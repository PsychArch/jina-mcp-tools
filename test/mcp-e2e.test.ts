import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { describe, expect, it } from "vitest";

const article = "Hello 世界. A paragraph with enough words for pagination.\n\n".repeat(12);
const timeout = { timeout: 5000 };
type UpstreamRequest = { url: string; method: string; headers: Record<string, unknown>; body: string };

async function startHarness(transportKind: string, era: string, endpoint: string, withKey = true) {
  const requests: UpstreamRequest[] = [];
  const upstream = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString();
    const url = String(req.headers["x-test-original-url"]);
    requests.push({ url, method: req.method!, headers: req.headers, body });
    res.setHeader("Content-Type", "application/json");
    if (body.includes("/failure") || url.includes("q=failure")) {
      res.writeHead(429).end(JSON.stringify({ code: 429, message: "fixture rate limit" }));
    } else if (url === "https://r.jina.ai/") {
      res.end(JSON.stringify({ data: { content: article } }));
    } else if (["s.jina.ai", "svip.jina.ai"].includes(new URL(url).hostname)) {
      const results = [1, 2].map(n => ({
        title: `Result ${n}`, url: `https://example.com/${n}`,
        description: `Description ${n}`, snippet: `Description ${n}`
      }));
      res.end(JSON.stringify({ code: 200, data: results, results }));
    } else if (url === "https://developers.cloudflare.com/html") {
      res.setHeader("Content-Type", "text/html");
      res.end("<html>Not negotiated markdown</html>");
    } else if (url === "https://developers.cloudflare.com/fallback") {
      res.writeHead(503).end("unavailable");
    } else if (url === "https://developers.cloudflare.com/direct" || url.startsWith("https://raw.githubusercontent.com/")) {
      res.setHeader("Content-Type", "text/markdown");
      res.end("# Direct content");
    } else {
      res.writeHead(500).end("Unexpected upstream URL");
    }
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  const address = upstream.address();
  if (!address || typeof address === "string") throw new Error("No upstream port");
  // Explicit environment: never inherit real credentials, proxy settings or NODE_OPTIONS.
  const env = {
    PATH: process.env.PATH ?? "",
    JINA_API_KEY: withKey ? "e2e-dummy-api-key" : "",
    JINA_TEST_UPSTREAM: `http://127.0.0.1:${address.port}`,
    JINA_TEST_SEARCH_ENDPOINT: endpoint
  };
  const client = new Client({ name: "e2e-client", version: "1.0.0" }, {
    versionNegotiation: { mode: era === "legacy" ? "legacy" : { pin: "2026-07-28" } }
  });
  let child: ChildProcess | undefined;
  let diagnostics = "";
  let url: URL | undefined;
  const close = async () => {
    try { await client.close(); } finally {
      if (child && child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit");
        child.kill("SIGKILL");
        await exited;
      }
      upstream.closeAllConnections();
      await new Promise<void>((done, reject) => upstream.close(error => error ? reject(error) : done()));
    }
  };
  try {
    const preload = resolve("test/fixtures/upstream-preload.mjs");
    if (transportKind === "stdio") {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: ["--import", preload, resolve("dist/cli.js"), "--tokens-per-page", "40", "--cache-size", "2", "--search-endpoint", endpoint],
        env, stderr: "pipe"
      });
      transport.stderr?.on("data", data => { diagnostics += data; });
      await client.connect(transport, timeout);
    } else {
      child = fork(resolve("test/fixtures/http-server.mjs"), [], {
        execArgv: ["--import", preload], env, silent: true
      });
      child.stderr?.on("data", data => { diagnostics += data; });
      const port = await new Promise<number>((done, reject) => {
        const timer = setTimeout(() => reject(new Error(`HTTP startup timed out: ${diagnostics}`)), 5000);
        child!.once("message", message => { clearTimeout(timer); done((message as { port: number }).port); });
        child!.once("error", error => { clearTimeout(timer); reject(error); });
        child!.once("exit", code => { clearTimeout(timer); reject(new Error(`HTTP exited ${code}: ${diagnostics}`)); });
      });
      url = new URL(`http://127.0.0.1:${port}/mcp`);
      await client.connect(new StreamableHTTPClientTransport(url, {
        requestInit: { headers: { Authorization: "Bearer e2e-http-token", Origin: "https://client.example" } }
      }), timeout);
    }
    return { client, requests, close, url };
  } catch (error) {
    await close();
    throw new Error(`E2E startup failed: ${diagnostics}`, { cause: error });
  }
}

function textOf(result: Awaited<ReturnType<Client["callTool"]>>) {
  expect(result.isError).not.toBe(true);
  return result.content.map(item => item.type === "text" ? item.text : "").join("\n");
}

