# Phase 2 — 装机向导（Setup Wizard）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Phase 1 的装机占位屏（SetupShell）建成一条真实的 5 屏向导：欢迎图解 → 环境自检与安装引导 → 首次登录 → Provider 密钥配置 → 完成，让非技术用户在本机自助装好 agent-compose。

**Architecture:** 纯前端 SPA。向导状态由 `useSetupWizard` 钩子管理（当前步、前进/返回、仅可回到已访问步）。5 个屏幕各自是一个独立组件，`SetupShell` 做壳：渲染 `SetupStepIndicator`（顶部步条）+ 当前步内容 + 返回按钮。世界切换仍由 App 层的 `useDaemonProbe` 驱动（health 探测；离线→向导，在线→主控台），向导不接管世界切换。auth 与 provider 密钥均通过受保护的 Connect RPC 与 daemon 交互：登录校验走 `SettingsService.GetGlobalEnv`（受保护、空请求）；密钥写入走 `SettingsService.UpdateGlobalEnv`（secret env，整体替换语义）。纯逻辑（OS 检测、安装指引文案、密钥合并规则）全部抽到 `src/domain/`，与 UI 解耦、可单测。

**Tech Stack:** React 19 + Vite 8 + TypeScript（strict）+ react-router-dom 7 + vitest 4 + @testing-library/react + @connectrpc/connect-web 2 + @bufbuild/protobuf 2 + 现有生成客户端（`src/api/gen/`）。**不新增任何 npm 依赖**（复制命令用内置 `navigator.clipboard`）。

## Global Constraints

- 文案转译（spec §7）：agent→**AI 助手**；provider→**AI 引擎/引擎**；scheduler→**什么时候干活**；volume→**数据文件夹**；workspace→**工作材料**；MCP server→**插件**；skill→**技能包**；sandbox→**隔离工作台**。界面一律简体中文、用人话，不出现 YAML/Docker/cron/provider 等行话（除非作为可点击链接的站外文档）。
- Provider 只出现 4 个：`claude` / `codex` / `pi` / `dsh`（`src/domain/labels.ts` 的 `ProviderId`）。
- Connect v2 API：一律 `createClient(Service, transport)`，**不存在** `createPromiseClient`。生成客户端来自 `src/api/gen/`，**不修改** `src/api/gen/**`。
- daemon 连接：默认 `baseUrl` 空 = 同源 `/api` 代理；Bearer token 存 localStorage 键 `acnova.connection`（见 `src/api/connection.ts`）。
- daemon 认证模型（上游 b44e2be 实测）：共享 Bearer token `AGENT_COMPOSE_AUTH_TOKEN`，**可选**（不设 = 认证关闭）；只有 Health 免鉴权；认证失败 HTTP 401 → connect-web 抛 `ConnectError` 且 `code === Code.Unauthenticated`。installer 打印的"admin 密码"是**官方 Web UI** 的登录口令（AUTH_PASSWORD），**不是** daemon Bearer token —— 向导"首次登录"必须按 daemon token 语义做（见 Task 5）。
- Provider 密钥真实落点：daemon 无"provider 管理 RPC"；唯一 API 写入点是 `SettingsService.UpdateGlobalEnv`（secret env）。`GetGlobalEnv` 对 secret 项返回**掩码值**（`secretRedactedValue`），UI 只能显示"已配置"徽章、**绝不**回显密钥明文。`UpdateGlobalEnv` 是**整体替换**：未列出的名字会被删除；secret 项省略 `value` 则保留原值。
- 密钥环境变量名（上游 `pkg/driver` 的 `LLMProviderKeyName` 与 facade 实测）：`claude → ANTHROPIC_API_KEY`；`codex/pi/dsh → OPENAI_API_KEY`（共享同一个 OpenAI 兼容密钥）。
- TypeScript strict 已开启（Phase 1 终审修复），新增代码必须通过 `npm run build`（tsc -b + vite build）、`npm test`、`npm run lint`（oxlint 零警告）。
- TDD 红绿；jsdom 环境；遵循仓库既有 mock 模式（`src/api/connection.test.ts`：`vi.mock` `@connectrpc/connect` 的 `createClient` 返回假 client）。
- 工作分支：本地 feature 分支 `feat/phase2-setup-wizard`（off `main`），沿用 Phase 1 裁决——不走 git worktree。

---

### Task 1: `useSetupWizard` 步进状态钩子

**Files:**
- Create: `src/hooks/useSetupWizard.ts`
- Test: `src/hooks/useSetupWizard.test.ts`

**Interfaces:**
- Consumes: 无（纯 React hook）。
- Produces: `useSetupWizard(totalSteps: number): { step: number; goNext: () => void; goBack: () => void; goTo: (target: number) => void; canGoBack: boolean; isLast: boolean }`。Task 2/3 依赖此签名。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSetupWizard } from './useSetupWizard';

