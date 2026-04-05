import { z } from "zod";
import fetch from "node-fetch";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { countTokens } from "./tokenizer.js";
import { contentCache } from "./cache.js";
import { paginateContent, getPage } from "./pagination.js";
import {
  createHeaders,
  getFetchAgent,
  handleGitHubUrl,
  buildJinaHeaders,
  shouldTryMarkdownNegotiation
} from "./utils.js";
import { JinaReaderResponse } from "./types.js";

async function fetchMarkdownNegotiatedContent(
  url: string,
  customTimeout?: number
): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = customTimeout
    ? setTimeout(() => controller.abort(), customTimeout * 1000)
    : undefined;

  try {
    const response = await fetch(url, {
      agent: getFetchAgent(),
      headers: {
        Accept: "text/markdown"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      return null;
    }

    const content = await response.text();
    if (!content.trim()) {
      return null;
    }

    return content;
  } catch {
    return null;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export function registerReaderTool(
  server: McpServer,
  tokensPerPage: number
): void {
  server.registerTool(
    "jina_reader",
    {
      title: "Jina Web Reader",
      description: `Read and extract content from web page.`,
      inputSchema: {
        url: z.string().url().describe("URL of the webpage to read and extract content from"),
        customTimeout: z.number().optional().describe("Override timeout in seconds for slow sites"),
        page: z.number().optional().default(1).describe("Page number for paginated content (1-indexed)")
      }
    },
    async ({ url, customTimeout, page = 1 }: {
      url: string;
      customTimeout?: number;
      page?: number;
    }) => {
      try {
        if (contentCache.has(url)) {
          const cached = contentCache.get(url);
          if (!cached) {
            throw new Error("Cache error: Content not found");
          }

          const requestedPage = getPage(cached.pages, page);

          if (!requestedPage) {
            throw new Error(`Page ${page} not found. Total pages: ${cached.pages.length}`);
          }

          const paginationInfo = `Page ${page} of ${cached.pages.length} | ${requestedPage.tokens} tokens`;

          return {
            content: [{
              type: "text" as const,
              text: `${paginationInfo}\n${'='.repeat(60)}\n\n${requestedPage.content}`
            }]
          };
        }

        const { isGitHub, convertedUrl, originalUrl, shouldBypassJina } = handleGitHubUrl(url);
        const actualUrl = convertedUrl;

        let content: string;

        if (shouldBypassJina) {
          const directResponse = await fetch(actualUrl, {
            agent: getFetchAgent()
          });

          if (!directResponse.ok) {
            throw new Error(`GitHub API error (${directResponse.status}): ${directResponse.statusText}`);
          }

          content = await directResponse.text();
        } else {
          const markdownContent = shouldTryMarkdownNegotiation(originalUrl)
            ? await fetchMarkdownNegotiatedContent(originalUrl, customTimeout)
            : null;

          if (markdownContent) {
            content = markdownContent;
          } else {
            const jinaHeaders = buildJinaHeaders(isGitHub);

            if (customTimeout) {
              jinaHeaders["X-Timeout"] = customTimeout.toString();
            }

            const headers = createHeaders(jinaHeaders);

            const response = await fetch("https://r.jina.ai/", {
              agent: getFetchAgent(),
              method: "POST",
              headers,
              body: JSON.stringify({ url: actualUrl })
            });

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Jina Reader API error (${response.status}): ${errorText}`);
            }

            const data = await response.json() as JinaReaderResponse;
            const responseData = data.data || {};
            content = responseData.content || "No content extracted";
          }
        }

        const pages = paginateContent(content, tokensPerPage);

        contentCache.set(url, {
          url,
          content,
          totalTokens: countTokens(content),
          pages
        });

        const requestedPage = getPage(pages, page);
        if (!requestedPage) {
          throw new Error(`Page ${page} not found. Total pages: ${pages.length}`);
        }

        const paginationInfo = `Page ${page} of ${pages.length} | ${requestedPage.tokens} tokens`;

        return {
          content: [{
            type: "text" as const,
            text: `${paginationInfo}\n${'='.repeat(60)}\n\n${requestedPage.content}`
          }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [{
            type: "text" as const,
            text: errorMessage
          }],
          isError: true
        };
      }
    }
  );
}
