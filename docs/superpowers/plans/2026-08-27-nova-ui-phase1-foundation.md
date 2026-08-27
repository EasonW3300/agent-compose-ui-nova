# Agent Compose Nova UI · Phase 1 内核实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建 agent-compose 新前端的工程内核：脚手架、类型安全的 daemon API 层、双世界路由骨架，以及创建向导将复用的全部纯逻辑模块。

**Architecture:** 纯静态 React SPA 直连本机 daemon 的 ConnectRPC API。同源 `/api` 代理解决 CORS；健康探测结果驱动"装机向导 / 主控台"两个世界切换；所有业务概念先以纯函数模块实现并被充分单测。

**Tech Stack:** React 19 + Vite + TypeScript；@connectrpc/connect-web 2.x + @bufbuild/protoc-gen-es 2.x（buf 生成）；Vitest 4 + Testing Library；react-router-dom 7；js-yaml 5。

## Global Constraints

以下约束取自 spec `docs/superpowers/specs/2026-08-27-agent-compose-nova-ui-design.md`，每个任务隐式包含本节：

- 技术栈固定 **React + Vite + TypeScript**。
- Provider 只做四个：`claude`（Claude Code）、`codex`（Codex）、`pi`（Pi）、`dsh`（DSH）。gemini/opencode 不出现在界面。
- 全部界面文案为**简体中文**，术语使用 spec §7 转译表：agent→AI 助手、provider→AI 引擎、volume→数据文件夹、MCP→插件、skill→技能包等。
- daemon 默认地址 `http://127.0.0.1:7410`；前端默认走**同源代理路径 `/api`**（daemon 无 CORS 中间件，已核实），用户可改绝对地址。
- 认证方式已核实：HTTP 头 `Authorization: Bearer <AGENT_COMPOSE_AUTH_TOKEN>`；Health 服务免鉴权，用作探测端点。
- proto 从上游仓库同步并**锚定 commit `b44e2be`**（记录于 `proto/UPSTREAM.md`）；buf 生成物提交入 git。
- 运行环境：Node ≥ 20，npm 包管理器。
- 锚定版本（写作时 npm latest）：`react@19.2.8` `react-dom@19.2.8` `react-router-dom@7.18.2` `@tanstack/react-query@5.102.6` `@connectrpc/connect-web@2.1.2` `@bufbuild/protobuf@2.14.0` `@bufbuild/protoc-gen-es@2.14.0` `@bufbuild/buf@1.72.0` `js-yaml@5.4.1` `vitest@4.1.11` `@testing-library/react@16.3.2`。
- 依赖 dist 联网：npm 需走本地代理 `export https_proxy=http://127.0.0.1:7897 http_proxy=http://127.0.0.1:7897`（执行机上 GitHub/npm 直连不稳）。
- 提交信息用约定式前缀：`feat:` / `test:` / `chore:` / `docs:`。

---

## File Structure（Phase 1 终态）

```
agent-compose-ui-nova/
├── index.html                      # Vite 入口（标题改中文）
├── vite.config.ts                  # React 插件 + Vitest 配置 + /api 代理
├── buf.yaml / buf.gen.yaml         # protobuf 生成配置
├── proto/
│   ├── UPSTREAM.md                 # 上游来源记录（commit b44e2be）
│   ├── agentcompose/v2/agentcompose.proto   # 主 API
│   └── health/v1/health.proto      # 健康 API（探测用）
├── src/
│   ├── main.tsx                    # React 挂载点
│   ├── App.tsx                     # 双世界路由决策
│   ├── App.test.tsx                # 世界切换冒烟测试
│   ├── api/
│   │   ├── gen/                    # buf 生成物（入 git）
│   │   └── connection.ts           # 连接设置、transport、健康探测
│   │   └── connection.test.ts
│   ├── domain/
│   │   ├── labels.ts               # 术语转译表、provider 元数据
│   │   ├── labels.test.ts
│   │   ├── schedule.ts             # ScheduleInput ↔ cron/interval/人话
│   │   ├── schedule.test.ts
│   │   ├── agentDraft.ts           # AgentDraft 类型 + 触发器片段构建
│   │   ├── agentDraft.test.ts
│   │   ├── composeYaml.ts          # AgentDraft → agent-compose.yml 文本
│   │   └── composeYaml.test.ts
│   ├── hooks/
│   │   ├── useDaemonProbe.ts       # 轮询探测 hook
│   │   └── useDaemonProbe.test.tsx
│   ├── ui/
│   │   ├── SetupShell.tsx          # 装机向导世界外壳（占位）
│   │   ├── SetupShell.test.tsx
│   │   ├── ConsoleLayout.tsx       # 主控台外壳 + 侧边导航（占位）
│   │   └── ConsoleLayout.test.tsx
```

---

### Task 1: 工程脚手架与测试工具链

**Files:**
- Create: `package.json`（由 Vite 生成）、`vite.config.ts`、`.gitignore`、`index.html`
- Modify: `src/main.tsx`、`src/App.tsx`
- Test: `src/App.test.tsx`

**Interfaces:**
- Produces: 可运行的 Vite 工程，`npm test` 执行 Vitest（jsdom 环境）；后续任务在 `src/` 下新增模块即用。

- [ ] **Step 1: 用 Vite 模板创建工程**

```bash
cd /Users/wys3300/Desktop/work_pro/agent-compose-ui-nova
export https_proxy=http://127.0.0.1:7897 http_proxy=http://127.0.0.1:7897
npm create vite@latest . -- --template react-ts
npm install
```

注意：目录里已有 `docs/` 与 `.git/`，若交互提示非空目录，选择忽略覆盖/继续（仅接受 Vite 生成的文件，冲突的 `index.html` 选跳过则手工核对无重复标题即可）。

- [ ] **Step 2: 安装测试工具链**