describe('useSetupWizard', () => {
  it('初始在第 0 步，canGoBack=false，isLast=false', () => {
    const { result } = renderHook(() => useSetupWizard(5));
    expect(result.current.step).toBe(0);
    expect(result.current.canGoBack).toBe(false);
    expect(result.current.isLast).toBe(false);
  });
  it('goNext 前进到第 1 步并允许返回', () => {
    const { result } = renderHook(() => useSetupWizard(5));
    act(() => result.current.goNext());
    expect(result.current.step).toBe(1);
    expect(result.current.canGoBack).toBe(true);
  });
  it('到达最后一屏后 goNext 不再前进，isLast=true', () => {
    const { result } = renderHook(() => useSetupWizard(2));
    act(() => result.current.goNext());
    act(() => result.current.goNext());
    expect(result.current.step).toBe(1);
    expect(result.current.isLast).toBe(true);
  });
  it('goBack 不会低于第 0 步', () => {
    const { result } = renderHook(() => useSetupWizard(5));
    act(() => result.current.goBack());
    expect(result.current.step).toBe(0);
  });
  it('goTo 只能跳到已访问过的步（≤ 当前步）', () => {
    const { result } = renderHook(() => useSetupWizard(5));
    act(() => result.current.goTo(3)); // 未访问过，被忽略
    expect(result.current.step).toBe(0);
    act(() => result.current.goNext()); // step 1
    act(() => result.current.goTo(2)); // 超过当前步，被忽略
    expect(result.current.step).toBe(1);
    act(() => result.current.goTo(0));
    expect(result.current.step).toBe(0);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/hooks/useSetupWizard.test.ts`
Expected: FAIL，报 `Failed to resolve import "./useSetupWizard"` 或函数未定义。

- [ ] **Step 3: 最小实现**

```ts
import { useCallback, useState } from 'react';

export function useSetupWizard(totalSteps: number) {
  const [step, setStep] = useState(0);

  const goNext = useCallback(() => {
    setStep((s) => (s < totalSteps - 1 ? s + 1 : s));
  }, [totalSteps]);
  const goBack = useCallback(() => {
    setStep((s) => (s > 0 ? s - 1 : s));
  }, []);
  const goTo = useCallback((target: number) => {
    setStep((s) => (target >= 0 && target <= s ? target : s));
  }, []);

  return { step, goNext, goBack, goTo, canGoBack: step > 0, isLast: step === totalSteps - 1 };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/hooks/useSetupWizard.test.ts`
Expected: 5 例全过。

- [ ] **Step 5: 提交**

```bash
git add src/hooks/useSetupWizard.ts src/hooks/useSetupWizard.test.ts
git commit -m "feat: setup wizard step state hook"
```

---

### Task 2: 步骤名常量 + `SetupStepIndicator` 步条

**Files:**
- Create: `src/ui/setupSteps.ts`
- Create: `src/ui/SetupStepIndicator.tsx`
- Test: `src/ui/SetupStepIndicator.test.tsx`

**Interfaces:**
- Consumes: 无。
- Produces: `export const SETUP_STEPS = ['欢迎与图解', '环境自检与安装引导', '首次登录', '密钥配置', '完成'] as const;`（供 Task 3+ 与 Phase 1 既有测试使用）；`SetupStepIndicator({ currentStep: number; onStepClick: (index: number) => void })`。

- [ ] **Step 1: 写失败测试**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SetupStepIndicator } from './SetupStepIndicator';

describe('SetupStepIndicator', () => {
  const names = ['欢迎与图解', '环境自检与安装引导', '首次登录', '密钥配置', '完成'];
  it('渲染全部 5 个步骤名，当前步带 aria-current', () => {
    render(<SetupStepIndicator currentStep={2} onStepClick={() => {}} />);
    for (const name of names) expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /首次登录/ })).toHaveAttribute('aria-current', 'step');
  });
  it('点击已访问步触发 onStepClick；未来步按钮禁用', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<SetupStepIndicator currentStep={1} onStepClick={onClick} />);
    await user.click(screen.getByRole('button', { name: /欢迎与图解/ }));
    expect(onClick).toHaveBeenCalledWith(0);
    expect(screen.getByRole('button', { name: /密钥配置/ })).toBeDisabled();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/ui/SetupStepIndicator.test.tsx`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

```ts
// src/ui/setupSteps.ts
export const SETUP_STEPS = ['欢迎与图解', '环境自检与安装引导', '首次登录', '密钥配置', '完成'] as const;
```

```tsx
// src/ui/SetupStepIndicator.tsx
import { SETUP_STEPS } from './setupSteps';

interface Props {
  currentStep: number;
  onStepClick: (index: number) => void;
}

export function SetupStepIndicator({ currentStep, onStepClick }: Props) {
  return (
    <ol className="setup-steps" aria-label="装机步骤">
      {SETUP_STEPS.map((name, i) => {
        const state = i < currentStep ? 'done' : i === currentStep ? 'current' : 'todo';
        return (
          <li key={name} className={`setup-step setup-step--${state}`}>
            <button
              type="button"
              className="setup-step__btn"
              aria-current={state === 'current' ? 'step' : undefined}
              disabled={i > currentStep}
              onClick={() => onStepClick(i)}
            >
              <span className="setup-step__index">{i + 1}</span>
              <span>{name}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/ui/SetupStepIndicator.test.tsx`
Expected: 2 例全过。

- [ ] **Step 5: 提交**

```bash
git add src/ui/setupSteps.ts src/ui/SetupStepIndicator.tsx src/ui/SetupStepIndicator.test.tsx
git commit -m "feat: setup wizard step indicator"
```

---

### Task 3: SetupShell 向导壳 + 欢迎屏 + 基础样式

**Files:**
- Modify: `src/ui/SetupShell.tsx`（整体重写）
- Create: `src/ui/WelcomeScreen.tsx`
- Create: `src/ui/StepPlaceholder.tsx`（临时脚手架，Task 7 删除）
- Create: `src/ui/setup.css`
- Modify: `src/ui/SetupShell.test.tsx`

**Interfaces:**
- Consumes: `useSetupWizard`（T1）、`SetupStepIndicator` + `SETUP_STEPS`（T2）。
- Produces: `SetupShell` 渲染步条 + 当前步内容 + 返回按钮；`WelcomeScreen({ onNext: () => void })`。

- [ ] **Step 1: 写失败测试**（保留 Phase 1 的"5 步名"断言，新增导航断言）

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SetupShell } from './SetupShell';

describe('SetupShell', () => {
  it('展示 5 个装机步骤名', () => {
    render(<SetupShell />);
    for (const step of ['欢迎与图解', '环境自检与安装引导', '首次登录', '密钥配置', '完成']) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
  });
  it('第 0 步展示欢迎内容，「开始安装」进入下一步', async () => {
    const user = userEvent.setup();
    render(<SetupShell />);
    expect(screen.getByRole('heading', { name: '欢迎使用 agent-compose' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '开始安装' }));
    expect(screen.getByRole('heading', { name: '环境自检与安装引导' })).toBeInTheDocument();
  });
  it('第 1 步显示「← 上一步」，点击回到欢迎屏', async () => {
    const user = userEvent.setup();
    render(<SetupShell />);
    await user.click(screen.getByRole('button', { name: '开始安装' }));
    await user.click(screen.getByRole('button', { name: /上一步/ }));
    expect(screen.getByRole('heading', { name: '欢迎使用 agent-compose' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/ui/SetupShell.test.tsx`
Expected: 新增 2 例 FAIL（Phase 1 的 1 例仍绿）。

- [ ] **Step 3: 实现**（welcome / placeholder / 壳 / 样式）

```tsx
// src/ui/WelcomeScreen.tsx
export function WelcomeScreen({ onNext }: { onNext: () => void }) {
  return (
    <section className="welcome" aria-label="欢迎">
      <div className="welcome__hero" role="img" aria-label="一个 AI 助手在小屋里替主人干活的插图">
        🏠🤖🧹
      </div>
      <h2>欢迎使用 agent-compose</h2>
      <p className="welcome__lead">
        <strong>AI 助手 = 你描述任务，它到隔离的小屋里替你干。</strong>
      </p>
      <p>你不用懂代码、不用懂配置文件。跟着下面的向导，几分钟就能让它跑起来。</p>
      <button type="button" className="setup-btn" onClick={onNext}>开始安装</button>
    </section>
  );
}
```

```tsx
// src/ui/StepPlaceholder.tsx —— 临时脚手架，Task 4-7 逐个替换，Task 7 删除
export function StepPlaceholder({ title }: { title: string }) {
  return (
    <section className="step-placeholder" aria-label={title}>
      <h2>{title}</h2>
      <p>这一步会在本阶段的后续任务里上线。</p>
    </section>
  );
}
```

```tsx
// src/ui/SetupShell.tsx
import { useSetupWizard } from '../hooks/useSetupWizard';
import { SetupStepIndicator } from './SetupStepIndicator';
import { SETUP_STEPS } from './setupSteps';
import { WelcomeScreen } from './WelcomeScreen';
import { StepPlaceholder } from './StepPlaceholder';
import './setup.css';

export function SetupShell() {
  const { step, goNext, goBack, goTo } = useSetupWizard(SETUP_STEPS.length);
  return (
    <main className="setup-shell">
      <h1>把 AI 助手装进这台电脑</h1>
      <SetupStepIndicator currentStep={step} onStepClick={goTo} />
      {step > 0 && (
        <button type="button" className="setup-back" onClick={goBack}>
          ← 上一步
        </button>
      )}
      {step === 0 && <WelcomeScreen onNext={goNext} />}
      {step > 0 && <StepPlaceholder title={SETUP_STEPS[step]} />}
    </main>
  );
}
```

```css
/* src/ui/setup.css —— 本阶段全部向导屏共用，随任务逐步补全 */
.setup-shell { max-width: 720px; margin: 0 auto; padding: 2rem 1.25rem 3rem; }
.setup-shell > h1 { font-size: 1.6rem; margin: 0 0 1.25rem; }
.setup-steps { list-style: none; display: flex; gap: 0.5rem; padding: 0; margin: 0 0 1.5rem; }
.setup-step { flex: 1; }
.setup-step__btn { width: 100%; border: 1px solid #d0d7de; border-radius: 8px; background: #fff; padding: 0.5rem; font-size: 0.85rem; cursor: pointer; text-align: left; }
.setup-step--current .setup-step__btn { border-color: #0969da; color: #0969da; font-weight: 600; }
.setup-step--done .setup-step__btn { background: #ddf4ff; }
.setup-step__btn:disabled { cursor: default; opacity: 0.55; }
.setup-step__index { display: inline-block; width: 1.25rem; }
.setup-back { border: none; background: none; color: #0969da; cursor: pointer; font-size: 0.9rem; padding: 0 0 1rem; }
.welcome { text-align: center; padding-top: 1rem; }
.welcome__hero { font-size: 4rem; }
.welcome__lead { font-size: 1.1rem; }
.setup-btn { border: none; border-radius: 8px; background: #0969da; color: #fff; font-size: 1rem; padding: 0.7rem 1.5rem; cursor: pointer; }
.setup-btn--ghost { background: transparent; color: #0969da; border: 1px solid #0969da; }
.setup-btn:disabled { opacity: 0.6; cursor: default; }
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/ui/SetupShell.test.tsx src/ui/SetupStepIndicator.test.tsx`
Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add src/ui/SetupShell.tsx src/ui/WelcomeScreen.tsx src/ui/StepPlaceholder.tsx src/ui/setup.css src/ui/SetupShell.test.tsx
git commit -m "feat: setup wizard shell with step indicator and welcome screen"
```

---

### Task 4: 环境自检 + 安装引导屏

**Files:**
- Create: `src/domain/os.ts` + `src/domain/os.test.ts`
- Create: `src/domain/install.ts` + `src/domain/install.test.ts`
- Create: `src/ui/InstallGuideScreen.tsx` + `src/ui/InstallGuideScreen.test.tsx`
- Modify: `src/ui/SetupShell.tsx`（接入 step 1 真实屏）

**Interfaces:**
- Consumes: `SetupShell` 的 `goNext`；`SETUP_STEPS`。
- Produces: `detectOS(): 'macos' | 'linux' | 'windows' | 'unsupported'`；`installPlanFor(os): InstallStep[]`（`InstallStep = { kind: 'text' | 'command' | 'link'; text: string; code?: string; href?: string }`）；`InstallGuideScreen({ onNext })`。

- [ ] **Step 1: 写失败测试（domain 纯逻辑）**

```ts
// src/domain/os.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { detectOS } from './os';

afterEach(() => vi.unstubAllGlobals());

describe('detectOS', () => {
  it('macOS：userAgent 含 mac os', () => {
    vi.stubGlobal('navigator', { ...window.navigator, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' });
    expect(detectOS()).toBe('macos');
  });
  it('Windows：userAgent 含 Windows', () => {
    vi.stubGlobal('navigator', { ...window.navigator, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
    expect(detectOS()).toBe('windows');
  });
  it('Linux：platform 为 Linux', () => {
    vi.stubGlobal('navigator', { ...window.navigator, userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', platform: 'Linux x86_64' });
    expect(detectOS()).toBe('linux');
  });
  it('未知系统返回 unsupported', () => {
    vi.stubGlobal('navigator', { ...window.navigator, userAgent: 'whatever', platform: '' });
    expect(detectOS()).toBe('unsupported');
  });
});
```
（注意：测试顶部需 `import { afterEach, describe, expect, it, vi } from 'vitest';`，补上 `vi`。）

```ts
// src/domain/install.test.ts
import { describe, expect, it } from 'vitest';
import { installPlanFor, LINUX_INSTALL_COMMAND } from './install';

describe('installPlanFor', () => {
  it('Linux 给出官方安装脚本命令', () => {
    const plan = installPlanFor('linux');
    expect(plan.some((s) => s.kind === 'command' && s.code === LINUX_INSTALL_COMMAND)).toBe(true);
  });
  it('macOS 引导安装 Docker Desktop 并提供文档链接', () => {
    const plan = installPlanFor('macos');
    expect(plan.some((s) => s.kind === 'link' && s.href?.includes('docker.com'))).toBe(true);
  });
  it('Windows 说明使用 WSL2 按 Linux 步骤', () => {
    const plan = installPlanFor('windows');
    expect(plan.some((s) => s.text.includes('WSL'))).toBe(true);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/domain/os.test.ts src/domain/install.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现（domain + 屏幕）**

```ts
// src/domain/os.ts
export type HostOS = 'macos' | 'linux' | 'windows' | 'unsupported';

export function detectOS(): HostOS {
  const ua = (navigator.userAgent || '').toLowerCase();
  const platform = (navigator.platform || '').toLowerCase();
  if (/mac os|macintosh/.test(ua) || /mac/.test(platform)) return 'macos';
  if (/windows|win32|win64/.test(ua) || /win/.test(platform)) return 'windows';
  if (/linux|x11/.test(ua) || /linux/.test(platform)) return 'linux';
  return 'unsupported';
}
```

```ts
// src/domain/install.ts
import type { HostOS } from './os';

export interface InstallStep {
  kind: 'text' | 'command' | 'link';
  text: string;
  code?: string;
  href?: string;
}

export const LINUX_INSTALL_COMMAND =
  'curl -fsSL https://github.com/chaitin/agent-compose/releases/download/installer-latest/install.sh | bash';
export const DOCKER_DESKTOP_URL = 'https://www.docker.com/products/docker-desktop/';
export const UPSTREAM_DOCS_URL = 'https://github.com/chaitin/agent-compose#readme';

export const OS_LABEL: Record<HostOS, string> = {
  macos: 'macOS',
  linux: 'Linux',
  windows: 'Windows',
  unsupported: '未知系统',
};

export function installPlanFor(os: HostOS): InstallStep[] {
  switch (os) {
    case 'linux':
      return [
        { kind: 'text', text: '在「终端」里粘贴下面这行命令并回车（提示密码时输入电脑密码即可）：' },
        { kind: 'command', code: LINUX_INSTALL_COMMAND },
        { kind: 'text', text: '脚本跑完后会提示访问密钥；把它记下来，下一步可能会用到。' },
      ];
    case 'macos':
      return [
        { kind: 'text', text: '第一步：安装 Docker Desktop（免费，装完打开一次）' },
        { kind: 'link', text: '打开 Docker Desktop 下载页', href: DOCKER_DESKTOP_URL },
        { kind: 'text', text: '第二步：打开 Docker Desktop 等它显示 running，再按官方文档完成 agent-compose 安装。' },
        { kind: 'link', text: '查看官方安装文档', href: UPSTREAM_DOCS_URL },
      ];
    case 'windows':
      return [
        { kind: 'text', text: 'agent-compose 目前需要 Linux 或 macOS 环境。Windows 用户请安装 WSL2 里的 Ubuntu，再按 Linux 步骤安装。' },
      ];
    case 'unsupported':
      return [
        { kind: 'text', text: '没能识别你的系统。可以手动打开官方文档，里面有各平台的安装说明。' },
        { kind: 'link', text: '查看官方安装文档', href: UPSTREAM_DOCS_URL },
      ];
  }
}
```

```tsx
// src/ui/InstallGuideScreen.tsx
import { useMemo, useState } from 'react';
import { detectOS } from '../domain/os';
import { installPlanFor, OS_LABEL } from '../domain/install';

export function InstallGuideScreen({ onNext }: { onNext: () => void }) {
  const os = useMemo(detectOS, []);
  const plan = useMemo(() => installPlanFor(os), [os]);
  const [copied, setCopied] = useState(false);

  const copyCommand = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="install-guide" aria-label="环境自检与安装引导">
      <h2>环境自检与安装引导</h2>
      <p className="install-guide__os">检测到你的系统：{OS_LABEL[os]}</p>
      <ol className="install-plan">
        {plan.map((s, i) => (
          <li key={i} className={`install-plan__item install-plan__item--${s.kind}`}>
            {s.kind === 'command' ? (
              <>
                <pre className="install-plan__code">{s.code}</pre>
                <button type="button" className="setup-btn setup-btn--ghost" onClick={() => copyCommand(s.code ?? '')}>
                  {copied ? '已复制' : '复制命令'}
                </button>
              </>
            ) : s.kind === 'link' ? (
              <a href={s.href} target="_blank" rel="noreferrer">
                {s.text}
              </a>
            ) : (
              <span>{s.text}</span>
            )}
          </li>
        ))}
      </ol>
      <p className="install-guide__hint">
        跑完安装后，页面会自动检测到 agent-compose 并带你进入主控台。也可以点下面按钮继续手动走完向导。
      </p>
      <button type="button" className="setup-btn" onClick={onNext}>
        我已运行安装脚本，继续
      </button>
    </section>
  );
}
```

修改 `src/ui/SetupShell.tsx`：把第 1 步接到真实屏（保留 `StepPlaceholder` 给第 2-4 步）：

```tsx
import { InstallGuideScreen } from './InstallGuideScreen';
// ...（其余 import 不变）
      {step === 1 && <InstallGuideScreen onNext={goNext} />}
      {step > 1 && <StepPlaceholder title={SETUP_STEPS[step]} />}
```

- [ ] **Step 4: 屏幕测试（mock 复制 + OS 分支）**

```tsx
// src/ui/InstallGuideScreen.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InstallGuideScreen } from './InstallGuideScreen';

afterEach(() => vi.unstubAllGlobals());

describe('InstallGuideScreen', () => {
  it('Linux 环境展示安装命令并支持一键复制', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...window.navigator, userAgent: 'X11; Linux x86_64', platform: 'Linux x86_64', clipboard: { writeText } });
    const onNext = vi.fn();
    render(<InstallGuideScreen onNext={onNext} />);
    expect(screen.getByText(/curl -fsSL/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '复制命令' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('install.sh'));
    await user.click(screen.getByRole('button', { name: /我已运行安装脚本/ }));
    expect(onNext).toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run src/domain/os.test.ts src/domain/install.test.ts src/ui/InstallGuideScreen.test.tsx`
Expected: 全部通过。

- [ ] **Step 6: 提交**

```bash
git add src/domain/os.ts src/domain/os.test.ts src/domain/install.ts src/domain/install.test.ts src/ui/InstallGuideScreen.tsx src/ui/InstallGuideScreen.test.tsx src/ui/SetupShell.tsx
git commit -m "feat: install guide screen with OS detection"
```

---

### Task 5: 访问密钥校验 + 首次登录屏

**Files:**
- Modify: `src/api/connection.ts`（新增 `checkAccess`）
- Modify: `src/api/connection.test.ts`（扩展 mock 覆盖 `getGlobalEnv`）
- Create: `src/ui/LoginScreen.tsx` + `src/ui/LoginScreen.test.tsx`
- Modify: `src/ui/SetupShell.tsx`（接入 step 2）

**Interfaces:**
- Consumes: `ConnectionSettings`/`createDaemonTransport`（connection.ts）、`SettingsService`（gen）、`Code`/`ConnectError`（@connectrpc/connect）。
- Produces: `checkAccess(s: ConnectionSettings): Promise<'ok' | 'invalid' | 'unreachable'>`（成功=可用；`ConnectError.code === Code.Unauthenticated`=密钥错；其他=连不上）；`LoginScreen({ onNext })`。

- [ ] **Step 1: 写失败测试（扩展 connection.test.ts）**

对 `src/api/connection.test.ts` 做三处改动（当前第 15 行为 `createClient: vi.fn(() => ({ status: ... }))`，只 mock 了 `status`）：

① 第 4 行 `const statusMock = vi.fn();` 之后新增：

```ts
const getGlobalEnvMock = vi.fn();
```

② 第 15 行 mock 返回值扩为同时提供 `getGlobalEnv`：

```ts
    createClient: vi.fn(() => ({
      status: (...a: unknown[]) => statusMock(...a),
      getGlobalEnv: (...a: unknown[]) => getGlobalEnvMock(...a),
    })),
```

③ 第 30 行 `statusMock.mockReset().mockResolvedValue(...)` 之后追加：

```ts
  getGlobalEnvMock.mockReset().mockResolvedValue({ env: [] });
```

④ 第 26 行的 import 中追加 `checkAccess,`，并新增 describe（`Code`/`ConnectError` 来自被 `...actual` 透传的真实 `@connectrpc/connect`）：

```ts
import { Code, ConnectError } from '@connectrpc/connect';

describe('checkAccess', () => {
  it('受保护 RPC 成功返回 ok', async () => {
    await expect(checkAccess({ baseUrl: '', authToken: '' })).resolves.toBe('ok');
  });
  it('401（Unauthenticated）返回 invalid', async () => {
    getGlobalEnvMock.mockRejectedValueOnce(new ConnectError('denied', Code.Unauthenticated));
    await expect(checkAccess({ baseUrl: '', authToken: 'bad' })).resolves.toBe('invalid');
  });
  it('网络失败返回 unreachable', async () => {
    getGlobalEnvMock.mockRejectedValueOnce(new Error('boom'));
    await expect(checkAccess({ baseUrl: '', authToken: '' })).resolves.toBe('unreachable');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/api/connection.test.ts`
Expected: `checkAccess` 未定义的 FAIL。

- [ ] **Step 3: 实现 checkAccess**

```ts
// src/api/connection.ts 追加：
import { Code, ConnectError } from '@connectrpc/connect';
import { SettingsService } from './gen/agentcompose/v2/agentcompose_pb';

export type AccessCheck = 'ok' | 'invalid' | 'unreachable';

/** 探测一个受保护的 RPC：成功=密钥可用（或未启用认证）；401=密钥错误；其他=连不上。 */
export async function checkAccess(s: ConnectionSettings): Promise<AccessCheck> {
  try {
    const client = createClient(SettingsService, createDaemonTransport(s));
    await client.getGlobalEnv({});
    return 'ok';
  } catch (err) {
    if (err instanceof ConnectError && err.code === Code.Unauthenticated) return 'invalid';
    return 'unreachable';
  }
}
```

- [ ] **Step 4: 写登录屏测试**

```tsx
// src/ui/LoginScreen.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginScreen } from './LoginScreen';

const checkAccessMock = vi.fn();
vi.mock('../api/connection', async (orig) => {
  const actual = await orig<typeof import('../api/connection')>();
  return {
    ...actual,
    loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }),
    saveConnectionSettings: () => {},
    checkAccess: (...a: unknown[]) => checkAccessMock(...a),
  };
});

describe('LoginScreen', () => {
  it('填入密钥并「保存并继续」，校验通过则进入下一步', async () => {
    const user = userEvent.setup();
    checkAccessMock.mockResolvedValue('ok');
    const onNext = vi.fn();
    render(<LoginScreen onNext={onNext} />);
    await user.type(screen.getByLabelText('访问密钥'), 'my-token');
    await user.click(screen.getByRole('button', { name: /保存并继续/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('密钥已保存');
    expect(onNext).toHaveBeenCalled();
  });
  it('密钥不正确时给出错误提示且不前进', async () => {
    const user = userEvent.setup();
    checkAccessMock.mockResolvedValue('invalid');
    const onNext = vi.fn();
    render(<LoginScreen onNext={onNext} />);
    await user.type(screen.getByLabelText('访问密钥'), 'wrong');
    await user.click(screen.getByRole('button', { name: /保存并继续/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('密钥不正确');
    expect(onNext).not.toHaveBeenCalled();
  });
  it('连不上时提示已保存并可继续', async () => {
    const user = userEvent.setup();
    checkAccessMock.mockResolvedValue('unreachable');
    const onNext = vi.fn();
    render(<LoginScreen onNext={onNext} />);
    await user.click(screen.getByRole('button', { name: /保存并继续/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('暂时连不上 agent-compose');
    expect(onNext).toHaveBeenCalled();
  });
  it('「没有密钥，直接下一步」直接前进', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<LoginScreen onNext={onNext} />);
    await user.click(screen.getByRole('button', { name: /没有密钥，直接下一步/ }));
    expect(onNext).toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: 实现登录屏**

```tsx
// src/ui/LoginScreen.tsx
import { useState } from 'react';
import { checkAccess, loadConnectionSettings, saveConnectionSettings, type ConnectionSettings } from '../api/connection';

type Status = 'idle' | 'checking' | 'ok' | 'invalid' | 'unreachable';

export function LoginScreen({ onNext }: { onNext: () => void }) {
  const [key, setKey] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  const submit = async () => {
    setStatus('checking');
    const settings: ConnectionSettings = { ...loadConnectionSettings(), authToken: key.trim() };
    saveConnectionSettings(settings);
    const result = await checkAccess(settings);
    if (result === 'invalid') {
      setStatus('invalid');
      return;
    }
    setStatus(result);
    onNext();
  };

  return (
    <section className="login" aria-label="首次登录">
      <h2>访问密钥（可选）</h2>
      <p>安装 agent-compose 时如果设置了访问密钥，粘贴到这里；没设置的话直接点「继续」。</p>
      <input
        type="password"
        aria-label="访问密钥"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="粘贴访问密钥（没有就留空）"
      />
      <div className="login__actions">
        <button type="button" className="setup-btn" onClick={submit} disabled={status === 'checking'}>
          {status === 'checking' ? '正在检查…' : '保存并继续'}
        </button>
        <button type="button" className="setup-btn setup-btn--ghost" onClick={onNext}>
          没有密钥，直接下一步
        </button>
      </div>
      {status === 'invalid' && (
        <p role="alert" className="login__msg login__msg--error">
          密钥不正确，请检查后重试；或者点「没有密钥，直接下一步」跳过。
        </p>
      )}
      {status === 'unreachable' && (
        <p role="alert" className="login__msg login__msg--warn">
          暂时连不上 agent-compose。密钥已保存，等它启动后会自动进入主控台。
        </p>
      )}
      {status === 'ok' && (
        <p role="status" className="login__msg login__msg--ok">
          密钥已保存，可以继续了。
        </p>
      )}
    </section>
  );
}
```

修改 `src/ui/SetupShell.tsx`：把第 2 步接到真实屏：

```tsx
import { LoginScreen } from './LoginScreen';
// ...
      {step === 2 && <LoginScreen onNext={goNext} />}
      {step > 2 && <StepPlaceholder title={SETUP_STEPS[step]} />}
```

- [ ] **Step 6: 运行确认通过**

Run: `npx vitest run src/api/connection.test.ts src/ui/LoginScreen.test.tsx`
Expected: 全部通过（含既有 connection 测试）。

- [ ] **Step 7: 提交**

```bash
git add src/api/connection.ts src/api/connection.test.ts src/ui/LoginScreen.tsx src/ui/LoginScreen.test.tsx src/ui/SetupShell.tsx
git commit -m "feat: access key validation and login screen"
```

---

### Task 6: Provider 密钥配置屏

**Files:**
- Create: `src/domain/providerKeys.ts` + `src/domain/providerKeys.test.ts`
- Create: `src/api/settings.ts` + `src/api/settings.test.ts`
- Create: `src/ui/ProviderKeysScreen.tsx` + `src/ui/ProviderKeysScreen.test.tsx`
- Modify: `src/ui/SetupShell.tsx`（接入 step 3）

**Interfaces:**
- Consumes: `ProviderId`（domain/labels）、`ConnectionSettings`/`createDaemonTransport`（connection）、`SettingsService`、`EnvVarSpec`/`EnvVarUpdateSpec`（gen）、`Code`/`ConnectError`。
- Produces: `PROVIDER_KEY_DEFS`（4 引擎→envVarName 映射）；`applyProviderKeyUpdates(existing, updates): EnvVarUpdateSpec[]`（整体替换、secret 保留语义）；`providerKeyStatus(existing, defs): Record<string,'configured'|'missing'>`；`getGlobalEnv(s)`/`updateGlobalEnv(s, env)`；`errorKind(err): 'auth' | 'unreachable' | 'other'`；`ProviderKeysScreen({ onNext })`。

- [ ] **Step 1: 写失败测试（domain 纯逻辑）**

```ts
// src/domain/providerKeys.test.ts
import { describe, expect, it } from 'vitest';
import { applyProviderKeyUpdates, providerKeyStatus, PROVIDER_KEY_DEFS } from './providerKeys';

describe('applyProviderKeyUpdates', () => {
  const existing = [
    { name: 'FOO', value: 'bar', secret: false },
    { name: 'ANTHROPIC_API_KEY', value: 'redacted', secret: true },
  ];
  it('保留既有项；secret 项省略 value 以保留原值', () => {
    const next = applyProviderKeyUpdates(existing, []);
    expect(next).toEqual([
      { name: 'FOO', value: 'bar', secret: false },
      { name: 'ANTHROPIC_API_KEY', secret: true },
    ]);
  });
  it('设置新密钥（secret），同名的旧项被替换去重', () => {
    const next = applyProviderKeyUpdates(existing, [
      { envVarName: 'ANTHROPIC_API_KEY', value: 'sk-new' },
      { envVarName: 'OPENAI_API_KEY', value: 'sk-oa' },
    ]);
    expect(next).toEqual([
      { name: 'FOO', value: 'bar', secret: false },
      { name: 'ANTHROPIC_API_KEY', value: 'sk-new', secret: true },
      { name: 'OPENAI_API_KEY', value: 'sk-oa', secret: true },
    ]);
  });
  it('值为空串表示不动该密钥（保留原值）', () => {
    const next = applyProviderKeyUpdates(existing, [{ envVarName: 'ANTHROPIC_API_KEY', value: '' }]);
    expect(next).toEqual([
      { name: 'FOO', value: 'bar', secret: false },
      { name: 'ANTHROPIC_API_KEY', secret: true },
    ]);
  });
});

describe('providerKeyStatus', () => {
  it('按 envVarName 判定已配置/缺失', () => {
    const status = providerKeyStatus([{ name: 'ANTHROPIC_API_KEY', value: 'x', secret: true }], PROVIDER_KEY_DEFS);
    expect(status.ANTHROPIC_API_KEY).toBe('configured');
    expect(status.OPENAI_API_KEY).toBe('missing');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/domain/providerKeys.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 domain + settings client**

```ts
// src/domain/providerKeys.ts
import type { ProviderId } from './labels';
import type { EnvVarSpec, EnvVarUpdateSpec } from '../api/gen/agentcompose/v2/agentcompose_pb';

export interface ProviderKeyDef {
  provider: ProviderId;
  label: string;
  hint: string;
  envVarName: string;
}

/** claude 用 Anthropic 密钥；codex/pi/dsh 共用 OpenAI 兼容密钥（上游 LLMProviderKeyName 实测）。 */
export const PROVIDER_KEY_DEFS: ProviderKeyDef[] = [
  { provider: 'claude', label: 'Claude Code', hint: 'Anthropic 密钥', envVarName: 'ANTHROPIC_API_KEY' },
  { provider: 'codex', label: 'Codex', hint: 'OpenAI 兼容密钥', envVarName: 'OPENAI_API_KEY' },
  { provider: 'pi', label: 'Pi', hint: 'OpenAI 兼容密钥', envVarName: 'OPENAI_API_KEY' },
  { provider: 'dsh', label: 'DSH', hint: 'OpenAI 兼容密钥', envVarName: 'OPENAI_API_KEY' },
];

/** UpdateGlobalEnv 是整体替换：未列出的名字会被删除；secret 项省略 value 则保留原值。 */
export function applyProviderKeyUpdates(
  existing: EnvVarSpec[],
  updates: { envVarName: string; value: string }[],
): EnvVarUpdateSpec[] {
  const next: EnvVarUpdateSpec[] = existing.map((e) =>
    e.secret ? { name: e.name, secret: true } : { name: e.name, value: e.value, secret: false },
  );
  for (const u of updates) {
    if (!u.value.trim()) continue; // 用户留空的字段 = 不动该密钥（保留原值）
    const i = next.findIndex((x) => x.name === u.envVarName);
    if (i >= 0) next.splice(i, 1); // 同名去重：后出现的覆盖先出现的（与 daemon last-wins 一致）
    next.push({ name: u.envVarName, value: u.value.trim(), secret: true });
  }
  return next;
}

export function providerKeyStatus(
  existing: EnvVarSpec[],
  defs: ProviderKeyDef[],
): Record<string, 'configured' | 'missing'> {
  const present = new Set(existing.map((e) => e.name));
  const status: Record<string, 'configured' | 'missing'> = {};
  for (const def of defs) status[def.envVarName] = present.has(def.envVarName) ? 'configured' : 'missing';
  return status;
}
```

```ts
// src/api/settings.ts
import { Code, ConnectError, createClient } from '@connectrpc/connect';
import { createDaemonTransport, type ConnectionSettings } from './connection';
import {
  SettingsService,
  type EnvVarSpec,
  type EnvVarUpdateSpec,
} from './gen/agentcompose/v2/agentcompose_pb';

function settingsClient(s: ConnectionSettings) {
  return createClient(SettingsService, createDaemonTransport(s));
}

export async function getGlobalEnv(s: ConnectionSettings): Promise<EnvVarSpec[]> {
  const res = await settingsClient(s).getGlobalEnv({});
  return res.env;
}

export async function updateGlobalEnv(s: ConnectionSettings, env: EnvVarUpdateSpec[]): Promise<EnvVarSpec[]> {
  const res = await settingsClient(s).updateGlobalEnv({ env });
  return res.env;
}

export function errorKind(err: unknown): 'auth' | 'unreachable' | 'other' {
  if (err instanceof ConnectError) {
    if (err.code === Code.Unauthenticated) return 'auth';
    if (err.code === Code.Unavailable || err.code === Code.DeadlineExceeded) return 'unreachable';
  }
  return 'other';
}
```

- [ ] **Step 4: 屏幕测试**

```tsx
// src/ui/ProviderKeysScreen.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProviderKeysScreen } from './ProviderKeysScreen';

const getGlobalEnvMock = vi.fn();
const updateGlobalEnvMock = vi.fn();
vi.mock('../api/settings', async (orig) => {
  const actual = await orig<typeof import('../api/settings')>();
  return { ...actual, getGlobalEnv: getGlobalEnvMock, updateGlobalEnv: updateGlobalEnvMock };
});
vi.mock('../api/connection', async (orig) => {
  const actual = await orig<typeof import('../api/connection')>();
  return { ...actual, loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }) };
});

describe('ProviderKeysScreen', () => {
  beforeEach(() => {
    getGlobalEnvMock.mockReset().mockResolvedValue([{ name: 'ANTHROPIC_API_KEY', value: 'redacted', secret: true }]);
    updateGlobalEnvMock.mockReset().mockResolvedValue([]);
  });
  it('渲染 4 张引擎卡，claude 显示已配置徽章', async () => {
    render(<ProviderKeysScreen onNext={() => {}} />);
    expect(await screen.findByText('Claude Code')).toBeInTheDocument();
    expect(screen.getByText('Codex')).toBeInTheDocument();
    expect(screen.getByText('Pi')).toBeInTheDocument();
    expect(screen.getByText('DSH')).toBeInTheDocument();
    expect(screen.getAllByText('已配置')).toHaveLength(1);
  });
  it('填入密钥并保存：以整体替换语义调用 updateGlobalEnv', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<ProviderKeysScreen onNext={onNext} />);
    await user.type(await screen.findByLabelText('Codex 密钥'), 'sk-oa');
    await user.click(screen.getByRole('button', { name: /保存密钥/ }));
    await waitFor(() => expect(updateGlobalEnvMock).toHaveBeenCalledTimes(1));
    const payload = updateGlobalEnvMock.mock.calls[0][1];
    expect(payload).toEqual(expect.arrayContaining([{ name: 'ANTHROPIC_API_KEY', secret: true }]));
    expect(payload).toEqual(expect.arrayContaining([{ name: 'OPENAI_API_KEY', value: 'sk-oa', secret: true }]));
    expect(onNext).not.toHaveBeenCalled(); // 保存后仍在当前页
  });
  it('「跳过，稍后在设置里配置」直接前进', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<ProviderKeysScreen onNext={onNext} />);
    await user.click(screen.getByRole('button', { name: /跳过，稍后在设置里配置/ }));
    expect(onNext).toHaveBeenCalled();
  });
});
```

（测试顶部需补 `import { waitFor } from '@testing-library/react';`。）

- [ ] **Step 5: 实现屏幕**

```tsx
// src/ui/ProviderKeysScreen.tsx
import { useEffect, useState } from 'react';
import { loadConnectionSettings } from '../api/connection';
import { errorKind, getGlobalEnv, updateGlobalEnv } from '../api/settings';
import { applyProviderKeyUpdates, PROVIDER_KEY_DEFS, providerKeyStatus } from '../domain/providerKeys';

type Status = 'loading' | 'idle' | 'saving' | 'saved' | 'auth' | 'unreachable' | 'other';

export function ProviderKeysScreen({ onNext }: { onNext: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [keyStatus, setKeyStatus] = useState<Record<string, 'configured' | 'missing'>>({});
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    getGlobalEnv(loadConnectionSettings())
      .then((env) => {
        setKeyStatus(providerKeyStatus(env, PROVIDER_KEY_DEFS));
        setStatus('idle');
      })
      .catch((err) => setStatus(errorKind(err)));
  }, []);

  const save = async () => {
    setStatus('saving');
    try {
      const existing = await getGlobalEnv(loadConnectionSettings());
      const updates = PROVIDER_KEY_DEFS.map((def) => ({ envVarName: def.envVarName, value: values[def.envVarName] ?? '' }));
      await updateGlobalEnv(loadConnectionSettings(), applyProviderKeyUpdates(existing, updates));
      setStatus('saved');
    } catch (err) {
      setStatus(errorKind(err));
    }
  };

  if (status === 'loading') return <p role="status">正在读取密钥配置…</p>;

  return (
    <section className="provider-keys" aria-label="密钥配置">
      <h2>给 AI 引擎填密钥</h2>
      <p>填了密钥的引擎才能干活。这些密钥只保存在你自己电脑上；可以先跳过，之后在「设置」里补。</p>
      <div className="key-cards">
        {PROVIDER_KEY_DEFS.map((def) => (
          <div key={def.provider} className="key-card">
            <h3>
              {def.label}
              {keyStatus[def.envVarName] === 'configured' && <span className="key-card__badge">已配置</span>}
            </h3>
            <input
              type="password"
              aria-label={`${def.label} 密钥`}
              value={values[def.envVarName] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [def.envVarName]: e.target.value }))}
              placeholder={def.hint}
            />
            {def.envVarName === 'OPENAI_API_KEY' && def.provider !== 'codex' && (
              <p className="key-card__note">与 Codex 共用同一个 OpenAI 兼容密钥。</p>
            )}
          </div>
        ))}
      </div>
      <div className="login__actions">
        <button type="button" className="setup-btn" onClick={save} disabled={status === 'saving'}>
          {status === 'saving' ? '正在保存…' : '保存密钥'}
        </button>
        <button type="button" className="setup-btn setup-btn--ghost" onClick={onNext}>
          跳过，稍后在设置里配置
        </button>
      </div>
      {status === 'saved' && <p role="status" className="login__msg login__msg--ok">密钥已保存。</p>}
      {status === 'auth' && (
        <p role="alert" className="login__msg login__msg--error">访问密钥不正确或缺失，密钥未保存。请返回上一步填写访问密钥。</p>
      )}
      {status === 'unreachable' && <p role="alert" className="login__msg login__msg--warn">暂时连不上 agent-compose，密钥未保存。</p>}
    </section>
  );
}
```

修改 `src/ui/SetupShell.tsx`：把第 3 步接到真实屏：

```tsx
import { ProviderKeysScreen } from './ProviderKeysScreen';
// ...
      {step === 3 && <ProviderKeysScreen onNext={goNext} />}
      {step === 4 && <StepPlaceholder title={SETUP_STEPS[step]} />}
```

- [ ] **Step 6: 运行确认通过**

Run: `npx vitest run src/domain/providerKeys.test.ts src/ui/ProviderKeysScreen.test.tsx`
Expected: 全部通过。

- [ ] **Step 7: 提交**

```bash
git add src/domain/providerKeys.ts src/domain/providerKeys.test.ts src/api/settings.ts src/ui/ProviderKeysScreen.tsx src/ui/ProviderKeysScreen.test.tsx src/ui/SetupShell.tsx
git commit -m "feat: provider key configuration screen"
```

---

### Task 7: 完成屏 + 收拢向导（删除脚手架）

**Files:**
- Create: `src/ui/CompletionScreen.tsx` + `src/ui/CompletionScreen.test.tsx`
- Delete: `src/ui/StepPlaceholder.tsx`
- Modify: `src/ui/SetupShell.tsx`（全部 5 步真实屏，去掉 placeholder）
- Modify: `src/ui/SetupShell.test.tsx`（补充全流程导航测试）

**Interfaces:**
- Consumes: 前 6 任务的 5 个屏幕 + `useSetupWizard`。
- Produces: `CompletionScreen()`（无回调）；`SetupShell` 覆盖 step 0-4 全部真实屏。

- [ ] **Step 1: 写失败测试（完成屏 + 全流程）**

```tsx
// src/ui/CompletionScreen.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CompletionScreen } from './CompletionScreen';

describe('CompletionScreen', () => {
  it('展示庆祝文案与自动进入提示', () => {
    render(<CompletionScreen />);
    expect(screen.getByRole('heading', { name: '搞定了！' })).toBeInTheDocument();
    expect(screen.getByText(/进入主控台/)).toBeInTheDocument();
  });
});
```

```tsx
// src/ui/SetupShell.test.tsx —— 重排文件顶部，mock 设置必须在 import SetupShell 之前
// （vitest 的 vi.mock 工厂在首次 import 时执行，const 必须先于导入赋值，沿用 connection.test.ts 的既有模式）：
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const getGlobalEnvMock = vi.fn();
vi.mock('../api/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/settings')>();
  return { ...actual, getGlobalEnv: getGlobalEnvMock };
});

import { SetupShell } from './SetupShell';

// 既有 describe 内追加：
beforeEach(() => {
  getGlobalEnvMock.mockReset().mockResolvedValue([]);
});

it('全流程可从欢迎屏一路走到完成屏', async () => {
  const user = userEvent.setup();
  render(<SetupShell />);
  await user.click(screen.getByRole('button', { name: '开始安装' }));
  expect(screen.getByRole('heading', { name: '环境自检与安装引导' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /我已运行安装脚本/ }));
  expect(screen.getByRole('heading', { name: '访问密钥（可选）' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /没有密钥，直接下一步/ }));
  expect(screen.getByRole('heading', { name: '给 AI 引擎填密钥' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /跳过，稍后在设置里配置/ }));
  expect(screen.getByRole('heading', { name: '搞定了！' })).toBeInTheDocument();
});
```
（注：全流程路径在 step 2 走的是「没有密钥，直接下一步」直通分支，不触发 `checkAccess`；step 3 的 `getGlobalEnv` 已被 mock。T3/T4/T5/T6 各自的组件测试已覆盖保存与校验分支。）

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/ui/CompletionScreen.test.tsx`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

```tsx
// src/ui/CompletionScreen.tsx
export function CompletionScreen() {
  return (
    <section className="completion" aria-label="完成">
      <div className="completion__hero" role="img" aria-label="庆祝">
        🎉
      </div>
      <h2>搞定了！</h2>
      <p>agent-compose 正在自动接入，马上就带你进入主控台。</p>
      <p className="completion__hint">
        如果页面没有自动跳转，稍等几秒——它每 3 秒会自动检查一次。
      </p>
    </section>
  );
}
```

修改 `src/ui/SetupShell.tsx` 为最终形态：

```tsx
import { useSetupWizard } from '../hooks/useSetupWizard';
import { SetupStepIndicator } from './SetupStepIndicator';
import { SETUP_STEPS } from './setupSteps';
import { WelcomeScreen } from './WelcomeScreen';
import { InstallGuideScreen } from './InstallGuideScreen';
import { LoginScreen } from './LoginScreen';
import { ProviderKeysScreen } from './ProviderKeysScreen';
import { CompletionScreen } from './CompletionScreen';
import './setup.css';

export function SetupShell() {
  const { step, goNext, goBack, goTo } = useSetupWizard(SETUP_STEPS.length);
  return (
    <main className="setup-shell">
      <h1>把 AI 助手装进这台电脑</h1>
      <SetupStepIndicator currentStep={step} onStepClick={goTo} />
      {step > 0 && (
        <button type="button" className="setup-back" onClick={goBack}>
          ← 上一步
        </button>
      )}
      {step === 0 && <WelcomeScreen onNext={goNext} />}
      {step === 1 && <InstallGuideScreen onNext={goNext} />}
      {step === 2 && <LoginScreen onNext={goNext} />}
      {step === 3 && <ProviderKeysScreen onNext={goNext} />}
      {step === 4 && <CompletionScreen />}
    </main>
  );
}
```

删除 `src/ui/StepPlaceholder.tsx`。若 `src/ui/SetupShell.test.tsx` 里存在对 placeholder 文本（"这一步会在本阶段的后续任务里上线"）的断言，一并移除。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run`
Expected: 全部测试绿（既有 44 + 本阶段新增全部通过），`npm run build` 与 `npm run lint` 也绿。

- [ ] **Step 5: 提交**

```bash
git add -A src/ui/CompletionScreen.tsx src/ui/CompletionScreen.test.tsx src/ui/SetupShell.tsx src/ui/SetupShell.test.tsx
git rm src/ui/StepPlaceholder.tsx
git commit -m "feat: completion screen and finalize setup wizard"
```

---

## 自审（Spec 对照）

- **§4 屏 1 欢迎与图解** → T3 `WelcomeScreen`（漫画式 emoji 图解 + "AI 助手 = 你描述任务，它到隔离小屋里替你干"）。✅
- **§4 屏 2 环境自检与安装引导** → T4 `detectOS` + `installPlanFor` + `InstallGuideScreen`（Linux 官方脚本复制；macOS Docker Desktop；轮询 health 由 App 层 `useDaemonProbe` 处理，非向导职责）。✅
- **§4 屏 3 首次登录** → T5 `LoginScreen`（粘贴密钥、受保护 RPC 校验、错误人话提示）。Ruling：spec 写"粘贴安装器打印的 admin 密码"，但上游实测 installer 的 AUTH_PASSWORD 是**官方 UI**登录口令，**非** daemon Bearer token；本向导按 daemon token 语义做"访问密钥（可选）"，认证未启用时留空即可通过。已获 controller 裁决（见裁决表）。
- **§4 屏 4 Provider 密钥配置** → T6 `ProviderKeysScreen`（4 引擎卡、secret 全局 env 写入、可跳过）。Ruling：上游无 provider 管理 RPC，密钥唯一 API 落点是 `UpdateGlobalEnv`（secret env），映射 `claude→ANTHROPIC_API_KEY`、`codex/pi/dsh→OPENAI_API_KEY`。
- **§4 屏 5 完成** → T7 `CompletionScreen`。✅
- **§4 返回上一步** → `useSetupWizard.goBack` + 步条点击已访问步。✅
- **§4 探测在线任意时刻跳过** → App 层 `useDaemonProbe` 已实现（Phase 1），向导不接管。✅
- **§7 文案转译** → 界面用语全部人话（访问密钥/隔离小屋/引擎）。✅
- **§8 401 弹回登录** → 留待 Phase 3（控制台页真正调 API 时才需要）；本阶段向导内 `checkAccess`/`errorKind` 已把人话错误覆盖。⚠️ 明确非本阶段目标。

## 裁决表（controller 在开工前记录）

1. **登录屏语义**：spec 说"粘贴 admin 密码"，实测不成立（见上）；向导改为"访问密钥（可选）"，校验走 `SettingsService.GetGlobalEnv`。代价：与官方 UI 的登录体验不同，但对接的是真实 daemon 认证。
2. **Provider 密钥落点**：无 provider RPC → 写 secret 全局 env；`codex/pi/dsh` 共用 `OPENAI_API_KEY`，UI 明示"共用"。
3. **世界切换不动 App**：在线跳过由 App 层 `useDaemonProbe` 处理（Phase 1 已测），向导不重复实现。
4. **Phase 2 不做控制台登录浮层**（§8）：控制台页面在 Phase 3 才调 API，届时再实现 401 浮层。
5. **无新依赖**：复制用 `navigator.clipboard`；样式用原生 CSS（`src/ui/setup.css`），不引入框架。

---

## 执行后附注（2026-08-28，subagent-driven 执行完毕）

**Errata — Task 4 内部不一致（真实计划缺陷，实现期已修正）：** 计划正文要求 `InstallStep.text: string`（必填），但其自身的 command 步骤样例没有 text。实现者按真实语义改为 `text?: string`（command 步骤只带 `code`），并在 `src/domain/install.ts` 补注释说明；task reviewer 判定 minimal + 行为正确。最终评审后确认该偏差是计划缺陷而非实现偏离。

**实现概要：** 7 任务全绿，19 个测试文件 / 77 个测试通过，`tsc -b` build 与 oxlint 零警告；全分支评审（f810331..5cc7120，9 commits）为 "Ready to merge"，修复波后 scoped 复评全部 ADDRESSED、无新破坏。

**遗留 minor（按控制器裁定 defer，进入 Phase 3 时消化）：**
- `ProviderKeysScreen`/`settings.ts` 的自定义 `ProviderKeyEnvVar` 平行类型：与 gen 的 `EnvVarUpdateSpec` 不漂移的唯一方式是改用 `PartialMessage<EnvVarUpdateSpec>`。代价若错：gen 变更时类型静默漂移。建议 Phase 3 统一 errorKind/AccessCheck 分类器时一并处理。
- 密钥保存后「已配置」badge 未即时刷新（`updateGlobalEnv` 的 `res.env` 被丢弃）——settings 屏拥有 badge 刷新逻辑时解决。
- `.login*` / `.key-card*` 样式类未定义（部署样式时落地；标记已在 markup 上）。
- Task 7 完成屏「每 3 秒自动检查一次」文案未被测试断言（coverage 建议，非缺陷）。
