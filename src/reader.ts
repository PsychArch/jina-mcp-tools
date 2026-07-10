import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { countTokens } from "./tokenizer.js";
import { contentCache } from "./cache.js";
import { paginateContent, getPage } from "./pagination.js";
import {
  createHeaders,
  handleGitHubUrl,
  buildJinaHeaders,
  shouldTryMarkdownNegotiation
} from "./utils.js";
import { JinaReaderResponse } from "./types.js";

interface ReaderInput {
  url: string;
  customTimeout?: number;
  page?: number;
}

type ToolTextResult = {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
};

const formatPageText = (
  content: string,
  page: number,
  totalPages: number,
  tokens: number
): string => {
  const paginationInfo = `Page ${page} of ${totalPages} | ${tokens} tokens`;
  const nextPageHint = page < totalPages
    ? `\n\nNext page: call jina_reader with page ${page + 1}.`
    : "";

  return `${paginationInfo}${nextPageHint}\n${'='.repeat(60)}\n\n${content}`;
};

async function fetchMarkdownNegotiatedContent(
  url: string,
  customTimeout?: number
): Promise<string | null> {
  try {
    const init: RequestInit = {
      headers: {
        Accept: "text/markdown"
      }
    };

    if (customTimeout !== undefined) {
      init.signal = AbortSignal.timeout(customTimeout * 1000);
    }

    const response = await fetch(url, init);

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
  }
}

export async function readUrl(
  { url, customTimeout, page = 1 }: ReaderInput,
  tokensPerPage: number
): Promise<ToolTextResult> {
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

      return {
        content: [{
          type: "text",
          text: formatPageText(
            requestedPage.content,
            page,
            cached.pages.length,
            requestedPage.tokens
          )
        }]
      };
    }

    const { isGitHub, convertedUrl, originalUrl, shouldBypassJina } = handleGitHubUrl(url);
    const actualUrl = convertedUrl;

    let content: string;

    if (shouldBypassJina) {
      const directResponse = await fetch(actualUrl);

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

        if (customTimeout !== undefined) {
          jinaHeaders["X-Timeout"] = customTimeout.toString();
        }

        const headers = createHeaders(jinaHeaders);

        const response = await fetch("https://r.jina.ai/", {
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

    return {
      content: [{
        type: "text",
        text: formatPageText(
          requestedPage.content,
          page,
          pages.length,
          requestedPage.tokens
        )
      }]
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{
        type: "text",
        text: errorMessage
      }],
      isError: true
    };
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
    async (args) => readUrl(args, tokensPerPage)
  );
}
