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
  version: "1.1.3",
  description: "Jina AI tools for web reading and search"
});

/**
 * Extraction modes define HOW content is processed from websites
 * These are independent of output format and control engine, selectors, and metadata collection
 */
const ExtractionMode = {
  /** Balanced speed and quality - uses direct engine with links summary (DEFAULT) */
  STANDARD: "standard",
  /** Maximum data extraction - uses browser engine with links + images summary */  
  COMPREHENSIVE: "comprehensive",
  /** Clean content focus - removes ads, navigation, noise using CSS selectors */
  CLEAN_CONTENT: "clean_content"
};

/**
 * Output formats define HOW content is returned to the user
 * These work with any extraction mode and control the structure and includes
 */
const OutputFormat = {
  /** Jina API's native format - no X-Return-Format header (DEFAULT) */
  DEFAULT: "default",
  /** Structured markdown with headers and links - uses X-Return-Format: markdown */
  MARKDOWN: "markdown", 
  /** Plain text only, fastest processing - uses X-Return-Format: text */
  TEXT: "text",
  /** Rich metadata with links and images - uses markdown + summaries */
  STRUCTURED: "structured"
};

/**
 * Detects if a URL is a GitHub file URL and handles it directly without Jina reader
 * @param {string} url - The URL to check and potentially convert
 * @returns {{isGitHub: boolean, convertedUrl: string, originalUrl: string, shouldBypassJina: boolean}}
 */
const handleGitHubUrl = (url) => {
  const isGitHub = url.includes('github.com') && url.includes('/blob/');
  
  if (isGitHub) {
    // Convert blob URLs to raw.githubusercontent.com format
    // Pattern: https://github.com/owner/repo/blob/ref/path -> https://raw.githubusercontent.com/owner/repo/refs/heads/branch/path
    // Or: https://github.com/owner/repo/blob/commit-hash/path -> https://raw.githubusercontent.com/owner/repo/commit-hash/path
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/?(.*)/);
    let convertedUrl;
    
    if (match) {
      const [, owner, repo, ref, path] = match;
      
      // Check if ref looks like a commit hash (40 chars, hex) or branch name
      const isCommitHash = /^[a-f0-9]{40}$/i.test(ref);
      
      if (isCommitHash) {
        // Direct commit hash
        convertedUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
      } else {
        // Branch name - add refs/heads/ prefix
        convertedUrl = `https://raw.githubusercontent.com/${owner}/${repo}/refs/heads/${ref}/${path}`;
      }
    } else {
      // Fallback to simple replacement if regex doesn't match
      convertedUrl = url
        .replace('github.com', 'raw.githubusercontent.com')
        .replace('/blob/', '/');
    }
    
    return {
      isGitHub: true,
      convertedUrl,
      originalUrl: url,
      shouldBypassJina: true
    };
  }
  
  return {
    isGitHub: false,
    convertedUrl: url,
    originalUrl: url,
    shouldBypassJina: false
  };
};

/**
 * Maps extraction mode and output format combinations to Jina API parameters
 * @param {string} mode - ExtractionMode value
 * @param {string} format - OutputFormat value  
 * @param {boolean} isGitHub - Whether this is a GitHub URL (overrides other settings)
 * @returns {object} Jina API headers object
 */
