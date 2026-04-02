import { GitHubUrlResult } from './types.js';
import { ProxyAgent } from 'proxy-agent';

const fetchAgent = new ProxyAgent();

export const getJinaApiKey = (): string | null => {
  return process.env.JINA_API_KEY || null;
};

export const createHeaders = (baseHeaders: Record<string, string> = {}): Record<string, string> => {
  const headers: Record<string, string> = { ...baseHeaders };
  const apiKey = getJinaApiKey();

  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  return headers;
};

export const getFetchAgent = (): ProxyAgent => {
  return fetchAgent;
};

export const handleGitHubUrl = (url: string): GitHubUrlResult => {
  const isGitHub = url.includes('github.com') && url.includes('/blob/');

  if (isGitHub) {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/?(.*)/);
    let convertedUrl: string;

    if (match) {
      const [, owner, repo, ref, path] = match;
      const isCommitHash = /^[a-f0-9]{40}$/i.test(ref);

      if (isCommitHash) {
        convertedUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
      } else {
        convertedUrl = `https://raw.githubusercontent.com/${owner}/${repo}/refs/heads/${ref}/${path}`;
      }
    } else {
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

export const buildJinaHeaders = (isGitHub: boolean): Record<string, string> => {
  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "X-Md-Link-Style": "discarded",
    "X-With-Links-Summary": "all",
    "X-Retain-Images": "none"
  };

  if (isGitHub) {
    return {
      ...baseHeaders,
      "X-Engine": "direct",
      "X-Return-Format": "text",
      "X-Timeout": "10"
    };
  }

  return baseHeaders;
};
