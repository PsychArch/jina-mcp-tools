import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createHeaders } from "./utils.js";
import { JinaSearchResponse } from "./types.js";

interface SearchInput {
  query: string;
  count?: number;
  siteFilter?: string;
}

type ToolTextResult = {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
};

export async function searchJina(
  { query, count = 5, siteFilter }: SearchInput
): Promise<ToolTextResult> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const baseHeaders: Record<string, string> = {
      "Accept": "application/json",
      "X-Respond-With": "no-content",
    };

    if (siteFilter) {
      baseHeaders["X-Site"] = siteFilter;
    }

    const headers = createHeaders(baseHeaders);

    const response = await fetch(`https://s.jina.ai/?q=${encodedQuery}`, {
      method: "GET",
      headers
    });

    const jsonResponse = await response.json() as JinaSearchResponse;

    if (!response.ok || jsonResponse.code !== 200) {
      throw new Error(jsonResponse.message || `Jina Search API error (${response.status})`);
    }

    const data = jsonResponse.data || [];
    const limitedData = data.slice(0, count);
    const formattedText = limitedData.map((result, index) => {
      const num = index + 1;
      let text = `[${num}] Title: ${result.title}\n`;
      text += `[${num}] URL Source: ${result.url}\n`;
      if (result.description) {
        text += `[${num}] Description: ${result.description}\n`;
      }
      if (result.date) {
        text += `[${num}] Date: ${result.date}\n`;
      }
      return text;
    }).join('\n');

    return {
      content: [{
        type: "text",
        text: formattedText
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

export function registerSearchTool(server: McpServer): void {
  server.registerTool(
    "jina_search",
    {
      title: "Web Search",
      description: `Search the web. The response includes only partial contents of each web page. Use jina reader for full content.`,
      inputSchema: {
        query: z.string().min(1).describe("Search query"),
        count: z.number().optional().default(5).describe("Number of search results to return"),
        siteFilter: z.string().optional().describe("Limit search to specific domain (e.g., 'github.com')")
      }
    },
    async (args) => searchJina(args)
  );
}
