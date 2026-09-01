import { describe, expect, it } from 'vitest';
import { RunStatus } from '../api/gen/agentcompose/v2/agentcompose_pb';
import { appendLogChunk, createLogBuffer } from './runLog';

function chunk(
  data: string,
  over: Partial<Omit<Parameters<typeof appendLogChunk>[1], 'createdAt'>> & { createdAt?: unknown } = {},
) {
  return {
    data, offset: 0n, isFinal: false, runStatus: RunStatus.RUNNING, prompt: '',
    ...over,
  } as Parameters<typeof appendLogChunk>[1];
}

describe('runLog 累积', () => {
  it('单个分片多行切成整行，行号从 0 递增', () => {
    let buf = createLogBuffer();
    buf = appendLogChunk(buf, chunk('第 1 行\n第 2 行\n'));
    expect(buf.lines.map((l) => l.text)).toEqual(['第 1 行', '第 2 行']);
    expect(buf.lines.map((l) => l.id)).toEqual([0, 1]);
    expect(buf.partial).toBe('');
  });

  it('跨分片残缺行拼接成一行', () => {
    let buf = createLogBuffer();
    buf = appendLogChunk(buf, chunk('abc\ndef'));
    expect(buf.lines.map((l) => l.text)).toEqual(['abc']);
    expect(buf.partial).toBe('def');
    buf = appendLogChunk(buf, chunk('ghi\n'));
    expect(buf.lines.map((l) => l.text)).toEqual(['abc', 'defghi']);
    expect(buf.partial).toBe('');
  });

  it('空 data 分片不产生新行', () => {
    let buf = createLogBuffer();
    buf = appendLogChunk(buf, chunk('x\n'));
    buf = appendLogChunk(buf, chunk(''));
    expect(buf.lines.map((l) => l.text)).toEqual(['x']);
    expect(buf.partial).toBe('');
  });

  it('内容中间的空行保留（日志里的空行有意义）', () => {
    let buf = createLogBuffer();
    buf = appendLogChunk(buf, chunk('a\n\nb\n'));
    expect(buf.lines.map((l) => l.text)).toEqual(['a', '', 'b']);
    expect(buf.partial).toBe('');
  });

  it('末尾换行的分片不产生多余空行', () => {
    let buf = createLogBuffer();
    buf = appendLogChunk(buf, chunk('a\n'));
    expect(buf.lines.map((l) => l.text)).toEqual(['a']);
    expect(buf.partial).toBe('');
  });

  it('分片带 createdAt 时行带 at（同分片共享时间戳）', () => {
    let buf = createLogBuffer();
    const created = { seconds: 1785293700n, nanos: 0 };
    buf = appendLogChunk(buf, chunk('a\nb\n', { createdAt: created }));
    expect(buf.lines.map((l) => l.at?.getTime())).toEqual([1785293700000, 1785293700000]);
    expect(buf.lines[0].at).toBeInstanceOf(Date);
  });

  it('无 createdAt 时行不设 at', () => {
    let buf = createLogBuffer();
    buf = appendLogChunk(buf, chunk('a\n'));
    expect(buf.lines[0].at).toBeUndefined();
  });
});
