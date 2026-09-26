# Architecture

## Entry points and configuration

- `src/cli.ts` is the executable bootstrap, including npm-style symlink launches.
- `src/config.ts` owns argument parsing, defaults, usage text and CLI errors.
- `src/index.ts` remains the import-safe public entry point. It re-exports the
  existing configuration and HTTP APIs, registers tools and starts transports.
- `src/http.ts` owns the Express adapter, Host/origin validation and bearer auth.

`createMcpServer` captures one API key for discovery and tool requests. Omit
`apiKey` to use `JINA_API_KEY`; pass a string to override it or `null` to disable
Jina authentication and search registration. Direct reader/search functions
retain environment defaults for callers that omit their credential argument.
Credentials are sent only to Jina endpoints, never direct markdown/GitHub hosts.

## Tool execution

`reader.ts` converts GitHub blob URLs to raw URLs, probes allowlisted hosts for
`text/markdown`, and otherwise posts to Jina Reader. It tokenizes and paginates
content, caches pages, and returns page metadata and next-page hints.
`markdown_allowlist.ts` is the source of truth for direct negotiation hosts.

`search.ts` and `search_vip.ts` adapt their distinct provider response formats.
`search_shared.ts` owns their common input schema and numbered-result formatter.
`utils.ts` owns credential headers and URL helpers; `types.ts` holds shared data
and text-result types. Tool execution failures return MCP `isError` results.

## State and transport boundaries

`cache.ts` holds a process-wide LRU cache, initialized by `startServer`. Embedding
callers must call `initializeCache` before reading. Cache keys are URLs, with no
TTL, credential or token-budget partition. Multiple embedded servers with
different credentials/budgets should use separate processes; this factory is
not a tenant-isolation boundary. HTTP request factories share the process cache.

`pagination.ts` and `tokenizer.ts` implement token-budget content paging using
`tiktoken`. This is separate from MCP discovery cursor pagination.
The SDK adapters serve stdio and stateless Streamable HTTP, including legacy and
modern protocol negotiation. HTTP middleware runs before SDK request handling.

Reader `customTimeout` is sent as Jina's `X-Timeout` and bounds direct markdown
probes. It does not currently bound Jina or GitHub fetches locally; search also
has no explicit local abort deadline. Network lifecycle and cache isolation are
known limitations, not guarantees supplied by the transport test timeouts.

## Validation

See [TEST_PLAN.md](TEST_PLAN.md) for deterministic transport tests, opt-in real
provider checks, and Codex client validation. Tests cover the compiled executable
and import safety so module refactors retain package-entrypoint behavior.
