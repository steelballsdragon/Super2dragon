export type ErrorCode =
  | 'unreachable'
  | 'timeout'
  | 'http'
  | 'model_not_found'
  | 'out_of_memory'
  | 'context_overflow'
  | 'aborted'
  | 'bad_response'
  | 'unsupported'
  | 'invalid_argument'
  | 'permission_denied'
  | 'not_found'
  | 'conflict'
  | 'internal';

export class LocalCodeError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, opts: { retryable?: boolean; cause?: unknown; details?: unknown } = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'LocalCodeError';
    this.code = code;
    this.retryable = opts.retryable ?? false;
    this.details = opts.details;
  }
}

export function isAbortError(err: unknown): boolean {
  if (err instanceof LocalCodeError) return err.code === 'aborted';
  return err instanceof Error && (err.name === 'AbortError' || (err as { code?: string }).code === 'ABORT_ERR');
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new LocalCodeError('aborted', 'Operation cancelled');
}
