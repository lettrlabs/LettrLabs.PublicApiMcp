import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXTERNAL_ENDPOINTS } from '../../src/openapi/spec.js';
import {
  DELIVERY_STATUSES,
  ORDER_STATUSES,
  POSTAGE_TYPES,
  PRODUCTION_SPEEDS,
  PostageType,
  ProductionSpeed,
} from '../../src/openapi/vocabulary.js';

interface Operation {
  method: string;
  path: string;
}
interface ContractSnapshot {
  operations: Operation[];
  vocabularies: {
    orderStatus: string[];
    deliveryStatus: string[];
    postageType: string[];
    productionSpeed: string[];
  };
}

const snapshot = JSON.parse(
  readFileSync(new URL('../fixtures/openapi.external.json', import.meta.url), 'utf8'),
) as ContractSnapshot;

const opKey = (o: Operation): string => `${o.method.toUpperCase()} ${o.path}`;
const sortedSet = (xs: readonly string[]): string[] => [...new Set(xs)].sort();

/**
 * Reconcile a (method, path) allow-list against the published operation set.
 * `missing` = published operations absent from the allow-list (raw hatch blocks
 * a live endpoint); `extra` = allow-list operations not in the published set
 * (raw hatch advertises a dead endpoint). Empty both ways = in sync.
 */
function reconcileOperations(
  allowList: readonly Operation[],
  published: readonly Operation[],
): { missing: string[]; extra: string[] } {
  const allow = new Set(allowList.map(opKey));
  const pub = new Set(published.map(opKey));
  return {
    missing: [...pub].filter((k) => !allow.has(k)).sort(),
    extra: [...allow].filter((k) => !pub.has(k)).sort(),
  };
}

describe('contract drift — vocabulary currency (R3)', () => {
  it('D-1: the mirrored vocabularies equal the published sets (not narrower)', () => {
    expect(sortedSet(ORDER_STATUSES)).toEqual(sortedSet(snapshot.vocabularies.orderStatus));
    expect(sortedSet(DELIVERY_STATUSES)).toEqual(sortedSet(snapshot.vocabularies.deliveryStatus));
    expect(sortedSet(POSTAGE_TYPES)).toEqual(sortedSet(snapshot.vocabularies.postageType));
    expect(sortedSet(PRODUCTION_SPEEDS)).toEqual(sortedSet(snapshot.vocabularies.productionSpeed));
  });

  it('D-2: every published postage/production value parses against its input z.enum', () => {
    for (const v of snapshot.vocabularies.postageType) {
      expect(PostageType.safeParse(v).success).toBe(true);
    }
    for (const v of snapshot.vocabularies.productionSpeed) {
      expect(ProductionSpeed.safeParse(v).success).toBe(true);
    }
  });
});

describe('contract drift — endpoint allow-list currency (R8/R9)', () => {
  it('D-3: EXTERNAL_ENDPOINTS matches the published operation set exactly', () => {
    const { missing, extra } = reconcileOperations(EXTERNAL_ENDPOINTS, snapshot.operations);
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });

  it('D-4: the reconciliation flags divergence on a stale (pre-sync) allow-list', () => {
    // The pre-M11 allow-list lacked templates/fonts/QR-scan/recipient-delivery-status/
    // canonical-recipients/address-book — reconciliation must surface them as missing.
    const staleAllowList: Operation[] = EXTERNAL_ENDPOINTS.filter(
      (e) =>
        !e.path.startsWith('/v1/templates') &&
        e.path !== '/v1/fonts' &&
        e.path !== '/v1/order-recipients-statistics',
    );
    const { missing } = reconcileOperations(staleAllowList, snapshot.operations);
    expect(missing).toContain('GET /v1/templates');
    expect(missing).toContain('GET /v1/fonts');
    expect(missing).toContain('POST /v1/order-recipients-statistics');
  });
});

// Normalize an operation key for cross-source comparison: strip a leading /api and
// collapse every {param} (including an optional {x?}) to a single {} token, so the
// snapshot's templates line up with the App's ASP.NET-style path parameters.
const normKey = (method: string, path: string): string =>
  `${method.toUpperCase()} ${path.replace(/^\/api/, '').replace(/\{[^}]+\}/g, '{}')}`;

// The snapshot's optional-tail template (e.g. .../proof/{recipient?}) stands for
// two live routes — with and without the tail — so expand it before an exact
// bidirectional compare.
function expandSnapshotKeys(ops: Operation[]): Set<string> {
  const keys = new Set<string>();
  for (const o of ops) {
    keys.add(normKey(o.method, o.path));
    const optional = o.path.match(/^(.*)\/\{[^}]+\?\}$/);
    if (optional && optional[1]) keys.add(normKey(o.method, optional[1]));
  }
  return keys;
}

// Env-gated live drift check: fetches the App's served external OpenAPI so a
// future upstream contract change fails here, without requiring network in the
// default offline suite. Set LIVE_CONTRACT_URL to a served /api/openapi/v3.json.
describe.skipIf(!process.env['LIVE_CONTRACT_URL'])('contract drift — live (R9)', () => {
  it('the snapshot operation set reconciles exactly with the live published contract', async () => {
    // Bound the request so a hung upstream fails cleanly instead of stalling the test.
    const res = await fetch(process.env['LIVE_CONTRACT_URL'] as string, {
      signal: AbortSignal.timeout(10_000),
    });
    expect(res.ok).toBe(true);
    const doc = (await res.json()) as { paths?: Record<string, Record<string, unknown>> };
    const live = new Set<string>();
    for (const [path, ops] of Object.entries(doc.paths ?? {})) {
      for (const method of Object.keys(ops)) live.add(normKey(method, path));
    }
    // Compare the external /v1/* surface both directions: `missing` = an operation
    // the snapshot claims that the live doc no longer has; `extra` = a live /v1/*
    // operation the snapshot (and the allow-list) lacks. Either is real drift.
    const liveV1 = new Set([...live].filter((k) => k.includes(' /v1/')));
    const snap = expandSnapshotKeys(snapshot.operations);
    const missing = [...snap].filter((k) => !liveV1.has(k)).sort();
    const extra = [...liveV1].filter((k) => !snap.has(k)).sort();
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });
});
