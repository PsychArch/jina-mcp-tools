import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type Express, type Request, type Response } from "express";
import { initializeCache } from "./cache.js";
import { registerReaderTool } from "./reader.js";
import { registerSearchTool } from "./search.js";
import { registerSearchVipTool } from "./search_vip.js";
import { getJinaApiKey } from "./utils.js";

type SearchEndpoint = "standard" | "vip";
type TransportType = "stdio" | "http";

export interface ServerConfig {
  cacheSize: number;
  host: string;
  port: number;
  searchEndpoint: SearchEndpoint;
  tokensPerPage: number;
  transport: TransportType;
}

interface McpServerOptions {
  apiKey?: string | null;
  searchEndpoint: SearchEndpoint;
  tokensPerPage: number;
}

interface HttpAppOptions {
  allowedOrigins?: readonly string[];
  authToken?: string | null;
}

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version: string };
const SERVER_VERSION = packageJson.version;

export const DEFAULT_CONFIG: ServerConfig = {
  cacheSize: 50,
  host: "127.0.0.1",
  port: 3000,
  searchEndpoint: "standard",
  tokensPerPage: 15000,
  transport: "stdio"
};

export const USAGE = `Usage: jina-mcp-tools [options]

Options:
  --transport <stdio|http>         Transport type (default: stdio)
  --host <host>                    Host/interface to bind in HTTP mode (default: 127.0.0.1)
  --port <1-65535>                 HTTP server port (default: 3000)
  --tokens-per-page <positive-int> Tokens per page for pagination (default: 15000)
  --search-endpoint <standard|vip> Search endpoint to use (default: standard)
  --cache-size <positive-int>      Reader cache size (default: 50)
  -h, --help                       Show this help message`;

export class CliUsageError extends Error {
  readonly exitCode = 1;
}

export class CliHelpRequested extends Error {
  readonly exitCode = 0;

  constructor() {
    super(USAGE);
  }
}

export const formatHostForUrl = (hostValue: string): string => {
  return hostValue.includes(":") && !hostValue.startsWith("[") ? `[${hostValue}]` : hostValue;
};

const failCli = (message: string): never => {
  throw new CliUsageError(message);
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

export const parseArgs = (args: string[]): ServerConfig => {
  const config: ServerConfig = { ...DEFAULT_CONFIG };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === undefined) {
      continue;
    }

    switch (arg) {
      case "-h":
      case "--help":
        throw new CliHelpRequested();
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
        const selectedTransport = getOptionValue(args, i, arg).toLowerCase();
        if (selectedTransport !== "stdio" && selectedTransport !== "http") {
          failCli(`Invalid value for ${arg}: ${selectedTransport}. Expected stdio or http.`);
        }
        config.transport = selectedTransport as TransportType;
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

export const formatCliError = (error: Error): string => {
  return `${error.message}\n\n${USAGE}`;
};

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

  registerReaderTool(server, tokensPerPage);

  if (apiKey) {
    if (searchEndpoint === "vip") {
      registerSearchVipTool(server);
    } else {
      registerSearchTool(server);
    }
  }

  return server;
}

const parseAllowedOrigins = (): string[] => {
  const value = process.env.JINA_MCP_ALLOWED_ORIGINS;
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const isLocalhostOrigin = (origin: string): boolean => {
  try {
    const parsed = new URL(origin);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
};

const isOriginAllowed = (
  origin: string | undefined,
  allowedOrigins: readonly string[]
): boolean => {
  if (!origin) {
    return true;
  }

  return allowedOrigins.includes("*")
    || allowedOrigins.includes(origin)
    || isLocalhostOrigin(origin);
};

const hasValidBearerToken = (
  req: Request,
  authToken: string | null | undefined
): boolean => {
  if (!authToken) {
    return true;
  }

  return req.header("authorization") === `Bearer ${authToken}`;
};

const rejectJson = (res: Response, status: number, message: string): void => {
  res.status(status).json({
    jsonrpc: "2.0",
    error: {
      code: -32603,
      message
    },
    id: null
  });
};

export function createHttpApp(
  serverFactory: () => McpServer,
  options: HttpAppOptions = {}
): Express {
  const app = express();
  const allowedOrigins = options.allowedOrigins ?? parseAllowedOrigins();
  const authToken = options.authToken ?? process.env.JINA_MCP_HTTP_AUTH_TOKEN ?? null;

  app.use(express.json());

  app.use("/mcp", (req, res, next) => {
    const origin = req.header("origin");

    if (!isOriginAllowed(origin, allowedOrigins)) {
      rejectJson(res, 403, "Origin is not allowed");
      return;
    }

    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept");
      res.vary("Origin");
    }

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }

    if (!hasValidBearerToken(req, authToken)) {
      rejectJson(res, 401, "Unauthorized");
      return;
    }

    next();
  });

  app.post("/mcp", async (req, res) => {
    try {
      const httpTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true
      });

      res.on("close", () => {
        void httpTransport.close();
      });

      const requestServer = serverFactory();
      await requestServer.connect(httpTransport);
      await httpTransport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        rejectJson(res, 500, "Internal server error");
      }
    }
  });

  app.get("/mcp", (_req, res) => {
    res.setHeader("Allow", "POST");
    rejectJson(res, 405, "Method not allowed");
  });

  app.delete("/mcp", (_req, res) => {
    res.setHeader("Allow", "POST");
    rejectJson(res, 405, "Method not allowed");
  });

  return app;
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
    }));
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
  const server = createMcpServer({
    apiKey,
    searchEndpoint,
    tokensPerPage
  });
  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
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
