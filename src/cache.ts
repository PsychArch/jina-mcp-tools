import { CachedContent } from './types.js';

export class LRUCache {
  private maxSize: number;
  private cache: Map<string, CachedContent>;

  constructor(maxSize: number = 50) {
    this.maxSize = maxSize;
    this.cache = new Map<string, CachedContent>();
  }

  set(url: string, data: Omit<CachedContent, 'timestamp'>): void {
    if (this.cache.has(url)) {
      this.cache.delete(url);
    }

    this.cache.set(url, {
      ...data,
      timestamp: Date.now()
    });

    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value as string;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
  }

  get(url: string): CachedContent | null {
    if (!this.cache.has(url)) {
      return null;
    }

    const data = this.cache.get(url)!;
    this.cache.delete(url);
    this.cache.set(url, data);

    return data;
  }

  has(url: string): boolean {
    return this.cache.has(url);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Default cache instance - will be initialized with configurable size
export let contentCache: LRUCache;

// Initialize cache with specified size
export function initializeCache(maxSize: number = 50): void {
  contentCache = new LRUCache(maxSize);
}
