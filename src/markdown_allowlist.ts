export type MarkdownNegotiationRule = {
  host: string;
  pathPrefixes?: readonly string[];
};

export const markdownNegotiationRules: readonly MarkdownNegotiationRule[] = [
  { host: "developers.cloudflare.com" },
  { host: "blog.cloudflare.com" },
  { host: "developer.wordpress.org" },
  { host: "vercel.com", pathPrefixes: ["/docs", "/blog"] },
  { host: "mintlify.com", pathPrefixes: ["/docs"] }
];
