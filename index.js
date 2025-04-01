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
  version: "1.0.0",
  description: "Jina AI tools for web reading, search, and fact-checking"
});

// WEB READER TOOL
server.tool(
  "jina_reader",
  "Read and extract content from web pages using Jina AI's powerful web reader",
  {
    url: z.string().url().describe("URL of the webpage to read and extract content from"),
    format: z.enum(["Default", "Markdown", "HTML", "Text", "Screenshot", "Pageshot"])
      .optional()
      .default("Markdown")
      .describe("Output format for the extracted content"),
    withLinks: z.boolean()
      .optional()
      .default(false)
      .describe("Include links in the extracted content"),
    withImages: z.boolean()
      .optional()
      .default(false)
      .describe("Include images in the extracted content")
  },
  async ({ url, format, withLinks, withImages }) => {
    try {
      const headers = createHeaders({
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-With-Links-Summary": withLinks ? "true" : "false",
        "X-With-Images-Summary": withImages ? "true" : "false",
        "X-Return-Format": format.toLowerCase()
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
          text: data.data && data.data.content ? data.data.content : JSON.stringify(data, null, 2)
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
server.tool(
  "jina_search",
  "Search the web for information using Jina AI's semantic search engine",
  {
    query: z.string().nonempty().describe("Search query to find information on the web"),
    count: z.number()
      .optional()
      .default(5)
      .describe("Number of search results to return"),
    returnFormat: z.enum(["markdown", "text", "html"])
      .optional()
      .default("markdown")
      .describe("Format of the returned search results")
  },
  async ({ query, count, returnFormat }) => {
    try {
      const encodedQuery = encodeURIComponent(query);
      const headers = createHeaders({
        "Accept": "application/json",
        "X-Respond-With": "no-content"
      });

      const response = await fetch(`https://s.jina.ai/?q=${encodedQuery}`, {
        method: "GET",
        headers
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Jina Search API error (${response.status}): ${errorText}`);
      }

      const text = await response.text();
      
      return {
        content: [{ 
          type: "text", 
          text: text
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

// FACT-CHECK TOOL
server.tool(
  "jina_fact_check",
  "Verify the factuality of statements using Jina AI's fact-checking capability",
  {
    statement: z.string().nonempty().describe("Statement to fact-check for accuracy"),
    deepdive: z.boolean()
      .optional()
      .default(false)
      .describe("Enable deep analysis with more comprehensive research")
  },
  async ({ statement, deepdive }) => {
    try {
      const headers = createHeaders({
        "Content-Type": "application/json",
        "Accept": "application/json"
      });

      const response = await fetch("https://g.jina.ai/", {
        method: "POST",
        headers,
        body: JSON.stringify({ 
          statement,
          deepdive
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Jina Fact-Check API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify(data, null, 2)
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
      console.log(`Jina AI API key found with length ${apiKey.length}`);
      if (apiKey.length < 10) {
        console.warn("Warning: JINA_API_KEY seems too short. Please verify your API key.");
      }
    } else {
      console.log("No Jina AI API key found. Running in keyless mode with possible rate limitations.");
    }

    // Connect the server to stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    // Successfully connected
    console.log("Jina MCP Tools server started successfully.");
    console.log("Server is running as Model Context Protocol tool provider.");
  } catch (error) {
    console.error(`Error starting Jina MCP Tools server: ${error.message}`);
    process.exit(1);
  }
}

// Execute the main function
main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});