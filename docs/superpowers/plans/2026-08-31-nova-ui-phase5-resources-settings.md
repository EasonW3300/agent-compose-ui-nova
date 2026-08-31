# Phase 5 资源中心 + 设置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐主控台最后两个一级页面 — 资源中心（工作区预设/数据卷/插件库/沙箱与镜像 4 Tab）与设置（Provider 密钥/全局环境变量/Capability Gateway/调度总览+事件历史 4 节）。

**Architecture:** React SPA 纯前端，无自有后端。页面直接消费 daemon ConnectRPC API：新增 `src/api/resources.ts`（volumes/sandboxes/images/caches/capability/scheduler events）+ `src/api/settings.ts` 扩展（presets/gateway）；新增 `src/domain/resourceView.ts` 做资源人话转译；两个新页面（`ResourcesScreen` 4 Tab 壳 + 各 Tab 组件、`SettingsScreen` 4 节）替换 `App.tsx` 中的占位路由。危险操作一律 `auth-overlay` 二次确认。

**Tech Stack:** React 19 + Vite + TypeScript，@tanstack/react-query@^5（唯一新增依赖来源，均为既有）、@connectrpc/connect-web v2、Vitest + Testing Library、oxlint。

**Spec:** `docs/superpowers/specs/2026-08-31-nova-ui-phase5-resources-settings-design.md`

## Global Constraints

- 永不修改 `src/api/gen/**`（生成物，只 import 类型/枚举/schema）。
- 新依赖仅 @tanstack/react-query@^5（本阶段不新增任何依赖）。
- 文案全中文，走 `labels.ts` TERMS / 页面内人话字符串；agent→AI 助手、run→运行、sandbox→助手工作台、cache→缓存、image→镜像、prune→清理、preset→预设、volume→数据卷（资源中心页签）/数据文件夹（向导内，TERMS 既有值不动）。
- 危险操作（删除/Prune/移除/停止）一律 `auth-overlay` 二次确认 + 人话后果文案，确认前绝不调 RPC。
- 401 → 复用既有 `AuthOverlay` 登录浮层模式（`classifyError` → 'auth'）。
- 测试：每任务 TDD 红→绿；**永不裸 `npx vitest`**（watch 挂起）——聚焦用 `npx vitest run <file>`，全量用 `npx vitest run --testTimeout=30000`（慢机默认 5s 偶发超时）。
- 门禁：`npm run build`（tsc -b && vite build）+ `npm run lint`（oxlint）全绿零警告。vite 的 >500 kB chunk-size info 警告不是失败。
- 新组件样式追加 `res-*` / `set-*` 前缀类到 `src/ui/console.css`，不与既有类重名。可复用既有类：`console-page`、`console-page__head`、`setup-btn`（App.tsx:5 静态 import SetupShell 恒生效）、`setup-btn--ghost`、`auth-overlay`、`auth-overlay__actions`、`key-card`/`key-card__badge`（setup.css）、`run-section`/`run-section__head`/`run-section__empty`、`dash-live`。
- 测试环境：`renderWithClient`（`src/test/renderWithClient`，per-render fresh QueryClient retry:false）；组件测试 mock API 模块（`vi.mock('../api/resources', ...)`）而非 hook；测试数据用 `create(Schema, {...})` 构造 protobuf Message（带必填 `$typeName` 判别，普通对象字面量过不了 tsc -b）。
- 分支 `feat/phase5-resources-settings` off `origin/main`。每任务 BASE 为上一任务 commit。不建 worktree。

## File Structure

| File | Responsibility |
|---|---|
| `src/api/resources.ts` (new) | volumes/sandboxes/images/caches/capability/scheduler events wrapper（T1） |
| `src/api/resources.test.ts` (new) | wrapper 契约测试（createClient mock 模式，T1） |
| `src/api/settings.ts` (modify) | 追加 presets CRUD + gateway config wrapper（T1） |
| `src/domain/resourceView.ts` (new) | 资源状态/类型人话转译 + 危险操作文案（T2） |
| `src/domain/resourceView.test.ts` (new) | 转译纯函数测试（T2） |
| `src/domain/labels.ts` (modify) | TERMS 增补 cache/image/preset/prune（T2） |
| `src/ui/ResourcesScreen.tsx` (new) | 资源中心 4 Tab 壳（T3） |
| `src/ui/PresetsTab.tsx` (new) | 工作区预设 Tab（T3） |
| `src/ui/VolumesTab.tsx` (new) | 数据卷 Tab（T3） |
| `src/ui/ResourcesScreen.test.tsx` / `PresetsTab.test.tsx` / `VolumesTab.test.tsx` (new) | T3 测试 |
| `src/ui/PluginLibraryTab.tsx` (new) | 插件库 Tab（技能包 + 在用 MCP/技能汇总，T4） |
| `src/ui/PluginLibraryTab.test.tsx` (new) | T4 测试 |
| `src/ui/SandboxesTab.tsx` (new) | 沙箱/镜像/缓存 Tab（T5） |
| `src/ui/SandboxesTab.test.tsx` (new) | T5 测试 |
| `src/ui/SettingsScreen.tsx` (new) | 设置 4 节单页壳（T6） |
| `src/ui/ProviderKeysScreen.tsx` (modify) | `onNext` 改可选，无则隐藏「跳过」按钮（T6） |
| `src/ui/GlobalEnvSection.tsx` (new) | 全局环境变量节（T6） |
| `src/ui/SettingsScreen.test.tsx` / `GlobalEnvSection.test.tsx` (new) | T6 测试 |
| `src/ui/GatewaySection.tsx` (new) | Capability Gateway 配置节（T7） |
| `src/ui/SchedulerSection.tsx` (new) | 调度总览 + 事件历史节（T7） |
| `src/ui/GatewaySection.test.tsx` / `SchedulerSection.test.tsx` (new) | T7 测试 |
| `src/App.tsx` (modify) | 路由：`resources`/`settings` 占位 → 新页（T8） |
| `src/App.test.tsx` (modify) | mock 2 新 screen + 2 新路由用例 + settings 占位断言改 stub（T8） |
| `src/ui/console.css` (modify) | 各 UI 任务追加 `res-*`/`set-*` 类 |

---

### Task 1: API 层 — `src/api/resources.ts` + `src/api/settings.ts` 扩展

**Files:**
- Create: `src/api/resources.ts`
- Create: `src/api/resources.test.ts`
- Modify: `src/api/settings.ts`
- Modify: `src/api/projects.ts`（追加 `listSchedulerEvents`）

**Interfaces:**
- Consumes: `createClient` / `createDaemonTransport` / `ConnectionSettings`（`src/api/connection.ts`）；`src/api/gen/agentcompose/v2/agentcompose_pb` 的 Service 与类型（见下）。
- Produces（T3-T7 消费，签名即契约）:
  - `listVolumes(s): Promise<Volume[]>`
  - `createVolume(s, v: { name: string; driver: string }): Promise<void>`（CreateVolumeRequest 无 path 字段，只有 name/driver/labels/options）
  - `removeVolume(s, name: string): Promise<void>`
  - `pruneVolumes(s): Promise<Volume[]>`
  - `listSandboxes(s): Promise<Sandbox[]>`
  - `stopSandbox(s, sandboxId: string): Promise<void>`
  - `resumeSandbox(s, sandboxId: string): Promise<void>`
  - `removeSandbox(s, sandboxId: string): Promise<void>`
  - `pruneSandboxes(s): Promise<void>`
  - `listImages(s): Promise<Image[]>`
  - `removeImage(s, imageRef: string): Promise<void>`
  - `listCaches(s): Promise<CacheItem[]>`
  - `removeCache(s, cacheId: string): Promise<void>`
  - `pruneCaches(s): Promise<void>`
  - `listCapabilitySets(s): Promise<CapabilitySet[]>`
  - `getCapabilityCatalog(s, capsetId: string): Promise<GetCapabilityCatalogResponse>`
  - `getCapabilityStatus(s): Promise<CapabilityStatusResponse>`
  - `listSchedulerEvents(s, opts?: { limit?: number }): Promise<SchedulerEvent[]>`
  - `getWorkspacePresets(s): Promise<WorkspacePreset[]>`（settings.ts）
  - `createWorkspacePreset(s, p: { name: string; type: string; configJson: string }): Promise<void>`（settings.ts）
  - `updateWorkspacePreset(s, p: { presetId: string; name: string; type: string; configJson: string }): Promise<void>`（settings.ts）
  - `deleteWorkspacePreset(s, presetId: string): Promise<void>`（settings.ts）
  - `getCapabilityGatewayConfig(s): Promise<CapabilityGatewayConfig | undefined>`（settings.ts）
  - `updateCapabilityGatewayConfig(s, cfg: { addr?: string; token?: string }): Promise<void>`（settings.ts）

- [ ] **Step 1: 写失败测试** `src/api/resources.test.ts`，复刻 `src/api/runs.test.ts` 的 mock 结构（mock `@connectrpc/connect-web` 的 `createConnectTransport` 保留 options；mock `@connectrpc/connect` 的 `createClient` 返回按 RPC 方法名键控的 stub，unary 走 interceptor 链，逐方法委托到 `vi.fn()`）：

```ts
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
```
> 注：若某资源 client 的 RPC 名与 mock 键不一致，运行时 stub 调用会落到 `undefined` 函数 — tsc 不查，但测试会立即暴露。所有 RPC 名以 `src/api/gen/agentcompose/v2/agentcompose_pb.ts` 中 `export const XxxService` 块为准（已核对：VolumeService listVolumes/createVolume/removeVolume/pruneVolumes；SandboxService listSandboxes/stopSandbox/resumeSandbox/removeSandbox/pruneSandboxes；ImageService listImages/removeImage；CacheService listCaches/removeCache/pruneCaches；CapabilityService listCapabilitySets/getCapabilityCatalog/getCapabilityStatus；ProjectService listSchedulerEvents；SettingsService listWorkspacePresets/createWorkspacePreset/updateWorkspacePreset/deleteWorkspacePreset/getCapabilityGatewayConfig/updateCapabilityGatewayConfig）。

随后写断言（覆盖 wrapper 解包与传参形状的 6 个代表用例）：

```ts
import { create } from '@bufbuild/protobuf';
import { VolumeSchema, type Volume } from './gen/agentcompose/v2/agentcompose_pb';
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

  it('createVolume 传 { name, driver, path }', async () => {
    mocks.createVolume.mockResolvedValue({});
    await createVolume(S, { name: 'data', driver: 'local', path: '/tmp/d' });
    expect(mocks.createVolume).toHaveBeenCalledWith({ name: 'data', driver: 'local', path: '/tmp/d' });
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
```
> 测试会先因 `./resources` 不存在而红。

- [ ] **Step 2: 跑测试确认红**

Run: `npx vitest run src/api/resources.test.ts`
Expected: FAIL（`Failed to resolve import "./resources"` 或 `./settings` 的扩展 wrapper 未定义）。

- [ ] **Step 3: 实现** `src/api/resources.ts`（完整）：

