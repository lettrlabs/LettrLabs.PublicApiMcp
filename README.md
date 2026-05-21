# LettrLabs.PublicApiMcp

Model Context Protocol (MCP) server that exposes the LettrLabs public API as tools usable by Claude, Microsoft Copilot Studio, Google Gemini Enterprise / Agent Builder, and other MCP-compatible AI agent platforms.

Internal LettrLabs repository. Proprietary; not for distribution.

## What it does

Wraps the customer-facing LettrLabs external API (the `[ApiKeySecurity]`-protected endpoints under `/v1/*` in `LettrLabs.App`) as a set of MCP tools. Customers point their agent platform at the hosted MCP endpoint, configure their LettrLabs API key, and the agent can list orders, draft campaigns, preview pricing, submit (with confirmation), and more.

The MCP server itself is stateless. It forwards `X-API-KEY` from inbound requests to the LettrLabs API; it never persists customer keys.

## Architecture

- **Transport**: Streamable HTTP (the official MCP transport for hosted servers). No stdio.
- **Tools**: ~12 curated semantic tools for the common flows (`list_orders`, `get_order_analytics`, `create_order_from_template`, `submit_and_charge_order`, etc.) plus a `call_lettrlabs_api` escape hatch for the remaining external endpoints.
- **Auth**: API key per request, forwarded as `X-API-KEY` to the LettrLabs API. Auth is implemented as middleware so OAuth can slot in later without rewriting tool handlers.
- **Dedupe**: an in-memory LRU dedupes write-tool calls within a short time window. This is a v1 stopgap pending an `Idempotency-Key` change in `LettrLabs.App`.
- **Confirmation gate**: tools that move money (`submit_and_charge_order`) require either an MCP elicitation handshake or an explicit `confirm: true` parameter from the calling agent.

## Local development

```bash
nvm use 20
npm install
cp .env.example .env
# Edit .env with a real LETTRLABS_API_BASE_URL (e.g. https://app-dev.lettrlabs.com)
npm run dev
```

The server starts on `PORT` (default `3333`). Point an MCP client at `http://localhost:3333/mcp` with `X-API-KEY` set to a dev LettrLabs API key.

### MCP Inspector (quick smoke test)

```bash
npx @modelcontextprotocol/inspector
```

Configure: transport = streamable-http, URL = `http://localhost:3333/mcp`, header `X-API-KEY: <your dev key>`.

## Tests

```bash
npm test            # one-shot
npm run test:watch  # watch mode
npm run typecheck   # tsc --noEmit
npm run lint
```

## Deployment

Deployment lives in the sibling repo **[LettrLabs.PublicApiMcp.Infra](https://github.com/lettrlabs/LettrLabs.PublicApiMcp.Infra)** (terraform + helm + workflows). On push to `main`, this repo's `publish-image.yml` workflow builds a Docker image to ACR and fires a `repository_dispatch` event that triggers the `.Infra` deploy workflow.

Hosted endpoints:

- nonprod: `https://mcp-nonprod.lettrlabs.com/mcp`
- prod:    `https://mcp.lettrlabs.com/mcp` (post-launch)

## Related

- LettrLabs public API: `LettrLabs.App` repo, `backend/Controllers/ExternalApi/V1/*`
- OpenAPI spec: `LettrLabs.App/shared/openapi.json` (mixes internal + external; we only wrap the `[ApiKeySecurity]`-protected subset)
- Infra / deploy: `LettrLabs.PublicApiMcp.Infra`
