const patterns: RegExp[] = [
  /\b(sk|pk|key|token|secret|session|sess|ghp|xoxb|xapp|AIza|sk-or-v1)[A-Za-z0-9_\-.:/+=]{12,}\b/gi,
  /\bBearer\s+[A-Za-z0-9_\-.:/+=]{10,}\b/gi,
  /\bAuthorization\s*:\s*[^,\n\r}]+/gi,
  /\bCookie\s*:\s*[^,\n\r}]+/gi,
  /\bSet-Cookie\s*:\s*[^,\n\r}]+/gi,
  /("?(?:api[_-]?key|authorization|cookie|token|secret|session)"?\s*[:=]\s*)("[^"]+"|'[^']+'|[^,\n\r}]+)/gi
];

export function redactSecrets(value: unknown): string {
  let text =
    typeof value === "string"
      ? value
      : value === undefined
        ? ""
        : JSON.stringify(value, null, 2);

  for (const pattern of patterns) {
    text = text.replace(pattern, (match, prefix) => {
      if (typeof prefix === "string" && /[:=]\s*$/.test(prefix)) {
        return `${prefix}[REDACTED]`;
      }
      return "[REDACTED]";
    });
  }

  return text;
}

export function keyPreview(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "saved";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
