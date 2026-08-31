import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RunStatus } from '../api/gen/agentcompose/v2/agentcompose_pb';
import type { RunLogChunk } from '../api/gen/agentcompose/v2/agentcompose_pb';
import { useRunLogs } from './useRunLogs';

const followRunLogsMock = vi.fn();
vi.mock('../api/runs', () => ({
  followRunLogs: (...a: unknown[]) => followRunLogsMock(...a),
}));

function chunk(data: string, over: Partial<RunLogChunk> = {}): RunLogChunk {
  return { data, offset: 0n, isFinal: false, runStatus: RunStatus.RUNNING, prompt: '', ...over } as RunLogChunk;
}

const s = { baseUrl: '', authToken: '' };

describe('useRunLogs', () => {
  beforeEach(() => {
    followRunLogsMock.mockReset();
  });

  it('runId 为空不订阅', () => {
    const { result } = renderHook(() => useRunLogs(s, null, { tailLines: 100 }));
    expect(result.current.lines).toEqual([]);
    expect(followRunLogsMock).not.toHaveBeenCalled();
  });

  it('流式累积日志行并带出终态 runStatus', async () => {
    followRunLogsMock.mockImplementation(() =>
      (async function* (): AsyncIterable<RunLogChunk> {
        yield chunk('第 1 行\n第 2 行\n');
        yield chunk('收尾\n', { isFinal: true, runStatus: RunStatus.SUCCEEDED });
      })(),
    );
    const { result } = renderHook(() => useRunLogs(s, 'r1', { tailLines: 100 }));
    expect(followRunLogsMock).toHaveBeenCalledWith(
      s,
      'r1',
      { tailLines: 100 },
      expect.anything(),
    );
    await waitFor(() => expect(result.current.lines.map((l) => l.text)).toEqual(['第 1 行', '第 2 行', '收尾']));
    expect(result.current.status).toBe(RunStatus.SUCCEEDED);
    expect(result.current.connected).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('未终止时断线给 error 并保持已收行', async () => {
    followRunLogsMock
      .mockImplementationOnce(() =>
        (async function* (): AsyncIterable<RunLogChunk> {
          yield chunk('a\n');
          throw new Error('boom');
        })(),
      )
      .mockImplementationOnce(() =>
        (async function* (): AsyncIterable<RunLogChunk> {
          yield chunk('b\n', { isFinal: true, runStatus: RunStatus.FAILED });
        })(),
      );
    const { result } = renderHook(() => useRunLogs(s, 'r1', { follow: true }));
    await waitFor(() => expect(result.current.lines.map((l) => l.text)).toEqual(['a']));
    // 第 1 轮断线后 error 出现、行保留
    await waitFor(() => expect(result.current.error).toBe('连接中断，正在重试…'));
    // 重连成功（真实定时器 1000ms 内会触发；用 waitFor 兜底轮询）
    await waitFor(
      () => expect(result.current.lines.map((l) => l.text)).toEqual(['a', 'b']),
      { timeout: 3000 },
    );
    expect(result.current.status).toBe(RunStatus.FAILED);
    expect(result.current.error).toBeNull();
  });

  it('reset 清空日志', async () => {
    followRunLogsMock
      .mockImplementationOnce(() =>
        (async function* (): AsyncIterable<RunLogChunk> {
          yield chunk('x\n', { isFinal: true, runStatus: RunStatus.SUCCEEDED });
        })(),
      )
      // reset 触发重连后不再产生数据，否则行会被重新填回
      .mockImplementation(() => ({
        [Symbol.asyncIterator]() {
          return {
            next: () => new Promise<IteratorResult<RunLogChunk>>(() => {}),
          };
        },
      }));
    const { result } = renderHook(() => useRunLogs(s, 'r1'));
    await waitFor(() => expect(result.current.lines.map((l) => l.text)).toEqual(['x']));
    act(() => result.current.reset());
    await waitFor(() => expect(result.current.lines).toEqual([]));
  });
});