```bash
npm install -D vitest@4.1.11 jsdom @testing-library/react@16.3.2 \
  @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 3: 写失败的世界冒烟测试**

创建 `src/App.test.tsx`（删除模板自带的其他测试文件如 `src/__tests__`）：

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App 冒烟', () => {
  it('渲染应用标题', () => {
    render(<App />);
    expect(screen.getByText('Agent Compose 驾驶台')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: 配置 Vitest 并确认测试失败**

替换 `vite.config.ts` 为：

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
  },
});
```

创建 `src/test-setup.ts`：

```ts
import '@testing-library/jest-dom/vitest';
```

`package.json` 的 `scripts` 增加：

```json
{ "test": "vitest run", "test:watch": "vitest" }
```

同时修改 `tsconfig.app.json` 增加 `"types": ["vitest/globals", "@testing-library/jest-dom"]`。

Run: `npm test`
Expected: FAIL —— `App` 渲染的是 Vite 模板内容，找不到 "Agent Compose 驾驶台"。

- [ ] **Step 5: 实现 App 中文占位**

替换 `src/App.tsx` 全部内容（删除模板的 css import 一并删除 `src/App.css`、`src/index.css` 引用，保留 `main.tsx` 中对样式文件的引用改为空或最小化）：

```tsx
export default function App() {
  return (
    <div className="app-root">
      <h1>Agent Compose 驾驶台</h1>
      <p>你的 AI 助手，装进一个界面。</p>
    </div>
  );
}
```

`index.html` 的 `<title>` 改为 `Agent Compose 驾驶台`。新建 `src/index.css` 仅含：

```css
body { margin: 0; font-family: system-ui, sans-serif; }
```

Run: `npm test`
Expected: PASS（1 个测试通过）

- [ ] **Step 6: Commit**

```bash
printf 'node_modules\ndist\n*.local\n.DS_Store\n' > .gitignore
git add -A
git commit -m "chore: scaffold vite react-ts app with vitest toolchain"
```

---

### Task 2: 上游 proto 同步与 buf 生成 Connect 客户端

**Files:**
- Create: `proto/UPSTREAM.md`、`proto/agentcompose/v2/agentcompose.proto`、`proto/health/v1/health.proto`、`buf.yaml`、`buf.gen.yaml`
- Create（生成物入 git）: `src/api/gen/**`
- Test: `src/api/gen.smoke.test.ts`

**Interfaces:**
- Consumes: 本机 `/tmp/agent-compose`（上游浅克隆，commit `b44e2be`）。
- Produces: `src/api/gen/health/v1/health_pb.ts` 导出 `HealthService`、`HealthStatusResponse` 等；`src/api/gen/agentcompose/v2/agentcompose_pb.ts` 导出 `ProjectService` 等全部服务符号。后续任务从这两个模块导入。

- [ ] **Step 1: 复制上游 proto 并记录来源**

```bash
cd /Users/wys3300/Desktop/work_pro/agent-compose-ui-nova
mkdir -p proto/agentcompose/v2 proto/health/v1
cp /tmp/agent-compose/proto/agentcompose/v2/agentcompose.proto proto/agentcompose/v2/
cp /tmp/agent-compose/proto/health/v1/health.proto proto/health/v1/
cd /tmp/agent-compose && git rev-parse HEAD
```

将输出的完整 commit hash 写入 `proto/UPSTREAM.md`：

```markdown
# 上游 proto 来源

- 仓库: https://github.com/EasonW3300/agent-compose.git
- 锚定 commit: b44e2be（浅克隆 HEAD）
- 复制命令:
  cp /tmp/agent-compose/proto/agentcompose/v2/agentcompose.proto proto/agentcompose/v2/
  cp /tmp/agent-compose/proto/health/v1/health.proto proto/health/v1/
- 更新流程: 在上游新 commit 上重新复制 → npx buf generate → 修复 TS 编译错误 → 更新本文件 hash。
```

- [ ] **Step 2: 安装 protobuf 工具链**

```bash
export https_proxy=http://127.0.0.1:7897 http_proxy=http://127.0.0.1:7897
npm install @connectrpc/connect-web@2.1.2 @bufbuild/protobuf@2.14.0
npm install -D @bufbuild/protoc-gen-es@2.14.0 @bufbuild/buf@1.72.0
```

- [ ] **Step 3: 写失败的生成物冒烟测试**

创建 `src/api/gen.smoke.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import * as healthPb from './gen/health/v1/health_pb';
import * as acPb from './gen/agentcompose/v2/agentcompose_pb';

describe('buf 生成物', () => {
  it('导出 HealthService 且注册了 status 方法', () => {
    expect((healthPb as Record<string, unknown>).HealthService).toBeDefined();
    const svc = healthPb.HealthService as unknown as {
      methods?: Record<string, unknown>;
      service?: Record<string, unknown>;
    };
    // 兼容 v2 生成物两种导出形态：methods 记录或 method 列表
    expect(JSON.stringify(svc.methods ?? svc.service ?? svc)).toMatch(/status/i);
  });
  it('导出 ProjectService 与 RunService', () => {
    const mod = acPb as Record<string, unknown>;
    expect(mod.ProjectService).toBeDefined();
    expect(mod.RunService).toBeDefined();
  });
});
```

- [ ] **Step 4: 确认失败**

Run: `npm test`
Expected: FAIL —— 找不到 `./gen/health/v1/health_pb` 模块。

- [ ] **Step 5: 配置并执行 buf 生成**

创建 `buf.yaml`：

```yaml
version: v2
modules:
  - path: proto
lint:
  use: [STANDARD]
breaking:
  use: [FILE]
```

创建 `buf.gen.yaml`（用本地 protoc-gen-es 产出 TS，Connect 服务随 v2 统一生成）：

```yaml
version: v2
plugins:
  - local:
      - node
      - ./node_modules/@bufbuild/protoc-gen-es/bin/protoc-gen-es
    out: src/api/gen
    opt: target=ts
inputs:
  - directory: proto
```

