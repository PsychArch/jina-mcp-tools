import { z } from "zod";
import fetch from "node-fetch";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createHeaders } from "./utils.js";
import { JinaVipSearchResponse } from "./types.js";

export function registerSearchVipTool(server: McpServer): void {
  server.registerTool(
    "jina_search_vip",
    {
      title: "Web Search",
      description: `Search the web. The response includes only partial contents of each web page. Use jina reader for full content.`,
      inputSchema: {
        query: z.string().min(1).describe("Search query to find information on the web"),
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

        const response = await fetch(`https://svip.jina.ai/?q=${encodedQuery}`, {
          method: "GET",
          headers
        });

        const jsonResponse = await response.json() as JinaVipSearchResponse;

        if (!response.ok) {
          const errorMessage = jsonResponse.message || jsonResponse.error || `Jina VIP Search API error (${response.status})`;
          throw new Error(errorMessage);
        }

        const results = jsonResponse.results || [];
        const limitedResults = results.slice(0, count);
        const formattedText = limitedResults.map((result, index) => {
          const num = index + 1;
          let text = `[${num}] Title: ${result.title}\n`;
          text += `[${num}] URL Source: ${result.url}\n`;
          if (result.snippet) {
            text += `[${num}] Description: ${result.snippet}\n`;
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
