import { get_encoding, Tiktoken } from '@dqbd/tiktoken';

// Cache the encoder instance
let encoder: Tiktoken | null = null;

/**
 * Get or create the tiktoken encoder instance
 */
export function getEncoder(): Tiktoken {
  if (!encoder) {
    encoder = get_encoding('o200k_base');
  }
  return encoder;
}

/**
 * Count tokens in text using tiktoken
 * Allows special tokens (like <|endoftext|>) to be treated as regular text
 */
export function countTokens(text: string): number {
  const enc = getEncoder();
  const tokens = enc.encode(text, "all");
  return tokens.length;
}

/**
 * Close and free the encoder instance
 */
export function closeEncoder(): void {
  if (encoder) {
    encoder.free();
    encoder = null;
  }
}

// Clean up encoder on process exit
process.on('exit', closeEncoder);