```ts
import { createClient } from '@connectrpc/connect';
import { createDaemonTransport, type ConnectionSettings } from './connection';
import {
  CacheService, CapabilityService, ImageService, SandboxService, VolumeService,
  ImageStoreKind, SandboxStopMode,
  type CacheItem, type CapabilitySet, type CapabilityStatusResponse, type GetCapabilityCatalogResponse,
  type Image, type Sandbox, type SchedulerEvent, type Volume,
} from './gen/agentcompose/v2/agentcompose_pb';

function volumeClient(s: ConnectionSettings) { return createClient(VolumeService, createDaemonTransport(s)); }
function sandboxClient(s: ConnectionSettings) { return createClient(SandboxService, createDaemonTransport(s)); }
function imageClient(s: ConnectionSettings) { return createClient(ImageService, createDaemonTransport(s)); }
function cacheClient(s: ConnectionSettings) { return createClient(CacheService, createDaemonTransport(s)); }
function capabilityClient(s: ConnectionSettings) { return createClient(CapabilityService, createDaemonTransport(s)); }

export async function listVolumes(s: ConnectionSettings): Promise<Volume[]> {
  const res = await volumeClient(s).listVolumes({});
  return res.volumes;
}
export async function createVolume(s: ConnectionSettings, v: { name: string; driver: string; path: string }): Promise<void> {
  await volumeClient(s).createVolume({ name: v.name, driver: v.driver, path: v.path });
}
export async function removeVolume(s: ConnectionSettings, name: string): Promise<void> {
  await volumeClient(s).removeVolume({ name, force: false });
}
export async function pruneVolumes(s: ConnectionSettings): Promise<Volume[]> {
  const res = await volumeClient(s).pruneVolumes({ query: '', driver: '' });
  return res.matched;
}

export async function listSandboxes(s: ConnectionSettings): Promise<Sandbox[]> {
  const res = await sandboxClient(s).listSandboxes({});
  return res.sandboxes;
}
export async function stopSandbox(s: ConnectionSettings, sandboxId: string): Promise<void> {
  await sandboxClient(s).stopSandbox({ sandboxId, mode: SandboxStopMode.GRACEFUL });
}
export async function resumeSandbox(s: ConnectionSettings, sandboxId: string): Promise<void> {
  await sandboxClient(s).resumeSandbox({ sandboxId });
}
export async function removeSandbox(s: ConnectionSettings, sandboxId: string): Promise<void> {
  await sandboxClient(s).removeSandbox({ sandboxId, force: false });
}
export async function pruneSandboxes(s: ConnectionSettings): Promise<void> {
  await sandboxClient(s).pruneSandboxes({ projectId: '', force: false });
}

export async function listImages(s: ConnectionSettings): Promise<Image[]> {
  const res = await imageClient(s).listImages({});
  return res.images;
}
export async function removeImage(s: ConnectionSettings, imageRef: string): Promise<void> {
  await imageClient(s).removeImage({ imageRef, store: ImageStoreKind.UNSPECIFIED });
}

export async function listCaches(s: ConnectionSettings): Promise<CacheItem[]> {
  const res = await cacheClient(s).listCaches({});
  return res.caches;
}
export async function removeCache(s: ConnectionSettings, cacheId: string): Promise<void> {
  await cacheClient(s).removeCache({ cacheId, force: false });
}
export async function pruneCaches(s: ConnectionSettings): Promise<void> {
  await cacheClient(s).pruneCaches({ force: false });
}

export async function listCapabilitySets(s: ConnectionSettings): Promise<CapabilitySet[]> {
  const res = await capabilityClient(s).listCapabilitySets({});
  return res.capsets;
}
export async function getCapabilityCatalog(s: ConnectionSettings, capsetId: string): Promise<GetCapabilityCatalogResponse> {
  return capabilityClient(s).getCapabilityCatalog({ capsetId });
}
export async function getCapabilityStatus(s: ConnectionSettings): Promise<CapabilityStatusResponse> {
  return capabilityClient(s).getCapabilityStatus({});
}
```
> `listSchedulerEvents` 在 `ProjectService` 下，放 `src/api/projects.ts`（与既有 `listProjects` 同文件）：

```ts
export async function listSchedulerEvents(s: ConnectionSettings, opts: { limit?: number } = {}): Promise<SchedulerEvent[]> {
  const res = await client(s).listSchedulerEvents({ limit: opts.limit ?? 100, offset: 0 });
  return res.events;
}
```
> `getCapabilityCatalog`/`getCapabilityStatus` 直接返回整个响应 Message（响应本身就是 catalog/status，无外层字段包裹）。`projects.ts` 里确认 `client` 已 import（既有文件已有），`SchedulerEvent` 类型从 gen import 补充。

`src/api/settings.ts` 追加（import `WorkspacePreset`, `CapabilityGatewayConfig`, SettingsService 已有）：

```ts
export async function getWorkspacePresets(s: ConnectionSettings): Promise<WorkspacePreset[]> {
  const res = await settingsClient(s).listWorkspacePresets({ offset: 0, limit: 100 });
  return res.presets;
}
export async function createWorkspacePreset(s: ConnectionSettings, p: { name: string; type: string; configJson: string }): Promise<void> {
  await settingsClient(s).createWorkspacePreset({ name: p.name, type: p.type, configJson: p.configJson });
}
export async function updateWorkspacePreset(s: ConnectionSettings, p: { presetId: string; name: string; type: string; configJson: string }): Promise<void> {
  await settingsClient(s).updateWorkspacePreset({ presetId: p.presetId, name: p.name, type: p.type, configJson: p.configJson });
}
export async function deleteWorkspacePreset(s: ConnectionSettings, presetId: string): Promise<void> {
  await settingsClient(s).deleteWorkspacePreset({ presetId });
}
export async function getCapabilityGatewayConfig(s: ConnectionSettings): Promise<CapabilityGatewayConfig | undefined> {
  const res = await settingsClient(s).getCapabilityGatewayConfig({});
  return res.config;
}
export async function updateCapabilityGatewayConfig(s: ConnectionSettings, cfg: { addr?: string; token?: string }): Promise<void> {
  await settingsClient(s).updateCapabilityGatewayConfig({ addr: cfg.addr, token: cfg.token });
}
```

- [ ] **Step 4: 跑测试确认绿**

Run: `npx vitest run src/api/resources.test.ts`
Expected: PASS。随后跑全量 `npx vitest run --testTimeout=30000` 确认无回归（settings.ts 改动只增不减，ProviderKeysScreen 测试仍绿）。

- [ ] **Step 5: 提交**

```bash
git add src/api/resources.ts src/api/resources.test.ts src/api/settings.ts src/api/projects.ts
git commit -m "feat: 资源/设置 API 层（卷/沙箱/镜像/缓存/能力集/调度事件/预设/Gateway 配置 wrapper）"
```

---

### Task 2: `src/domain/resourceView.ts` + labels TERMS 增补

**Files:**
- Create: `src/domain/resourceView.ts`
- Create: `src/domain/resourceView.test.ts`
- Modify: `src/domain/labels.ts`

**Interfaces:**
- Consumes: `SandboxStatus`、`CacheDomain` 枚举（gen）；`TERMS`（labels.ts）。
- Produces（T3-T7 消费）:
  - `describeSandboxStatus(status: SandboxStatus): string`
  - `describeCacheDomain(domain: CacheDomain): string`
  - `schedulerLevelTone(level: string): 'info' | 'warn' | 'error'`
  - `describePresetType(type: string): string`
  - `DANGEROUS_ACTIONS: Record<string, string>`（键为操作 id，值为二次确认的人话后果文案）

- [ ] **Step 1: 写失败测试** `src/domain/resourceView.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { CacheDomain, SandboxStatus } from '../api/gen/agentcompose/v2/agentcompose_pb';
import { DANGEROUS_ACTIONS, describeCacheDomain, describePresetType, describeSandboxStatus, schedulerLevelTone } from './resourceView';

describe('resourceView', () => {
  it('沙箱状态人话化', () => {
    expect(describeSandboxStatus(SandboxStatus.RUNNING)).toBe('运行中');
    expect(describeSandboxStatus(SandboxStatus.PENDING)).toBe('准备中');
    expect(describeSandboxStatus(SandboxStatus.STOPPED)).toBe('已停止');
    expect(describeSandboxStatus(SandboxStatus.FAILED)).toBe('异常');
    expect(describeSandboxStatus(SandboxStatus.UNSPECIFIED)).toBe('未知');
  });
  it('缓存域人话化', () => {
    expect(describeCacheDomain(CacheDomain.OCI_IMAGE_STORE)).toBe('镜像仓库');
    expect(describeCacheDomain(CacheDomain.UNSPECIFIED)).toBe('其他');
  });
  it('调度事件级别 → 色调', () => {
    expect(schedulerLevelTone('error')).toBe('error');
    expect(schedulerLevelTone('warn')).toBe('warn');
    expect(schedulerLevelTone('info')).toBe('info');
    expect(schedulerLevelTone('anything-else')).toBe('info');
  });
  it('预设类型人话化（未知回退原文）', () => {
    expect(describePresetType('empty')).toBe('空工作区');
    expect(describePresetType('git')).toBe('Git 仓库');
    expect(describePresetType('path')).toBe('本地路径');
    expect(describePresetType('custom-thing')).toBe('custom-thing');
  });
  it('危险操作文案齐全（volumes/sandboxes/images/caches/prune）', () => {
    expect(DANGEROUS_ACTIONS.removeVolume).toContain('数据会一起删除');
    expect(DANGEROUS_ACTIONS.pruneVolumes).toContain('未被任何助手使用的数据卷');
    expect(DANGEROUS_ACTIONS.pruneSandboxes).toContain('已停止或异常');
    expect(DANGEROUS_ACTIONS.removeImage).toContain('镜像');
    expect(DANGEROUS_ACTIONS.pruneCaches).toContain('缓存');
  });
});
```
> `SandboxStatus.FAILED` 若 gen 中没有该成员，以 tsc -b 报错为准改为实际名称（已核对含 FAILED）。

- [ ] **Step 2: 跑测试确认红**

Run: `npx vitest run src/domain/resourceView.test.ts`
Expected: FAIL（`Failed to resolve import "./resourceView"`）。

- [ ] **Step 3: 实现** `src/domain/resourceView.ts`：

```ts
import { CacheDomain, SandboxStatus } from '../api/gen/agentcompose/v2/agentcompose_pb';

export function describeSandboxStatus(status: SandboxStatus): string {
  switch (status) {
    case SandboxStatus.PENDING: return '准备中';
    case SandboxStatus.RUNNING: return '运行中';
    case SandboxStatus.STOPPED: return '已停止';
    case SandboxStatus.FAILED: return '异常';
    default: return '未知';
  }
}

export function describeCacheDomain(domain: CacheDomain): string {
  switch (domain) {
    case CacheDomain.OCI_IMAGE_STORE: return '镜像仓库';
    case CacheDomain.MATERIALIZED_IMAGE_CACHE: return '镜像缓存';
    default: return '其他';
  }
}

export function schedulerLevelTone(level: string): 'info' | 'warn' | 'error' {
  if (level === 'error') return 'error';
  if (level === 'warn' || level === 'warning') return 'warn';
  return 'info';
}

export function describePresetType(type: string): string {
  switch (type) {
    case 'empty': return '空工作区';
    case 'git': return 'Git 仓库';
    case 'path': return '本地路径';
    default: return type;
  }
}

/** 危险操作二次确认文案：键为操作 id，值为人话后果。 */
export const DANGEROUS_ACTIONS: Record<string, string> = {
  removePreset: '删除后，这个工作区预设会从列表移除，向导里不再可选。',
  removeVolume: '删除后，这个数据卷里的数据会一起删除，无法恢复。',
  pruneVolumes: '会清理所有未被任何助手使用的数据卷，释放磁盘空间。',
  removeSandbox: '删除后，这个助手的工作台会被移除，无法恢复。',
  pruneSandboxes: '会清理所有已停止或异常的工作台，释放磁盘空间。',
  removeImage: '删除后，这个镜像会在本地被移除，下次用到时要重新拉取。',
  removeCache: '删除后，这份缓存会被清理，下次运行可能变慢。',
  pruneCaches: '会清理所有未使用的缓存，释放磁盘空间。',
};
```

`src/domain/labels.ts` 的 `TERMS` 增补：

```ts
export const TERMS: Record<string, string> = {
  agent: 'AI 助手',
  project: '助手团队',
  provider: 'AI 引擎',
  scheduler: '什么时候干活',
  volume: '数据文件夹',
  workspace: '工作材料',
  mcp_server: '插件',
  skill: '技能包',
  sandbox: '隔离工作台',
  image: '镜像',
  cache: '缓存',
  preset: '工作区预设',
  prune: '清理',
};
```

- [ ] **Step 4: 跑测试确认绿**

Run: `npx vitest run src/domain/resourceView.test.ts`
Expected: PASS。全量 `npx vitest run --testTimeout=30000` 无回归。

- [ ] **Step 5: 提交**

```bash
git add src/domain/resourceView.ts src/domain/resourceView.test.ts src/domain/labels.ts
git commit -m "feat: 资源人话转译与危险操作文案 + labels TERMS 增补"
```

---

### Task 3: 资源中心壳 + 工作区预设 + 数据卷

**Files:**
- Create: `src/ui/ResourcesScreen.tsx`
- Create: `src/ui/ResourcesScreen.test.tsx`
- Create: `src/ui/PresetsTab.tsx`
- Create: `src/ui/PresetsTab.test.tsx`
- Create: `src/ui/VolumesTab.tsx`
- Create: `src/ui/VolumesTab.test.tsx`
- Modify: `src/ui/console.css`（追加 `res-*` 类）

**Interfaces:**
- Consumes: `getWorkspacePresets`/`createWorkspacePreset`/`updateWorkspacePreset`/`deleteWorkspacePreset`（settings.ts）、`listVolumes`/`createVolume`/`removeVolume`/`pruneVolumes`（resources.ts）、`DANGEROUS_ACTIONS`/`describePresetType`（resourceView.ts）、`loadConnectionSettings`。
- Produces: `ResourcesScreen`（默认「工作区预设」Tab）——T8 挂到 `/console/resources`；`PresetsTab`/`VolumesTab`。

- [ ] **Step 1: 写失败测试**

`src/ui/ResourcesScreen.test.tsx`（Tab 切换；两个 Tab 组件 mock 掉以免触发网络）：

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithClient } from '../test/renderWithClient';
import { ResourcesScreen } from './ResourcesScreen';

vi.mock('./PresetsTab', () => ({ PresetsTab: () => <div>presets tab</div> }));
vi.mock('./VolumesTab', () => ({ VolumesTab: () => <div>volumes tab</div> }));
vi.mock('./PluginLibraryTab', () => ({ PluginLibraryTab: () => <div>plugins tab</div> }));
vi.mock('./SandboxesTab', () => ({ SandboxesTab: () => <div>sandboxes tab</div> }));