Run: `npx buf generate`
Expected: 无输出（成功），`src/api/gen/health/v1/health_pb.ts` 与 `src/api/gen/agentcompose/v2/agentcompose_pb.ts` 出现。

- [ ] **Step 6: 测试通过**

Run: `npm test`
Expected: PASS（上一任务的冒烟 + 本任务 2 个测试全绿）

- [ ] **Step 7: Commit**

```bash
git add proto buf.yaml buf.gen.yaml src/api
git commit -m "feat: sync upstream proto (b44e2be) and generate connect-web client"
```

---

### Task 3: daemon 连接层与 Vite 同源代理

**Files:**
- Create: `src/api/connection.ts`
- Test: `src/api/connection.test.ts`
- Modify: `vite.config.ts`（加 dev/preview 代理）

**Interfaces:**
- Consumes: Task 2 生成的 `HealthService`（`src/api/gen/health/v1/health_pb`）。
- Produces:
  - `interface ConnectionSettings { baseUrl: string; authToken: string }`（空串 = 使用同源代理）
  - `loadConnectionSettings(): ConnectionSettings` / `saveConnectionSettings(s: ConnectionSettings): void`（localStorage 键 `acnova.connection`）
  - `resolveApiBase(s: ConnectionSettings): string`（空 baseUrl → `'/api'`；否则去尾斜杠的绝对地址）
  - `createDaemonTransport(s: ConnectionSettings): ConnectTransport`（自动附加 `Authorization: Bearer`）
  - `probeDaemon(s: ConnectionSettings): Promise<'ok' | 'down'>`

- [ ] **Step 1: 写失败的连接层测试**

创建 `src/api/connection.test.ts`：

```ts
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
    // createPromiseClient(service, transport) -> 我们只关心 HealthService.status
    createPromiseClient: vi.fn(() => ({ status: (...a: unknown[]) => statusMock(...a) })),
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
```

- [ ] **Step 2: 确认失败**

Run: `npm test`
Expected: FAIL —— `./connection` 不存在。

- [ ] **Step 3: 实现 connection.ts**

创建 `src/api/connection.ts`：

```ts
import { createPromiseClient, Interceptor } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { HealthService } from './gen/health/v1/health_pb';

export interface ConnectionSettings {
  /** 空 = 走同源 /api 代理；否则为形如 http://127.0.0.1:7410 的绝对地址 */
  baseUrl: string;
  authToken: string;
}

const STORAGE_KEY = 'acnova.connection';

export function loadConnectionSettings(): ConnectionSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error('empty');
    const parsed = JSON.parse(raw) as Partial<ConnectionSettings>;
    return { baseUrl: parsed.baseUrl ?? '', authToken: parsed.authToken ?? '' };
  } catch {
    return { baseUrl: '', authToken: '' };
  }
}

export function saveConnectionSettings(s: ConnectionSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function resolveApiBase(s: ConnectionSettings): string {
  if (!s.baseUrl.trim()) return '/api';
  return s.baseUrl.replace(/\/+$/, '');
}

function authInterceptor(token: string): Interceptor {
  return (next) => async (req) => {
    if (token) req.header.set('Authorization', `Bearer ${token}`);
    return next(req);
  };
}

export function createDaemonTransport(s: ConnectionSettings) {
  return createConnectTransport({
    baseUrl: resolveApiBase(s),
    interceptors: [authInterceptor(s.authToken)],
  });
}

/** 探测 daemon 是否在线（Health 服务免鉴权）。任何异常一律判定 down。 */
export async function probeDaemon(s: ConnectionSettings): Promise<'ok' | 'down'> {
  try {
    const client = createPromiseClient(HealthService, createDaemonTransport(s));
    await client.status({});
    return 'ok';
  } catch {
    return 'down';
  }
}
```

- [ ] **Step 4: 给 vite.config.ts 加同源代理**

在 Task 1 的配置基础上追加（`defineConfig` 内）：

```ts
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7410',
        changeOrigin: true,
        rewrite: (p: string) => p.replace(/^\/api/, ''),
      },
    },
  },
  preview: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7410',
        changeOrigin: true,
        rewrite: (p: string) => p.replace(/^\/api/, ''),
      },
    },
  },
```

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/api/health.v1.HealthService/Status`
Expected: 返回一个 HTTP 状态码（200 或 405 均可）——只要请求穿透代理到达了 daemon 端口（没有 daemon 在线时可能是 502/500，也证明代理转发已配置生效）。

- [ ] **Step 5: 测试通过**

Run: `npm test`
Expected: PASS（累计全部用例）

- [ ] **Step 6: Commit**

```bash
git add src/api/connection.ts src/api/connection.test.ts vite.config.ts
git commit -m "feat: daemon connection layer with bearer auth and health probing"
```

---

### Task 4: 术语转译与调度纯逻辑模块

**Files:**
- Create: `src/domain/labels.ts`、`src/domain/schedule.ts`
- Test: `src/domain/labels.test.ts`、`src/domain/schedule.test.ts`

**Interfaces:**
- Produces:
  - `type ProviderId = 'claude' | 'codex' | 'pi' | 'dsh'`
  - `const PROVIDERS: readonly ProviderMeta[]`（字段 `id, label, tagline, scenarios`）
  - `type RunStatus = 'running' | 'succeeded' | 'failed' | 'stopped' | 'unknown'`；`describeRunStatus(s: RunStatus): string`
  - `TERMS: Record<string, string>`（AC 术语→界面用语映射，来自 spec §7 表）
  - `type ScheduleInput`；`buildCronExpr(input): string`（daily/weekly）；`buildIntervalString(minutes): string`（Go duration 风格，如 90→`1h30m`）；`describeSchedule(input): string`（人话）

- [ ] **Step 1: 写失败的 labels 测试**

创建 `src/domain/labels.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { PROVIDERS, describeRunStatus, TERMS } from './labels';

