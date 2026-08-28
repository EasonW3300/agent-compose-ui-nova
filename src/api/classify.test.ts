import { describe, expect, it } from 'vitest';
import { Code, ConnectError } from '@connectrpc/connect';
import { classifyError } from './classify';

describe('classifyError', () => {
  it('401 → auth', () => {
    expect(classifyError(new ConnectError('x', Code.Unauthenticated))).toBe('auth');
  });
  it('Unavailable/DeadlineExceeded → unreachable', () => {
    expect(classifyError(new ConnectError('x', Code.Unavailable))).toBe('unreachable');
    expect(classifyError(new ConnectError('x', Code.DeadlineExceeded))).toBe('unreachable');
  });
  it('其他错误 → other', () => {
    expect(classifyError(new ConnectError('x', Code.Internal))).toBe('other');
    expect(classifyError(new Error('plain'))).toBe('other');
    expect(classifyError('nope')).toBe('other');
  });
});
