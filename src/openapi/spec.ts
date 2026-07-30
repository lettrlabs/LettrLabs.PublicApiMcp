import type { HttpMethod } from '../client.js';

/**
 * Allow-list of the LettrLabs external API endpoints. This is the surface
 * the `call_lettrlabs_api` escape hatch can reach.
 *
 * Source of truth: the App's served external OpenAPI at `/api/openapi/v3.json`
 * (generated from `LettrLabs.App/backend/Controllers/ExternalApi/V1/*` — every
 * method decorated with [ApiKeySecurity]). Keep in sync when endpoints are added
 * or removed; `test/openapi/contract-drift.test.ts` reconciles this list against
 * the committed `test/fixtures/openapi.external.json` snapshot (and, in its
 * env-gated live mode, against the served doc) so drift fails a test.
 *
 * Paths use ASP.NET-style `{param}` placeholders. The matcher below converts
 * a real path like `/v1/order/42/proof/7` into the template `/v1/order/{id}/proof/{recipient?}`
 * by comparing segment counts and literal segments.
 */
export interface ExternalEndpoint {
  method: HttpMethod;
  path: string;
  controller: string;
  operationId: string;
}

export const EXTERNAL_ENDPOINTS: readonly ExternalEndpoint[] = [
  // ExternalOrderController
  { method: 'GET', path: '/v1/order', controller: 'ExternalOrderController', operationId: 'GetOrders' },
  { method: 'POST', path: '/v1/order', controller: 'ExternalOrderController', operationId: 'CreateOrderFromTemplate' },
  { method: 'DELETE', path: '/v1/order/{id}', controller: 'ExternalOrderController', operationId: 'DeleteOrder' },
  { method: 'GET', path: '/v1/order/{id}/proof/{recipient?}', controller: 'ExternalOrderController', operationId: 'GetOrderProof' },
  { method: 'GET', path: '/v1/order/analytics', controller: 'ExternalOrderController', operationId: 'GetOrderAnalytics' },
  { method: 'GET', path: '/v1/order/transaction', controller: 'ExternalOrderController', operationId: 'GetOrderTransactions' },
  { method: 'GET', path: '/v1/order/{id}/checkout', controller: 'ExternalOrderController', operationId: 'PreviewOrderCheckout' },
  { method: 'POST', path: '/v1/order/{id}/checkout', controller: 'ExternalOrderController', operationId: 'SubmitOrderCheckout' },
  { method: 'GET', path: '/v1/order/{id}/recipients', controller: 'ExternalOrderController', operationId: 'GetOrderRecipients' },
  { method: 'DELETE', path: '/v1/order/{id}/recipients', controller: 'ExternalOrderController', operationId: 'DeleteOrderRecipients' },
  // Canonical PUT plus the `:append` compat alias — both are live external routes.
  { method: 'PUT', path: '/v1/order/{id}/recipients', controller: 'ExternalOrderController', operationId: 'AppendOrderRecipients' },
  { method: 'PUT', path: '/v1/order/{id}/recipients:append', controller: 'ExternalOrderController', operationId: 'AppendOrderRecipientsCompat' },
  { method: 'GET', path: '/v1/order/{id}/recipient-delivery-status', controller: 'ExternalOrderController', operationId: 'GetRecipientDeliveryStatus' },

  // IntegrationOrdersController
  { method: 'GET', path: '/v1/integration-orders', controller: 'IntegrationOrdersController', operationId: 'GetIntegrationOrders' },
  { method: 'POST', path: '/v1/integration-orders/{id}/recipients', controller: 'IntegrationOrdersController', operationId: 'PostIntegrationOrderRecipients' },
  // Canonical hyphen route plus the `:mail-by-proximity` compat alias.
  { method: 'POST', path: '/v1/integration-orders/{id}-by-proximity', controller: 'IntegrationOrdersController', operationId: 'MailByProximity' },
  { method: 'POST', path: '/v1/integration-orders/{id}:mail-by-proximity', controller: 'IntegrationOrdersController', operationId: 'MailByProximityCompat' },

  // ConversionController
  { method: 'GET', path: '/v1/conversions', controller: 'ConversionController', operationId: 'GetConversions' },
  { method: 'POST', path: '/v1/conversions', controller: 'ConversionController', operationId: 'CreateConversion' },
  { method: 'DELETE', path: '/v1/conversions/{id}', controller: 'ConversionController', operationId: 'DeleteConversion' },
  { method: 'GET', path: '/v1/conversions/{id}/status', controller: 'ConversionController', operationId: 'GetConversionStatus' },

  // ExternalTemplatesController
  { method: 'GET', path: '/v1/templates', controller: 'ExternalTemplatesController', operationId: 'GetTemplates' },
  { method: 'GET', path: '/v1/templates/{id}', controller: 'ExternalTemplatesController', operationId: 'GetTemplateById' },

  // ExternalFontsController
  { method: 'GET', path: '/v1/fonts', controller: 'ExternalFontsController', operationId: 'GetFonts' },

  // OrderStatisticsController
  { method: 'POST', path: '/v1/order-recipients-statistics', controller: 'OrderStatisticsController', operationId: 'ScanOrderRecipientQrCode' },

  // AuthController, ZapierActionsController
  { method: 'GET', path: '/v1/me', controller: 'AuthController', operationId: 'GetMe' },
  // Canonical route plus the `zapierActions/` compat alias.
  { method: 'POST', path: '/v1/address-book', controller: 'ZapierActionsController', operationId: 'AddAddressBookEntry' },
  { method: 'POST', path: '/v1/zapierActions/address-book', controller: 'ZapierActionsController', operationId: 'AddAddressBookEntryCompat' },
];

