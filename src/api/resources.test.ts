import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = {
  listVolumes: vi.fn(), createVolume: vi.fn(), removeVolume: vi.fn(), pruneVolumes: vi.fn(),
  listSandboxes: vi.fn(), stopSandbox: vi.fn(), resumeSandbox: vi.fn(), removeSandbox: vi.fn(), pruneSandboxes: vi.fn(),
  listImages: vi.fn(), removeImage: vi.fn(),
  listCaches: vi.fn(), removeCache: vi.fn(), pruneCaches: vi.fn(),
  listCapabilitySets: vi.fn(), getCapabilityCatalog: vi.fn(), getCapabilityStatus: vi.fn(),
  listSchedulerEvents: vi.fn(),
  listWorkspacePresets: vi.fn(), createWorkspacePreset: vi.fn(), updateWorkspacePreset: vi.fn(), deleteWorkspacePreset: vi.fn(),
  getCapabilityGatewayConfig: vi.fn(), updateCapabilityGatewayConfig: vi.fn(),
};
vi.mock('@connectrpc/connect-web', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@connectrpc/connect-web')>();
  return { ...actual, createConnectTransport: vi.fn((options: unknown) => ({ ...(options as object) })) };
});
vi.mock('@connectrpc/connect', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@connectrpc/connect')>();
  return {
    ...actual,
    createClient: vi.fn((_service: unknown, transport: { interceptors?: unknown[] }) => {
      type AnyInterceptor = (next: (req: unknown) => Promise<unknown>) => (req: unknown) => Promise<unknown>;
      const interceptors = (transport?.interceptors ?? []) as AnyInterceptor[];
      const withInterceptors = (call: () => Promise<unknown>) => {
        const req = { header: new Headers() };
        let handler: (r: unknown) => Promise<unknown> = () => Promise.resolve(call());
        for (const interceptor of interceptors) handler = interceptor(handler);
        return handler(req);
      };
      const stub: Record<string, (...a: unknown[]) => unknown> = {};
      for (const [name, mock] of Object.entries(mocks)) stub[name] = (...a: unknown[]) => withInterceptors(() => mock(...a));
      return stub;
    }),
  };
});
vi.mock('./connection', () => ({ createDaemonTransport: () => ({ baseUrl: '' }), loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }) }));

import { create } from '@bufbuild/protobuf';
import { VolumeSchema } from './gen/agentcompose/v2/agentcompose_pb';
import { listVolumes, createVolume, pruneVolumes } from './resources';
import { listSchedulerEvents } from './projects';
import { getWorkspacePresets, getCapabilityGatewayConfig } from './settings';

const S = { baseUrl: '', authToken: '' };

describe('resources wrappers', () => {
  beforeEach(() => { for (const m of Object.values(mocks)) m.mockReset(); });

  it('listVolumes 解包 res.volumes', async () => {
    const v = create(VolumeSchema, { name: 'data', driver: 'local', path: '/tmp/d' });
    mocks.listVolumes.mockResolvedValue({ volumes: [v] });
    await expect(listVolumes(S)).resolves.toEqual([v]);
    expect(mocks.listVolumes).toHaveBeenCalledWith({});
  });

  it('createVolume 传 { name, driver }（CreateVolumeRequest 无 path 字段）', async () => {
    mocks.createVolume.mockResolvedValue({});
    await createVolume(S, { name: 'data', driver: 'local' });
    expect(mocks.createVolume).toHaveBeenCalledWith({ name: 'data', driver: 'local' });
  });

  it('pruneVolumes 传空 query/driver 并解包 res.matched', async () => {
    const v = create(VolumeSchema, { name: 'data', driver: 'local', path: '/tmp/d' });
    mocks.pruneVolumes.mockResolvedValue({ matched: [v], dryRun: false });
    await expect(pruneVolumes(S)).resolves.toEqual([v]);
    expect(mocks.pruneVolumes).toHaveBeenCalledWith({ query: '', driver: '' });
  });

  it('listSchedulerEvents 传 limit 并解包 res.events', async () => {
    mocks.listSchedulerEvents.mockResolvedValue({ events: [], total: 0 });
    await listSchedulerEvents(S, { limit: 50 });
    expect(mocks.listSchedulerEvents).toHaveBeenCalledWith({ limit: 50, offset: 0 });
  });

  it('getWorkspacePresets 解包 res.presets', async () => {
    mocks.listWorkspacePresets.mockResolvedValue({ presets: [], total: 0 });
    await expect(getWorkspacePresets(S)).resolves.toEqual([]);
    expect(mocks.listWorkspacePresets).toHaveBeenCalledWith({ offset: 0, limit: 100 });
  });

  it('getCapabilityGatewayConfig 解包 res.config', async () => {
    mocks.getCapabilityGatewayConfig.mockResolvedValue({ config: { addr: 'tcp://1.2.3.4:9000', tokenSet: true } });
    await expect(getCapabilityGatewayConfig(S)).resolves.toEqual({ addr: 'tcp://1.2.3.4:9000', tokenSet: true });
    expect(mocks.getCapabilityGatewayConfig).toHaveBeenCalledWith({});
  });
});
