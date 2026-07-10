import { describe, expect, it } from "vitest";
import {
  handleGitHubUrl,
  shouldTryMarkdownNegotiation
} from "../src/utils.js";

describe("handleGitHubUrl", () => {
  it("converts branch blob URLs to raw URLs", () => {
    expect(handleGitHubUrl("https://github.com/owner/repo/blob/main/src/index.ts")).toMatchObject({
      isGitHub: true,
      convertedUrl: "https://raw.githubusercontent.com/owner/repo/refs/heads/main/src/index.ts",
      shouldBypassJina: true
    });
  });

  it("converts commit blob URLs to raw URLs without refs/heads", () => {
    const commit = "0123456789abcdef0123456789abcdef01234567";
    expect(handleGitHubUrl(`https://github.com/owner/repo/blob/${commit}/README.md`)).toMatchObject({
      isGitHub: true,
      convertedUrl: `https://raw.githubusercontent.com/owner/repo/${commit}/README.md`,
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
