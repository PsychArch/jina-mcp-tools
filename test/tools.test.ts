import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeCache } from "../src/cache.js";
import { readUrl } from "../src/reader.js";
import { searchJina } from "../src/search.js";
import { searchJinaVip } from "../src/search_vip.js";

const proxyEnvNames = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy"
] as const;

const savedEnv = new Map<string, string | undefined>();

const jsonResponse = (body: unknown, status = 200): Response => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
};

const textResponse = (body: string, status = 200): Response => {
  return new Response(body, { status });
};

beforeEach(() => {
  initializeCache(10);
  for (const name of proxyEnvNames) {
    savedEnv.set(name, process.env[name]);
    delete process.env[name];
  }
  savedEnv.set("JINA_API_KEY", process.env["JINA_API_KEY"]);
  delete process.env["JINA_API_KEY"];
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const [name, value] of savedEnv) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  savedEnv.clear();
});

describe("jina_reader behavior", () => {
  it("returns cached pages without fetching a second time", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: { content: "Cached reader content" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await readUrl({ url: "https://example.com/article" }, 1000);
    const second = await readUrl({ url: "https://example.com/article" }, 1000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.content[0]?.text).toContain("Cached reader content");
    expect(second.content[0]?.text).toContain("Cached reader content");
  });

  it("includes a next-page hint for paginated reader content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: { content: "one two three four five six seven eight nine ten ".repeat(30) }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await readUrl({ url: "https://example.com/long" }, 20);

    expect(result.content[0]?.text).toContain("Page 1 of");
    expect(result.content[0]?.text).toContain("Next page: call jina_reader with page 2.");
  });

  it("does not include a next-page hint on the final reader page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: { content: "one two three four five six seven eight nine ten ".repeat(30) }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await readUrl({ url: "https://example.com/long-final" }, 20);
    const totalPages = Number(first.content[0]?.text.match(/^Page 1 of (\d+)/)?.[1]);
    const result = await readUrl({
      url: "https://example.com/long-final",
      page: totalPages
    }, 20);

    expect(totalPages).toBeGreaterThan(1);
    expect(result.content[0]?.text).toContain(`Page ${totalPages} of`);
    expect(result.content[0]?.text).not.toContain("Next page:");
  });

  it("tries direct markdown for allowlisted URLs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse("# Direct markdown"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await readUrl({
      url: "https://developers.cloudflare.com/agents/getting-started/"
    }, 1000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://developers.cloudflare.com/agents/getting-started/");
    expect(result.content[0]?.text).toContain("# Direct markdown");
  });

  it("falls back to Jina when direct markdown returns empty content", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(textResponse("  "))
      .mockResolvedValueOnce(jsonResponse({ data: { content: "Jina fallback content" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await readUrl({
      url: "https://blog.cloudflare.com/markdown-for-agents/"
    }, 1000);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://r.jina.ai/");
    expect(result.content[0]?.text).toContain("Jina fallback content");
  });

  it("returns useful MCP errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse("bad upstream", 502));
    vi.stubGlobal("fetch", fetchMock);

    const result = await readUrl({ url: "https://example.com/fails" }, 1000);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("Jina Reader API error (502)");
  });
});

describe("search tools", () => {
  it("passes API headers, site filters, and count for standard search", async () => {
    process.env["JINA_API_KEY"] = "test-token";
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      code: 200,
      data: [
        { title: "One", url: "https://one.example", description: "first" },
        { title: "Two", url: "https://two.example", description: "second" }
      ]
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchJina({
      query: "hello world",
      count: 1,
      siteFilter: "example.com"
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://s.jina.ai/?q=hello%20world");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        Authorization: "Bearer test-token",
        "X-Site": "example.com"
      }
    });
    expect(result.content[0]?.text).toContain("[1] Title: One");
    expect(result.content[0]?.text).not.toContain("[2] Title: Two");
  });

  it("passes API headers, site filters, and count for VIP search", async () => {
    process.env["JINA_API_KEY"] = "test-token";
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      results: [
        { title: "VIP One", url: "https://one.example", snippet: "first" },
        { title: "VIP Two", url: "https://two.example", snippet: "second" }
      ]
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchJinaVip({
      query: "vip",
      count: 1,
      siteFilter: "example.com"
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://svip.jina.ai/?q=vip");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        Authorization: "Bearer test-token",
        "X-Site": "example.com"
      }
    });
    expect(result.content[0]?.text).toContain("[1] Title: VIP One");
    expect(result.content[0]?.text).not.toContain("[2] Title: VIP Two");
  });

  it("returns MCP errors for failed search responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      code: 401,
      message: "missing auth"
    }, 401));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchJina({ query: "secret" });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("missing auth");
  });
});
