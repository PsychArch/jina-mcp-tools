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

## Basis in current MCP guidance

Reviewed 2026-09-16 against the installed SDK v2 API:

- The [official SDK client guide](https://ts.sdk.modelcontextprotocol.io/v2/clients/connect)
  documents real child-process stdio and HTTP transports, plus in-memory testing.
  Use real transports here to catch process and serialization regressions that
  in-memory or direct-handler tests cannot exercise.
- The [MCP tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
  distinguishes protocol failures from tool execution errors. Assert unknown-tool
  protocol errors separately from invalid-input/upstream `isError` results.
- The [official Inspector](https://github.com/modelcontextprotocol/inspector)
  is useful for interactive interoperability debugging. SDK-driven tests provide
  repeatable CI coverage without an LLM or a browser dependency.

## Optional live provider checks

With `JINA_API_KEY` already exported, run:

```sh
pnpm build
node scripts/live-mcp.mjs
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

## Test URLs

| URL | Expected Tokens | Description |
|-----|----------------|-------------|
| https://www.alibabacloud.com/help/en/model-studio/use-qwen-by-calling-api | ~48k | Alibaba Cloud - Qwen API docs |
| https://huggingface.co/docs/transformers/main/en/model_doc/qwen3_omni_moe | ~30k | HuggingFace - Qwen3 docs |
| https://platform.openai.com/docs/api-reference/responses/create | ~161k | OpenAI API reference |
| https://docs.nvidia.com/cuda/parallel-thread-execution | ~991k | NVIDIA CUDA PTX (massive) |
| https://developer.work.weixin.qq.com/document/path/94695 | ~33k | WeChat Work API (Chinese) |
| https://man7.org/linux/man-pages/man1/tmux.1.html | ~51k | Linux man pages - tmux manual |
| https://www.volcengine.com/docs/82379/1824121 | ~36k | VolcEngine docs (Chinese) |
| https://modelcontextprotocol.io/specification/2025-06-18/server/tools | ~2.2k | MCP specification - tools |
| https://gofastmcp.com/servers/tools | ~5.8k | GoFast MCP server tools |
| https://docs.jina.ai/concepts/serving/executor/ | ~9.1k | Jina AI Search Foundation API Guide |

## Test Cases

1. **Small page (< 20k tokens)** - Should return full content in single page
2. **Medium page (20-50k tokens)** - Should paginate into 2-4 pages
3. **Large page (50-200k tokens)** - Should paginate into 4-14 pages
4. **Massive page (> 200k tokens)** - Should paginate into 14+ pages
5. **Non-English content** - Test Chinese/international docs
6. **Markdown negotiation success** - Allowlisted host returns markdown directly
7. **Markdown negotiation fallback** - Non-allowlisted or failed direct response falls back to Jina cleanly

## Expected Behavior

- ✅ Automatic reader content chunking for content exceeding the token budget (separate from MCP list pagination)
- ✅ Natural break points (paragraphs > sentences > words)
- ✅ Cached pages for instant retrieval
- ✅ Clear pagination metadata (Page X of Y, token count)
- ✅ Next page hints in output
- ✅ Allowlisted markdown-capable hosts prefer direct `Accept: text/markdown` responses
- ✅ Failed or empty allowlisted direct responses fall back to Jina output

## Success Criteria

- All URLs accessible and paginated correctly
- Token counts within configured limits per page
- Cache hits on subsequent page requests
- Clean markdown output maintained

## Markdown Negotiation Smoke Tests

| URL | Expected Path |
|-----|---------------|
| https://developers.cloudflare.com/agents/getting-started/build-a-chat-agent/ | Direct markdown via `Accept: text/markdown` |
| https://blog.cloudflare.com/markdown-for-agents/ | Direct markdown via `Accept: text/markdown` |
| https://developer.wordpress.org/reference/functions/get_permalink/ | Direct markdown via `Accept: text/markdown` |
| https://vercel.com/docs | Direct markdown via `Accept: text/markdown` |
| https://vercel.com/blog/self-driving-infrastructure | Direct markdown via `Accept: text/markdown` |
| https://mintlify.com/docs | Direct markdown via `Accept: text/markdown` |
| https://nextjs.org/docs | Skip direct probe and use Jina fallback |
