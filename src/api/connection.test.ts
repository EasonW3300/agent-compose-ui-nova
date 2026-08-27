import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakeTransport = { fake: true };
const statusMock = vi.fn();
vi.mock('@connectrpc/connect-web', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@connectrpc/connect-web')>();
  return { ...actual, createConnectTransport: vi.fn(() => fakeTransport) };
});
vi.mock('@connectrpc/connect', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@connectrpc/connect')>();
  return {
    ...actual,
    // createClient(service, transport) -> 我们只关心 HealthService.status
    // （connect-es v2 起为 createClient，v1 的 createPromiseClient 已移除）
    createClient: vi.fn(() => ({ status: (...a: unknown[]) => statusMock(...a) })),
  };
});

import { createConnectTransport } from '@connectrpc/connect-web';
import {
  loadConnectionSettings,
  saveConnectionSettings,
  resolveApiBase,
  createDaemonTransport,
  probeDaemon,
} from './connection';

beforeEach(() => {
  localStorage.clear();
  statusMock.mockReset().mockResolvedValue({ version: 'test' });
});

describe('连接设置存取', () => {
  it('默认返回同源代理与空 token', () => {
    expect(loadConnectionSettings()).toEqual({ baseUrl: '', authToken: '' });
  });
  it('保存后能读回', () => {
    saveConnectionSettings({ baseUrl: 'http://127.0.0.1:7410', authToken: 't1' });
    expect(loadConnectionSettings()).toEqual({ baseUrl: 'http://127.0.0.1:7410', authToken: 't1' });
  });
});

describe('resolveApiBase', () => {
  it('空地址回退到 /api 同源代理', () => {
    expect(resolveApiBase({ baseUrl: '', authToken: '' })).toBe('/api');
  });
  it('去掉绝对地址尾部斜杠', () => {
    expect(resolveApiBase({ baseUrl: 'http://x:7410/', authToken: '' })).toBe('http://x:7410');
  });
});

describe('createDaemonTransport', () => {
  it('以解析后的 apiBase 创建 transport', () => {
    createDaemonTransport({ baseUrl: '', authToken: 'sec' });
    expect(vi.mocked(createConnectTransport)).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: '/api' }),
    );
  });
});

describe('probeDaemon', () => {
  it('HealthService.status 成功返回 ok', async () => {
    expect(await probeDaemon({ baseUrl: '', authToken: '' })).toBe('ok');
  });
  it('status 抛错返回 down', async () => {
    statusMock.mockRejectedValueOnce(new Error('boom'));
    expect(await probeDaemon({ baseUrl: '', authToken: '' })).toBe('down');
  });
});
