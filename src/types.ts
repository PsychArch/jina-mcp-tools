// Page structure for pagination
export interface Page {
  pageNum: number;
  content: string;
  tokens: number;
}

// Cached content structure
export interface CachedContent {
  url: string;
  content: string;
  totalTokens: number;
  pages: Page[];
  timestamp: number;
}

// GitHub URL detection result
export interface GitHubUrlResult {
  isGitHub: boolean;
  convertedUrl: string;
  originalUrl: string;
  shouldBypassJina: boolean;
}

// Jina Search API types
export interface JinaSearchResult {
  title: string;
  url: string;
  description?: string;
  date?: string;
}

export interface JinaSearchResponse {
  code: number;
  message?: string;
  data?: JinaSearchResult[];
}

// Jina Reader API types
export interface JinaReaderResponse {
  data?: {
    content?: string;
    links?: [string, string][];
  };
}

// VIP Search API types
export interface JinaVipSearchResponse {
  results?: Array<{
    title: string;
    url: string;
    snippet?: string;
    date?: string;
  }>;
  message?: string;
  error?: string;
}
