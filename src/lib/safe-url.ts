import { defaultUrlTransform } from 'react-markdown';

/** Allows only https: and mailto: URLs in rendered content (SECURITY §8); anything else becomes ''. */
export function safeUrl(url: string): string {
  const transformed = defaultUrlTransform(url);
  return /^(https:|mailto:)/i.test(transformed) ? transformed : '';
}