describe('PROVIDERS', () => {
  it('只含四个引擎且有序', () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual(['claude', 'codex', 'pi', 'dsh']);
  });
  it('每个引擎有中文名与一句话定位', () => {
    for (const p of PROVIDERS) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.tagline.length).toBeGreaterThan(0);
      expect(p.scenarios.length).toBeGreaterThan(0);
    }
  });
  it('claude 的展示名是 Claude Code', () => {
    expect(PROVIDERS.find((p) => p.id === 'claude')!.label).toBe('Claude Code');
  });
});

describe('describeRunStatus', () => {
  it('翻译各状态为人话', () => {
    expect(describeRunStatus('running')).toBe('正在工作');
    expect(describeRunStatus('succeeded')).toBe('已完成');
    expect(describeRunStatus('failed')).toBe('出了点问题');
    expect(describeRunStatus('stopped')).toBe('已停止');
    expect(describeRunStatus('unknown')).toBe('未知');
  });
});

describe('TERMS', () => {
  it('覆盖核心转译词', () => {
    expect(TERMS.agent).toBe('AI 助手');
    expect(TERMS.provider).toBe('AI 引擎');
    expect(TERMS.volume).toBe('数据文件夹');
    expect(TERMS.mcp_server).toBe('插件');
    expect(TERMS.skill).toBe('技能包');
  });
});
```

- [ ] **Step 2: 写失败的 schedule 测试**

创建 `src/domain/schedule.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { buildCronExpr, buildIntervalString, describeSchedule } from './schedule';

describe('buildCronExpr', () => {
  it('每天 8 点 -> "0 8 * * *"', () => {
    expect(buildCronExpr({ kind: 'daily', hour: 8, minute: 0 })).toBe('0 8 * * *');
  });
  it('周一和周五 9 点半 -> "30 9 * * 1,5"', () => {
    expect(buildCronExpr({ kind: 'weekly', days: [5, 1], hour: 9, minute: 30 })).toBe(
      '30 9 * * 1,5',
    );
  });
});

describe('buildIntervalString', () => {
  it('90 分钟 -> 1h30m', () => {
    expect(buildIntervalString(90)).toBe('1h30m');
  });
  it('45 分钟 -> 45m', () => {
    expect(buildIntervalString(45)).toBe('45m');
  });
  it('24 小时整 -> 24h', () => {
    expect(buildIntervalString(1440)).toBe('24h');
  });
});

describe('describeSchedule', () => {
  it('手动触发的人话', () => {
    expect(describeSchedule({ kind: 'manual' })).toBe('我点了它才干活');
  });
  it('定时的人话（整点）', () => {
    expect(describeSchedule({ kind: 'daily', hour: 8, minute: 0 })).toBe('每天早上 8 点');
  });
  it('定时的人话（半点）', () => {
    expect(describeSchedule({ kind: 'daily', hour: 14, minute: 30 })).toBe('每天下午 2 点半');
  });
  it('间隔的人话', () => {
    expect(describeSchedule({ kind: 'interval', minutes: 90 })).toBe('每 1 小时 30 分钟一次');
  });
  it('周几的人话', () => {
    expect(describeSchedule({ kind: 'weekly', days: [1], hour: 9, minute: 30 })).toBe(
      '每周一 早上 9 点半',
    );
  });
});
```

- [ ] **Step 3: 确认失败**

Run: `npm test`
Expected: FAIL —— 两个模块不存在。

- [ ] **Step 4: 实现 labels.ts**

创建 `src/domain/labels.ts`：

```ts
export type ProviderId = 'claude' | 'codex' | 'pi' | 'dsh';

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  tagline: string;
  scenarios: string;
}

export const PROVIDERS: readonly ProviderMeta[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    tagline: 'Anthropic 家的全能选手，长于复杂编程与分析。',
    scenarios: '适合：写代码、改代码、深度分析报告',
  },
  {
    id: 'codex',
    label: 'Codex',
    tagline: 'OpenAI 家的编程助手，干活利落。',
    scenarios: '适合：日常脚本、自动化任务',
  },
  {
    id: 'pi',
    label: 'Pi',
    tagline: '轻量灵活的小助手，上手快。',
    scenarios: '适合：轻量查询、格式整理',
  },
  {
    id: 'dsh',
    label: 'DSH',
    tagline: 'agent-compose 自带引擎，与沙箱配合最紧密。',
    scenarios: '适合：沙箱内文件与终端操作',
  },
];

export type RunStatus = 'running' | 'succeeded' | 'failed' | 'stopped' | 'unknown';

const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  running: '正在工作',
  succeeded: '已完成',
  failed: '出了点问题',
  stopped: '已停止',
  unknown: '未知',
};

export function describeRunStatus(status: RunStatus): string {
  return RUN_STATUS_LABELS[status];
}

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
};
```

- [ ] **Step 5: 实现 schedule.ts**

创建 `src/domain/schedule.ts`（对应上游 `pkg/compose/spec.go` 的 `SchedulerSpec.Triggers []TriggerSpec`：

```go
TriggerSpec { Name, Cron, Timezone, Interval, Timeout, Event, Prompt string... }
```

interval 采用 Go duration 字符串，已在文档核实如 `30m`）：

```ts
export type ScheduleInput =
  | { kind: 'manual' }
  | { kind: 'daily'; hour: number; minute: number }
  | { kind: 'weekly'; days: number[]; hour: number; minute: number } // 0=周日
  | { kind: 'interval'; minutes: number };

const WEEK_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** daily/weekly 转标准 5 位 cron 表达式；manual/interval 不是 cron。 */
export function buildCronExpr(
  input: Extract<ScheduleInput, { kind: 'daily' | 'weekly' }>,
): string {
  if (input.kind === 'daily') {
    return `${input.minute} ${input.hour} * * *`;
  }
  const days = [...new Set(input.days)].sort((a, b) => a - b).join(',');
  return `${input.minute} ${input.hour} * * ${days}`;
}

/** 分钟数 → Go duration 风格字符串（与上游 interval 字段一致），如 90 → "1h30m"。 */
export function buildIntervalString(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join('');
}

