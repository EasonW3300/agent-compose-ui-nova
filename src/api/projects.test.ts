import { beforeEach, describe, expect, it, vi } from 'vitest';

const listProjectsMock = vi.fn();
const getProjectMock = vi.fn();
const validateProjectMock = vi.fn();
const applyProjectMock = vi.fn();
const removeProjectMock = vi.fn();
const startAgentRunMock = vi.fn();
const getSchedulerMock = vi.fn();

// 复刻 connection.test.ts 的 mock 结构：createConnectTransport 保留 options（含 interceptors），
// createClient 让 RPC 调用流经 transport 的 interceptor 链（connect-es v2 的 createClient）。
vi.mock('@connectrpc/connect-web', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@connectrpc/connect-web')>();
  return { ...actual, createConnectTransport: vi.fn((options: unknown) => ({ ...(options as object) })) };
});
vi.mock('@connectrpc/connect', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@connectrpc/connect')>();
  return {
    ...actual,
    createClient: vi.fn((_service: unknown, transport: { interceptors?: unknown[] }) => {
      type AnyInterceptor = (
        next: (req: unknown) => Promise<unknown>,
      ) => (req: unknown) => Promise<unknown>;
      const interceptors = (transport?.interceptors ?? []) as AnyInterceptor[];
      // 依序套上 interceptor，最内层调用 mock 的对应方法
      const withInterceptors = (call: () => Promise<unknown>) => {
        const req = { header: new Headers() };
        let handler: (r: unknown) => Promise<unknown> = () => Promise.resolve(call());
        for (const interceptor of interceptors) {
          handler = interceptor(handler);
        }
        return handler(req);
      };
      return {
        listProjects: (...a: unknown[]) => withInterceptors(() => listProjectsMock(...a)),
        getProject: (...a: unknown[]) => withInterceptors(() => getProjectMock(...a)),
        validateProject: (...a: unknown[]) => withInterceptors(() => validateProjectMock(...a)),
        applyProject: (...a: unknown[]) => withInterceptors(() => applyProjectMock(...a)),
        removeProject: (...a: unknown[]) => withInterceptors(() => removeProjectMock(...a)),
        startAgentRun: (...a: unknown[]) => withInterceptors(() => startAgentRunMock(...a)),
        getScheduler: (...a: unknown[]) => withInterceptors(() => getSchedulerMock(...a)),
      };
    }),
  };
});

import { Code, ConnectError } from '@connectrpc/connect';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { RunSource } from './gen/agentcompose/v2/agentcompose_pb';
import {
  listProjects,
  getProject,
  validateProject,
  applyProject,
  removeProject,
  startAgentRun,
  getSchedulerNextFire,
  setAgentEnabled,
  projectRefByName,
  projectRefById,
} from './projects';

const s = { baseUrl: '', authToken: '' };