describe.each(["stdio", "http"])("compiled MCP E2E: %s", transport => {
  describe.each(["legacy", "modern"])("%s protocol", era => {
    it.each(["standard", "vip"])("completes reader and %s search flows", async endpoint => {
      const h = await startHarness(transport, era, endpoint);
      try {
        expect(h.client.getProtocolEra()).toBe(era);
        const search = endpoint === "vip" ? "jina_search_vip" : "jina_search";
        const listed = await h.client.listTools(undefined, timeout);
        expect(listed.tools.map(t => t.name).sort()).toEqual(["jina_reader", search].sort());
        expect(listed.tools[0].inputSchema.type).toBe("object");
        const call = (name: string, args: Record<string, unknown>) => h.client.callTool({ name, arguments: args }, timeout);
        const read = (args: Record<string, unknown>) => call("jina_reader", args);
        const url = "https://example.com/article";
        const first = textOf(await read({ url, customTimeout: 7 }));
        const total = Number(first.match(/^Page 1 of (\d+)/)?.[1]);
        expect(total).toBeGreaterThan(1);
        expect(first).toContain("Next page: call jina_reader with page 2.");
        let reconstructed = first.split("=".repeat(60) + "\n\n")[1];
        for (let page = 2; page <= total; page++) {
          const text = textOf(await read({ url, page }));
          expect(text).toContain(`Page ${page} of ${total}`);
          if (page === total) expect(text).not.toContain("Next page:");
          reconstructed += text.split("=".repeat(60) + "\n\n")[1];
        }
        expect(reconstructed).toBe(article);
        expect(h.requests).toHaveLength(1);
        expect(h.requests[0]).toMatchObject({
          url: "https://r.jina.ai/", method: "POST", body: JSON.stringify({ url }),
          headers: { authorization: "Bearer e2e-dummy-api-key", "x-timeout": "7" }
        });
        expect((await read({ url, page: total + 1 })).isError).toBe(true);
        const found = textOf(await call(search, { query: "hello 世界 & MCP", count: 1, siteFilter: "example.com" }));
        expect(found).toContain("[1] Title: Result 1");
        expect(found).toContain("Description 1");
        expect(found).not.toContain("Result 2");
        expect(h.requests.at(-1)).toMatchObject({
          url: `https://${endpoint === "vip" ? "svip" : "s"}.jina.ai/?q=${encodeURIComponent("hello 世界 & MCP")}`,
          method: "GET", headers: { authorization: "Bearer e2e-dummy-api-key", "x-site": "example.com" }
        });
        const beforeInvalid = h.requests.length;
        for (const args of [{}, { url: "not-a-url" }, { url, page: 0 }, { url, page: 1.5 }, { url, customTimeout: -1 }, { url, customTimeout: 2147484 }]) {
          expect((await read(args)).isError).toBe(true);
        }
        for (const args of [{ query: "" }, { query: "test", count: -1 }, { query: "test", count: 1.5 }]) {
          expect((await call(search, args)).isError).toBe(true);
        }
        expect(h.requests).toHaveLength(beforeInvalid);
        await expect(call("missing_tool", {})).rejects.toMatchObject({ code: -32602 });
        for (const [name, args] of [["jina_reader", { url: "https://example.com/failure" }], [search, { query: "failure" }]] as const) {
          const result = await call(name, args);
          expect(result.isError).toBe(true);
          expect(JSON.stringify(result.content)).toContain("fixture rate limit");
        }
        expect(textOf(await read({ url }))).toBe(first);
        expect((await h.client.listTools(undefined, timeout)).tools).toHaveLength(2);

        if (h.url) {
          const unauthorized = await fetch(h.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
          expect(unauthorized.status).toBe(401);
          await unauthorized.text();
          const forbidden = await fetch(h.url, { method: "POST", headers: { Authorization: "Bearer e2e-http-token", Origin: "https://evil.example" } });
          expect(forbidden.status).toBe(403);
          await forbidden.text();
        }
      } finally { await h.close(); }
    }, 20000);

    it("supports anonymous reader, direct markdown, fallback and GitHub", async () => {
      const h = await startHarness(transport, era, "standard", false);
      try {
        expect((await h.client.listTools(undefined, timeout)).tools.map(t => t.name)).toEqual(["jina_reader"]);
        const read = (url: string) => h.client.callTool({ name: "jina_reader", arguments: { url } }, timeout);
        expect(textOf(await read("https://developers.cloudflare.com/direct"))).toContain("# Direct content");
        expect(h.requests).toHaveLength(1);
        expect(h.requests[0].headers.accept).toBe("text/markdown");
        expect(textOf(await read("https://developers.cloudflare.com/fallback"))).toContain("Hello");
        expect(h.requests.slice(1).map(r => r.url)).toEqual(["https://developers.cloudflare.com/fallback", "https://r.jina.ai/"]);
        expect(textOf(await read("https://github.com/example/repo/blob/main/README.md"))).toContain("# Direct content");
        expect(h.requests.at(-1)?.url).toBe("https://raw.githubusercontent.com/example/repo/refs/heads/main/README.md");
        expect(h.requests.every(r => r.headers.authorization === undefined)).toBe(true);
        // Cache size is two: the first URL must have been evicted.
        await read("https://developers.cloudflare.com/direct");
        expect(h.requests).toHaveLength(5);
        const htmlFallback = textOf(await read("https://developers.cloudflare.com/html"));
        expect(htmlFallback).toContain("Hello");
        expect(htmlFallback).not.toContain("<html>");
        expect(h.requests.slice(-2).map(r => r.url)).toEqual(["https://developers.cloudflare.com/html", "https://r.jina.ai/"]);
      } finally { await h.close(); }
    }, 15000);
  });
});