function formatMinutes(minute: number): string {
  if (minute === 0) return '点';
  if (minute === 30) return '点半';
  return `点 ${String(minute).padStart(2, '0')} 分`;
}

function formatTimeOfDay(hour: number): string {
  if (hour < 11) return '早上';
  if (hour < 13) return '中午';
  if (hour < 18) return '下午';
  return '晚上';
}

export function describeSchedule(input: ScheduleInput): string {
  switch (input.kind) {
    case 'manual':
      return '我点了它才干活';
    case 'daily':
      return `每天${formatTimeOfDay(input.hour)} ${input.hour % 12 === 0 ? 12 : input.hour % 12}${formatMinutes(input.minute)}`;
    case 'weekly': {
      const dayLabel = input.days.map((d) => WEEK_LABELS[d] ?? '').join('、');
      return `每${dayLabel} ${formatTimeOfDay(input.hour)} ${input.hour % 12 === 0 ? 12 : input.hour % 12}${formatMinutes(input.minute)}`;
    }
    case 'interval': {
      const h = Math.floor(input.minutes / 60);
      const m = input.minutes % 60;
      const span = h > 0 ? (m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`) : `${m} 分钟`;
      return `每 ${span}一次`;
    }
  }
}
```

说明：24 小时制小时在展示时折算为 12 小时制（`8 → 早上 8 点`、`14 → 下午 2 点半`），与测试断言一致。

- [ ] **Step 6: 测试通过**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/domain
git commit -m "feat: term translation and schedule pure-logic modules"
```

---

### Task 5: 双世界路由骨架（探测驱动）

**Files:**
- Create: `src/hooks/useDaemonProbe.ts`、`src/ui/SetupShell.tsx`、`src/ui/ConsoleLayout.tsx`
- Modify: `src/App.tsx`
- Test: `src/hooks/useDaemonProbe.test.tsx`、`src/ui/SetupShell.test.tsx`、`src/ui/ConsoleLayout.test.tsx`

**Interfaces:**
- Consumes: Task 3 `probeDaemon(settings)`、`loadConnectionSettings()`。
- Produces:
  - `type ProbeState = 'probing' | 'online' | 'offline'`；`useDaemonProbe(): { state: ProbeState }`（加载设置 → 首测 → 每 3000ms 轮询重探，仅在 offline 时继续轮询；online 后停止轮询并保持 online——重新变为 offline 由全局兜底页处理）
  - `<SetupShell />`：装机向导外壳（Phase 2 填充步骤，本期渲染 5 个步骤占位条目）
  - `<ConsoleLayout />`：主控台外壳（侧边导航 5 项 + Outlet 占位面板）

- [ ] **Step 1: 安装路由**

```bash
npm install react-router-dom@7.18.2
```

- [ ] **Step 2: 写失败的 probe hook 测试**

创建 `src/hooks/useDaemonProbe.test.tsx`：

```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDaemonProbe } from './useDaemonProbe';

const probeMock = vi.fn();
vi.mock('../api/connection', async (orig) => {
  const actual = await orig<typeof import('../api/connection')>();
  return {
    ...actual,
    loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }),
    probeDaemon: (...args: unknown[]) => probeMock(...args),
  };
});

afterEach(() => vi.restoreAllMocks());

describe('useDaemonProbe', () => {
  it('首次探测成功转为 online 并停止轮询', async () => {
    probeMock.mockResolvedValue('ok');
    const { result } = renderHook(() => useDaemonProbe());
    await waitFor(() => expect(result.current.state).toBe('online'));
    expect(probeMock).toHaveBeenCalledTimes(1);
  });
  it('探测失败保持 offline', async () => {
    probeMock.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useDaemonProbe());
    await waitFor(() => expect(result.current.state).toBe('offline'));
    expect(result.current.state).toBe('offline');
  });
});
```

- [ ] **Step 3: 确认失败**

Run: `npm test`
Expected: FAIL —— `./useDaemonProbe` 不存在。

- [ ] **Step 4: 实现 hook**

创建 `src/hooks/useDaemonProbe.ts`：

```ts
import { useEffect, useState } from 'react';
import { loadConnectionSettings, probeDaemon } from '../api/connection';

export type ProbeState = 'probing' | 'online' | 'offline';

/**
 * 加载连接设置并轮询健康探测：
 * probing 起步；ok → online（停止轮询）；down → offline（此后每 3 秒重试，
 * 以便用户在装机向导里跑完安装脚本后页面能自动感知）。
 */
export function useDaemonProbe(): { state: ProbeState } {
  const [state, setState] = useState<ProbeState>('probing');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const tick = async () => {
      try {
        const result = await probeDaemon(loadConnectionSettings());
        if (cancelled) return;
        if (result === 'ok') {
          setState('online');
        } else {
          setState('offline');
          timer = setTimeout(tick, 3000);
        }
      } catch {
        if (cancelled) return;
        setState('offline');
        timer = setTimeout(tick, 3000);
      }
    };
    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { state };
}
```

- [ ] **Step 5: 写失败的两个外壳组件测试**

创建 `src/ui/SetupShell.test.tsx`：

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SetupShell } from './SetupShell';

describe('SetupShell', () => {
  it('展示 5 个装机步骤名', () => {
    render(<SetupShell />);
    for (const step of ['欢迎与图解', '环境自检与安装引导', '首次登录', '密钥配置', '完成']) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
  });
});
```

