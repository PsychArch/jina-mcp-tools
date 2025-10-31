import { countTokens } from './tokenizer.js';
import { Page } from './types.js';

export function paginateContent(content: string, tokensPerPage: number): Page[] {
  const pages: Page[] = [];
  let currentPage = 1;
  let start = 0;

  const totalTokens = countTokens(content);
  if (totalTokens <= tokensPerPage) {
    return [{
      pageNum: 1,
      content: content,
      tokens: totalTokens
    }];
  }

  while (start < content.length) {
    let left = start;
    let right = content.length;
    let bestEnd = start + 1;

    while (left < right) {
      const mid = Math.floor((left + right + 1) / 2);
      const chunk = content.substring(start, mid);
      const tokens = countTokens(chunk);

      if (tokens <= tokensPerPage) {
        left = mid;
        bestEnd = mid;
      } else {
        right = mid - 1;
      }
    }

    const chunk = content.substring(start, bestEnd);
    const chunkTokens = countTokens(chunk);
    const naturalEnd = findNaturalBreakPoint(chunk, chunkTokens, tokensPerPage);
    const finalEnd = start + naturalEnd;

    const pageContent = content.substring(start, finalEnd);
    pages.push({
      pageNum: currentPage,
      content: pageContent,
      tokens: countTokens(pageContent)
    });

    start = finalEnd;
    currentPage++;
  }

  return pages;
}

function findNaturalBreakPoint(text: string, currentTokens: number, targetTokens: number): number {
  // Try to find natural break points, but only if we're close to the end
  // This ensures we don't sacrifice too much content for a "natural" break

  // Minimum token threshold: only use natural breaks if we've reached at least 85% of target
  const minTokenRatio = 0.85;
  const hasReachedMinimum = currentTokens >= (targetTokens * minTokenRatio);

  // If we haven't reached the minimum token threshold, use full text
  if (!hasReachedMinimum) {
    return text.length;
  }

  // First priority: paragraph breaks in the last 10% (>0.9)
  const paragraphBreak = text.lastIndexOf('\n\n');
  if (paragraphBreak > text.length * 0.9) {
    return paragraphBreak + 2;
  }

  // Second priority: sentence breaks in the last 10% (>0.9)
  const sentenceBreak = Math.max(
    text.lastIndexOf('. '),
    text.lastIndexOf('! '),
    text.lastIndexOf('? ')
  );
  if (sentenceBreak > text.length * 0.9) {
    return sentenceBreak + 2;
  }

  // Third priority: paragraph breaks in the last 15% (>0.85)
  if (paragraphBreak > text.length * 0.85) {
    return paragraphBreak + 2;
  }

  // Fourth priority: sentence breaks in the last 15% (>0.85)
  if (sentenceBreak > text.length * 0.85) {
    return sentenceBreak + 2;
  }

  // Last resort: word breaks in the last 20% (>0.8)
  const wordBreak = text.lastIndexOf(' ');
  if (wordBreak > text.length * 0.8) {
    return wordBreak + 1;
  }

  // If no good break point found, just use the full text
  return text.length;
}

export function getPage(pages: Page[], pageNum: number): Page | null {
  if (pageNum < 1 || pageNum > pages.length) {
    return null;
  }
  return pages[pageNum - 1];
}