describe('ResourcesScreen', () => {
  it('默认渲染工作区预设 Tab', () => {
    renderWithClient(<ResourcesScreen />);
    expect(screen.getByText('presets tab')).toBeInTheDocument();
  });
  it('点击 Tab 切换', async () => {
    const user = userEvent.setup();
    renderWithClient(<ResourcesScreen />);
    await user.click(screen.getByRole('tab', { name: '数据卷' }));
    expect(screen.getByText('volumes tab')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '插件库' }));
    expect(screen.getByText('plugins tab')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '沙箱与镜像' }));
    expect(screen.getByText('sandboxes tab')).toBeInTheDocument();
  });
});
```
> 若 SandboxesTab 的 Tab 名定为「沙箱与镜像」，与 T5 实现一致；测试只在 mock 下跑，文案自洽即可。

`src/ui/PresetsTab.test.tsx`：

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithClient } from '../test/renderWithClient';
import { PresetsTab } from './PresetsTab';

const mocks = {
  getWorkspacePresets: vi.fn(),
  createWorkspacePreset: vi.fn(),
  updateWorkspacePreset: vi.fn(),
  deleteWorkspacePreset: vi.fn(),
};
vi.mock('../api/settings', () => ({
  getWorkspacePresets: (...a: unknown[]) => mocks.getWorkspacePresets(...a),
  createWorkspacePreset: (...a: unknown[]) => mocks.createWorkspacePreset(...a),
  updateWorkspacePreset: (...a: unknown[]) => mocks.updateWorkspacePreset(...a),
  deleteWorkspacePreset: (...a: unknown[]) => mocks.deleteWorkspacePreset(...a),
}));
vi.mock('../api/connection', () => ({ loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }) }));

function preset(id: string, name: string, type: string) {
  return { id, name, type, configJson: '' };
}

describe('PresetsTab', () => {
  beforeEach(() => {
    mocks.getWorkspacePresets.mockReset().mockResolvedValue([preset('p1', '我的工作台', 'git'), preset('p2', '空开始', 'empty')]);
    mocks.createWorkspacePreset.mockReset().mockResolvedValue(undefined);
    mocks.updateWorkspacePreset.mockReset().mockResolvedValue(undefined);
    mocks.deleteWorkspacePreset.mockReset().mockResolvedValue(undefined);
  });
  it('列表渲染名称与类型人话', async () => {
    renderWithClient(<PresetsTab />);
    await waitFor(() => expect(screen.getByText('我的工作台')).toBeInTheDocument());
    expect(screen.getByText('Git 仓库')).toBeInTheDocument();
    expect(screen.getByText('空工作区')).toBeInTheDocument();
  });
  it('新建：填 name/type 保存调 createWorkspacePreset 并刷新', async () => {
    const user = userEvent.setup();
    renderWithClient(<PresetsTab />);
    await waitFor(() => expect(screen.getByRole('button', { name: /新建预设/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /新建预设/ }));
    await user.type(screen.getByLabelText('预设名称'), '共享工作区');
    await user.selectOptions(screen.getByLabelText('类型'), 'git');
    await user.click(screen.getByRole('button', { name: '创建' }));
    await waitFor(() => expect(mocks.createWorkspacePreset).toHaveBeenCalledWith(
      { baseUrl: '', authToken: '' },
      { name: '共享工作区', type: 'git', configJson: '' },
    ));
    await waitFor(() => expect(mocks.getWorkspacePresets).toHaveBeenCalledTimes(2));
  });
  it('删除前必须确认，确认后调 deleteWorkspacePreset', async () => {
    const user = userEvent.setup();
    renderWithClient(<PresetsTab />);
    await waitFor(() => expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '删除' }));
    expect(mocks.deleteWorkspacePreset).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(mocks.deleteWorkspacePreset).toHaveBeenCalledWith({ baseUrl: '', authToken: '' }, 'p1'));
  });
  it('加载失败给重试', async () => {
    const refetch = vi.fn();
    mocks.getWorkspacePresets.mockReset().mockRejectedValueOnce(new Error('down'));
    renderWithClient(<PresetsTab />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('连不上 agent-compose'));
  });
});
```
> 删除确认弹层复用 `auth-overlay` 结构（`role="dialog"`，含「确认删除」按钮）。「新建」对话框用原生 `<form>` + `getByLabelText` 字段。

`src/ui/VolumesTab.test.tsx`（完整）：

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithClient } from '../test/renderWithClient';
import { VolumesTab } from './VolumesTab';

const mocks = { listVolumes: vi.fn(), createVolume: vi.fn(), removeVolume: vi.fn(), pruneVolumes: vi.fn() };
vi.mock('../api/resources', () => ({
  listVolumes: (...a: unknown[]) => mocks.listVolumes(...a),
  createVolume: (...a: unknown[]) => mocks.createVolume(...a),
  removeVolume: (...a: unknown[]) => mocks.removeVolume(...a),
  pruneVolumes: (...a: unknown[]) => mocks.pruneVolumes(...a),
}));
vi.mock('../api/connection', () => ({ loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }) }));

const v = { name: 'data', driver: 'local', path: '/tmp/d', labels: [] };

describe('VolumesTab', () => {
  beforeEach(() => {
    mocks.listVolumes.mockReset().mockResolvedValue([v]);
    mocks.createVolume.mockReset().mockResolvedValue(undefined);
    mocks.removeVolume.mockReset().mockResolvedValue(undefined);
    mocks.pruneVolumes.mockReset().mockResolvedValue([]);
  });
  it('列表渲染 name/driver/path', async () => {
    renderWithClient(<VolumesTab />);
    await waitFor(() => expect(screen.getByText('data')).toBeInTheDocument());
    expect(screen.getByText('local')).toBeInTheDocument();
    expect(screen.getByText('/tmp/d')).toBeInTheDocument();
  });
  it('新建调 createVolume 并刷新', async () => {
    const user = userEvent.setup();
    renderWithClient(<VolumesTab />);
    await waitFor(() => expect(screen.getByRole('button', { name: /新建数据卷/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /新建数据卷/ }));
    await user.type(screen.getByLabelText('名称'), 'vol2');
    await user.click(screen.getByRole('button', { name: '创建' }));
    await waitFor(() => expect(mocks.createVolume).toHaveBeenCalledWith(
      { baseUrl: '', authToken: '' },
      { name: 'vol2', driver: 'local' },
    ));
    await waitFor(() => expect(mocks.listVolumes).toHaveBeenCalledTimes(2));
  });
  it('单个删除二次确认后才调 removeVolume', async () => {
    const user = userEvent.setup();
    renderWithClient(<VolumesTab />);
    await waitFor(() => expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '删除' }));
    expect(mocks.removeVolume).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(mocks.removeVolume).toHaveBeenCalledWith({ baseUrl: '', authToken: '' }, 'data'));
  });
  it('Prune 二次确认 + 弹层展示人话后果文案', async () => {
    const user = userEvent.setup();
    renderWithClient(<VolumesTab />);
    await waitFor(() => expect(screen.getByRole('button', { name: /清理未使用的卷/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /清理未使用的卷/ }));
    expect(screen.getByText(/未被任何助手使用的数据卷/)).toBeInTheDocument();
    expect(mocks.pruneVolumes).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '确认清理' }));
    await waitFor(() => expect(mocks.pruneVolumes).toHaveBeenCalledWith({ baseUrl: '', authToken: '' }));
  });
});
```

- [ ] **Step 2: 跑测试确认红**

Run: `npx vitest run src/ui/ResourcesScreen.test.tsx src/ui/PresetsTab.test.tsx src/ui/VolumesTab.test.tsx`
Expected: FAIL（import 解析失败 / 组件不存在）。

- [ ] **Step 3: 实现**

`src/ui/ResourcesScreen.tsx`：

```tsx
import { useState } from 'react';
import { PresetsTab } from './PresetsTab';
import { VolumesTab } from './VolumesTab';
import { PluginLibraryTab } from './PluginLibraryTab';
import { SandboxesTab } from './SandboxesTab';
import './console.css';

