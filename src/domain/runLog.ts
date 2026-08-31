import { timestampDate } from '@bufbuild/protobuf/wkt';
import type { RunLogChunk } from '../api/gen/agentcompose/v2/agentcompose_pb';

export interface LogLine {
  id: number;
  text: string;
  at?: Date;
}

export interface LogBuffer {
  /** 尚未以换行收尾的残缺行（下个分片续上）。 */
  partial: string;
  /** 已完成的整行（含日志中间的空白行）。 */
  lines: LogLine[];
  /** 下一个行号，保证跨分片单调。 */
  nextId: number;
}

export function createLogBuffer(): LogBuffer {
  return { partial: '', lines: [], nextId: 0 };
}

/** 把一个日志分片追加进 buffer：按 \n 切出完整行，残缺尾部留在 partial。 */
export function appendLogChunk(buf: LogBuffer, chunk: RunLogChunk): LogBuffer {
  const joined = buf.partial + chunk.data;
  const parts = joined.split('\n');
  const partial = parts.pop() ?? '';
  const at = chunk.createdAt ? timestampDate(chunk.createdAt) : undefined;
  const newLines: LogLine[] = parts.map((text, i) => ({
    id: buf.nextId + i,
    text,
    ...(at ? { at } : {}),
  }));
  return { partial, lines: [...buf.lines, ...newLines], nextId: buf.nextId + newLines.length };
}
