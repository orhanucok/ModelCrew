export function estimateTokens(text: string): number {
  return Math.ceil(text.trim().length / 4);
}
