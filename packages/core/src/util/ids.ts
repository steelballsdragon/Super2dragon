import { randomBytes } from 'node:crypto';

/** Short, sortable-ish unique id: time component + randomness. */
export function newId(prefix = ''): string {
  const time = Date.now().toString(36);
  const rand = randomBytes(6).toString('base64url');
  return `${prefix}${time}${rand}`;
}

export function nonce(bytes = 8): string {
  return randomBytes(bytes).toString('hex');
}
