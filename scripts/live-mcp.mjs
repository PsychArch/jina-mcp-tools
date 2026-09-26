// Opt-in, billable live smoke. Never included in the default test suite.
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { createHttpApp, createMcpServer } from "../dist/index.js";
import { initializeCache } from "../dist/cache.js";

const key = process.env.JINA_API_KEY;
if (!key) throw new Error("Set JINA_API_KEY before running live smoke tests");
const redact = value => String(value).split(key).join("[REDACTED]");
const results = [];
const requestOptions = { timeout: 45000 };
const readerUrl = "https://modelcontextprotocol.io/specification/2025-11-25/server/tools";

async function check(name, run) {
  const started = Date.now();
  try {
    const details = await run();
    const result = { name, status: "PASS", ms: Date.now() - started, ...details };
    results.push(result);
    console.log(redact(JSON.stringify(result)));
  } catch (error) {
    const result = { name, status: "FAIL", ms: Date.now() - started, error: redact(error.message) };
    results.push(result);
    console.log(JSON.stringify(result));
    process.exitCode = 1;
  }
}

function resultText(result) {
  const text = result.content.filter(item => item.type === "text").map(item => item.text).join("\n");
  assert.notEqual(result.isError, true, `Tool failed: ${redact(text).slice(0, 400)}`);
  assert.ok(text.trim().length > 0, "Empty tool result");
  return text;
}

const cases = [
  ["stdio", "legacy", "standard"],
  ["http", "modern", "standard"],
  ["stdio", "modern", "vip"],
  ["http", "legacy", "vip"]
];
const selected = process.argv[2];
if (selected && !cases.some(parts => parts.join("/") === selected)) {
  throw new Error("Optional argument must name a case such as stdio/modern/vip");
}
for (const [kind, era, endpoint] of cases.filter(parts => !selected || parts.join("/") === selected)) {
  const prefix = `${kind}/${era}/${endpoint}`;
  const client = new Client({ name: "jina-live-smoke", version: "1.0.0" }, {
    versionNegotiation: { mode: era === "legacy" ? "legacy" : { pin: "2026-07-28" } }
  });
  let server;
  try {
    await check(`${prefix}/connect-and-list`, async () => {
      let transport;
      if (kind === "stdio") {
        const env = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined));
        // Prevent test preload inheritance; retain the user's network/proxy configuration.
        delete env.JINA_TEST_UPSTREAM;
        transport = new StdioClientTransport({
          command: process.execPath,
          args: [fileURLToPath(new URL("../dist/cli.js", import.meta.url)), "--search-endpoint", endpoint, "--tokens-per-page", "256"],
          env, stderr: "pipe"
        });
        transport.stderr?.resume();
      } else {
        initializeCache(10);
        const token = randomUUID();
        const app = createHttpApp(() => createMcpServer({ searchEndpoint: endpoint, tokensPerPage: 256 }), {
          allowedHosts: [], allowedOrigins: [], authToken: token
        });
        server = app.listen(0, "127.0.0.1");
        await once(server, "listening");
        const url = new URL(`http://127.0.0.1:${server.address().port}/mcp`);
        const denied = await fetch(url, { method: "POST" });
        assert.equal(denied.status, 401);
        await denied.text();
        const unsupported = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        assert.equal(unsupported.status, 405);
        await unsupported.text();
        transport = new StreamableHTTPClientTransport(url, {
          requestInit: { headers: { Authorization: `Bearer ${token}` } }
        });
      }
      await client.connect(transport, requestOptions);
      assert.equal(client.getProtocolEra(), era);
      const tools = (await client.listTools(undefined, requestOptions)).tools.map(tool => tool.name).sort();
      assert.deepEqual(tools, ["jina_reader", endpoint === "vip" ? "jina_search_vip" : "jina_search"].sort());
      return { tools };
    });
    if (results.at(-1).status === "FAIL") continue;

    if (endpoint === "standard") {
      await check(`${prefix}/reader-and-pagination`, async () => {
        const read = page => client.callTool({ name: "jina_reader", arguments: { url: readerUrl, page, customTimeout: 20 } }, requestOptions);
        const first = resultText(await read(1));
        const total = Number(first.match(/^Page 1 of (\d+)/)?.[1]);
        assert.ok(total > 1, "Expected multiple pages at 256 tokens/page");
        assert.match(first, /tool/i);
        const second = resultText(await read(2));
        assert.ok(second.startsWith(`Page 2 of ${total}`));
        const repeated = resultText(await read(1));
        assert.equal(repeated, first);
        const last = resultText(await read(total));
        assert.ok(last.startsWith(`Page ${total} of ${total}`));
        assert.ok(!last.includes("Next page:"));
        return { url: readerUrl, pages: total, firstPageCharacters: first.length, repeatedPageIdentical: true };
      });
    }
    await check(`${prefix}/search`, async () => {
      const text = resultText(await client.callTool({
        name: endpoint === "vip" ? "jina_search_vip" : "jina_search",
        arguments: { query: "Model Context Protocol tools specification", count: 2 }
      }, requestOptions));
      assert.match(text, /\[1\] Title: .+/);
      assert.match(text, /URL Source: https?:\/\//);
      assert.ok(!text.includes("[3] Title:"));
      return { resultCount: (text.match(/\[\d+\] Title:/g) ?? []).length, characters: text.length };
    });
  } finally {
    await client.close();
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }
}
console.log(JSON.stringify({ finishedAt: new Date().toISOString(), passed: results.filter(r => r.status === "PASS").length, failed: results.filter(r => r.status === "FAIL").length }));