创建 `src/ui/ConsoleLayout.test.tsx`：

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ConsoleLayout } from './ConsoleLayout';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/console/:page?" element={<ConsoleLayout />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ConsoleLayout', () => {
  it('侧边导航包含五个一级页面（人话命名）', () => {
    renderAt('/console');
    for (const item of ['首页', '我的 AI 助手', '运行记录', '资源中心', '设置']) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
  });
  it('导航链接指向对应路径', () => {
    renderAt('/console');
    expect(screen.getByText('我的 AI 助手').closest('a')).toHaveAttribute(
      'href',
      '/console/agents',
    );
  });
});
```

- [ ] **Step 6: 确认失败**

Run: `npm test`
Expected: FAIL —— 两组件不存在。

- [ ] **Step 7: 实现两个外壳**

创建 `src/ui/SetupShell.tsx`：

```tsx
const STEPS = ['欢迎与图解', '环境自检与安装引导', '首次登录', '密钥配置', '完成'];

export function SetupShell() {
  return (
    <main className="setup-shell">
      <h1>把 AI 助手装进这台电脑</h1>
      <ol className="steps">
        {STEPS.map((step, i) => (
          <li key={step}>
            <span>第 {i + 1} 步</span> · <span>{step}</span>
          </li>
        ))}
      </ol>
      <p className="hint">分步安装向导将在下一个阶段上线。</p>
    </main>
  );
}
```

说明：步骤名包一层 `<span>` 是为了 `getByText('欢迎与图解')` 能精确命中该文本节点（`li` 的完整 textContent 是「第 1 步 · 欢迎与图解」，无法整体匹配）。

创建 `src/ui/ConsoleLayout.tsx`：

```tsx
import { Link, Outlet, useLocation } from 'react-router-dom';

export const NAV_ITEMS = [
  { to: '/console', label: '首页', exact: true },
  { to: '/console/agents', label: '我的 AI 助手', exact: false },
  { to: '/console/runs', label: '运行记录', exact: false },
  { to: '/console/resources', label: '资源中心', exact: false },
  { to: '/console/settings', label: '设置', exact: false },
] as const;

