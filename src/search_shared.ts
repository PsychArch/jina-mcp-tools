import { z } from "zod";
import type { JinaSearchResult } from "./types.js";

export const searchInputSchema = z.object({
  query: z.string().min(1).describe("Search query"),
  count: z.number().int().positive().optional().default(5).describe("Number of search results to return"),
  siteFilter: z.string().optional().describe("Limit search to specific domain (e.g., 'github.com')")
});

export interface SearchInput {
  query: string;
  count?: number;
  siteFilter?: string;
}

export function formatSearchResults(results: JinaSearchResult[]): string {
  return results.map((result, index) => {
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
}
