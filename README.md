# LettrLabs MCP Server

Send direct mail from Claude, ChatGPT, Cursor, and other MCP-compatible AI agents. Drafting campaigns, previewing pricing, and submitting mailings happens inside the same chat where you're already working — no copy-paste into separate dashboards.

> **🧪 Public beta.** Live at `https://mcp.lettrlabs.com/mcp` for all LettrLabs customers. We're actively improving it — tool behavior and connection flows may change, and you're helping us harden it across the many agent platforms and setups in the wild. Please report anything that breaks or feels off to your LettrLabs contact. Generate an API key ([Get an API key](#get-an-api-key)) and connect your agent below.

---

## Connect to your AI agent

You'll need a LettrLabs API key (see [Get an API key](#get-an-api-key) below). Then pick your agent:

### Claude.ai (Pro / Team / Enterprise)

1. **Settings → Connectors → Add custom connector**
2. **URL**: `https://mcp.lettrlabs.com/mcp`
3. Click **Connect**. Claude will open an authorization page in a new tab.
4. **Paste your LettrLabs API key** into the consent form and click **Authorize**.

> **Leave "Advanced settings" empty.** The optional **OAuth Client ID** and **Client Secret** fields don't apply to LettrLabs — your API key is *not* a client secret, and entering it there makes Claude error with *"A client id must be provided with a client secret."* Claude registers itself with the server automatically; your API key goes on the authorization page in step 4.

Claude stores the token from then on. Start a new chat, enable the LettrLabs connector via the toggle in the composer, and ask it to "list my recent orders".

### ChatGPT (Plus / Pro / Team / Enterprise)

1. **Settings → Connectors → Add MCP Connector**
2. **URL**: `https://mcp.lettrlabs.com/mcp`
3. **Authentication**: API Key. Header name `X-API-KEY`, value = your LettrLabs API key.
4. Save and enable for your conversation.

### Cursor, Windsurf, Continue, Zed, Cline

Add to your IDE's MCP config (path varies — Cursor uses `~/.cursor/mcp.json`, Windsurf `~/.codeium/windsurf/mcp_config.json`, Continue `~/.continue/config.json` `mcpServers` block, etc.):

```json
{
  "mcpServers": {
    "lettrlabs": {
      "url": "https://mcp.lettrlabs.com/mcp",
      "headers": {
        "X-API-KEY": "LL-API-your-key-here"
      }
    }
  }
}
```

### Claude Code (CLI)

```bash
claude mcp add-json lettrlabs '{"url":"https://mcp.lettrlabs.com/mcp","headers":{"X-API-KEY":"LL-API-your-key-here"}}'
```

### MCP Inspector (quick smoke test)

```bash
npx @modelcontextprotocol/inspector
```

Configure: transport = streamable-http, URL = `https://mcp.lettrlabs.com/mcp`, custom header `X-API-KEY: <your key>`. Lets you click through `tools/list` and `tools/call` to confirm the connection works.

---

## What you can do

Once connected, your agent can call these tools on your behalf:

**Read your account**
- `list_orders` — your direct mail orders with filters by status, date, product
- `get_order_recipients` — who's on a given order
- `get_order_proof` — the printed-piece PDF for an order
- `get_order_analytics` — aggregate spend and send counts across all campaigns
- `get_order_transactions` — itemized charges and refunds
- `list_automations` — recurring/triggered campaigns (Shopify, Klaviyo, etc.)
- `list_conversions` — attributed responses to past sends
- `get_my_profile` — account info and balance

**Draft and send campaigns**
- `preview_order_pricing` — costs out an order *without* charging
- `create_order_from_template` — start a new draft from one of your templates
- `append_order_recipients` — add a mailing list to a draft
- `submit_and_charge_order` — submits for production. **Requires explicit `confirm: true`** — agents must surface the spend to you before this fires.

**Escape hatch**
- `call_lettrlabs_api` — call any LettrLabs external API endpoint not yet covered above

Each tool's full input/output is exposed via `tools/list` and visible in your agent's tool picker.

---

## Get an API key

**Prerequisite — your plan must include OpenAPI / API access.** This MCP calls the LettrLabs external API, which is gated to plans with OpenAPI integrations enabled. If you don't see the option below, or your agent reports *"your subscription tier doesn't include OpenAPI integrations,"* contact your LettrLabs rep to enable it on your account.

Sign in at https://app.lettrlabs.com, then:

**Automations → Manage Integrations → OpenAPI → Generate Key**

Copy the generated key (it starts with `LL-API-`). Treat it like any other credential — the bearer token your AI agent stores is derived from this key, so anyone holding it can act on your LettrLabs account. Rotate or revoke it from the same screen if it's ever exposed.

If you're not a LettrLabs customer yet, reach out at https://lettrlabs.com to get set up.

---

## Safety model

- **You authorize each connection once.** No long-lived auth handshake without your consent — the agent walks through OAuth and lands on a LettrLabs-hosted consent page where you paste your API key.
- **The MCP server is stateless.** Your key isn't stored server-side. The token your agent holds is the bearer credential it presents on every call.
- **Charge tools require explicit confirmation.** `submit_and_charge_order` won't fire unless the agent passes `confirm: true`. Well-behaved agents will show you the price first and ask before sending.
- **The MCP server is open source.** Inspect what your agent is actually calling on your behalf — every tool's behavior is in `src/tools/`.

---

## For LettrLabs developers

Local dev + testing:

```bash
nvm use 24
npm install
cp .env.example .env
# Set LETTRLABS_API_BASE_URL to a dev environment (e.g. https://app-dev.lettrlabs.com/api)
npm run dev          # starts on http://localhost:3333
npm test             # vitest one-shot
npm run typecheck    # tsc --noEmit
npm run lint
```

Deployment lives in the private sibling repo **[LettrLabs.PrivateApiMcp.Infra](https://github.com/lettrlabs/LettrLabs.PrivateApiMcp.Infra)** (terraform + helm + GitHub Actions). On push to `main`, deploy by:

```bash
gh workflow run "Deploy to nonprod" \
  -R lettrlabs/LettrLabs.PrivateApiMcp.Infra \
  -f code_ref=$(git rev-parse HEAD)
```

---

## License

Source-available for transparency; proprietary. See [LICENSE](LICENSE) for terms.