export function ConsoleLayout() {
  const location = useLocation();
  return (
    <div className="console-layout">
      <nav aria-label="主导航">
        <ul>
          {NAV_ITEMS.map((item) => {
            const active = item.exact
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            return (
              <li key={item.to}>
                <Link to={item.to} aria-current={active ? 'page' : undefined}>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}
```

`exact: true` 仅用于「首页」，避免 `/console/agents` 等子路径时首页也一直高亮；测试中的 URL 断言使用 Link 的 href。

- [ ] **Step 8: 改造 App.tsx 为双世界决策**

```tsx
import { BrowserRouter } from 'react-router-dom';
import { useDaemonProbe } from './hooks/useDaemonProbe';
import { SetupShell } from './ui/SetupShell';
import { ConsoleLayout } from './ui/ConsoleLayout';

export default function App() {
  const { state } = useDaemonProbe();

  if (state === 'probing') {
    return <div role="status">正在寻找你电脑上的 agent-compose…</div>;
  }

  return (
    <BrowserRouter>
      {state === 'offline' ? <SetupShell /> : <ConsoleLayout />}
    </BrowserRouter>
  );
}
```

说明：本期 ConsoleLayout 直接渲染（无嵌套路由），Phase 3/4 再把 `<Route element={<ConsoleLayout />}>` 的具体页面接进来。

Run: `npm test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx src/hooks src/ui
git commit -m "feat: dual-world shell driven by daemon health probing"
```

---

### Task 6: AgentDraft 类型与触发器片段构建

**Files:**
- Create: `src/domain/agentDraft.ts`
- Test: `src/domain/agentDraft.test.ts`

**Interfaces:**
- Consumes: Task 4 的 `ProviderId`、`ScheduleInput`、`buildCronExpr`、`buildIntervalString`。
- Produces:
  - 类型 `AgentDraft`（下述字段供 Phase 3 向导直接读写）
  - `slugify(name: string): string`（项目/agent 键名合法化，输出 `[a-z0-9-]`）
  - `buildTriggers(draft['schedule']): Array<{ name: string } & Record<string, string>> | null`（manual → null；daily/weekly → 单元素 `[{ name, cron }]`；interval → `[{ name, interval }]`；带 timeoutMinutes 时附 `timeout`）
  - `interface AgentDraft` 定义见 Step 4 实现。

- [ ] **Step 1: 写失败的测试**

创建 `src/domain/agentDraft.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { slugify, buildTriggers, type AgentDraft } from './agentDraft';

const baseDraft: AgentDraft = {
  name: '日报助手',
  displayName: '日报助手',
  provider: 'claude',
  prompt: '帮我整理今天的新闻要点',
  schedule: { kind: 'manual' },
  workspace: { kind: 'none' },
  volumes: [],
  mcpServers: [],
  skills: [],
  env: [],
};

describe('slugify', () => {
  it('中文与小写转换', () => {
    expect(slugify('My Report')).toBe('my-report');
  });
  it('非法字符折叠为连字符，前后分隔符被修剪', () => {
    expect(slugify('  Daily 报告!!  ')).toBe('daily');
  });
  it('全非法输入退化为 "assistant"', () => {
    expect(slugify('###')).toBe('assistant');
  });
});

describe('buildTriggers', () => {
  it('manual -> null', () => {
    expect(buildTriggers({ kind: 'manual' })).toBeNull();
  });
  it('daily -> 单条 cron 触发器', () => {
    expect(buildTriggers({ kind: 'daily', hour: 8, minute: 0 })).toEqual([
      { name: 'trigger', cron: '0 8 * * *' },
    ]);
  });
  it('interval -> interval 字符串（90 分钟 -> 1h30m）', () => {
    expect(buildTriggers({ kind: 'interval', minutes: 90 })).toEqual([
      { name: 'trigger', interval: '1h30m' },
    ]);
  });
  it('timeoutMinutes 附着到触发器', () => {
    expect(buildTriggers({ kind: 'daily', hour: 9, minute: 0 }, 15)[0]).toMatchObject({
      cron: '0 9 * * *',
      timeout: '15m',
    });
  });
});
```

- [ ] **Step 2: 确认失败**

Run: `npm test`
Expected: FAIL —— `./agentDraft` 不存在。

- [ ] **Step 3: 实现 agentDraft.ts**

创建 `src/domain/agentDraft.ts`：

```ts
import type { ProviderId } from './labels';
import type { ScheduleInput } from './schedule';
import { buildCronExpr, buildIntervalString } from './schedule';

export interface EnvPair {
  key: string;
  value: string;
}

export type WorkspaceDraft =
  | { kind: 'none' }
  | { kind: 'local'; path: string }
  | { kind: 'git'; url: string; branch?: string };

export interface VolumeMountDraft {
  source: string;
  target: string;
  readOnly: boolean;
}

export interface McpServerDraft {
  name: string;
  type: 'local' | 'remote';
  command?: string;
  args?: string[];
  url?: string;
}

export interface SkillDraft {
  name: string;
  url?: string;
  ref?: string;
}

export interface AgentDraft {
  name: string;
  displayName: string;
  description?: string;
  provider: ProviderId;
  model?: string;
  /** 任务说明（写入 trigger.prompt 与 system_prompt 缺省提示语义由向导决定） */
  prompt: string;
  systemPrompt?: string;
  env: EnvPair[];
  schedule: ScheduleInput;
  timeoutMinutes?: number;
  workspace: WorkspaceDraft;
  volumes: VolumeMountDraft[];
  mcpServers: McpServerDraft[];
  skills: SkillDraft[];
  jupyterEnabled: boolean;
}

/** 项目/agent 键名需匹配上游 stable identifier 格式：小写字母数字与连字符。 */
export function slugify(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned : 'assistant';
}

export interface TriggerYamlEntry {
  name: string;
  cron?: string;
  interval?: string;
  timeout?: string;
}

export function buildTriggers(
  schedule: ScheduleInput,
  timeoutMinutes?: number,
): TriggerYamlEntry[] | null {
  const timeout = timeoutMinutes ? { timeout: `${timeoutMinutes}m` } : {};
  if (schedule.kind === 'manual') return null;
  if (schedule.kind === 'interval') {
    return [{ name: 'trigger', interval: buildIntervalString(schedule.minutes), ...timeout }];
  }
  return [{ name: 'trigger', cron: buildCronExpr(schedule), ...timeout }];
}
```

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/domain/agentDraft.ts src/domain/agentDraft.test.ts
git commit -m "feat: agent draft model and scheduler trigger builder"
```

---

### Task 7: AgentDraft → agent-compose.yml 序列化器

**Files:**
- Create: `src/domain/composeYaml.ts`
- Test: `src/domain/composeYaml.test.ts`

**Interfaces:**
- Consumes: Task 6 `AgentDraft`、`slugify`、`buildTriggers`；`js-yaml` 的 `dump`。
- Produces:
  - `composeToObject(draft: AgentDraft): Record<string, unknown>`（完整项目对象，键序符合上游 schema）
  - `draftToComposeYaml(draft: AgentDraft): string`（YAML 文本，Phase 3 确认步骤直接展示）
  - YAML 键与上游 `pkg/compose/spec.go` 的 json/yaml tag 一致（本期支持子集）：`enabled/display_name/description/provider/model/system_prompt/env/mcp_servers/skills/volumes/workspace/scheduler/jupyter`；scheduler 键 `triggers[].{name,cron,interval,timeout,prompt}`；workspace local 用 `{provider: file, path}`、git 用 `{provider: git, url, ref}`；volume 挂载键 `{source,target,read_only}`。

- [ ] **Step 1: 写失败的序列化测试**

创建 `src/domain/composeYaml.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { composeToObject, draftToComposeYaml } from './composeYaml';
import type { AgentDraft } from './agentDraft';

const draft: AgentDraft = {
  name: '日报助手',
  displayName: '每日新闻整理员',
  description: '每天汇总新闻',
  provider: 'claude',
  model: 'claude-sonnet-5',
  prompt: '整理今天最重要的三条科技新闻',
  env: [{ key: 'NEWS_LANG', value: 'zh-CN' }],
  schedule: { kind: 'daily', hour: 8, minute: 0 },
  timeoutMinutes: 15,
  workspace: { kind: 'git', url: 'https://github.com/example/notes.git', branch: 'main' },
  volumes: [{ source: '~/news-cache', target: '/workspace/cache', readOnly: false }],
  mcpServers: [
    { name: 'fetcher', type: 'remote', url: 'https://mcp.example.com/fetch' },
  ],
  skills: [{ name: 'summarize', url: 'https://skills.example.com/summarize' }],
  jupyterEnabled: true,
};

describe('composeToObject', () => {
  it('产出顶层 name 与 agents 映射', () => {
    const obj = composeToObject(draft);
    // '日报助手' 不含 ASCII 词法 → slugify 退化为 'assistant'，agents 键同名
    expect(obj.name).toBe('assistant');
    expect(Object.keys((obj as { agents: Record<string, unknown> }).agents)).toEqual([
      'assistant',
    ]);
  });

  it('完整填充 agent 子键', () => {
    const obj = composeToObject(draft) as {
      agents: Record<string, Record<string, unknown>>;
    };
    const agent = obj.agents.assistant;
    expect(agent.display_name).toBe('每日新闻整理员');
    expect(agent.provider).toBe('claude');
    expect(agent.model).toBe('claude-sonnet-5');
    expect(agent.env).toEqual({ NEWS_LANG: 'zh-CN' });
    expect(agent.workspace).toEqual({
      provider: 'git',
      url: 'https://github.com/example/notes.git',
      ref: 'main',
    });
    expect(agent.volumes).toEqual([
      { source: '~/news-cache', target: '/workspace/cache', read_only: false },
    ]);
    expect(agent.mcp_servers).toEqual([
      { name: 'fetcher', type: 'remote', url: 'https://mcp.example.com/fetch' },
    ]);
    expect(agent.skills).toEqual([{ name: 'summarize', url: 'https://skills.example.com/summarize' }]);
    expect(agent.jupyter).toEqual({ enabled: true });
    expect(agent.scheduler).toEqual({
      triggers: [{ name: 'trigger', cron: '0 8 * * *', timeout: '15m', prompt: draft.prompt }],
    });
  });

  it('manual 触发且无可选段时不输出多余键', () => {
    const obj = composeToObject({
      ...draft,
      name: 'quick',
      schedule: { kind: 'manual' },
      timeoutMinutes: undefined,
      jupyterEnabled: false,
    }) as { agents: Record<string, Record<string, unknown>> };
    expect(obj.agents.quick.scheduler).toBeUndefined();
    expect(obj.agents.quick.jupyter).toBeUndefined();
  });
});

describe('draftToComposeYaml', () => {
  it('输出可直接粘贴到 agent-compose.yml 的文本', () => {
    const text = draftToComposeYaml(draft);
    expect(text.startsWith('name: assistant')).toBe(true);
    expect(text).toContain('agents:');
    expect(text).toContain('provider: claude');
    expect(text).toContain('prompt: 整理今天最重要的三条科技新闻');
  });
});
```

注意第一条用例：`slugify('日报助手')` 不含 ASCII 词法 → 结果为 `assistant`，因此期望值是 `assistant`。

- [ ] **Step 2: 确认失败**

Run: `npm test`
Expected: FAIL —— `./composeYaml` 不存在。

- [ ] **Step 3: 实现 composeYaml.ts**

创建 `src/domain/composeYaml.ts`：

```ts
import yaml from 'js-yaml';
import { slugify, buildTriggers, type AgentDraft } from './agentDraft';

export function composeToObject(draft: AgentDraft): Record<string, unknown> {
  const agent: Record<string, unknown> = {};
  agent.enabled = true;
  agent.display_name = draft.displayName;
  if (draft.description) agent.description = draft.description;
  agent.provider = draft.provider;
  if (draft.model) agent.model = draft.model;
  if (draft.systemPrompt) agent.system_prompt = draft.systemPrompt;
  if (draft.env.length > 0) {
    agent.env = Object.fromEntries(draft.env.map((e) => [e.key, e.value]));
  }
  if (draft.mcpServers.length > 0) {
    agent.mcp_servers = draft.mcpServers.map((m) => ({
      name: m.name,
      type: m.type,
      ...(m.command ? { command: m.command } : {}),
      ...(m.args && m.args.length > 0 ? { args: m.args } : {}),
      ...(m.url ? { url: m.url } : {}),
    }));
  }
  if (draft.skills.length > 0) {
    agent.skills = draft.skills.map((k) => ({
      name: k.name,
      ...(k.url ? { url: k.url } : {}),
      ...(k.ref ? { ref: k.ref } : {}),
    }));
  }
  if (draft.volumes.length > 0) {
    agent.volumes = draft.volumes.map((v) => ({
      source: v.source,
      target: v.target,
      read_only: v.readOnly,
    }));
  }
  if (draft.workspace.kind === 'local') {
    agent.workspace = { provider: 'file', path: draft.workspace.path };
  } else if (draft.workspace.kind === 'git') {
    agent.workspace = {
      provider: 'git',
      url: draft.workspace.url,
      ...(draft.workspace.branch ? { ref: draft.workspace.branch } : {}),
    };
  }
  const triggers = buildTriggers(draft.schedule, draft.timeoutMinutes);
  if (triggers) {
    agent.scheduler = {
      triggers: triggers.map((t) =>
        draft.schedule.kind === 'manual'
          ? t
          : {
              ...t,
              ...(draft.prompt ? { prompt: draft.prompt } : {}),
            },
      ),
    };
  }
  if (draft.jupyterEnabled) agent.jupyter = { enabled: true };

  return { name: slugify(draft.name), agents: { [slugify(draft.name)]: agent } };
}

export function draftToComposeYaml(draft: AgentDraft): string {
  return yaml.dump(composeToObject(draft), { lineWidth: 100, noRefs: true });
}
```

- [ ] **Step 4: 测试通过**

Run: `npm test`
Expected: PASS（全部累计用例）

- [ ] **Step 5: 目检 YAML 输出**

Run: `npx vitest run src/domain/composeYaml.test.ts --reporter=verbose`
Expected: PASS。另可在 Node 里目检一次真实输出（换行、引号、中文不被转义）：

```bash
npx tsx -e "
import { draftToComposeYaml } from './src/domain/composeYaml';
console.log(draftToComposeYaml({
  name: '快速检查', displayName: '快速检查', provider: 'codex', prompt: '你好',
  schedule: { kind: 'manual' }, workspace: { kind: 'none' },
  volumes: [], mcpServers: [], skills: [], env: [], jupyterEnabled: false,
}));
"
```

Expected: 打印以 `name: assistant` 开头、含 `provider: codex` 与 `prompt: 你好` 的 YAML 文本。（若未安装 tsx，可改用 `npm i -D tsx` 后重跑，或临时在 Vitest 里 console.log。）

- [ ] **Step 6: Commit**

```bash
git add src/domain/composeYaml.ts src/domain/composeYaml.test.ts
git commit -m "feat: serialize agent draft to agent-compose yaml"
```

---

## 收尾验收（Phase 1 Definition of Done）

- [ ] `npm run dev` 打开页面：daemon 不在线时显示装机向导外壳（5 步列表）；在线时显示主控台骨架（5 个导航项）。
- [ ] `npm test` 全绿（预计 ≥ 20 个用例，覆盖连接层、调度转换、标签转译、触发器、YAML 序列化、双世界壳）。
- [ ] `src/api/gen` 生成物已入库；`proto/UPSTREAM.md` 记录锚定 commit `b44e2be`。
- [ ] 全部提交均为约定式提交信息，工作区 clean。

## Phase 2 预告（不在本计划内）

装机向导世界实作：真 OS 检测、一键安装脚本渲染、密码登录（Bearer token 存入 `saveConnectionSettings`）、Provider 密钥引导（Gateway/LLM 配置接口对接）。
