# AI 助手环境变量引导 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clarify the per-agent environment-variable fields in the creation wizard without changing the agent draft or API payload.

**Architecture:** Keep `TaskStep` as the single owner of the advanced form. Add presentational labels, a keyboard-accessible help trigger, and static examples around the existing `draft.env` inputs. Use CSS only for the tooltip and responsive layout, leaving update handlers unchanged.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, CSS.

## Global Constraints

- Do not change `AgentDraft.env`, save handlers, RPC payloads, routes, or dependencies.
- Preserve existing “变量名” and “变量值” accessible names.
- The help copy must say “通常无需填写” and direct API Key configuration to “设置 → AI 引擎密钥”.
- Examples must be static text: `TZ=Asia/Shanghai`, `LANG=zh_CN.UTF-8`, and `HTTPS_PROXY=http://proxy.example:8080`.

---

### Task 1: Make per-agent environment variables self-explanatory

**Files:**
- Modify: `src/ui/steps/TaskStep.tsx:50-86`
- Modify: `src/ui/setup.css:43-48`
- Test: `src/ui/steps/TaskStep.test.tsx`

**Interfaces:**
- Consumes: `TaskStep` receives `draft.env: EnvPair[]` and `update({ env })`.
- Produces: unchanged `EnvPair[]` updates; additional presentational DOM only.

- [ ] **Step 1: Write the failing test**

```tsx
it('解释当前助手的环境变量并展示示例', async () => {
  const user = userEvent.setup();
  render(<TaskStepHarness onUpdate={vi.fn()} />);

  await user.click(screen.getByRole('button', { name: /高级设置/ }));

  expect(screen.getByRole('button', { name: '查看环境变量说明' })).toBeInTheDocument();
  expect(screen.getByText(/通常无需填写/)).toBeInTheDocument();
  expect(screen.getByText('TZ=Asia/Shanghai')).toBeInTheDocument();
  expect(screen.getByText('LANG=zh_CN.UTF-8')).toBeInTheDocument();
  expect(screen.getByText('HTTPS_PROXY=http://proxy.example:8080')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/ui/steps/TaskStep.test.tsx`

Expected: FAIL because the help button and examples do not exist.

- [ ] **Step 3: Write minimal implementation**

```tsx
<div className="env-section__head">
  <h4>环境变量</h4>
  <button type="button" className="env-help" aria-label="查看环境变量说明">
    ?
    <span className="env-help__tooltip" role="tooltip">
      这些变量只传给当前 AI 助手。通常无需填写；不要在这里填写 AI 引擎 API Key，请到“设置 → AI 引擎密钥”配置。
    </span>
  </button>
</div>
<p className="env-section__hint">通常无需填写。示例：<code>TZ=Asia/Shanghai</code>、<code>LANG=zh_CN.UTF-8</code>、<code>HTTPS_PROXY=http://proxy.example:8080</code></p>
```

Add visible `变量名` and `变量值` labels for each row, while retaining the existing input `aria-label` values. Add CSS that reveals `.env-help__tooltip` for `.env-help:hover` and `.env-help:focus-visible`, without changing `env-row` update handlers.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `npm test -- src/ui/steps/TaskStep.test.tsx`

Expected: PASS with the new explanation test and existing environment-variable update test.

- [ ] **Step 5: Run complete verification**

Run: `npm test && npm run lint && npm run build && git diff --check`

Expected: all tests, lint, and build pass; Vite may emit its existing bundle-size advisory.

- [ ] **Step 6: Commit and push**

```bash
git add src/ui/steps/TaskStep.tsx src/ui/setup.css src/ui/steps/TaskStep.test.tsx
git commit -m "feat: clarify agent environment variables"
git push
```
