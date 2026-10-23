/**
 * Truncate long text keeping the head and tail, which is where compiler errors,
 * test summaries and stack traces usually live.
 */
export function truncateMiddle(text: string, maxChars: number, label = 'characters'): string {
  if (text.length <= maxChars) return text;
  const headLen = Math.floor(maxChars * 0.4);
  const tailLen = maxChars - headLen;
  const omitted = text.length - headLen - tailLen;
  return `${text.slice(0, headLen)}\n\n[... ${omitted} ${label} omitted ...]\n\n${text.slice(text.length - tailLen)}`;
}

export function truncateEnd(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n[... truncated ${text.length - maxChars} characters]`;
}

/** Rough token estimate. Calibrated by the context manager when real counts are known. */
export function estimateTokens(text: string, charsPerToken = 3.5): number {
  return Math.ceil(text.length / charsPerToken);
}

const ANSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*(\u0007|\u001b\\)|\u001b[()][0-9A-B]/g;
export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}

/** Stable JSON stringify (sorted keys) used for loop detection signatures. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return 'unknown';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function isProbablyBinary(buf: Buffer): boolean {
  const len = Math.min(buf.length, 8192);
  for (let i = 0; i < len; i++) if (buf[i] === 0) return true;
  return false;
}
