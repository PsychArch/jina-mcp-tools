import { hostHeaderValidation, localhostHostValidation } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler, type McpServer } from "@modelcontextprotocol/server";
import express, { type ErrorRequestHandler, type Express, type Request, type Response } from "express";
import { DEFAULT_CONFIG } from "./config.js";

interface HttpAppOptions {
  allowedOrigins?: readonly string[];
  allowedHosts?: readonly string[];
  authToken?: string | null;
  host?: string;
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

const parseAllowedHosts = (): string[] => {
  const value = process.env.JINA_MCP_ALLOWED_HOSTS;
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
};

const isLocalhostBind = (host: string): boolean => {
  return ["localhost", "127.0.0.1", "::1"].includes(host);
};

const isLocalhostOrigin = (origin: string): boolean => {
  try {
    const parsed = new URL(origin);
    return ["http:", "https:"].includes(parsed.protocol)
      && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
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
  const allowedHosts = options.allowedHosts ?? parseAllowedHosts();
  const authToken = options.authToken ?? process.env.JINA_MCP_HTTP_AUTH_TOKEN ?? null;
  const host = options.host ?? DEFAULT_CONFIG.host;

  app.disable("x-powered-by");

  if (allowedHosts.length > 0) {
    app.use(hostHeaderValidation([...allowedHosts]));
  } else if (isLocalhostBind(host)) {
    app.use(localhostHostValidation());
  } else {
    console.warn(
      `Warning: HTTP server is binding to ${host} without Host header validation. `
      + "Set JINA_MCP_ALLOWED_HOSTS to the public hostnames accepted by this server."
    );
  }

  app.use("/mcp", (req, res, next) => {
    const origin = req.header("origin");

    if (!isOriginAllowed(origin, allowedOrigins)) {
      rejectJson(res, 403, "Origin is not allowed");
      return;
    }

    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name"
      );
      res.vary("Origin");
    }

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
    }

    if (!hasValidBearerToken(req, authToken)) {
      rejectJson(res, 401, "Unauthorized");
      return;
    }

    next();
  });

  const mcpHandler = createMcpHandler(serverFactory, {
    onerror: (error) => console.error("Error handling MCP request:", error)
  });
  const nodeHandler = toNodeHandler(mcpHandler, {
    onerror: (error) => console.error("Error adapting MCP request:", error)
  });

  // Validate access before parsing untrusted request bodies.
  app.all("/mcp", express.json({ limit: "100kb" }), async (req, res) => {
    await nodeHandler(req, res, req.body);
  });

  // Express's development error handler exposes stack traces and local paths.
  const handleError: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const status = Number(error?.status);
    const clientError = Number.isInteger(status) && status >= 400 && status < 500;
    rejectJson(res, clientError ? status : 500,
      status === 413 ? "Request body too large" : clientError ? "Invalid request body" : "Internal server error");
  };
  app.use(handleError);

  return app;
}