const TABS = [
  { id: 'presets', label: '工作区预设' },
  { id: 'volumes', label: '数据卷' },
  { id: 'plugins', label: '插件库' },
  { id: 'sandboxes', label: '沙箱与镜像' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function ResourcesScreen() {
  const [tab, setTab] = useState<TabId>('presets');
  return (
    <section className="console-page">
      <div className="console-page__head"><h2>资源中心</h2></div>
      <div className="res-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`res-tab${tab === t.id ? ' res-tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'presets' && <PresetsTab />}
      {tab === 'volumes' && <VolumesTab />}
      {tab === 'plugins' && <PluginLibraryTab />}
      {tab === 'sandboxes' && <SandboxesTab />}
    </section>
  );
}
```

`src/ui/PresetsTab.tsx`（完整）：

```tsx
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loadConnectionSettings } from '../api/connection';
import { createWorkspacePreset, deleteWorkspacePreset, getWorkspacePresets, updateWorkspacePreset } from '../api/settings';
import type { WorkspacePreset } from '../api/gen/agentcompose/v2/agentcompose_pb';
import { DANGEROUS_ACTIONS, describePresetType } from '../domain/resourceView';
import './console.css';

interface PresetDraft { id: string | null; name: string; type: string; configJson: string; }
const EMPTY: PresetDraft = { id: null, name: '', type: 'empty', configJson: '' };

export function PresetsTab() {
  const queryClient = useQueryClient();
  const s = loadConnectionSettings();
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ['workspace-presets'],
    queryFn: () => getWorkspacePresets(s),
  });
  const [draft, setDraft] = useState<PresetDraft | null>(null);
  const [deleting, setDeleting] = useState<WorkspacePreset | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['workspace-presets'] });
  const saveMutation = useMutation({
    mutationFn: async (d: PresetDraft) => {
      if (d.id) await updateWorkspacePreset(s, { presetId: d.id, name: d.name, type: d.type, configJson: d.configJson });
      else await createWorkspacePreset(s, { name: d.name, type: d.type, configJson: d.configJson });
    },
    onSuccess: () => { setDraft(null); invalidate(); },
  });
  const deleteMutation = useMutation({
    mutationFn: async (p: WorkspacePreset) => { await deleteWorkspacePreset(s, p.id); },
    onSuccess: () => { setDeleting(null); invalidate(); },
  });

  if (isLoading) return <p role="status">正在加载工作区预设…</p>;
  if (isError) return <p role="alert">连不上 agent-compose，加载失败。</p>;

  return (
    <div className="res-section">
      <div className="run-section__head">
        <h3>工作区预设</h3>
        <button type="button" className="setup-btn" onClick={() => setDraft(EMPTY)}>+ 新建预设</button>
      </div>
      {data.length === 0 ? (
        <p className="run-section__empty">还没有工作区预设。新建一个，向导里选「工作材料」时就能直接用。</p>
      ) : (
        <table className="runs-table">
          <thead><tr><th>名称</th><th>类型</th><th></th></tr></thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{describePresetType(p.type)}</td>
                <td>
                  <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setDraft({ id: p.id, name: p.name, type: p.type, configJson: p.configJson })}>编辑</button>{' '}
                  <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setDeleting(p)}>删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {draft && (
        <div className="auth-overlay" role="dialog" aria-label={draft.id ? '编辑预设' : '新建预设'}>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(draft); }}>
            <h3>{draft.id ? '编辑预设' : '新建预设'}</h3>
            <label>
              预设名称
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="预设名称" required />
            </label>
            <label>
              类型
              <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} aria-label="类型">
                <option value="empty">空工作区</option>
                <option value="git">Git 仓库</option>
                <option value="path">本地路径</option>
              </select>
            </label>
            <details className="wizard-advanced">
              <summary>进阶：configJson</summary>
              <textarea value={draft.configJson} onChange={(e) => setDraft({ ...draft, configJson: e.target.value })} rows={4} aria-label="configJson" />
            </details>
            <div className="auth-overlay__actions">
              <button type="submit" className="setup-btn" disabled={saveMutation.isPending || !draft.name.trim()}>
                {draft.id ? '保存' : '创建'}
              </button>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setDraft(null)}>取消</button>
            </div>
          </form>
        </div>
      )}

      {deleting && (
        <div className="auth-overlay" role="dialog" aria-label="删除确认">
          <div>
            <h3>删除「{deleting.name}」？</h3>
            <p>{DANGEROUS_ACTIONS.removePreset}</p>
            <div className="auth-overlay__actions">
              <button type="button" className="setup-btn" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(deleting)}>
                {deleteMutation.isPending ? '删除中…' : '确认删除'}
              </button>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setDeleting(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```
> 预设删除用 `DANGEROUS_ACTIONS.removePreset`（T2 已定义）。VolumesTab 用 `removeVolume`/`pruneVolumes` 文案。

`src/ui/VolumesTab.tsx`（结构与 PresetsTab 同构：列表 + 新建对话框 + 单删确认 + Prune 确认）：

```tsx
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loadConnectionSettings } from '../api/connection';
import { createVolume, listVolumes, pruneVolumes, removeVolume } from '../api/resources';
import type { Volume } from '../api/gen/agentcompose/v2/agentcompose_pb';
import { DANGEROUS_ACTIONS } from '../domain/resourceView';
import './console.css';

const EMPTY = { name: '', driver: 'local' };

export function VolumesTab() {
  const queryClient = useQueryClient();
  const s = loadConnectionSettings();
  const { data = [], isLoading, isError } = useQuery({ queryKey: ['volumes'], queryFn: () => listVolumes(s) });
  const [draft, setDraft] = useState<typeof EMPTY | null>(null);
  const [removing, setRemoving] = useState<Volume | null>(null);
  const [confirmingPrune, setConfirmingPrune] = useState(false);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['volumes'] });

  const createMutation = useMutation({
    mutationFn: async (v: typeof EMPTY) => { await createVolume(s, v); },
    onSuccess: () => { setDraft(null); invalidate(); },
  });
  const removeMutation = useMutation({
    mutationFn: async (v: Volume) => { await removeVolume(s, v.name); },
    onSuccess: () => { setRemoving(null); invalidate(); },
  });
  const pruneMutation = useMutation({
    mutationFn: async () => { await pruneVolumes(s); },
    onSuccess: () => { setConfirmingPrune(false); invalidate(); },
  });

  if (isLoading) return <p role="status">正在加载数据卷…</p>;
  if (isError) return <p role="alert">连不上 agent-compose，加载失败。</p>;

  return (
    <div className="res-section">
      <div className="run-section__head">
        <h3>数据卷</h3>
        <div>
          <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setConfirmingPrune(true)}>清理未使用的卷</button>{' '}
          <button type="button" className="setup-btn" onClick={() => setDraft(EMPTY)}>+ 新建数据卷</button>
        </div>
      </div>
      {data.length === 0 ? (
        <p className="run-section__empty">还没有数据卷。</p>
      ) : (
        <table className="runs-table">
          <thead><tr><th>名称</th><th>驱动</th><th>路径</th><th></th></tr></thead>
          <tbody>
            {data.map((v) => (
              <tr key={v.name}>
                <td>{v.name}</td><td>{v.driver}</td><td>{v.path}</td>
                <td><button type="button" className="setup-btn setup-btn--ghost" onClick={() => setRemoving(v)}>删除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {draft && (
        <div className="auth-overlay" role="dialog" aria-label="新建数据卷">
          <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(draft); }}>
            <h3>新建数据卷</h3>
            <label>名称<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="名称" required /></label>
            <label>驱动<input value={draft.driver} onChange={(e) => setDraft({ ...draft, driver: e.target.value })} aria-label="驱动" /></label>
            <div className="auth-overlay__actions">
              <button type="submit" className="setup-btn" disabled={createMutation.isPending || !draft.name.trim()}>创建</button>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setDraft(null)}>取消</button>
            </div>
          </form>
        </div>
      )}

      {removing && (
        <div className="auth-overlay" role="dialog" aria-label="删除确认">
          <div>
            <h3>删除数据卷「{removing.name}」？</h3>
            <p>{DANGEROUS_ACTIONS.removeVolume}</p>
            <div className="auth-overlay__actions">
              <button type="button" className="setup-btn" disabled={removeMutation.isPending} onClick={() => removeMutation.mutate(removing)}>
                {removeMutation.isPending ? '删除中…' : '确认删除'}
              </button>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setRemoving(null)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {confirmingPrune && (
        <div className="auth-overlay" role="dialog" aria-label="清理确认">
          <div>
            <h3>清理未使用的数据卷？</h3>
            <p>{DANGEROUS_ACTIONS.pruneVolumes}</p>
            <div className="auth-overlay__actions">
              <button type="button" className="setup-btn" disabled={pruneMutation.isPending} onClick={() => pruneMutation.mutate()}>
                {pruneMutation.isPending ? '清理中…' : '确认清理'}
              </button>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setConfirmingPrune(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

`src/ui/console.css` 追加：

```css
/* ===== 资源中心 ===== */
.res-tabs { display: flex; gap: 8px; border-bottom: 1px solid #eee; margin-bottom: 16px; }
.res-tab { padding: 8px 16px; border: none; background: none; font-size: 14px; color: #666; cursor: pointer; border-bottom: 2px solid transparent; }
.res-tab--active { color: #0969da; border-bottom-color: #0969da; font-weight: 600; }
.res-section { margin-bottom: 24px; }
```

- [ ] **Step 4: 跑测试确认绿**

Run: `npx vitest run src/ui/ResourcesScreen.test.tsx src/ui/PresetsTab.test.tsx src/ui/VolumesTab.test.tsx`
Expected: PASS。全量 `--testTimeout=30000` 无回归。

- [ ] **Step 5: 提交**

```bash
git add src/ui/ResourcesScreen.tsx src/ui/ResourcesScreen.test.tsx src/ui/PresetsTab.tsx src/ui/PresetsTab.test.tsx src/ui/VolumesTab.tsx src/ui/VolumesTab.test.tsx src/ui/console.css src/domain/resourceView.ts src/domain/resourceView.test.ts
git commit -m "feat: 资源中心壳 + 工作区预设 + 数据卷（列表/新建/删除/清理二次确认）"
```

---

### Task 4: 插件库 Tab

**Files:**
- Create: `src/ui/PluginLibraryTab.tsx`
- Create: `src/ui/PluginLibraryTab.test.tsx`
- Modify: `src/ui/console.css`（追加 `res-plugin-*` 类）

**Interfaces:**
- Consumes: `listCapabilitySets`/`getCapabilityCatalog`/`getCapabilityStatus`（resources.ts）、`listProjects`+`getProject`（projects.ts，既有）、`projectRefById`（projects.ts）。`CapabilitySet`/`GetCapabilityCatalogResponse`/`CapabilityStatusResponse` 类型。
- Produces: `PluginLibraryTab`。

- [ ] **Step 1: 写失败测试** `src/ui/PluginLibraryTab.test.tsx`：

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithClient } from '../test/renderWithClient';
import { PluginLibraryTab } from './PluginLibraryTab';

const mocks = {
  listCapabilitySets: vi.fn(),
  getCapabilityCatalog: vi.fn(),
  getCapabilityStatus: vi.fn(),
  listProjects: vi.fn(),
  getProject: vi.fn(),
};
vi.mock('../api/resources', () => ({
  listCapabilitySets: (...a: unknown[]) => mocks.listCapabilitySets(...a),
  getCapabilityCatalog: (...a: unknown[]) => mocks.getCapabilityCatalog(...a),
  getCapabilityStatus: (...a: unknown[]) => mocks.getCapabilityStatus(...a),
}));
vi.mock('../api/projects', () => ({
  listProjects: (...a: unknown[]) => mocks.listProjects(...a),
  getProject: (...a: unknown[]) => mocks.getProject(...a),
  projectRefById: (id: string) => ({ id }),
}));
vi.mock('../api/connection', () => ({ loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }) }));

const CATALOG = { capsetId: 'web', name: 'Web 能力', description: '', methods: [{ methodFullName: 'fetch', enabled: true }] };

describe('PluginLibraryTab', () => {
  beforeEach(() => {
    mocks.listCapabilitySets.mockReset().mockResolvedValue([
      { id: 'web', name: 'Web 能力', description: '访问网页', enabled: true },
      { id: 'code', name: '代码能力', description: '读写代码', enabled: false },
    ]);
    mocks.getCapabilityCatalog.mockReset().mockResolvedValue(CATALOG);
    mocks.getCapabilityStatus.mockReset().mockResolvedValue({ configured: true, ok: true });
    mocks.listProjects.mockReset().mockResolvedValue([{ projectId: 'p1' }]);
    mocks.getProject.mockReset().mockResolvedValue({
      summary: { projectId: 'p1', name: 'proj' },
      // AgentSpec 数据在 spec.agents（Project.agents 是 ProjectAgent[]，无 name/mcpServers/skills）
      spec: { agents: [{ name: 'my-report', displayName: '我的日报', mcpServers: [{ name: 'github' }], skills: [{ name: 'code' }] }] },
    });
  });
  it('渲染技能包列表 + 在用汇总', async () => {
    renderWithClient(<PluginLibraryTab />);
    await waitFor(() => expect(screen.getByText('Web 能力')).toBeInTheDocument());
    expect(screen.getByText('已启用')).toBeInTheDocument();
    expect(screen.getByText('代码能力')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('在用插件与技能')).toBeInTheDocument());
    expect(screen.getByText('github')).toBeInTheDocument();
    expect(screen.getByText('我的日报')).toBeInTheDocument();
  });
  it('展开技能包加载能力目录', async () => {
    const user = userEvent.setup();
    renderWithClient(<PluginLibraryTab />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Web 能力/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Web 能力/ }));
    await waitFor(() => expect(screen.getByText('fetch')).toBeInTheDocument());
    expect(mocks.getCapabilityCatalog).toHaveBeenCalledWith({ baseUrl: '', authToken: '' }, 'web');
  });
});
```

- [ ] **Step 2: 跑测试确认红**

Run: `npx vitest run src/ui/PluginLibraryTab.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 实现** `src/ui/PluginLibraryTab.tsx`：

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { loadConnectionSettings } from '../api/connection';
import { getCapabilityCatalog, getCapabilityStatus, listCapabilitySets } from '../api/resources';
import { getProject, listProjects, projectRefById } from '../api/projects';
import type { CapabilitySet } from '../api/gen/agentcompose/v2/agentcompose_pb';
import './console.css';

export function PluginLibraryTab() {
  const s = loadConnectionSettings();
  const setsQuery = useQuery({ queryKey: ['capability-sets'], queryFn: () => listCapabilitySets(s) });
  const statusQuery = useQuery({ queryKey: ['capability-status'], queryFn: () => getCapabilityStatus(s) });
  const usageQuery = useQuery({
    queryKey: ['capability-usage'],
    queryFn: async () => {
      const summaries = await listProjects(s);
      const projects = (
        await Promise.all(summaries.map((p) => getProject(s, projectRefById(p.projectId), true).catch(() => undefined)))
      ).filter((p): p is NonNullable<typeof p> => Boolean(p));
      const rows: { projectName: string; agentName: string; displayName: string; mcp: string[]; skills: string[] }[] = [];
      for (const proj of projects) {
        for (const a of proj.spec?.agents ?? []) {
          rows.push({ projectName: proj.summary?.name ?? proj.summary?.projectId ?? '', agentName: a.name, displayName: a.displayName, mcp: a.mcpServers?.map((m) => m.name) ?? [], skills: a.skills?.map((s) => s.name) ?? [] });
        }
      }
      return rows;
    },
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const catalogQuery = useQuery({
    queryKey: ['capability-catalog'],
    queryFn: () => getCapabilityCatalog(s, Array.from(expanded)[0] ?? ''),
    enabled: expanded.size > 0,
  });

  if (setsQuery.isLoading) return <p role="status">正在加载插件库…</p>;
  if (setsQuery.isError) return <p role="alert">连不上 agent-compose，加载失败。</p>;
  const sets = setsQuery.data ?? [];
  const status = statusQuery.data;
  const usage = usageQuery.data ?? [];

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.clear(), next.add(id);
    setExpanded(next);
  };
  const expandedId = Array.from(expanded)[0];

  return (
    <div className="res-section">
      <div className="run-section__head">
        <h3>技能包能力集</h3>
        {status && <span className={`res-capstatus${status.ok ? ' res-capstatus--ok' : ''}`}>{status.ok ? '网关就绪' : '网关未就绪'}</span>}
      </div>
      {sets.length === 0 ? (
        <p className="run-section__empty">没有可用的技能包。</p>
      ) : (
        <div className="res-plugin-list">
          {sets.map((set: CapabilitySet) => (
            <div key={set.id} className="res-plugin">
              <button type="button" className="res-plugin__head" aria-expanded={expanded.has(set.id)} onClick={() => toggle(set.id)}>
                <span>{set.name}</span>
                {set.enabled ? <span className="run-status run-status--running">已启用</span> : <span className="run-status run-status--stopped">未启用</span>}
              </button>
              {set.description && <p className="res-plugin__desc">{set.description}</p>}
              {expanded.has(set.id) && (
                <div className="res-plugin__methods">
                  {(catalogQuery.data?.methods ?? []).map((m) => (
                    <span key={m.methodFullName} className="res-plugin__method">{m.methodFullName}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="run-section__head" style={{ marginTop: 24 }}>
        <h3>在用插件与技能</h3>
      </div>
      {usage.length === 0 ? (
        <p className="run-section__empty">还没有助手用到插件或技能包。</p>
      ) : (
        <table className="runs-table">
          <thead><tr><th>助手</th><th>所属项目</th><th>插件（MCP）</th><th>技能包</th></tr></thead>
          <tbody>
            {usage.map((r) => (
              <tr key={`${r.projectName}:${r.agentName}`}>
                <td>{r.displayName || r.agentName}</td>
                <td>{r.projectName}</td>
                <td>{r.mcp.length > 0 ? r.mcp.join('、') : '—'}</td>
                <td>{r.skills.length > 0 ? r.skills.join('、') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```
> 注意 TS 语义：`next.clear(), next.add(id)` 在逗号表达式里合法但 lint 可能报 `no-sequences`。改为两行语句（`next.clear(); next.add(id);`）。`expandedId` 变量若未使用会触发 oxlint 未使用警告 — 直接删掉，catalogQuery 里用 `Array.from(expanded)[0] ?? ''`。
> 在用汇总读 `proj.spec?.agents`（ProjectSpec.agents: AgentSpec[]）而非 `proj.agents`（ProjectAgent[] 无 name/mcpServers/skills；getProject 以 includeSpec=true 调用，spec 已填充）。AgentSpec.skills 是 SkillSpec[]（有 name 字段），映射 `s.name`；mcpServers 是 MCPServerSpec[]（有 name 字段）。能力目录方法名用 `m.methodFullName`（CapabilityMethod 无 name 字段）。

`src/ui/console.css` 追加：

```css
.res-capstatus { font-size: 12px; color: #9ca3af; }
.res-capstatus--ok { color: #15803d; }
.res-plugin-list { display: flex; flex-direction: column; gap: 8px; }
.res-plugin { border: 1px solid var(--ac-border, #d5d5d5); border-radius: 8px; padding: 10px 12px; }
.res-plugin__head { display: flex; justify-content: space-between; align-items: center; width: 100%; border: none; background: none; font-size: 14px; font-weight: 600; cursor: pointer; }
.res-plugin__desc { color: #666; font-size: 13px; margin: 4px 0 0; }
.res-plugin__methods { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.res-plugin__method { background: #f0f6ff; color: #0969da; border-radius: 999px; padding: 2px 10px; font-size: 12px; }
```

- [ ] **Step 4: 跑测试确认绿**

Run: `npx vitest run src/ui/PluginLibraryTab.test.tsx`
Expected: PASS。全量 `--testTimeout=30000` 无回归。

- [ ] **Step 5: 提交**

```bash
git add src/ui/PluginLibraryTab.tsx src/ui/PluginLibraryTab.test.tsx src/ui/console.css
git commit -m "feat: 插件库 Tab（技能包能力集展开 + 在用 MCP/技能汇总）"
```

---

### Task 5: 沙箱与镜像 Tab

**Files:**
- Create: `src/ui/SandboxesTab.tsx`
- Create: `src/ui/SandboxesTab.test.tsx`
- Modify: `src/ui/console.css`（追加 `res-sbx-*` 类）

**Interfaces:**
- Consumes: `listSandboxes`/`stopSandbox`/`resumeSandbox`/`removeSandbox`/`pruneSandboxes`、`listImages`/`removeImage`、`listCaches`/`removeCache`/`pruneCaches`（resources.ts）、`describeSandboxStatus`/`describeCacheDomain`/`DANGEROUS_ACTIONS`（resourceView.ts）。
- Produces: `SandboxesTab`。

- [ ] **Step 1: 写失败测试** `src/ui/SandboxesTab.test.tsx`：

```tsx
const mocks = {
  listSandboxes: vi.fn(), stopSandbox: vi.fn(), resumeSandbox: vi.fn(), removeSandbox: vi.fn(), pruneSandboxes: vi.fn(),
  listImages: vi.fn(), removeImage: vi.fn(),
  listCaches: vi.fn(), removeCache: vi.fn(), pruneCaches: vi.fn(),
};
vi.mock('../api/resources', () => ({
  listSandboxes: (...a: unknown[]) => mocks.listSandboxes(...a),
  stopSandbox: (...a: unknown[]) => mocks.stopSandbox(...a),
  resumeSandbox: (...a: unknown[]) => mocks.resumeSandbox(...a),
  removeSandbox: (...a: unknown[]) => mocks.removeSandbox(...a),
  pruneSandboxes: (...a: unknown[]) => mocks.pruneSandboxes(...a),
  listImages: (...a: unknown[]) => mocks.listImages(...a),
  removeImage: (...a: unknown[]) => mocks.removeImage(...a),
  listCaches: (...a: unknown[]) => mocks.listCaches(...a),
  removeCache: (...a: unknown[]) => mocks.removeCache(...a),
  pruneCaches: (...a: unknown[]) => mocks.pruneCaches(...a),
}));
vi.mock('../api/connection', () => ({ loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }) }));
vi.mock('../domain/resourceView', () => ({
  describeSandboxStatus: (st: number) => (st === 2 ? '运行中' : '已停止'),
  describeCacheDomain: () => '镜像仓库',
  DANGEROUS_ACTIONS: { removeSandbox: '删除后工作台会被移除。', removeImage: '镜像会被移除。', removeCache: '缓存会被清理。', pruneSandboxes: '清理所有已停止的工作台。', pruneCaches: '清理所有未使用的缓存。' },
}));

const S = { baseUrl: '', authToken: '' };
const RUNNING = { sandboxId: 'sb1', status: 2, driver: 'docker' };
const img = { imageRef: 'img/foo:latest' };
const cache = { cacheId: 'c1', domain: 1 };

describe('SandboxesTab', () => {
  beforeEach(() => {
    mocks.listSandboxes.mockReset().mockResolvedValue([RUNNING]);
    mocks.stopSandbox.mockReset().mockResolvedValue(undefined);
    mocks.resumeSandbox.mockReset().mockResolvedValue(undefined);
    mocks.removeSandbox.mockReset().mockResolvedValue(undefined);
    mocks.pruneSandboxes.mockReset().mockResolvedValue(undefined);
    mocks.listImages.mockReset().mockResolvedValue([img]);
    mocks.removeImage.mockReset().mockResolvedValue(undefined);
    mocks.listCaches.mockReset().mockResolvedValue([cache]);
    mocks.removeCache.mockReset().mockResolvedValue(undefined);
    mocks.pruneCaches.mockReset().mockResolvedValue(undefined);
  });
  it('渲染沙箱状态人话 + 镜像名 + 缓存行', async () => {
    renderWithClient(<SandboxesTab />);
    await waitFor(() => expect(screen.getByText('运行中')).toBeInTheDocument());
    expect(screen.getByText('img/foo:latest')).toBeInTheDocument();
    expect(screen.getByText('镜像仓库')).toBeInTheDocument();
  });
  it('停止需二次确认，确认后才调 stopSandbox', async () => {
    const user = userEvent.setup();
    renderWithClient(<SandboxesTab />);
    await waitFor(() => expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '停止' }));
    expect(mocks.stopSandbox).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '确认停止' }));
    await waitFor(() => expect(mocks.stopSandbox).toHaveBeenCalledWith(S, 'sb1'));
  });
  it('移除沙箱二次确认 → removeSandbox', async () => {
    const user = userEvent.setup();
    renderWithClient(<SandboxesTab />);
    await waitFor(() => expect(screen.getByRole('button', { name: '移除' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '移除' }));
    expect(mocks.removeSandbox).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '确认移除' }));
    await waitFor(() => expect(mocks.removeSandbox).toHaveBeenCalledWith(S, 'sb1'));
  });
  it('清理沙箱/清理缓存二次确认 → pruneSandboxes / pruneCaches', async () => {
    const user = userEvent.setup();
    renderWithClient(<SandboxesTab />);
    await waitFor(() => expect(screen.getByRole('button', { name: /清理已停止的工作台/ })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /清理已停止的工作台/ }));
    await user.click(screen.getByRole('button', { name: '确认清理' }));
    await waitFor(() => expect(mocks.pruneSandboxes).toHaveBeenCalledWith(S));
    await user.click(screen.getByRole('button', { name: /清理缓存/ }));
    await user.click(screen.getByRole('button', { name: '确认清理' }));
    await waitFor(() => expect(mocks.pruneCaches).toHaveBeenCalledWith(S));
  });
  it('移除镜像/缓存二次确认 → removeImage / removeCache', async () => {
    const user = userEvent.setup();
    renderWithClient(<SandboxesTab />);
    await waitFor(() => expect(screen.getAllByRole('button', { name: '移除' }).length).toBeGreaterThan(1));
    const buttons = screen.getAllByRole('button', { name: '移除' });
    // DOM 顺序：沙箱行(运行中, [停止][移除]) → 镜像行[移除] → 缓存行[移除]
    await user.click(buttons[1]);
    await user.click(screen.getByRole('button', { name: '确认移除' }));
    await waitFor(() => expect(mocks.removeImage).toHaveBeenCalledWith(S, 'img/foo:latest'));
    await user.click(screen.getAllByRole('button', { name: '移除' })[2]);
    await user.click(screen.getByRole('button', { name: '确认移除' }));
    await waitFor(() => expect(mocks.removeCache).toHaveBeenCalledWith(S, 'c1'));
  });
});
```
> 沙箱状态 mock 用 `status: 2`（SandboxStatus.RUNNING 的数值），`describeSandboxStatus` 被 mock 后返回「运行中」→ 表格渲染「停止」按钮；`cache.domain: 1`（CacheDomain.OCI_IMAGE_STORE）。「移除镜像/移除缓存」用例中三个「移除」按钮同文本，用 `getAllByRole` 按 DOM 顺序取（沙箱→镜像→缓存）。

- [ ] **Step 2: 跑测试确认红**

Run: `npx vitest run src/ui/SandboxesTab.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 实现** `src/ui/SandboxesTab.tsx`（三段式：沙箱 / 镜像 / 缓存，各含列表与操作；结构照 VolumesTab，三段复用「列表 + 操作 + 确认弹层」模式）：

```tsx
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loadConnectionSettings } from '../api/connection';
import {
  listCaches, listImages, listSandboxes, pruneCaches, pruneSandboxes,
  removeCache, removeImage, removeSandbox, resumeSandbox, stopSandbox,
} from '../api/resources';
import type { CacheItem, Image, Sandbox } from '../api/gen/agentcompose/v2/agentcompose_pb';
import { DANGEROUS_ACTIONS, describeCacheDomain, describeSandboxStatus } from '../domain/resourceView';
import './console.css';

export function SandboxesTab() {
  const queryClient = useQueryClient();
  const s = loadConnectionSettings();
  const sbx = useQuery({ queryKey: ['sandboxes'], queryFn: () => listSandboxes(s) });
  const imgs = useQuery({ queryKey: ['images'], queryFn: () => listImages(s) });
  const caches = useQuery({ queryKey: ['caches'], queryFn: () => listCaches(s) });
  const [stopping, setStopping] = useState<Sandbox | null>(null);
  const [removingSbx, setRemovingSbx] = useState<Sandbox | null>(null);
  const [removingImg, setRemovingImg] = useState<Image | null>(null);
  const [removingCache, setRemovingCache] = useState<CacheItem | null>(null);
  const [confirmingPrune, setConfirmingPrune] = useState<'sandboxes' | 'caches' | null>(null);
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ['sandboxes'] }); queryClient.invalidateQueries({ queryKey: ['images'] }); queryClient.invalidateQueries({ queryKey: ['caches'] }); };

  const stopMutation = useMutation({ mutationFn: async (x: Sandbox) => { await stopSandbox(s, x.sandboxId); }, onSuccess: () => { setStopping(null); invalidate(); } });
  const removeSbxMutation = useMutation({ mutationFn: async (x: Sandbox) => { await removeSandbox(s, x.sandboxId); }, onSuccess: () => { setRemovingSbx(null); invalidate(); } });
  const resumeMutation = useMutation({ mutationFn: async (x: Sandbox) => { await resumeSandbox(s, x.sandboxId); }, onSuccess: () => invalidate() });
  const pruneSbxMutation = useMutation({ mutationFn: async () => { await pruneSandboxes(s); }, onSuccess: () => { setConfirmingPrune(null); invalidate(); } });
  const removeImgMutation = useMutation({ mutationFn: async (x: Image) => { await removeImage(s, x.imageRef); }, onSuccess: () => { setRemovingImg(null); invalidate(); } });
  const removeCacheMutation = useMutation({ mutationFn: async (x: CacheItem) => { await removeCache(s, x.cacheId); }, onSuccess: () => { setRemovingCache(null); invalidate(); } });
  const pruneCacheMutation = useMutation({ mutationFn: async () => { await pruneCaches(s); }, onSuccess: () => { setConfirmingPrune(null); invalidate(); } });

  if (sbx.isLoading || imgs.isLoading || caches.isLoading) return <p role="status">正在加载沙箱与镜像…</p>;
  if (sbx.isError || imgs.isError || caches.isError) return <p role="alert">连不上 agent-compose，加载失败。</p>;

  return (
    <div className="res-section">
      <div className="run-section__head">
        <h3>沙箱（助手工作台）</h3>
        <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setConfirmingPrune('sandboxes')}>清理已停止的工作台</button>
      </div>
      <table className="runs-table">
        <thead><tr><th>ID</th><th>状态</th><th>驱动</th><th></th></tr></thead>
        <tbody>
          {(sbx.data ?? []).map((x) => (
            <tr key={x.sandboxId}>
              <td>{x.sandboxId}</td>
              <td><span className={`run-status run-status--${describeSandboxStatus(x.status) === '运行中' ? 'running' : 'stopped'}`}>{describeSandboxStatus(x.status)}</span></td>
              <td>{x.driver}</td>
              <td>
                {describeSandboxStatus(x.status) === '运行中' ? (
                  <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setStopping(x)}>停止</button>
                ) : (
                  <button type="button" className="setup-btn setup-btn--ghost" onClick={() => resumeMutation.mutate(x)}>恢复</button>
                )}{' '}
                <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setRemovingSbx(x)}>移除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="run-section__head" style={{ marginTop: 24 }}>
        <h3>镜像</h3>
      </div>
      <table className="runs-table">
        <thead><tr><th>镜像</th><th></th></tr></thead>
        <tbody>
          {(imgs.data ?? []).map((x) => (
            <tr key={x.imageRef}>
              <td>{x.imageRef}</td>
              <td><button type="button" className="setup-btn setup-btn--ghost" onClick={() => setRemovingImg(x)}>移除</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="run-section__head" style={{ marginTop: 24 }}>
        <h3>缓存</h3>
        <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setConfirmingPrune('caches')}>清理缓存</button>
      </div>
      <table className="runs-table">
        <thead><tr><th>缓存</th><th>域</th><th></th></tr></thead>
        <tbody>
          {(caches.data ?? []).map((x) => (
            <tr key={x.cacheId}>
              <td>{x.cacheId}</td>
              <td>{describeCacheDomain(x.domain)}</td>
              <td><button type="button" className="setup-btn setup-btn--ghost" onClick={() => setRemovingCache(x)}>移除</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {stopping && (
        <div className="auth-overlay" role="dialog" aria-label="停止确认">
          <div>
            <h3>停止这个工作台？</h3>
            <p>正在进行的任务会中断，可以之后再恢复。</p>
            <div className="auth-overlay__actions">
              <button type="button" className="setup-btn" disabled={stopMutation.isPending} onClick={() => stopMutation.mutate(stopping)}>确认停止</button>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setStopping(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
      {removingSbx && (
        <div className="auth-overlay" role="dialog" aria-label="移除确认">
          <div>
            <h3>移除这个工作台？</h3>
            <p>{DANGEROUS_ACTIONS.removeSandbox}</p>
            <div className="auth-overlay__actions">
              <button type="button" className="setup-btn" disabled={removeSbxMutation.isPending} onClick={() => removeSbxMutation.mutate(removingSbx)}>确认移除</button>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setRemovingSbx(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
      {removingImg && (
        <div className="auth-overlay" role="dialog" aria-label="移除确认">
          <div>
            <h3>移除镜像「{removingImg.imageRef}」？</h3>
            <p>{DANGEROUS_ACTIONS.removeImage}</p>
            <div className="auth-overlay__actions">
              <button type="button" className="setup-btn" disabled={removeImgMutation.isPending} onClick={() => removeImgMutation.mutate(removingImg)}>确认移除</button>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setRemovingImg(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
      {removingCache && (
        <div className="auth-overlay" role="dialog" aria-label="移除确认">
          <div>
            <h3>移除这份缓存？</h3>
            <p>{DANGEROUS_ACTIONS.removeCache}</p>
            <div className="auth-overlay__actions">
              <button type="button" className="setup-btn" disabled={removeCacheMutation.isPending} onClick={() => removeCacheMutation.mutate(removingCache)}>确认移除</button>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setRemovingCache(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
      {confirmingPrune === 'sandboxes' && (
        <div className="auth-overlay" role="dialog" aria-label="清理确认">
          <div>
            <h3>清理已停止的工作台？</h3>
            <p>{DANGEROUS_ACTIONS.pruneSandboxes}</p>
            <div className="auth-overlay__actions">
              <button type="button" className="setup-btn" disabled={pruneSbxMutation.isPending} onClick={() => pruneSbxMutation.mutate()}>确认清理</button>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setConfirmingPrune(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
      {confirmingPrune === 'caches' && (
        <div className="auth-overlay" role="dialog" aria-label="清理确认">
          <div>
            <h3>清理未使用的缓存？</h3>
            <p>{DANGEROUS_ACTIONS.pruneCaches}</p>
            <div className="auth-overlay__actions">
              <button type="button" className="setup-btn" disabled={pruneCacheMutation.isPending} onClick={() => pruneCacheMutation.mutate()}>确认清理</button>
              <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setConfirmingPrune(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```
> `resumeMutation` 无确认（恢复非破坏性）。状态徽章复用既有 `run-status` 类（running/stopped 两态）。

`src/ui/console.css` 追加（如需额外样式；现有 `runs-table`/`run-status`/`run-section__head` 已够，可只加注释头）：

```css
/* ===== 资源中心：沙箱与镜像（复用 runs-table / run-status / run-section__head） ===== */
```

- [ ] **Step 4: 跑测试确认绿**

Run: `npx vitest run src/ui/SandboxesTab.test.tsx`
Expected: PASS。全量 `--testTimeout=30000` 无回归。

- [ ] **Step 5: 提交**

```bash
git add src/ui/SandboxesTab.tsx src/ui/SandboxesTab.test.tsx src/ui/console.css
git commit -m "feat: 沙箱/镜像/缓存 Tab（停止/恢复/移除/清理二次确认）"
```

---

### Task 6: 设置页壳 + Provider 密钥复用 + 全局环境变量

**Files:**
- Create: `src/ui/SettingsScreen.tsx`
- Create: `src/ui/SettingsScreen.test.tsx`
- Create: `src/ui/GlobalEnvSection.tsx`
- Create: `src/ui/GlobalEnvSection.test.tsx`
- Modify: `src/ui/ProviderKeysScreen.tsx`（`onNext` 改可选）
- Modify: `src/ui/ProviderKeysScreen.test.tsx`（补「无 onNext 时隐藏跳过按钮」用例）
- Modify: `src/ui/console.css`（追加 `set-*` 类）

**Interfaces:**
- Consumes: `getGlobalEnv`/`updateGlobalEnv`（settings.ts）、`ProviderKeysScreen`（改造后）、`EnvVarSpec` 类型。
- Produces: `SettingsScreen`（4 节，Provider 密钥 + 全局 env 先渲染，Gateway/调度在 T7 加入）——T8 挂到 `/console/settings`；`GlobalEnvSection`。

- [ ] **Step 1: 写失败测试**

`src/ui/SettingsScreen.test.tsx`（mock 四个子组件）：

```tsx
vi.mock('./ProviderKeysScreen', () => ({ ProviderKeysScreen: () => <div>provider keys</div> }));
vi.mock('./GlobalEnvSection', () => ({ GlobalEnvSection: () => <div>global env</div> }));
vi.mock('./GatewaySection', () => ({ GatewaySection: () => <div>gateway</div> }));
vi.mock('./SchedulerSection', () => ({ SchedulerSection: () => <div>scheduler</div> }));
describe('SettingsScreen', () => {
  it('渲染四个设置区块', () => {
    renderWithClient(<SettingsScreen />);
    expect(screen.getByText('provider keys')).toBeInTheDocument();
    expect(screen.getByText('global env')).toBeInTheDocument();
    expect(screen.getByText('gateway')).toBeInTheDocument();
    expect(screen.getByText('scheduler')).toBeInTheDocument();
  });
});
```

`src/ui/GlobalEnvSection.test.tsx`：

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithClient } from '../test/renderWithClient';
import { GlobalEnvSection } from './GlobalEnvSection';

const mocks = { getGlobalEnv: vi.fn(), updateGlobalEnv: vi.fn() };
vi.mock('../api/settings', () => ({
  getGlobalEnv: (...a: unknown[]) => mocks.getGlobalEnv(...a),
  updateGlobalEnv: (...a: unknown[]) => mocks.updateGlobalEnv(...a),
}));
vi.mock('../api/connection', () => ({ loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }) }));

describe('GlobalEnvSection', () => {
  beforeEach(() => {
    mocks.getGlobalEnv.mockReset().mockResolvedValue([
      { name: 'MY_TOKEN', value: 'abc', secret: true },
      { name: 'APP_VER', value: '1.0', secret: false },
    ]);
    mocks.updateGlobalEnv.mockReset().mockResolvedValue(undefined);
  });
  it('渲染两行；secret 行输入框 type=password', async () => {
    renderWithClient(<GlobalEnvSection />);
    await waitFor(() => expect(screen.getAllByLabelText('变量名').length).toBe(2));
    const values = screen.getAllByLabelText('变量值');
    expect(values[0]).toHaveAttribute('type', 'password');
    expect(values[1]).toHaveAttribute('type', 'text');
  });
  it('新增一行 → 保存 → updateGlobalEnv 收到合并后的数组', async () => {
    const user = userEvent.setup();
    renderWithClient(<GlobalEnvSection />);
    await waitFor(() => expect(screen.getByRole('button', { name: '+ 添加' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '+ 添加' }));
    await user.type(screen.getAllByLabelText('变量名')[2], 'NEW_KEY');
    await user.type(screen.getAllByLabelText('变量值')[2], 'x');
    await user.click(screen.getByRole('button', { name: '保存环境变量' }));
    await waitFor(() => expect(mocks.updateGlobalEnv).toHaveBeenCalledWith(
      { baseUrl: '', authToken: '' },
      [
        { name: 'MY_TOKEN', secret: true },
        { name: 'APP_VER', value: '1.0', secret: false },
        { name: 'NEW_KEY', value: 'x', secret: false },
      ],
    ));
  });
  it('删除一行 → 保存 → 数组不含该 key', async () => {
    const user = userEvent.setup();
    renderWithClient(<GlobalEnvSection />);
    await waitFor(() => expect(screen.getByRole('button', { name: '删除 MY_TOKEN' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '删除 MY_TOKEN' }));
    await user.click(screen.getByRole('button', { name: '保存环境变量' }));
    await waitFor(() => expect(mocks.updateGlobalEnv).toHaveBeenCalledWith(
      { baseUrl: '', authToken: '' },
      [{ name: 'APP_VER', value: '1.0', secret: false }],
    ));
  });
  it('保存后提示「已保存」', async () => {
    const user = userEvent.setup();
    renderWithClient(<GlobalEnvSection />);
    await waitFor(() => expect(screen.getByRole('button', { name: '保存环境变量' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '保存环境变量' }));
    await waitFor(() => expect(screen.getByText('已保存')).toBeInTheDocument());
  });
});
```
> `updateGlobalEnv` 是整体替换：UI 编辑当前数组 → 提交全量。secret 行的值在保存时省略（`{ name, secret: true }`，无 value）——保留原值语义。断言顺序与 secret 标记保留。

`src/ui/ProviderKeysScreen.test.tsx` 追加用例：

```tsx
it('无 onNext 时不显示「跳过」按钮', () => {
  renderWithClient(<ProviderKeysScreen />);
  // getGlobalEnv mock resolve 后
  expect(screen.queryByRole('button', { name: /跳过/ })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /保存密钥/ })).toBeInTheDocument();
});
```
> ProviderKeysScreen 的既有测试已覆盖 with-onNext 路径；新用例渲染无 onNext 版本。ProviderKeysScreen 渲染不依赖 router，renderWithClient 即可。

- [ ] **Step 2: 跑测试确认红**

Run: `npx vitest run src/ui/SettingsScreen.test.tsx src/ui/GlobalEnvSection.test.tsx src/ui/ProviderKeysScreen.test.tsx`
Expected: FAIL（SettingsScreen 不存在；ProviderKeysScreen 无 onNext 用例红——组件仍要求 onNext）。

- [ ] **Step 3: 实现**

`src/ui/ProviderKeysScreen.tsx` 改造：`onNext` 改可选，跳过按钮条件渲染：

```tsx
export function ProviderKeysScreen({ onNext }: { onNext?: () => void }) {
  // ...（其余不变）
  <div className="login__actions">
    <button type="button" className="setup-btn" onClick={save} disabled={status === 'saving'}>
      {status === 'saving' ? '正在保存…' : '保存密钥'}
    </button>
    {onNext && (
      <button type="button" className="setup-btn setup-btn--ghost" onClick={onNext}>
        跳过，稍后在设置里配置
      </button>
    )}
  </div>
```
> SetupShell 传 onNext 处无需改（可选参数兼容）。若 oxlint 报 onNext 未使用（仅条件使用，不会），无问题。

`src/ui/GlobalEnvSection.tsx`：

```tsx
import { useEffect, useState } from 'react';
import { getGlobalEnv, updateGlobalEnv } from '../api/settings';
import { loadConnectionSettings } from '../api/connection';
import type { EnvVarSpec } from '../api/gen/agentcompose/v2/agentcompose_pb';
import './console.css';

interface Row { name: string; value: string; secret: boolean; key: string; }
let seq = 0;
const nextKey = () => `row-${seq++}`;

export function GlobalEnvSection() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [status, setStatus] = useState<'loading' | 'idle' | 'saving' | 'saved'>('loading');

  useEffect(() => {
    getGlobalEnv(loadConnectionSettings())
      .then((env: EnvVarSpec[]) => setRows(env.map((e) => ({ name: e.name, value: e.value, secret: e.secret, key: nextKey() }))))
      .catch(() => { setRows([]); setStatus('idle'); });
  }, []);

  if (!rows) return <p role="status">正在读取全局环境变量…</p>;

  const save = async () => {
    setStatus('saving');
    try {
      await updateGlobalEnv(loadConnectionSettings(), rows.map((r) => (r.secret ? { name: r.name, secret: true } : { name: r.name, value: r.value, secret: false })));
      setStatus('saved');
    } catch {
      setStatus('idle');
    }
  };

  return (
    <div className="set-section">
      <div className="run-section__head">
        <h3>全局环境变量</h3>
        <button type="button" className="setup-btn" onClick={() => setRows((r) => [...(r ?? []), { name: '', value: '', secret: false, key: nextKey() }])}>+ 添加</button>
      </div>
      <p className="run-section__empty">这些变量会注入到所有 AI 助手的工作环境。值带「密钥」标记的会掩码显示。</p>
      <table className="runs-table">
        <thead><tr><th>变量名</th><th>值</th><th>密钥</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td><input value={r.name} aria-label="变量名" onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, name: e.target.value } : x)))} /></td>
              <td><input type={r.secret ? 'password' : 'text'} value={r.value} aria-label="变量值" onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, value: e.target.value } : x)))} /></td>
              <td><input type="checkbox" checked={r.secret} aria-label="标记为密钥" onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, secret: e.target.checked } : x)))} /></td>
              <td><button type="button" className="setup-btn setup-btn--ghost" aria-label={`删除 ${r.name || '此行'}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>删除</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="auth-overlay__actions">
        <button type="button" className="setup-btn" disabled={status === 'saving'} onClick={save}>{status === 'saving' ? '正在保存…' : '保存环境变量'}</button>
        {status === 'saved' && <span className="dash-live">已保存</span>}
      </div>
    </div>
  );
}
```
> secret 行在编辑时值留空 = 提交时省略 value（`secret: true` 不带 value）→ daemon 保留原值（providerKeys.ts 既有语义）。若用户把 secret 行改成非 secret 且留空，提交 value:'' 会清掉——测试②断言合并语义时注意。

`src/ui/SettingsScreen.tsx`：

```tsx
import { ProviderKeysScreen } from './ProviderKeysScreen';
import { GlobalEnvSection } from './GlobalEnvSection';
import { GatewaySection } from './GatewaySection';
import { SchedulerSection } from './SchedulerSection';
import './console.css';

export function SettingsScreen() {
  return (
    <section className="console-page">
      <div className="console-page__head"><h2>设置</h2></div>
      <div className="set-block">
        <div className="run-section__head"><h3>AI 引擎密钥</h3></div>
        <ProviderKeysScreen />
      </div>
      <GlobalEnvSection />
      <GatewaySection />
      <SchedulerSection />
    </section>
  );
}
```

`src/ui/console.css` 追加：

```css
/* ===== 设置 ===== */
.set-block { margin-bottom: 24px; }
.set-section { margin-bottom: 24px; }
```

- [ ] **Step 4: 跑测试确认绿**

Run: `npx vitest run src/ui/SettingsScreen.test.tsx src/ui/GlobalEnvSection.test.tsx src/ui/ProviderKeysScreen.test.tsx`
Expected: PASS。全量 `--testTimeout=30000` 无回归（SetupShell 相关测试仍绿——ProviderKeysScreen onNext 兼容）。

- [ ] **Step 5: 提交**

```bash
git add src/ui/SettingsScreen.tsx src/ui/SettingsScreen.test.tsx src/ui/GlobalEnvSection.tsx src/ui/GlobalEnvSection.test.tsx src/ui/ProviderKeysScreen.tsx src/ui/ProviderKeysScreen.test.tsx src/ui/console.css
git commit -m "feat: 设置页（Provider 密钥复用 + 全局环境变量）"
```

---

### Task 7: 设置页 Capability Gateway + 调度（总览 + 事件历史）

**Files:**
- Create: `src/ui/GatewaySection.tsx`
- Create: `src/ui/GatewaySection.test.tsx`
- Create: `src/ui/SchedulerSection.tsx`
- Create: `src/ui/SchedulerSection.test.tsx`
- Modify: `src/ui/console.css`（追加 `set-gw-*` / `set-sch-*` 类）

**Interfaces:**
- Consumes: `getCapabilityGatewayConfig`/`updateCapabilityGatewayConfig`（settings.ts）、`listSchedulerEvents`（projects.ts，T1 新增）、`listProjects`+`getProject`+`projectRefById`+`getSchedulerNextFire`（projects.ts，既有，`getProject(s, ref, true)` 返回 `Project | undefined`）、`schedulerLevelTone`（resourceView.ts）、`CapabilityGatewayConfig`/`SchedulerEvent`/`ProjectSummary` 类型。
- Produces: `GatewaySection`、`SchedulerSection`。

- [ ] **Step 1: 写失败测试**

`src/ui/GatewaySection.test.tsx`：

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithClient } from '../test/renderWithClient';
import { GatewaySection } from './GatewaySection';

const mocks = { getCapabilityGatewayConfig: vi.fn(), updateCapabilityGatewayConfig: vi.fn() };
vi.mock('../api/settings', () => ({
  getCapabilityGatewayConfig: (...a: unknown[]) => mocks.getCapabilityGatewayConfig(...a),
  updateCapabilityGatewayConfig: (...a: unknown[]) => mocks.updateCapabilityGatewayConfig(...a),
}));
vi.mock('../api/connection', () => ({ loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }) }));

