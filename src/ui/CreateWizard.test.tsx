import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithClient } from '../test/renderWithClient';
import { CreateWizard } from './CreateWizard';

const validateProjectMock = vi.fn();
const applyProjectMock = vi.fn();
const startAgentRunMock = vi.fn();
const getProjectMock = vi.fn();

vi.mock('../api/projects', () => ({
  validateProject: (...a: unknown[]) => validateProjectMock(...a),
  applyProject: (...a: unknown[]) => applyProjectMock(...a),
  startAgentRun: (...a: unknown[]) => startAgentRunMock(...a),
  getProject: (...a: unknown[]) => getProjectMock(...a),
  // ProjectRef 真实形状是 { selector: { case, value } }（oneof 在 selector 下），平铺 { case, value } 会编译不过。
  projectRefByName: (name: string) => ({ selector: { case: 'name' as const, value: name } }),
}));
vi.mock('../api/connection', () => ({ loadConnectionSettings: () => ({ baseUrl: '', authToken: '' }) }));

function RunDetailStub() {
  const { runId } = useParams();
  return <div>run detail {runId}</div>;
}

function renderWizard(path = '/console/agents/new') {
  return renderWithClient(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/console/agents/new" element={<CreateWizard />} />
        <Route path="/console/agents/:agentName/edit" element={<CreateWizard />} />
        <Route path="/console/agents" element={<div>agents list</div>} />
        <Route path="/console/runs" element={<div>runs list</div>} />
        <Route path="/console/runs/:runId" element={<RunDetailStub />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function walkToConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '继续' })); // step0 引擎（默认 claude）
  // getByLabelText('任务说明') 会同时命中步条上的同名按钮，改用 textbox role 精确匹配。
  await user.type(screen.getByRole('textbox', { name: '任务说明' }), '整理日志');
  await user.click(screen.getByRole('button', { name: '继续' }));
  await user.click(screen.getByRole('radio', { name: /固定间隔/ })); // step2 固定间隔
  await user.type(screen.getByLabelText('间隔分钟数'), '90'); // 默认 0 分钟会拦截继续，先填一个正数
  await user.click(screen.getByRole('button', { name: '继续' }));
  await user.click(screen.getByRole('button', { name: '继续' })); // step3 材料（默认无）
  await user.type(screen.getByLabelText('AI 助手名字'), '我的机器人');
}

describe('CreateWizard 全流程', () => {
  beforeEach(() => {
    validateProjectMock.mockReset().mockResolvedValue({ valid: true, issues: [] });
    applyProjectMock.mockReset().mockResolvedValue({ applied: true, issues: [], project: { summary: { projectId: 'p1' } } });
    startAgentRunMock.mockReset().mockResolvedValue({ runId: 'r1' });
    getProjectMock.mockReset();
  });
  it('新建：走完 5 步，保存先 Validate 再 Apply，然后回到列表', async () => {
    const user = userEvent.setup();
    renderWizard();
    await walkToConfirm(user);
    expect(screen.getByText('我的机器人')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /保存/ }));
    await waitFor(() => expect(validateProjectMock).toHaveBeenCalled());
    await waitFor(() => expect(applyProjectMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('agents list')).toBeInTheDocument());
  });
  it('校验失败给人话提示并停在确认页', async () => {
    validateProjectMock.mockResolvedValue({ valid: false, issues: [{ severity: 2, path: 'agents.0.provider', message: 'provider 不支持' }] });
    const user = userEvent.setup();
    renderWizard();
    await walkToConfirm(user);
    await user.click(screen.getByRole('button', { name: /保存/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/provider 不支持/));
    expect(applyProjectMock).not.toHaveBeenCalled();
  });
  it('测试运行一次：Validate+Apply 后调 StartAgentRun 并跳运行详情', async () => {
    const user = userEvent.setup();
    renderWizard();
    await walkToConfirm(user);
    await user.click(screen.getByRole('button', { name: /测试运行一次/ }));
    await waitFor(() => expect(startAgentRunMock).toHaveBeenCalled());
    // Apply 返回的 projectId 作为 Run 的项目引用；slugify('我的机器人') 退化为确定性唯一 'assistant-53aa96'。
    expect(startAgentRunMock).toHaveBeenCalledWith(
      { baseUrl: '', authToken: '' },
      { projectId: 'p1', agentName: 'assistant-53aa96', prompt: '整理日志' },
    );
    await waitFor(() => expect(screen.getByText('run detail r1')).toBeInTheDocument());
  });
  it('编辑：GetProject 回填草稿，标题为「编辑 AI 助手」', async () => {
    // getProject 返回 Project 本体（带 summary/spec 顶层字段），不是包一层 { project }。
    getProjectMock.mockResolvedValue({
      summary: { projectId: 'p1', name: 'my-bot' },
      spec: {
        name: 'my-bot',
        agents: [{ name: 'my-bot', provider: 'codex', model: 'gpt-5', systemPrompt: '', displayName: '我的机器人', description: '', enabled: true, env: [], scheduler: undefined, workspace: undefined, volumes: [], mcpServers: [], skills: [], jupyter: undefined }],
      },
    });
    renderWizard('/console/agents/my-bot/edit');
    // 等 GetProject 回填完成（确认页展示回填的显示名），再校验编辑标题。
    await waitFor(() => expect(screen.getByText('我的机器人')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: '编辑 AI 助手' })).toBeInTheDocument();
    expect(getProjectMock).toHaveBeenCalledWith(
      { baseUrl: '', authToken: '' },
      { selector: { case: 'name', value: 'my-bot' } },
      true,
    );
  });
  it('Apply 返回 applied:false（无 issues）时提示保存失败并停在确认页', async () => {
    applyProjectMock.mockResolvedValue({ applied: false, issues: [], project: undefined });
    const user = userEvent.setup();
    renderWizard();
    await walkToConfirm(user);
    await user.click(screen.getByRole('button', { name: /保存/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/保存失败/));
    expect(screen.queryByText('agents list')).not.toBeInTheDocument();
    expect(startAgentRunMock).not.toHaveBeenCalled();
  });
  it('保存接口报错时给人话提示并复位 busy（按钮恢复可用）', async () => {
    applyProjectMock.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    renderWizard();
    await walkToConfirm(user);
    await user.click(screen.getByRole('button', { name: /保存/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/连不上后台服务/));
    expect(screen.getByRole('button', { name: /保存/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /测试运行一次/ })).toBeEnabled();
    expect(screen.queryByText('agents list')).not.toBeInTheDocument();
  });
  it('编辑：GetProject 返回无 spec（bad 编辑 URL）时提示找不到', async () => {
    getProjectMock.mockResolvedValue(null);
    renderWizard('/console/agents/ghost/edit');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/找不到这个 AI 助手/));
  });
});
