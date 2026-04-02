import { z } from "zod";
import fetch from "node-fetch";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createHeaders, getFetchAgent } from "./utils.js";
import { JinaSearchResponse } from "./types.js";

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
    async ({ query, count, siteFilter }: {
      query: string;
      count?: number;
      siteFilter?: string
    }) => {
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
          agent: getFetchAgent(),
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
            type: "text" as const,
            text: formattedText
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