describe('GatewaySection', () => {
  beforeEach(() => {
    mocks.getCapabilityGatewayConfig.mockReset().mockResolvedValue({ addr: 'tcp://127.0.0.1:9000', tokenSet: true });
    mocks.updateCapabilityGatewayConfig.mockReset().mockResolvedValue(undefined);
  });
  it('折叠块默认收起；展开显示 addr 回填', async () => {
    const user = userEvent.setup();
    renderWithClient(<GatewaySection />);
    await waitFor(() => expect(mocks.getCapabilityGatewayConfig).toHaveBeenCalled());
    expect(document.querySelector('details')?.open).toBe(false);
    await user.click(screen.getByText('进阶：能力网关（Capability Gateway）'));
    expect(document.querySelector('details')?.open).toBe(true);
    expect(screen.getByLabelText('网关地址')).toHaveValue('tcp://127.0.0.1:9000');
  });
  it('tokenSet=true 提示「（已配置）」', async () => {
    const user = userEvent.setup();
    renderWithClient(<GatewaySection />);
    await user.click(screen.getByText('进阶：能力网关（Capability Gateway）'));
    await waitFor(() => expect(screen.getByText('（已配置）')).toBeInTheDocument());
  });
  it('保存：token 留空 → token undefined', async () => {
    const user = userEvent.setup();
    renderWithClient(<GatewaySection />);
    await user.click(screen.getByText('进阶：能力网关（Capability Gateway）'));
    await user.click(screen.getByRole('button', { name: '保存配置' }));
    await waitFor(() => expect(mocks.updateCapabilityGatewayConfig).toHaveBeenCalledWith(
      { baseUrl: '', authToken: '' },
      { addr: 'tcp://127.0.0.1:9000', token: undefined },
    ));
  });
  it('保存：填 token → 一并提交', async () => {
    const user = userEvent.setup();
    renderWithClient(<GatewaySection />);
    await user.click(screen.getByText('进阶：能力网关（Capability Gateway）'));
    await user.type(screen.getByLabelText('访问令牌'), 'sekrit');
    await user.click(screen.getByRole('button', { name: '保存配置' }));
    await waitFor(() => expect(mocks.updateCapabilityGatewayConfig).toHaveBeenCalledWith(
      { baseUrl: '', authToken: '' },
      { addr: 'tcp://127.0.0.1:9000', token: 'sekrit' },
    ));
  });
  it('保存成功提示「已保存」', async () => {
    const user = userEvent.setup();
    renderWithClient(<GatewaySection />);
    await user.click(screen.getByText('进阶：能力网关（Capability Gateway）'));
    await user.click(screen.getByRole('button', { name: '保存配置' }));
    await waitFor(() => expect(screen.getByText('已保存')).toBeInTheDocument());
  });
});
```
> `<details>` 在 jsdom 中不实现「收起时子节点不可见」，因此「默认收起」断言用 `details.open` 属性（原生 summary 点击切换），不用 queryByLabelText 判不可见。

`src/ui/SchedulerSection.test.tsx`：

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithClient } from '../test/renderWithClient';
import { SchedulerSection } from './SchedulerSection';

const mocks = {
  listProjects: vi.fn(), getProject: vi.fn(), getSchedulerNextFire: vi.fn(), listSchedulerEvents: vi.fn(),
};
vi.mock('../api/projects', () => ({
  listProjects: (...a: unknown[]) => mocks.listProjects(...a),
  getProject: (...a: unknown[]) => mocks.getProject(...a),
  projectRefById: (id: string) => ({ id }),
  getSchedulerNextFire: (...a: unknown[]) => mocks.getSchedulerNextFire(...a),
  listSchedulerEvents: (...a: unknown[]) => mocks.listSchedulerEvents(...a),
}));
vi.mock('../api/connection', () => ({ loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }) }));
vi.mock('../domain/resourceView', () => ({ schedulerLevelTone: (l: string) => (l === 'error' ? 'error' : 'info') }));

function PathStub() {
  const loc = useLocation();
  return <div>now at {loc.pathname}</div>;
}
function renderSection() {
  return renderWithClient(
    <MemoryRouter initialEntries={['/console/settings']}>
      <Routes>
        <Route path="/console/settings" element={<SchedulerSection />} />
        <Route path="/console/agents/:agentName/edit" element={<PathStub />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SchedulerSection', () => {
  beforeEach(() => {
    mocks.listProjects.mockReset().mockResolvedValue([{ projectId: 'p1' }]);
    mocks.getProject.mockReset().mockResolvedValue({
      summary: { projectId: 'p1', name: 'proj' },
      agents: [{ name: 'my-report', displayName: '我的日报', scheduler: { enabled: true, intervalMinutes: 90 } }],
    });
    mocks.getSchedulerNextFire.mockReset().mockResolvedValue(new Date('2026-09-01T09:00:00Z'));
    mocks.listSchedulerEvents.mockReset().mockResolvedValue([
      { id: 'e1', type: 'trigger', level: 'info', message: '到点触发', runId: 'r1', triggerId: '', payloadJson: '', createdAt: undefined },
      { id: 'e2', type: 'run', level: 'error', message: '触发失败', runId: 'r2', triggerId: '', payloadJson: '', createdAt: undefined },
    ]);
  });
  it('调度总览渲染助手名 + 已开启 + 下次触发时间（人话，非 —）', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByText('我的日报')).toBeInTheDocument());
    expect(screen.getByText('已开启')).toBeInTheDocument();
    const fire = screen.getByText(/月.*日 \d{2}:\d{2}/);
    expect(fire).not.toHaveTextContent('—');
  });
  it('点击助手行跳 /console/agents/my-report/edit', async () => {
    const user = userEvent.setup();
    renderSection();
    await waitFor(() => expect(screen.getByText('我的日报')).toBeInTheDocument());
    await user.click(screen.getByText('我的日报'));
    await waitFor(() => expect(screen.getByText('now at /console/agents/my-report/edit')).toBeInTheDocument());
  });
  it('事件历史渲染 message + level 徽章（info/error）', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByText('到点触发')).toBeInTheDocument());
    expect(screen.getByText('触发失败')).toBeInTheDocument();
    expect(screen.getByText('info')).toBeInTheDocument();
    expect(screen.getByText('error')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 跑测试确认红**

Run: `npx vitest run src/ui/GatewaySection.test.tsx src/ui/SchedulerSection.test.tsx`
Expected: FAIL。

- [ ] **Step 3: 实现**

`src/ui/GatewaySection.tsx`：

```tsx
import { useEffect, useState } from 'react';
import { getCapabilityGatewayConfig, updateCapabilityGatewayConfig } from '../api/settings';
import { loadConnectionSettings } from '../api/connection';
import './console.css';

