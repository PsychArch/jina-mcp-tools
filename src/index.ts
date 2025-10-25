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

// Parse command line arguments
const args: string[] = process.argv.slice(2);
let tokensPerPage: number = 15000;
let searchEndpoint: 'standard' | 'vip' = 'standard';
let transport: 'stdio' | 'http' = 'stdio';
let port: number = 3000;
let cacheSize: number = 50;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--tokens-per-page' && i + 1 < args.length) {
    const pageTokens = parseInt(args[i + 1]);
    if (!isNaN(pageTokens) && pageTokens > 0) {
      tokensPerPage = pageTokens;
    }
  }
  if (args[i] === '--search-endpoint' && i + 1 < args.length) {
    const endpoint = args[i + 1].toLowerCase();
    if (endpoint === 'standard' || endpoint === 'vip') {
      searchEndpoint = endpoint as 'standard' | 'vip';
    }
  }
  if (args[i] === '--transport' && i + 1 < args.length) {
    const transportType = args[i + 1].toLowerCase();
    if (transportType === 'stdio' || transportType === 'http') {
      transport = transportType as 'stdio' | 'http';
    }
  }
  if (args[i] === '--port' && i + 1 < args.length) {
    const portNum = parseInt(args[i + 1]);
    if (!isNaN(portNum) && portNum > 0 && portNum <= 65535) {
      port = portNum;
    }
  }
  if (args[i] === '--cache-size' && i + 1 < args.length) {
    const cacheSizeNum = parseInt(args[i + 1]);
    if (!isNaN(cacheSizeNum) && cacheSizeNum > 0) {
      cacheSize = cacheSizeNum;
    }
  }
}

// Initialize cache with configured size
initializeCache(cacheSize);

// Create MCP server for Jina AI tools
const server = new McpServer({
  name: "jina-mcp-tools",
  version: "1.2.0",
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

      app.listen(port, () => {
        console.error(`Jina MCP Server running on http://localhost:${port}/mcp`);
        console.error(`Transport: HTTP (Streamable)`);
      }).on('error', (error: Error) => {
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
