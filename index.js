#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch";

// Get Jina API key from environment (optional)
const getJinaApiKey = () => {
  return process.env.JINA_API_KEY || null;
};

// Helper to create headers with or without API key
const createHeaders = (baseHeaders = {}) => {
  const headers = { ...baseHeaders };
  const apiKey = getJinaApiKey();
  
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  
  return headers;
};

// Create MCP server for Jina AI tools
const server = new McpServer({
  name: "jina-mcp-tools",
  version: "1.0.4",
  description: "Jina AI tools for web reading and search"
});

// READER TOOL
server.registerTool(
  "jina_reader",
  {
    title: "Jina Web Reader", 
    description: "Read and extract content from web pages using Jina AI's powerful web reader",
    inputSchema: {
      url: z.string().url().describe("URL of the webpage to read and extract content from"),
      format: z.enum(["Default", "Markdown", "HTML", "Text", "Screenshot", "Pageshot"])
        .optional()
        .default("Default")
        .describe("Output format for the extracted content"),
      withLinks: z.boolean().optional().default(false).describe("Include links in the extracted content"),
      withImages: z.boolean().optional().default(false).describe("Include images in the extracted content"),
      useReaderLM: z.boolean().optional().default(false).describe("Use ReaderLM-v2 for better HTML processing")
    }
  },
  async ({ url, format, withLinks, withImages, useReaderLM }) => {
    try {
      const headers = createHeaders({
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-With-Links-Summary": withLinks ? "true" : "false",
        "X-With-Images-Summary": withImages ? "true" : "false", 
        "X-Return-Format": format.toLowerCase(),
        "X-Respond-With": useReaderLM ? "readerlm-v2" : undefined,
        "X-With-Generated-Alt": "true",
        "X-With-Iframe": "true",
        "X-With-Shadow-Dom": "true"
      });

      const response = await fetch("https://r.jina.ai/", {
        method: "POST",
        headers,
        body: JSON.stringify({ url })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Jina Reader API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return {
        content: [{ 
          type: "text", 
          text: data.data?.content || JSON.stringify(data, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// SEARCH TOOL  
server.registerTool(
  "jina_search",
  {
    title: "Jina Web Search",
    description: "Search the web for information using Jina AI's semantic search engine", 
    inputSchema: {
      query: z.string().min(1).describe("Search query to find information on the web"),
      count: z.number().optional().default(5).describe("Number of search results to return"),
      returnFormat: z.enum(["markdown", "text", "html"]).optional().default("markdown").describe("Format of the returned search results"),
      siteFilter: z.string().optional().describe("Limit search to specific domain (e.g., 'github.com')")
    }
  },
  async ({ query, count, returnFormat, siteFilter }) => {
    try {
      const encodedQuery = encodeURIComponent(query);
      const baseHeaders = {
        "Accept": "application/json",
        "X-Respond-With": "no-content",
        "X-With-Favicons": "true"
      };
      
      if (siteFilter) {
        baseHeaders["X-Site"] = `https://${siteFilter}`;
      }
      
      const headers = createHeaders(baseHeaders);

      const response = await fetch(`https://s.jina.ai/?q=${encodedQuery}`, {
        method: "GET", 
        headers
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Jina Search API error (${response.status}): ${errorText}`);
      }

      const text = await response.text();
      const data = JSON.parse(text);
      let results = data.data || [];
      
      if (count && count > 0 && results.length > count) {
        results = results.slice(0, count);
      }
      
      results = results.map(result => {
        if (result.usage) delete result.usage;
        return result;
      });
      
      let formattedOutput;
      if (returnFormat === 'markdown') {
        formattedOutput = results.map((result, index) => {
          return `${index + 1}. **${result.title || 'Untitled'}**\n   ${result.url || ''}\n   ${result.description || ''}\n   ${result.date ? `Date: ${result.date}` : ''}\n`;
        }).join('\n');
      } else if (returnFormat === 'html') {
        formattedOutput = `<ol>${results.map(result => 
          `<li><strong>${result.title || 'Untitled'}</strong><br>
           <a href="${result.url || ''}">${result.url || ''}</a><br>
           ${result.description || ''}<br>
           ${result.date ? `Date: ${result.date}` : ''}</li>`
        ).join('')}</ol>`;
      } else {
        formattedOutput = results.map((result, index) => {
          return `${index + 1}. ${result.title || 'Untitled'}\n   ${result.url || ''}\n   ${result.description || ''}\n   ${result.date ? `Date: ${result.date}` : ''}`;
        }).join('\n\n');
      }
      
      return {
        content: [{ 
          type: "text", 
          text: formattedOutput
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: `Error: ${error.message}`
        }],
        isError: true
      };
    }
  }
);


// Main function to start the server
async function main() {
  try {
    // Check for API key (now optional)
    const apiKey = getJinaApiKey();
    if (apiKey) {
      console.error(`Jina AI API key found with length ${apiKey.length}`);
      if (apiKey.length < 10) {
        console.warn("Warning: JINA_API_KEY seems too short. Please verify your API key.");
      }
    } else {
      console.error("No Jina AI API key found. Some features may be limited.");
    }

    // Connect the server to stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
  } catch (error) {
    console.error("Server error:", error);
    process.exit(1);
  }
}

// Execute the main function
main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
