import type { ToolTextResult } from "./types.js";
import { searchInputSchema, formatSearchResults, type SearchInput } from "./search_shared.js";
import { McpServer } from "@modelcontextprotocol/server";
import { createHeaders, getJinaApiKey } from "./utils.js";
import { JinaSearchResponse } from "./types.js";

export async function searchJina(
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
    const formattedText = formatSearchResults(limitedData);

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

export function registerSearchTool(server: McpServer, apiKey: string | null = getJinaApiKey()): void {
  server.registerTool(
    "jina_search",
    {
      title: "Web Search",
      description: `Search the web. The response includes only partial contents of each web page. Use jina reader for full content.`,
      inputSchema: searchInputSchema
    },
    async (args) => searchJina(args, apiKey)
  );
}
