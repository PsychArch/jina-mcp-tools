# Test Plan: jina_reader Tool

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

- ✅ Automatic pagination for content exceeding token budget
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