export function GatewaySection() {
  const s = loadConnectionSettings();
  const [addr, setAddr] = useState('');
  const [token, setToken] = useState('');
  const [tokenSet, setTokenSet] = useState(false);
  const [status, setStatus] = useState<'loading' | 'idle' | 'saving' | 'saved'>('loading');

  useEffect(() => {
    getCapabilityGatewayConfig(s)
      .then((cfg) => {
        setAddr(cfg?.addr ?? '');
        setTokenSet(cfg?.tokenSet ?? false);
        setStatus('idle');
      })
      .catch(() => setStatus('idle'));
  }, [s]);

  const save = async () => {
    setStatus('saving');
    try {
      await updateCapabilityGatewayConfig(s, { addr, token: token ? token : undefined });
      setStatus('saved');
      if (token) { setToken(''); setTokenSet(true); }
    } catch {
      setStatus('idle');
    }
  };

  return (
    <details className="set-section wizard-advanced" data-testid="gateway">
      <summary>进阶：能力网关（Capability Gateway）</summary>
      {status !== 'loading' && (
        <>
          <p className="run-section__empty">连接外部能力网关（MCP 等）。改动立即生效。</p>
          <label>
            网关地址
            <input value={addr} onChange={(e) => setAddr(e.target.value)} aria-label="网关地址" placeholder="tcp://127.0.0.1:9000" />
          </label>
          <label>
            访问令牌{tokenSet && <span className="dash-live">（已配置）</span>}
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} aria-label="访问令牌" placeholder="留空则保持现有令牌" />
          </label>
          <div className="auth-overlay__actions">
            <button type="button" className="setup-btn" disabled={status === 'saving'} onClick={save}>{status === 'saving' ? '正在保存…' : '保存配置'}</button>
            {status === 'saved' && <span className="dash-live">已保存</span>}
          </div>
        </>
      )}
    </details>
  );
}
```

`src/ui/SchedulerSection.tsx`：

```tsx
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { loadConnectionSettings } from '../api/connection';
import { getProject, getSchedulerNextFire, listProjects, listSchedulerEvents, projectRefById } from '../api/projects';
import { schedulerLevelTone } from '../domain/resourceView';
import './console.css';

