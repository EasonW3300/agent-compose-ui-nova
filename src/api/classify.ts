import { Code, ConnectError } from '@connectrpc/connect';

export type ErrorKind = 'auth' | 'unreachable' | 'other';

/** 统一错误分类：401→auth（密钥问题）；Unavailable/DeadlineExceeded→unreachable；其余→other。 */
export function classifyError(err: unknown): ErrorKind {
  if (err instanceof ConnectError) {
    if (err.code === Code.Unauthenticated) return 'auth';
    if (err.code === Code.Unavailable || err.code === Code.DeadlineExceeded) return 'unreachable';
  }
  return 'other';
}
