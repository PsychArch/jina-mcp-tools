import { describe, expect, it } from "vitest";
import { LRUCache } from "../src/cache.js";
import { getPage, paginateContent } from "../src/pagination.js";

describe("paginateContent", () => {
  it("keeps pages within the token budget and rejects invalid pages", () => {
    const pages = paginateContent("one two three four five six seven eight nine ten ".repeat(30), 20);

    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((page) => page.tokens <= 20)).toBe(true);
    expect(getPage(pages, 1)).toBe(pages[0]);
    expect(getPage(pages, 0)).toBeNull();
    expect(getPage(pages, pages.length + 1)).toBeNull();
  });

  it("prefers a natural paragraph break near the page boundary", () => {
    const content = `${"alpha beta gamma delta ".repeat(14)}\n\n${"tail ".repeat(60)}`;
    const pages = paginateContent(content, 60);

    expect(pages.length).toBeGreaterThan(1);
    expect(pages[0]?.content.endsWith("\n\n")).toBe(true);
  });
});

describe("LRUCache", () => {
  const content = {
    url: "https://example.com",
    content: "text",
    totalTokens: 1,
    pages: [{ pageNum: 1, content: "text", tokens: 1 }]
  };

  it("evicts the oldest entry", () => {
    const cache = new LRUCache(2);
    cache.set("a", { ...content, url: "a" });
    cache.set("b", { ...content, url: "b" });
    cache.set("c", { ...content, url: "c" });

    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(true);
    expect(cache.has("c")).toBe(true);
  });

  it("refreshes recently read entries", () => {
    const cache = new LRUCache(2);
    cache.set("a", { ...content, url: "a" });
    cache.set("b", { ...content, url: "b" });

    expect(cache.get("a")?.url).toBe("a");
    cache.set("c", { ...content, url: "c" });

    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
  });
});