describe('projects API', () => {
  beforeEach(() => {
    listProjectsMock.mockReset().mockResolvedValue({ projects: [], total: 0 });
    getProjectMock.mockReset();
    validateProjectMock.mockReset();
    applyProjectMock.mockReset();
    removeProjectMock.mockReset();
    startAgentRunMock.mockReset();
    getSchedulerMock.mockReset();
  });
  it('listProjects 返回摘要列表', async () => {
    listProjectsMock.mockResolvedValue({ projects: [{ projectId: 'p1', name: 'proj' }], total: 1 });
    await expect(listProjects(s)).resolves.toEqual([{ projectId: 'p1', name: 'proj' }]);
  });
  it('getProject includeSpec 传参正确并返回 project', async () => {
    getProjectMock.mockResolvedValue({ project: { name: 'p' } });
    const p = await getProject(s, projectRefByName('proj'), true);
    // ProjectRef 的 oneof 挂在 selector 字段上（protobuf-es v2）
    expect(getProjectMock).toHaveBeenCalledWith({
      project: expect.objectContaining({ selector: { case: 'name', value: 'proj' } }),
      includeSpec: true,
    });
    expect(p).toEqual({ name: 'p' });
  });
  it('getProject 空响应返回 undefined', async () => {
    getProjectMock.mockResolvedValue({});
    await expect(getProject(s, projectRefByName('p'), false)).resolves.toBeUndefined();
  });
  it('projectRefById 构造 projectId selector', async () => {
    getProjectMock.mockResolvedValue({ project: { name: 'p' } });
    await getProject(s, projectRefById('pid-1'), true);
    expect(getProjectMock).toHaveBeenCalledWith({
      project: expect.objectContaining({ selector: { case: 'projectId', value: 'pid-1' } }),
      includeSpec: true,
    });
  });
  it('validateProject 返回 valid+issues', async () => {
    validateProjectMock.mockResolvedValue({ valid: false, issues: [{ severity: 2, path: 'agents.0.provider', message: 'x' }], specHash: '' });
    const r = await validateProject(s, {} as never);
    expect(r.valid).toBe(false);
    expect(r.issues).toHaveLength(1);
  });
  it('applyProject 返回 applied', async () => {
    applyProjectMock.mockResolvedValue({ applied: true, issues: [], unchanged: false });
    const r = await applyProject(s, {} as never);
    expect(r.applied).toBe(true);
  });
  it('removeProject 保留运行历史并停止运行中的沙箱', async () => {
    await removeProject(s, projectRefByName('proj'));
    expect(removeProjectMock).toHaveBeenCalledWith({
      project: expect.objectContaining({ selector: { case: 'name', value: 'proj' } }),
      removeHistory: false,
      stopRunningSandboxes: true,
    });
  });
  it('startAgentRun 用 MANUAL source 并返回 run 摘要', async () => {
    startAgentRunMock.mockResolvedValue({ run: { runId: 'r1', status: 2 }, started: true });
    const r = await startAgentRun(s, { projectId: 'p1', agentName: 'a1', prompt: '跑一下' });
    expect(startAgentRunMock).toHaveBeenCalledWith({
      run: { projectId: 'p1', agentName: 'a1', prompt: '跑一下', source: RunSource.MANUAL },
    });
    expect(r.runId).toBe('r1');
  });
  it('getSchedulerNextFire 取首个 enabled trigger 的 nextFireAt', async () => {
    getSchedulerMock.mockResolvedValue({
      triggers: [
        { enabled: false, nextFireAt: undefined },
        { enabled: true, nextFireAt: timestampFromDate(new Date('2026-08-30T09:00:00Z')) },
      ],
    });
    const d = await getSchedulerNextFire(s, projectRefByName('proj'), 'a1');
    expect(d?.toISOString()).toBe('2026-08-30T09:00:00.000Z');
  });
  it('getSchedulerNextFire 首个 enabled trigger 无 nextFireAt 时跳到下一个有值的', async () => {
    getSchedulerMock.mockResolvedValue({
      triggers: [
        { enabled: true, nextFireAt: undefined },
        { enabled: true, nextFireAt: timestampFromDate(new Date('2026-09-01T08:00:00Z')) },
      ],
    });
    const d = await getSchedulerNextFire(s, projectRefByName('proj'), 'a1');
    expect(d?.toISOString()).toBe('2026-09-01T08:00:00.000Z');
  });
  it('getSchedulerNextFire 无 enabled trigger → null', async () => {
    getSchedulerMock.mockResolvedValue({ triggers: [{ enabled: false, nextFireAt: undefined }] });
    await expect(getSchedulerNextFire(s, projectRefByName('proj'), 'a1')).resolves.toBeNull();
  });
  it('setAgentEnabled 用 includeSpec 拉回 spec、翻转 enabled、重新 apply', async () => {
    getProjectMock.mockResolvedValue({
      project: { spec: { name: 'proj', agents: [{ name: 'a1', enabled: true }] } },
    });
    applyProjectMock.mockResolvedValue({ applied: true, issues: [] });
    const ok = await setAgentEnabled(s, projectRefByName('proj'), 'a1', false);
    expect(ok).toBe(true);
    const specSent = applyProjectMock.mock.calls[0][0].spec;
    expect(specSent.agents[0].enabled).toBe(false);
  });
  it('401 分类为 auth 不吞错误', async () => {
    getProjectMock.mockRejectedValue(new ConnectError('u', Code.Unauthenticated));
    await expect(getProject(s, projectRefByName('p'), false)).rejects.toThrow();
  });
});
