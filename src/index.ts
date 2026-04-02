#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { getJinaApiKey } from "./utils.js";
import { registerReaderTool } from "./reader.js";
import { registerSearchTool } from "./search.js";
import { registerSearchVipTool } from "./search_vip.js";
import { initializeCache } from "./cache.js";

type SearchEndpoint = "standard" | "vip";
type TransportType = "stdio" | "http";

interface ServerConfig {
  cacheSize: number;
  host: string;
  port: number;
  searchEndpoint: SearchEndpoint;
  tokensPerPage: number;
  transport: TransportType;
}

const DEFAULT_CONFIG: ServerConfig = {
  cacheSize: 50,
  host: "127.0.0.1",
  port: 3000,
  searchEndpoint: "standard",
  tokensPerPage: 15000,
  transport: "stdio"
};

const USAGE = `Usage: jina-mcp-tools [options]

Options:
  --transport <stdio|http>         Transport type (default: stdio)
  --host <host>                    Host/interface to bind in HTTP mode (default: 127.0.0.1)
  --port <1-65535>                 HTTP server port (default: 3000)
  --tokens-per-page <positive-int> Tokens per page for pagination (default: 15000)
  --search-endpoint <standard|vip> Search endpoint to use (default: standard)
  --cache-size <positive-int>      Reader cache size (default: 50)
  -h, --help                       Show this help message`;

const formatHostForUrl = (hostValue: string): string => {
  return hostValue.includes(':') && !hostValue.startsWith('[') ? `[${hostValue}]` : hostValue;
};

const failCli = (message: string): never => {
  console.error(message);
  console.error("");
  console.error(USAGE);
  process.exit(1);
};

const getOptionValue = (args: string[], index: number, option: string): string => {
  const value = args[index + 1];

  if (value === undefined) {
    failCli(`Missing value for ${option}.`);
  }

  if (value.startsWith("-")) {
    failCli(`Expected a value for ${option}, received another option: ${value}`);
  }

  return value;
};

const parsePositiveInteger = (
  value: string,
  option: string,
  max?: number
): number => {
  if (!/^\d+$/.test(value)) {
    failCli(`Invalid value for ${option}: ${value}. Expected a positive integer.`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    failCli(`Invalid value for ${option}: ${value}. Expected a positive integer.`);
  }

  if (max !== undefined && parsed > max) {
    failCli(`Invalid value for ${option}: ${value}. Maximum allowed value is ${max}.`);
  }

  return parsed;
};

const parseArgs = (args: string[]): ServerConfig => {
  const config: ServerConfig = { ...DEFAULT_CONFIG };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "-h":
      case "--help":
        console.error(USAGE);
        process.exit(0);
      case "--tokens-per-page":
        config.tokensPerPage = parsePositiveInteger(
          getOptionValue(args, i, arg),
          arg
        );
        i++;
        break;
      case "--search-endpoint": {
        const endpoint = getOptionValue(args, i, arg).toLowerCase();
        if (endpoint !== "standard" && endpoint !== "vip") {
          failCli(`Invalid value for ${arg}: ${endpoint}. Expected standard or vip.`);
        }
        config.searchEndpoint = endpoint as SearchEndpoint;
        i++;
        break;
      }
      case "--transport": {
        const transport = getOptionValue(args, i, arg).toLowerCase();
        if (transport !== "stdio" && transport !== "http") {
          failCli(`Invalid value for ${arg}: ${transport}. Expected stdio or http.`);
        }
        config.transport = transport as TransportType;
        i++;
        break;
      }
      case "--port":
        config.port = parsePositiveInteger(getOptionValue(args, i, arg), arg, 65535);
        i++;
        break;
      case "--host": {
        const host = getOptionValue(args, i, arg).trim();
        if (!host) {
          failCli(`Invalid value for ${arg}: host cannot be empty.`);
        }
        config.host = host;
        i++;
        break;
      }
      case "--cache-size":
        config.cacheSize = parsePositiveInteger(getOptionValue(args, i, arg), arg);
        i++;
        break;
      default:
        failCli(`Unknown argument: ${arg}`);
    }
  }

  return config;
};

const {
  cacheSize,
  host,
  port,
  searchEndpoint,
  tokensPerPage,
  transport
} = parseArgs(process.argv.slice(2));

// Initialize cache with configured size
initializeCache(cacheSize);

// Create MCP server for Jina AI tools
const server = new McpServer({
  name: "jina-mcp-tools",
  version: "1.2.1",
  description: "Jina AI tools for web reading and search"
});

// Get API key to determine which tools to register
const apiKey = getJinaApiKey();

// Register tools based on API key availability
if (apiKey) {
  // API key available - register all tools
  registerReaderTool(server, tokensPerPage);

  // Register search tool based on selected endpoint
  if (searchEndpoint === 'vip') {
    registerSearchVipTool(server);
  } else {
    registerSearchTool(server);
  }
} else {
  // No API key - register only reader tool (works without API key)
  registerReaderTool(server, tokensPerPage);
}

// Main function to start the server
async function main(): Promise<void> {
  try {
    if (apiKey) {
      console.error(`Jina AI API key found with length ${apiKey.length}`);
      if (apiKey.length < 10) {
        console.warn("Warning: JINA_API_KEY seems too short. Please verify your API key.");
      }
      const searchToolName = searchEndpoint === 'vip' ? 'jina_search_vip' : 'jina_search';
      console.error(`Tools registered: jina_reader, ${searchToolName}`);
      console.error(`Search endpoint: ${searchEndpoint === 'vip' ? 'svip.jina.ai' : 's.jina.ai'}`);
    } else {
      console.error("No Jina AI API key found. Only jina_reader tool registered (works without API key).");
      console.error("To enable search tools, set the JINA_API_KEY environment variable.");
    }

    if (transport === 'http') {
      // HTTP transport mode
      const app = express();
      app.use(express.json());

      app.post('/mcp', async (req, res) => {
        try {
          // Create a new transport for each request to prevent request ID collisions
          const httpTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true
          });

          res.on('close', () => {
            httpTransport.close();
          });

          await server.connect(httpTransport);
          await httpTransport.handleRequest(req, res, req.body);
        } catch (error) {
          console.error('Error handling MCP request:', error);
          if (!res.headersSent) {
            res.status(500).json({
              jsonrpc: '2.0',
              error: {
                code: -32603,
                message: 'Internal server error'
              },
              id: null
            });
          }
        }
      });

      const listeningHost = host;
      const accessHost = formatHostForUrl(host);
      const onListen = (): void => {
        console.error(`Jina MCP Server running on http://${accessHost}:${port}/mcp`);
        console.error(`Transport: HTTP (Streamable)`);
        console.error(`Bound host: ${listeningHost}`);
      };

      const httpServer = app.listen(port, host, onListen);

      httpServer.on('error', (error: Error) => {
        console.error('Server error:', error);
        process.exit(1);
      });
    } else {
      // stdio transport mode (default)
      console.error(`Transport: stdio`);
      const stdioTransport = new StdioServerTransport();
      await server.connect(stdioTransport);
    }

  } catch (error) {
    console.error("Server error:", error);
    process.exit(1);
  }
}

// Execute the main function
main().catch((error: Error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