export function SchedulerSection() {
  const navigate = useNavigate();
  const s = loadConnectionSettings();
  const overview = useQuery({
    queryKey: ['scheduler-overview'],
    queryFn: async () => {
      const summaries = await listProjects(s);
      const projects = (await Promise.all(summaries.map((p) => getProject(s, projectRefById(p.projectId), true).catch(() => undefined)))).filter((p): p is NonNullable<typeof p> => Boolean(p));
      const rows: { projectId: string; agentName: string; displayName: string; enabled: boolean; nextFireAt: Date | null }[] = [];
      for (const proj of projects) {
        const pid = proj.summary?.projectId ?? '';
        for (const ag of proj.agents ?? []) {
          const enabled = Boolean(ag.scheduler?.enabled);
          let fire: Date | null = null;
          if (enabled) { try { fire = await getSchedulerNextFire(s, projectRefById(pid), ag.name); } catch { fire = null; } }
          rows.push({ projectId: pid, agentName: ag.name, displayName: ag.displayName || ag.name, enabled, nextFireAt: fire });
        }
      }
      return rows;
    },
  });
  const events = useQuery({ queryKey: ['scheduler-events'], queryFn: () => listSchedulerEvents(s, { limit: 50 }) });

  const fmt = (d: Date | null) => (d ? `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '—');

  return (
    <div className="set-section">
      <div className="run-section__head"><h3>调度总览</h3></div>
      <p className="run-section__empty">每个 AI 助手的「什么时候干活」汇总。点击可去编辑。</p>
      <table className="runs-table">
        <thead><tr><th>助手</th><th>状态</th><th>下次触发</th></tr></thead>
        <tbody>
          {(overview.data ?? []).map((r) => (
            <tr key={`${r.projectId}:${r.agentName}`} onClick={() => navigate(`/console/agents/${r.agentName}/edit`)}>
              <td>{r.displayName}</td>
              <td>{r.enabled ? <span className="run-status run-status--running">已开启</span> : <span className="run-status run-status--stopped">已暂停</span>}</td>
              <td>{fmt(r.nextFireAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="run-section__head" style={{ marginTop: 24 }}><h3>调度事件历史</h3></div>
      {(events.data ?? []).length === 0 ? (
        <p className="run-section__empty">暂无调度事件。</p>
      ) : (
        <div className="run-events">
          {(events.data ?? []).map((ev) => (
            <div key={ev.id} className="run-event">
              <span className={`set-sch-level set-sch-level--${schedulerLevelTone(ev.level)}`}>{ev.level}</span>
              <span className="run-event__text">{ev.message}{ev.runId ? `（运行 ${ev.runId}）` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```
> `ag.scheduler?.enabled` — AgentSpec 的 scheduler 字段形状以 gen 为准（已核对有 scheduler；tsc 校验字段名）。

`src/ui/console.css` 追加：

```css
.set-sch-level { flex: 0 0 auto; font-size: 12px; border-radius: 999px; padding: 1px 8px; }
.set-sch-level--info { background: #f3f4f6; color: #6b7280; }
.set-sch-level--warn { background: #fef3c7; color: #92400e; }
.set-sch-level--error { background: #fee2e2; color: #b91c1c; }
```

- [ ] **Step 4: 跑测试确认绿**

Run: `npx vitest run src/ui/GatewaySection.test.tsx src/ui/SchedulerSection.test.tsx`
Expected: PASS。全量 `--testTimeout=30000` 无回归。

- [ ] **Step 5: 提交**

```bash
git add src/ui/GatewaySection.tsx src/ui/GatewaySection.test.tsx src/ui/SchedulerSection.tsx src/ui/SchedulerSection.test.tsx src/ui/console.css
git commit -m "feat: 设置页 Capability Gateway + 调度总览/事件历史"
```

---

### Task 8: 路由接线 + 导航验证

**Files:**
- Modify: `src/App.tsx`（`/console/resources`、`/console/settings` 占位 → `ResourcesScreen`/`SettingsScreen`）
- Modify: `src/App.test.tsx`（mock 2 新 screen + 2 新路由用例；settings 占位断言改 stub）
- Modify: `src/ui/console.css`（无需新增，若 SettingsScreen/ResourcesScreen 引用了未定义类则此处补）

**Interfaces:**
- Consumes: `ResourcesScreen`（T3）、`SettingsScreen`（T6）。`PagePlaceholder` 在 resources/settings 换掉后若无其他路由使用，从 App.tsx 移除 import（见 Step 3 注）。

- [ ] **Step 1: 写失败测试** `src/App.test.tsx`：

```tsx
// 顶部新增：
vi.mock('./ui/ResourcesScreen', () => ({ ResourcesScreen: () => <div>ResourcesScreen stub</div> }));
vi.mock('./ui/SettingsScreen', () => ({ SettingsScreen: () => <div>SettingsScreen stub</div> }));

// 既有「在线时 /console/settings 渲染占位页」用例整体替换为以下两条（settings 改为断言 stub，resources 为新增）：
it('在线时 /console/resources 渲染资源中心', async () => {
  window.history.replaceState({}, '', '/console/resources');
  probeMock.mockResolvedValue('ok');
  render(<App />);
  await waitFor(() => expect(screen.getByText('ResourcesScreen stub')).toBeInTheDocument());
});
it('在线时 /console/settings 渲染设置', async () => {
  window.history.replaceState({}, '', '/console/settings');
  probeMock.mockResolvedValue('ok');
  render(<App />);
  await waitFor(() => expect(screen.getByText('SettingsScreen stub')).toBeInTheDocument());
});
```
> 注意：既有「在线时 /console/settings 渲染占位页」用例断言的是 `设置（下个阶段）` 占位文本，T8 实现后必失败——必须整体替换（删除该用例，让上方的 settings 新用例承担断言），不能保留。「在线时 /console/agents 渲染 Agent 列表路由」等其余用例原样保留。

- [ ] **Step 2: 跑测试确认红**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL（settings 用例仍渲染占位；resources/settings 新用例找不到 stub）。

- [ ] **Step 3: 实现** `src/App.tsx`：

```tsx
import { ResourcesScreen } from './ui/ResourcesScreen';
import { SettingsScreen } from './ui/SettingsScreen';
// ...
  <Route path="resources" element={<ResourcesScreen />} />
  <Route path="settings" element={<SettingsScreen />} />
```
> `PagePlaceholder` 若不再被任何路由使用（resources/settings 是仅剩的占位），删除 `import { PagePlaceholder }`。检查 `src/App.tsx`：`/` 重定向、agents/agents/new/agents/:agentName/edit/runs/runs/:runId/resources/settings + `*`。占位仅 resources/settings 两处 — 换掉后 `PagePlaceholder` import 删除。App.test 的「在线时 /console/settings 渲染占位页」断言文本「设置（下个阶段）」一并删除。

- [ ] **Step 4: 跑测试确认绿**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS。全量 `npx vitest run --testTimeout=30000`、`npm run build`、`npm run lint` 全绿零警告。

- [ ] **Step 5: 提交**

```bash
git add src/App.tsx src/App.test.tsx src/ui/console.css
git commit -m "feat: 路由接线（资源中心/设置替换占位）+ 导航验证"
```

---

## Self-Review

**1. Spec 覆盖：**
- §1.1 工作区预设 CRUD → T1（settings.ts wrapper）+ T3（PresetsTab）。✅
- §1.2 数据卷 CRUD + Prune → T1 + T3（VolumesTab，含二次确认）。✅
- §1.3 插件库（技能包 + 在用汇总）→ T1（capability wrapper）+ T4。✅
- §1.4 沙箱/镜像/缓存 → T1 + T5（停止/恢复/移除/清理二次确认）。✅
- §2.1 Provider 密钥复用 → T6（onNext 可选化）。✅
- §2.2 全局环境变量 → T1（settings.ts 已有）+ T6（GlobalEnvSection）。✅
- §2.3 Capability Gateway → T1 + T7（GatewaySection）。✅
- §2.4 调度总览 + 事件历史 → T1（listSchedulerEvents）+ T7（SchedulerSection）。✅
- §3 API 层、§4 Domain 层 → T1/T2。✅
- 危险操作二次确认（Spec §1 约束）→ T3/T5 每处删除/Prune/移除/停止弹层。✅
- 文案全中文 + TERMS 增补 → T2。✅

**2. Placeholder scan：** 无 TBD/TODO。所有测试均为完整可执行代码（ResourcesScreen/PresetsTab/VolumesTab/PluginLibraryTab/SandboxesTab/GlobalEnv/SettingsScreen/Gateway/Scheduler/ProviderKeys/App 全部给了完整断言）。`getCapabilityCatalog`/`getCapabilityStatus` 返回整个响应 Message 已确定（无 `res.catalog` 之类猜测字段）。组件测试的 mock 形状均为 wrapper 返回形状（非 RPC 原始形状）。

**3. Type consistency：**
- `listVolumes`→T3 用；`getWorkspacePresets`→T3 用；`listCapabilitySets`/`getCapabilityCatalog`/`getCapabilityStatus`/`listProjects`/`getProject`/`projectRefById`→T4 用；`listSandboxes`/`stopSandbox`/`resumeSandbox`/`removeSandbox`/`pruneSandboxes`/`listImages`/`removeImage`/`listCaches`/`removeCache`/`pruneCaches`→T5 用；`getGlobalEnv`/`updateGlobalEnv`→T6 用；`getCapabilityGatewayConfig`/`updateCapabilityGatewayConfig`/`listSchedulerEvents`→T7 用。签名在 T1 Produces 与各消费任务一一对应。✅
- `describeSandboxStatus`/`describeCacheDomain`/`schedulerLevelTone`/`describePresetType`/`DANGEROUS_ACTIONS`→T2 Produces，T3/T5/T7 消费。✅
- `ResourcesScreen`/`SettingsScreen`→T8 消费。✅
- Query keys 统一：`['workspace-presets']`、`['volumes']`、`['capability-sets']`、`['capability-status']`、`['capability-usage']`、`['capability-catalog']`、`['sandboxes']`、`['images']`、`['caches']`、`['scheduler-overview']`、`['scheduler-events']`。✅
- 组件命名：T3 的 `ResourcesScreen`/`PresetsTab`/`VolumesTab`、T4 `PluginLibraryTab`、T5 `SandboxesTab`、T6 `SettingsScreen`/`GlobalEnvSection`、T7 `GatewaySection`/`SchedulerSection`，T8 引用一致。✅

**4. 依赖顺序：** T1（API）→ T2（domain）→ T3/T4/T5（资源中心，可并行但按序推进）→ T6/T7（设置页）→ T8（路由）。每任务 BASE = 前一 commit。
