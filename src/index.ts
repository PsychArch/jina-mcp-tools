import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { initializeCache } from "./cache.js";
import { registerReaderTool } from "./reader.js";
import { registerSearchTool } from "./search.js";
import { registerSearchVipTool } from "./search_vip.js";
import { getJinaApiKey } from "./utils.js";
import {
  parseArgs, CliHelpRequested, CliUsageError, formatCliError,
  formatHostForUrl, type ServerConfig
} from "./config.js";
import { createHttpApp } from "./http.js";

export * from "./config.js";
export { createHttpApp } from "./http.js";

type SearchEndpoint = ServerConfig["searchEndpoint"];

interface McpServerOptions {
  apiKey?: string | null;
  searchEndpoint: SearchEndpoint;
  tokensPerPage: number;
}

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version: string };
const SERVER_VERSION = packageJson.version;

export function createMcpServer({
  apiKey = getJinaApiKey(),
  searchEndpoint,
  tokensPerPage
}: McpServerOptions): McpServer {
  const server = new McpServer({
    name: "jina-mcp-tools",
    version: SERVER_VERSION,
    description: "Jina AI tools for web reading and search"
  });

  registerReaderTool(server, tokensPerPage, apiKey);

  if (apiKey) {
    if (searchEndpoint === "vip") {
      registerSearchVipTool(server, apiKey);
    } else {
      registerSearchTool(server, apiKey);
    }
  }

  return server;
}

const logRegisteredTools = (apiKey: string | null, searchEndpoint: SearchEndpoint): void => {
  if (apiKey) {
    console.error(`Jina AI API key found with length ${apiKey.length}`);
    if (apiKey.length < 10) {
      console.warn("Warning: JINA_API_KEY seems too short. Please verify your API key.");
    }
    const searchToolName = searchEndpoint === "vip" ? "jina_search_vip" : "jina_search";
    console.error(`Tools registered: jina_reader, ${searchToolName}`);
    console.error(`Search endpoint: ${searchEndpoint === "vip" ? "svip.jina.ai" : "s.jina.ai"}`);
  } else {
    console.error("No Jina AI API key found. Only jina_reader tool registered (works without API key).");
    console.error("To enable search tools, set the JINA_API_KEY environment variable.");
  }
};

export async function startServer(config: ServerConfig): Promise<void> {
  const { cacheSize, host, port, searchEndpoint, tokensPerPage, transport } = config;

  initializeCache(cacheSize);

  const apiKey = getJinaApiKey();
  logRegisteredTools(apiKey, searchEndpoint);

  if (transport === "http") {
    const app = createHttpApp(() => createMcpServer({
      apiKey,
      searchEndpoint,
      tokensPerPage
    }), { host });
    const accessHost = formatHostForUrl(host);

    const httpServer = app.listen(port, host, () => {
      console.error(`Jina MCP Server running on http://${accessHost}:${port}/mcp`);
      console.error("Transport: HTTP (Streamable)");
      console.error(`Bound host: ${host}`);
    });

    httpServer.on("error", (error: Error) => {
      console.error("Server error:", error);
      process.exit(1);
    });

    return;
  }

  console.error("Transport: stdio");
  serveStdio(() => createMcpServer({
    apiKey,
    searchEndpoint,
    tokensPerPage
  }), {
    onerror: (error) => console.error("MCP stdio error:", error)
  });
}

export async function runCli(args = process.argv.slice(2)): Promise<void> {
  try {
    await startServer(parseArgs(args));
  } catch (error) {
    if (error instanceof CliHelpRequested) {
      console.error(error.message);
      process.exit(error.exitCode);
    }

    if (error instanceof CliUsageError) {
      console.error(formatCliError(error));
      process.exit(error.exitCode);
    }

    console.error("Server error:", error);
    process.exit(1);
  }
}
