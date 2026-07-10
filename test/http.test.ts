import { describe, expect, it } from "vitest";
import request from "supertest";
import { createHttpApp, createMcpServer } from "../src/index.js";

describe("HTTP transport", () => {
  it("accepts JSON-RPC initialize requests at POST /mcp", async () => {
    const app = createHttpApp(() => createMcpServer({
      apiKey: null,
      searchEndpoint: "standard",
      tokensPerPage: 1000
    }));

    const response = await request(app)
      .post("/mcp")
      .set("Accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "DRAFT-2026-v1",
          capabilities: {},
          clientInfo: {
            name: "vitest",
            version: "1.0.0"
          }
        }
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        serverInfo: {
          name: "jina-mcp-tools"
        }
      }
    });
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
      id: null
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
    const app = createHttpApp(() => createMcpServer({
      apiKey: null,
      searchEndpoint: "standard",
      tokensPerPage: 1000
    }));

    const response = await request(app).get("/mcp");

    expect(response.status).toBe(405);
    expect(response.headers.allow).toBe("POST");
  });
});
