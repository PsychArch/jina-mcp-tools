# Jina AI MCP Tools

> Web search and page reading for coding agents. Two tools, no tool-catalog buffet.

`jina-mcp-tools` is an unofficial, deliberately small [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server built on [Jina AI Reader and Search](https://jina.ai/).

It gives Codex, Claude Code, and other coding agents the two web capabilities they usually need while programming:

- Find a small set of relevant pages.
- Read the pages that actually matter.

That is the whole menu. No embeddings, screenshotting, image search, classification, reranking, or PDF archaeology. Those are useful tools—just not always useful tools to carry into every coding session.

> [!NOTE]
> This is an unofficial community project. It is not affiliated with or endorsed by Jina AI, and it uses Jina AI APIs rather than replacing them.

## Why Another Jina Integration?

Jina already provides an excellent [official MCP server](https://github.com/jina-ai/MCP) and [official CLI](https://github.com/jina-ai/cli). They are designed to expose a broad range of Jina capabilities. This project makes a different tradeoff: it treats context space and tool-selection attention as resources worth saving.

MCP tool definitions typically enter an agent's context before the real work begins. A broad catalog is valuable when the agent needs it; for everyday programming research, it can be more menu than meal. `jina-mcp-tools` exposes at most two focused tools and follows one deliberately boring workflow:

1. Search the web and receive a short list of results.
2. Pick the useful URLs.
3. Read those pages, one manageable page at a time.
4. Get back to the code.

Boring infrastructure is often very considerate infrastructure.

## Which Jina Integration Should I Use?

| | `jina-mcp-tools` | [Official Jina MCP](https://github.com/jina-ai/MCP) | [Official Jina CLI](https://github.com/jina-ai/cli) |
| --- | --- | --- | --- |
| Interface | Local or self-hosted MCP over stdio/HTTP | Hosted remote MCP | Shell commands |
| Default scope | Web search and page reading | Broad Jina tool catalog | Broad Jina command suite |
| Context approach | At most two small tool definitions | Server-side tool filters are available | Uses the agent's existing shell tool and progressive `--help` |
| Large pages | Explicit token-based pagination with an LRU cache | Client-aware response guardrails | Standard output and Unix pipes |
| Best fit | Coding agents that want a small native MCP surface | Hosted access, research tools, images, PDFs, embeddings, or reranking | Agents and humans who want pipes, JSON, scripting, and the wider Jina platform |

Choose **`jina-mcp-tools`** when native MCP integration, a minimal default tool surface, and paginated reading matter most.

Choose the **official MCP server** when you want a hosted endpoint or need its wider capabilities. It can also be narrowed with `include_tools` or `include_tags`, which is a good option when hosting convenience matters more than running a local process.

Choose the **official CLI** when your agent already has reliable shell access and you want Unix composition or the full Jina API suite without registering a large MCP catalog.

## Quick Start

### Prerequisites

- Node.js 20 or later.
- A [Jina AI API key](https://jina.ai/?sui=apikey) for web search. The reader works without a key, subject to Jina's unauthenticated rate limits.

Set the API key in your shell if you want both search and reading:

```bash
export JINA_API_KEY=jina_your_api_key
```

### [Codex](https://developers.openai.com/codex/mcp)

```bash
codex mcp add jina-web --env JINA_API_KEY="$JINA_API_KEY" -- npx -y jina-mcp-tools
```

### [Claude Code](https://code.claude.com/docs/en/mcp)

```bash
claude mcp add --scope user \
  --env JINA_API_KEY="$JINA_API_KEY" \
  --transport stdio jina-web -- npx -y jina-mcp-tools
```

Omit the API-key option from either command for reader-only mode.

### [VS Code](https://code.visualstudio.com/docs/agent-customization/mcp-servers)

VS Code stores MCP configuration in a user-profile `mcp.json` or a workspace-level `.vscode/mcp.json`. Its configuration uses `servers`, not `mcpServers`. This example securely prompts for the API key and stores it using VS Code's input-variable support:

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "jina-api-key",
      "description": "Jina AI API key",
      "password": true
    }
  ],
  "servers": {
    "jina-web": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "jina-mcp-tools"],
      "env": {
        "JINA_API_KEY": "${input:jina-api-key}"
      }
    }
  }
}
```

Open the user configuration with **MCP: Open User Configuration**, or save the file as `.vscode/mcp.json` to share the server configuration with a workspace. Remove `env` and `inputs` for reader-only mode.

For a reader-only user-profile installation from the command line:

```bash
code --add-mcp "{\"name\":\"jina-web\",\"type\":\"stdio\",\"command\":\"npx\",\"args\":[\"-y\",\"jina-mcp-tools\"]}"
```

### Claude Desktop, Cursor, and Other MCP Clients

For clients that use the `mcpServers` JSON format:

```json
{
  "mcpServers": {
    "jina-web": {
      "command": "npx",
      "args": [
        "-y",
        "jina-mcp-tools"
      ],
      "env": {
        "JINA_API_KEY": "your_jina_api_key_here"
      }
    }
  }
}
```

The default transport is stdio. Remove the `env` block for reader-only mode.

## Available Tools

### `jina_reader`

Extract and read content from a web page.

Parameters:

- `url` — URL to read (required).
- `page` — Page number for paginated content (default: `1`).
- `customTimeout` — Timeout override in seconds (optional).

Designed for coding-agent research:

- Automatically paginates large documents instead of returning one oversized response.
- Keeps an LRU cache so later pages of the same URL are available immediately.
- Converts GitHub file URLs to raw content URLs.
- Tries direct `Accept: text/markdown` retrieval for a maintained allowlist of documentation and blog hosts, then falls back to `r.jina.ai` if the response fails or is empty.

The default cache holds 50 URLs, and each page is limited to approximately 15,000 tokens. Both values are configurable.

### `jina_search` / `jina_search_vip`

Search the web and return a lightweight shortlist. Use `jina_reader` to retrieve the full content of promising results. A Jina API key is required.

Only one search tool is registered, depending on `--search-endpoint`:

- `jina_search` uses `s.jina.ai` (`standard`, the default).
- `jina_search_vip` uses `svip.jina.ai` (`vip`).

Parameters:

- `query` — Search query (required).
- `count` — Number of results (default: `5`).
- `siteFilter` — Limit results to a domain such as `github.com`.

The small default result count is intentional: search first, read selectively, and leave some context for the repository you were working on in the first place.

## Configuration

```text
Usage: jina-mcp-tools [options]

