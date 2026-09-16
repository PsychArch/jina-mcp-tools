import type { ToolTextResult } from "./types.js";
import { searchInputSchema, formatSearchResults, type SearchInput } from "./search_shared.js";
import { McpServer } from "@modelcontextprotocol/server";
import { createHeaders, getJinaApiKey } from "./utils.js";
import { JinaVipSearchResponse } from "./types.js";

export async function searchJinaVip(
  { query, count = 5, siteFilter }: SearchInput,
  apiKey: string | null = getJinaApiKey()
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

    const headers = createHeaders(baseHeaders, apiKey);

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
    const formattedText = formatSearchResults(limitedResults.map(result => ({ ...result, description: result.snippet })));

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

export function registerSearchVipTool(server: McpServer, apiKey: string | null = getJinaApiKey()): void {
  server.registerTool(
    "jina_search_vip",
    {
      title: "Web Search",
      description: `Search the web. The response includes only partial contents of each web page. Use jina reader for full content.`,
      inputSchema: searchInputSchema
    },
    async (args) => searchJinaVip(args, apiKey)
  );
}
