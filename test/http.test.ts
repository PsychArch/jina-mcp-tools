import { once } from "node:events";
import type { Server } from "node:http";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { initializeCache } from "../src/cache.js";
import { createHttpApp, createMcpServer } from "../src/index.js";

const startHttpApp = async (
  app: ReturnType<typeof createHttpApp>
): Promise<{ server: Server; url: URL }> => {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected HTTP server to listen on a TCP port");
  }

  return {
    server,
    url: new URL(`http://127.0.0.1:${address.port}/mcp`)
  };
};

const stopHttpServer = async (server: Server): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
};

const createTestApp = () => createHttpApp(() => createMcpServer({
  apiKey: null,
  searchEndpoint: "standard",
  tokensPerPage: 1000
}), {
  allowedHosts: [],
  allowedOrigins: [],
  authToken: ""
});

describe("HTTP transport", () => {
  it("accepts legacy initialize requests at POST /mcp", async () => {
    const app = createTestApp();

    const response = await request(app)
      .post("/mcp")
      .set("Accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: {
            name: "vitest",
            version: "1.0.0"
          }
        }
      });

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.text).toContain('"protocolVersion":"2025-11-25"');
    expect(response.text).toContain('"name":"jina-mcp-tools"');
  });

  it.each([
    ["legacy", "legacy" as const],
    ["2026-07-28", "modern" as const]
  ])("serves tools over the %s protocol era", async (mode, expectedEra) => {
    initializeCache(10);
    const app = createTestApp();
    const { server, url } = await startHttpApp(app);
    const nativeFetch = globalThis.fetch;
    const client = new Client(
      { name: `http-${expectedEra}-test`, version: "1.0.0" },
      {
        versionNegotiation: {
          mode: mode === "legacy" ? "legacy" : { pin: mode }
        }
      }
    );
    const transport = new StreamableHTTPClientTransport(url, { fetch: nativeFetch });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { content: `Reader content over ${expectedEra}` }
    }), {
      headers: { "Content-Type": "application/json" }
    })));

    try {
      await client.connect(transport, { timeout: 5000 });
      const tools = await client.listTools(undefined, { timeout: 5000 });
      const result = await client.callTool({
        name: "jina_reader",
        arguments: { url: `https://example.com/${expectedEra}` }
      }, { timeout: 5000 });

      expect(client.getProtocolEra()).toBe(expectedEra);
      expect(tools.tools.map((tool) => tool.name)).toContain("jina_reader");
      expect(result.content).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining(`Reader content over ${expectedEra}`)
        })
      ]));
    } finally {
      await client.close();
      await stopHttpServer(server);
      vi.unstubAllGlobals();
    }
  });

  it("returns JSON-RPC -32603 for internal errors before headers are sent", async () => {
    const app = createHttpApp(() => {
      throw new Error("boom");
    });

    const response = await request(app)
      .post("/mcp")
      .send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: "Internal server error"
      },
      id: 1
    });
  });

  it("requires bearer auth when an HTTP auth token is configured", async () => {
    const app = createHttpApp(() => createMcpServer({
      apiKey: null,
      searchEndpoint: "standard",
      tokensPerPage: 1000
    }), {
      authToken: "secret"
    });

    const response = await request(app)
      .post("/mcp")
      .send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe("Unauthorized");
  });

  it("handles allowed CORS preflight before bearer auth", async () => {
    const app = createHttpApp(() => createMcpServer({
      apiKey: null,
      searchEndpoint: "standard",
      tokensPerPage: 1000
    }), {
      allowedOrigins: ["https://client.example"],
      authToken: "secret"
    });

    const response = await request(app)
      .options("/mcp")
      .set("Origin", "https://client.example")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization,content-type");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("https://client.example");
    expect(response.headers["access-control-allow-methods"]).toContain("POST");
    expect(response.headers["access-control-allow-headers"]).toContain("Authorization");
    expect(response.headers["access-control-allow-headers"]).toContain("MCP-Protocol-Version");
    expect(response.headers.vary).toContain("Origin");
  });

  it("rejects browser origins outside the allowlist", async () => {
    const app = createHttpApp(() => createMcpServer({
      apiKey: null,
      searchEndpoint: "standard",
      tokensPerPage: 1000
    }), {
      allowedOrigins: ["https://allowed.example"]
    });

    const response = await request(app)
      .post("/mcp")
      .set("Origin", "https://evil.example")
      .send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });

    expect(response.status).toBe(403);
    expect(response.body.error.message).toBe("Origin is not allowed");
  });

  it("reports unsupported HTTP methods on /mcp", async () => {
    const app = createTestApp();

    const response = await request(app).get("/mcp");

    expect(response.status).toBe(405);
    expect(response.headers.allow).toBe("POST");
  });

  it("rejects non-local Host headers on the default loopback bind", async () => {
    const response = await request(createTestApp())
      .post("/mcp")
      .set("Host", "evil.example")
      .send({ jsonrpc: "2.0", id: 1, method: "ping" });

    expect(response.status).toBe(403);
  });
});
