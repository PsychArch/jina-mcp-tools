# Jina AI MCP Tools

A Model Context Protocol (MCP) server that integrates with [Jina AI Search Foundation APIs](https://docs.jina.ai/).

## Features

This MCP server provides access to the following Jina AI APIs:

- **Web Reader** - Extract content from web pages using r.jina.ai
- **Web Search** - Search the web using s.jina.ai or svip.jina.ai (configurable via `--search-endpoint`)

## Prerequisites

1. **Jina AI API Key** (Optional) - Get a free API key from [https://jina.ai/?sui=apikey](https://jina.ai/?sui=apikey) for enhanced features
2. **Node.js** - Version 16 or higher


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

### Proxy Environment Variables

Outbound HTTP requests now honor standard proxy environment variables. This applies to `jina_reader`, `jina_search`, and `jina_search_vip`.

- Supported proxy variables: `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`
- Lowercase variants are also supported: `http_proxy`, `https_proxy`, `all_proxy`
- Exclusions are respected via `NO_PROXY` / `no_proxy`

Example:

```bash
HTTPS_PROXY=http://proxy.internal:8080 npx jina-mcp-tools --transport stdio
```

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
