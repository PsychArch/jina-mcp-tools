import { describe, expect, it } from "vitest";
import {
  handleGitHubUrl,
  shouldTryMarkdownNegotiation
} from "../src/utils.js";

describe("handleGitHubUrl", () => {
  it.each([
    ["branch", "main/src/index.ts"],
    ["tag", "v5.0.0/package.json"],
    ["commit", "0123456789abcdef0123456789abcdef01234567/README.md"],
    ["slash-containing branch", "feature/foo/src/index.ts"]
  ])("converts %s blob URLs without assuming a branch ref", (_kind, refAndPath) => {
    const url = `https://github.com/owner/repo/blob/${refAndPath}`;
    expect(handleGitHubUrl(url)).toEqual({
      isGitHub: true,
      convertedUrl: `https://raw.githubusercontent.com/owner/repo/${refAndPath}`,
      originalUrl: url,
      shouldBypassJina: true
    });
  });
});

describe("shouldTryMarkdownNegotiation", () => {
  it.each([
    "https://developers.cloudflare.com/agents/getting-started/",
    "https://blog.cloudflare.com/markdown-for-agents/",
    "https://developer.wordpress.org/reference/functions/get_permalink/",
    "https://vercel.com/docs",
    "https://vercel.com/blog/self-driving-infrastructure",
    "https://mintlify.com/docs"
  ])("allows intended markdown-capable URL %s", (url) => {
    expect(shouldTryMarkdownNegotiation(url)).toBe(true);
  });

  it.each([
    "https://nextjs.org/docs",
    "https://vercel.com/customers/acme",
    "https://mintlify.com/customers",
    "notaurl"
  ])("rejects URL outside the allowlist %s", (url) => {
    expect(shouldTryMarkdownNegotiation(url)).toBe(false);
  });
});