export interface MatchResult {
  matched: boolean;
  endpoint?: ExternalEndpoint;
  reason?: string;
}

/**
 * Check if a (method, path) pair maps to a known external endpoint.
 * Used by the `call_lettrlabs_api` escape hatch to reject internal-only paths
 * (or typos) with a helpful error before forwarding to the API.
 */
export function matchExternalEndpoint(method: string, path: string): MatchResult {
  const normalizedMethod = method.toUpperCase() as HttpMethod;
  const cleanPath = stripQuery(path);

  for (const ep of EXTERNAL_ENDPOINTS) {
    if (ep.method !== normalizedMethod) continue;
    if (pathMatchesTemplate(cleanPath, ep.path)) {
      return { matched: true, endpoint: ep };
    }
  }

  return {
    matched: false,
    reason: `No external LettrLabs endpoint matches ${normalizedMethod} ${cleanPath}. Use a curated tool when one exists; otherwise pass a method+path from the list of known external endpoints.`,
  };
}

export function listExternalEndpoints(): readonly ExternalEndpoint[] {
  return EXTERNAL_ENDPOINTS;
}

function stripQuery(path: string): string {
  const idx = path.indexOf('?');
  return idx >= 0 ? path.slice(0, idx) : path;
}

function pathMatchesTemplate(path: string, template: string): boolean {
  const pathSegs = path.split('/').filter(Boolean);
  const templateSegs = template.split('/').filter(Boolean);

  // Optional trailing param (e.g., `{recipient?}`) allows one fewer segment.
  const hasOptionalTail =
    templateSegs.length > 0 && /^\{[^}]+\?\}$/.test(templateSegs[templateSegs.length - 1]!);
  const requiredLen = hasOptionalTail ? templateSegs.length - 1 : templateSegs.length;

  if (pathSegs.length < requiredLen || pathSegs.length > templateSegs.length) {
    return false;
  }

  for (let i = 0; i < pathSegs.length; i++) {
    const t = templateSegs[i]!;
    const p = pathSegs[i]!;
    if (t.startsWith('{') && t.endsWith('}')) {
      // Placeholder (required or optional) — matches anything non-empty.
      if (p.length === 0) return false;
    } else if (t.includes('{')) {
      // Composite segment: a placeholder followed by a literal suffix, e.g.
      // `{id}:mail-by-proximity` or `{id}-by-proximity`. Split at the closing brace
      // so either a colon- or hyphen-led suffix matches.
      const closeIdx = t.indexOf('}');
      if (closeIdx < 0) return false;
      const placeholderPart = t.slice(0, closeIdx + 1);
      const literalSuffix = t.slice(closeIdx + 1);
      if (!(placeholderPart.startsWith('{') && placeholderPart.endsWith('}'))) {
        return false;
      }
      if (literalSuffix.length === 0) return false; // pure placeholder handled above
      if (!p.endsWith(literalSuffix)) return false;
      // The portion before the suffix must be non-empty.
      const variablePart = p.slice(0, p.length - literalSuffix.length);
      if (variablePart.length === 0) return false;
    } else {
      if (t !== p) return false;
    }
  }
  return true;
}