Options:
  --transport <stdio|http>         Transport type (default: stdio)
  --host <host>                    Host/interface in HTTP mode (default: 127.0.0.1)
  --port <1-65535>                 HTTP port (default: 3000)
  --tokens-per-page <positive-int> Tokens per reader page (default: 15000)
  --search-endpoint <standard|vip> Search endpoint (default: standard)
  --cache-size <positive-int>      Reader cache size in URLs (default: 50)
  -h, --help                       Show the built-in help
```

## HTTP Transport

HTTP mode is intended for self-hosted deployments or clients that cannot spawn a local stdio process.

Start the server:

```bash
# Search and reader
JINA_API_KEY=your_api_key npx -y jina-mcp-tools \
  --transport http \
  --host 127.0.0.1 \
  --port 3000

# Reader only
npx -y jina-mcp-tools --transport http --port 3000
```

Connect to `http://localhost:3000/mcp`:

- Codex: `codex mcp add jina-web --url http://localhost:3000/mcp`
- Claude Code: `claude mcp add --transport http jina-web http://localhost:3000/mcp`
- MCP Inspector: `npx -y @modelcontextprotocol/inspector`
- VS Code: `code --add-mcp "{\"name\":\"jina-web\",\"type\":\"http\",\"url\":\"http://localhost:3000/mcp\"}"`

### HTTP Security

HTTP mode binds to `127.0.0.1` by default. For a remote deployment, put the server behind TLS and require a bearer token:

```bash
JINA_MCP_HTTP_AUTH_TOKEN=change-me \
  npx -y jina-mcp-tools --transport http --host 0.0.0.0 --port 3000
```

Clients must send:

```http
Authorization: Bearer change-me
```

Browser-origin requests are limited to localhost by default. Set `JINA_MCP_ALLOWED_ORIGINS` to a comma-separated allowlist for browser-based remote clients.

Running the MCP process locally does not make Jina requests offline: search and most reader requests still call Jina AI services. Some allowlisted markdown hosts and GitHub file URLs may be fetched directly.

## Proxy Environment Variables

To route outbound requests through a proxy, enable Node's proxy environment support and provide the proxy URLs:

```bash
NODE_USE_ENV_PROXY=1 \
HTTP_PROXY=http://127.0.0.1:7890 \
HTTPS_PROXY=http://127.0.0.1:7890 \
NO_PROXY=localhost,127.0.0.1,::1 \
npx -y jina-mcp-tools
```

For MCP clients that use the `mcpServers` configuration format, include the same environment variables:

```json
{
  "mcpServers": {
    "jina-web": {
      "command": "npx",
      "args": ["-y", "jina-mcp-tools"],
      "env": {
        "JINA_API_KEY": "your_jina_api_key_here",
        "NODE_USE_ENV_PROXY": "1",
        "HTTP_PROXY": "http://127.0.0.1:7890",
        "HTTPS_PROXY": "http://127.0.0.1:7890",
        "NO_PROXY": "localhost,127.0.0.1,::1"
      }
    }
  }
}
```

Alternatively, start Node with `NODE_OPTIONS=--use-env-proxy`. Proxy URLs are only used when proxy environment support is enabled.

## Scope and Non-Goals

This project intentionally does not aim to expose every Jina API. It is not the right choice when you need embeddings, reranking, classification, screenshots, image or academic search, query expansion, deduplication, or structured PDF extraction. Use the official [MCP server](https://github.com/jina-ai/MCP) or [CLI](https://github.com/jina-ai/cli) for those jobs.

The narrow scope is the feature. If this server grows twenty tools and develops a small cockpit, something has gone terribly wrong.

## License

MIT

## Links

- GitHub: [github.com/PsychArch/jina-mcp-tools](https://github.com/PsychArch/jina-mcp-tools)
- Issues: [github.com/PsychArch/jina-mcp-tools/issues](https://github.com/PsychArch/jina-mcp-tools/issues)
