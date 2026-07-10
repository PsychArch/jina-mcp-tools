# Jina AI MCP Tools

A Model Context Protocol (MCP) server that integrates with [Jina AI Search Foundation APIs](https://docs.jina.ai/).

## Features

This MCP server provides access to the following Jina AI APIs:

- **Web Reader** - Extract content from web pages using r.jina.ai
- **Web Search** - Search the web using s.jina.ai or svip.jina.ai (configurable via `--search-endpoint`)

## Prerequisites

1. **Jina AI API Key** (Optional) - Get a free API key from [https://jina.ai/?sui=apikey](https://jina.ai/?sui=apikey) for enhanced features
2. **Node.js** - Version 20 or higher


## MCP Server

### Using stdio Transport (Default)

For local integrations spawned by another process (e.g., Claude Desktop, VS Code, Cursor):

```json
{
  "mcpServers": {
    "jina-mcp-tools": {
      "command": "npx",
      "args": [
        "jina-mcp-tools",
        "--transport", "stdio",
        "--tokens-per-page", "15000",
        "--search-endpoint", "standard"
      ],
      "env": {
        "JINA_API_KEY": "your_jina_api_key_here_optional"
      }
    }
  }
}
```

### Using HTTP Transport

For remote server deployments accessible via HTTP:

**Start the server:**
```bash
# With API key
JINA_API_KEY=your_api_key npx jina-mcp-tools --transport http --host 127.0.0.1 --port 3000

# Without API key (reader tool only, binds to 127.0.0.1 by default)
npx jina-mcp-tools --transport http --port 3000
```

**Connect from MCP clients:**
- MCP Inspector: `npx @modelcontextprotocol/inspector` → `http://localhost:3000/mcp`
- Claude Code: `claude mcp add --transport http jina-tools http://localhost:3000/mcp`
- VS Code: `code --add-mcp '{"name":"jina-tools","type":"http","url":"http://localhost:3000/mcp"}'`

**CLI Options:**
- `--transport` - Transport type: `stdio` or `http` (default: stdio)
- `--host` - Host/interface to bind in HTTP mode (default: `127.0.0.1`)
- `--port` - HTTP server port (default: 3000, only for HTTP transport)
- `--tokens-per-page` - Tokens per page for pagination (default: 15000)
- `--search-endpoint` - Search endpoint to use: `standard` (s.jina.ai) or `vip` (svip.jina.ai) (default: standard)
- `--cache-size` - Reader cache size in URLs (default: 50)
- `--help` - Show the built-in CLI help

### HTTP Security

HTTP mode binds to `127.0.0.1` by default. For remote deployments, put the server behind TLS and set a bearer token:

```bash
JINA_MCP_HTTP_AUTH_TOKEN=change-me npx jina-mcp-tools --transport http --host 0.0.0.0 --port 3000
```

Clients must then send:

```http
Authorization: Bearer change-me
```

Browser-origin requests are limited to localhost by default. Set `JINA_MCP_ALLOWED_ORIGINS` to a comma-separated allowlist for browser-based remote clients.

### Proxy Environment Variables

To route outbound requests through a proxy, enable proxy environment support and provide the proxy URLs:

```bash
NODE_USE_ENV_PROXY=1 \
HTTP_PROXY=http://127.0.0.1:7890 \
HTTPS_PROXY=http://127.0.0.1:7890 \
NO_PROXY=localhost,127.0.0.1,::1 \
npx jina-mcp-tools --transport stdio
```

For MCP client configs, include the same environment variables:

```json
{
  "mcpServers": {
    "jina-mcp-tools": {
      "command": "npx",
      "args": ["jina-mcp-tools"],
      "env": {
        "JINA_API_KEY": "your_jina_api_key_here_optional",
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

## Available Tools

### jina_reader

Extract and read web page content.

**Parameters:**
- `url` - URL to read (required)
- `page` - Page number for paginated content (default: 1)
- `customTimeout` - Timeout override in seconds (optional)

**Features:**
- Automatic pagination for large documents
- LRU cache (50 URLs) for instant subsequent page requests
- GitHub file URLs automatically converted to raw content URLs
- Tries `Accept: text/markdown` first for a maintained allowlist of markdown-capable docs/blog hosts, then falls back to `r.jina.ai` on fetch failure or empty responses

### jina_search / jina_search_vip

Search the web. Returns partial content; use `jina_reader` for full content. Requires API key.

Tool registered depends on `--search-endpoint`:
- `jina_search` → `standard` (s.jina.ai, default)
- `jina_search_vip` → `vip` (svip.jina.ai)

**Parameters:**
- `query` - Search query (required)
- `count` - Number of results (default: 5)
- `siteFilter` - Limit to specific domain (e.g., "github.com")


## License

MIT

## Links

- GitHub: [https://github.com/PsychArch/jina-mcp-tools](https://github.com/PsychArch/jina-mcp-tools)
- Issues: [https://github.com/PsychArch/jina-mcp-tools/issues](https://github.com/PsychArch/jina-mcp-tools/issues) 
