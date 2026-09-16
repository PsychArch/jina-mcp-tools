# Test Plan: MCP server and Jina tools

## Automated verification

```sh
pnpm verify    # source and test typechecks, build, all tests
pnpm test:e2e  # build and compiled transport matrix only
```

`test/mcp-e2e.test.ts` runs 12 scenarios: stdio/HTTP × legacy/modern
negotiation × standard search/VIP search/anonymous reader. Each scenario gets
its own compiled server process and ephemeral loopback upstream server.
Stdio launches the production CLI; HTTP launches the compiled application factory
through a small fixture wrapper using port zero. Existing CLI tests cover direct
and symlinked launch and import safety.

The full flow is client connection and negotiation → tool discovery → tool call
→ upstream HTTP request → parsing and pagination → serialized MCP result.
Assertions cover:

- Exact tool availability with and without a key, and endpoint selection.
- Reader request body, bearer header, and custom timeout header.
- Every reader page reconstructs the original multilingual document exactly;
  cached pages do not refetch, invalid pages fail, and cache eviction refetches.
- Standard and VIP search query encoding, site filtering, result limits and formatting.
- Missing/invalid inputs, numeric bounds, unknown tools, upstream 429 errors,
  and successful requests after errors on the same client connection.
- Direct markdown, HTML and failed-negotiation fallback, GitHub raw conversion,
  and anonymous upstream requests without authorization headers.
- Authenticated HTTP calls and rejected unauthenticated/disallowed-origin requests.

Only the child process's upstream fetch boundary is redirected by a test-only
preload. Requests retain their original URL in a fixture header, method, headers,
body and signal; MCP transport, registration, handlers, tokenizer, cache and
response formatting are real. No production endpoint override is introduced.
Child environments exclude real API keys, proxies and inherited Node options.
All upstream destinations go to the local fixture, including unexpected URLs.
Startup and MCP requests have bounded timeouts; teardown closes sockets and children.

These are deterministic application E2E tests, not live Jina service tests.
They do not verify TLS/DNS, real provider response drift, browser-enforced CORS,
HTTP CLI argument-to-listener wiring, installed tarballs, or graceful shutdown.
The current CI automatically runs them in the verification job and its Node 20
runtime job; local success alone does not prove those remote jobs passed.

## Optional live provider checks

With `JINA_API_KEY` already exported, run:

```sh
pnpm build
pnpm test:live
# Retry only one case if needed:
node scripts/live-mcp.mjs stdio/modern/vip
```

This opt-in script makes six intended provider requests: two reader fetches,
two standard searches and two VIP searches. Reader pagination/repeated reads
reuse each server's cache. It covers stdio legacy/modern and HTTP modern/legacy,
prints credential-redacted JSON summaries, and exits nonzero on failure.
HTTP uses the compiled application factory on an ephemeral loopback port with
a random local bearer token; the script also checks 401 and 405 responses.
Requests use the actual Jina services, so they may consume account credits.
The script is excluded from the default suite and CI.

Run these separately with an explicitly supplied test credential and a small
request budget. Check one reader URL, one standard search and, when the account
supports it, one VIP search through an MCP client. Check semantics and schema,
not exact search ranking or changing page text. Never make remote content size
estimates below hard CI assertions.

## Live Codex client check

Build the checkout and register it under a separate name so an installed or remote
server cannot be mistaken for the code being tested:

```sh
pnpm build
codex mcp add jina-local -- node "$PWD/dist/cli.js" --tokens-per-page 256
```

In the generated `[mcp_servers.jina-local]` table in `~/.codex/config.toml`, add:

```toml
env_vars = ["JINA_API_KEY"]
```

This forwards the exported key without storing its value in configuration.
Start Codex from a shell with `JINA_API_KEY` set. Use a fresh session because
already-running clients do not automatically reload their MCP tool list.

```sh
codex exec --ephemeral --json \
  -o /tmp/jina-codex-result.md \
  - < scripts/codex-live.prompt.txt > /tmp/jina-codex-events.jsonl
```

Inspect the JSONL for completed `mcp_tool_call` events using server `jina-local`,
actual tool results, and no tool errors. A model's final success statement alone
is insufficient. The prompt requests standard search, reader pages 1 and 2,
and a repeated page 1. At the configured 256-token budget the document should
span multiple pages; use returned metadata, not historical page counts.
This makes two intended provider requests; cached reads stay local.

To check VIP with the same registration, override the launch arguments for one
session (substitute the absolute checkout path), and change the prompt's search
tool to `jina_search_vip`:

```sh
sed 's/jina_search /jina_search_vip /g' scripts/codex-live.prompt.txt | \
  codex exec --ephemeral --json \
  -c 'mcp_servers.jina-local.args=["/absolute/checkout/dist/cli.js","--tokens-per-page","256","--search-endpoint","vip"]' \
  -o /tmp/jina-codex-vip-result.md - > /tmp/jina-codex-vip-events.jsonl
```

Disable unrelated MCP entries for the test session if necessary using
`-c 'mcp_servers.NAME.enabled=false'`. Keep raw logs and dated outcomes outside
tracked documentation. Record failures and targeted retries separately; do not
turn a successful retry into a claim that the initial run passed. These checks
use real Jina credits and a configured Codex model provider, and remain opt-in.
Remove the checkout registration when no longer wanted with
`codex mcp remove jina-local`.

## Additional manual coverage

For broader provider investigations, choose a current small page, long document,
Chinese document, GitHub blob URL, and markdown-negotiation host from
`src/markdown_allowlist.ts`. Assert content and pagination against the response
actually returned. Upstream sizes, accessibility and markdown support change;
none is a fixed CI assertion. Test direct markdown success and HTML/empty/error
fallback deterministically in the existing fixture suite.

Known gaps include production request deadlines/cancellation, concurrent calls,
graceful shutdown, browser-enforced CORS and fresh tarball installation. The live
HTTP harness exercises the application factory, not HTTP CLI listener wiring.