const buildJinaHeaders = (mode, format, isGitHub) => {
  const baseHeaders = {
    "Content-Type": "application/json",
    "Accept": "application/json"
  };

  // GitHub URLs get special optimized treatment regardless of user options
  if (isGitHub) {
    return {
      ...baseHeaders,
      "X-Engine": "direct",
      "X-Return-Format": "text",
      "X-Timeout": "10"
    };
  }

  // Apply extraction mode settings
  switch (mode) {
    case ExtractionMode.STANDARD:
      baseHeaders["X-Engine"] = "direct";
      baseHeaders["X-With-Links-Summary"] = "true";
      baseHeaders["X-Timeout"] = "10";
      break;
      
    case ExtractionMode.COMPREHENSIVE:
      baseHeaders["X-Engine"] = "browser";
      baseHeaders["X-With-Links-Summary"] = "true";
      baseHeaders["X-With-Images-Summary"] = "true";
      baseHeaders["X-Timeout"] = "15";
      break;
      
    case ExtractionMode.CLEAN_CONTENT:
      baseHeaders["X-Engine"] = "browser";
      baseHeaders["X-Target-Selector"] = "main,article,.content";
      baseHeaders["X-Remove-Selector"] = "nav,header,footer,.sidebar,.ads";
      baseHeaders["X-Timeout"] = "15";
      break;
  }

  // Apply output format settings
  switch (format) {
    case OutputFormat.DEFAULT:
      // No X-Return-Format header - uses Jina's native format
      break;
      
    case OutputFormat.MARKDOWN:
      baseHeaders["X-Return-Format"] = "markdown";
      break;
      
    case OutputFormat.TEXT:
      baseHeaders["X-Return-Format"] = "text";
      break;
      
    case OutputFormat.STRUCTURED:
      baseHeaders["X-Return-Format"] = "markdown";
      baseHeaders["X-With-Links-Summary"] = "true";
      baseHeaders["X-With-Images-Summary"] = "true";
      break;
  }

  return baseHeaders;
};

// READER TOOL - Elegant Enum Interface
server.registerTool(
  "jina_reader",
  {
    title: "Jina Web Reader",
    description: `Read and extract content from web page.`,
    inputSchema: {
      url: z.string().url().describe("URL of the webpage to read and extract content from"),
      mode: z.enum(["standard", "comprehensive", "clean_content"])
        .optional()
        .default("standard")
        .describe(`Extraction mode - how content is processed:
• "standard" - Best for technical document pages (direct engine, links)
• "comprehensive" - Maximum data extraction for media-rich pages (browser engine, links + images)  
• "clean_content" - Remove ads, navigation, noise (CSS selectors)`),
      format: z.enum(["default", "markdown", "text", "structured"])
        .optional()
        .default("default")  
        .describe(`Output format - how content is returned:
• "default" - Markdown focusing on main content -- best for technical documents
• "markdown" - Markdown with headers
• "text" - Plain text only
• "structured" - Rich metadata (links + images)`),
      customTimeout: z.number().optional().describe("Override timeout in seconds for slow sites")
    }
  },
  async ({ url, mode = "standard", format = "default", customTimeout }) => {
    try {
      // Handle GitHub URL detection and conversion
      const { isGitHub, convertedUrl, originalUrl, shouldBypassJina } = handleGitHubUrl(url);
      const actualUrl = convertedUrl;

      // For GitHub repo files, bypass Jina and fetch directly
      if (shouldBypassJina) {
        const directResponse = await fetch(actualUrl);
        
        if (!directResponse.ok) {
          throw new Error(`GitHub API error (${directResponse.status}): ${directResponse.statusText}`);
        }

        // Raw file content
        const content = await directResponse.text();

        return {
          content: [{ 
            type: "text", 
            text: content
          }]
        };
      }

      // Regular Jina processing for non-GitHub URLs
      const jinaHeaders = buildJinaHeaders(mode, format, isGitHub);
      
      if (customTimeout) {
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

      const data = await response.json();
      
      const responseData = data.data || {};
      const resultText = responseData.content || "No content extracted";

      return {
        content: [{ 
          type: "text", 
          text: resultText
        }]
      };
    } catch (error) {
      return {
        content: [{ 
          type: "text", 
          text: error.message
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
    description: `Search the web. The response includes only partial contents of each web page. Use jina reader for full content.`, 
    inputSchema: {
      query: z.string().min(1).describe("Search query to find information on the web"),
      count: z.number().optional().default(5).describe("Number of search results to return"),
      siteFilter: z.string().optional().describe("Limit search to specific domain (e.g., 'github.com')")
    }
  },
  async ({ query, count, siteFilter }) => {
    try {
      const encodedQuery = encodeURIComponent(query);
      const baseHeaders = {
        "X-Respond-With": "no-content",
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
          text: error.message
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
