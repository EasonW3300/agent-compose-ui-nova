import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { loadConnectionSettings } from '../api/connection';
import { applyProject, getProject, projectRefByName, startInteractiveAgentRun, validateProject } from '../api/projects';
import { draftToProjectSpec, projectSpecToDraft } from '../domain/projectSpec';
import { emptyDraft, type AgentDraft } from '../domain/agentDraft';
import { useSetupWizard } from '../hooks/useSetupWizard';
import { CREATE_STEPS } from './createWizardSteps';
import { WizardStepBar } from './WizardStepBar';
import { EngineStep } from './steps/EngineStep';
import { TaskStep } from './steps/TaskStep';
import { ScheduleStep } from './steps/ScheduleStep';
import { MaterialsStep } from './steps/MaterialsStep';
import { ConfirmStep, type ConfirmIssue } from './steps/ConfirmStep';

// Project APIs retain validation and saving; only the explicit test entry point starts an interactive run.
// The draft converters keep the UI model and daemon project specification aligned at the save boundary.
export function CreateWizard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { agentName } = useParams();
  const editing = Boolean(agentName);
  // 编辑态直达确认页：回填的摘要立即可见，可任意回跳修改（useSetupWizard 支持指定初始步）。
  const { step, goNext, goBack, goTo } = useSetupWizard(
    CREATE_STEPS.length,
    editing ? CREATE_STEPS.length - 1 : 0,
  );
  // 本地草稿：回填数据（loaded）在用户首次编辑前作为初稿；一旦编辑，以本地草稿为准。
  const [draft, setDraft] = useState<AgentDraft | null>(null);
  const [issues, setIssues] = useState<ConfirmIssue[]>([]);
  const [busy, setBusy] = useState(false);

  const { data: loaded, isError, isSuccess } = useQuery({
    queryKey: ['project-for-edit', agentName],
    queryFn: async () => {
      const s = loadConnectionSettings();
      const project = await getProject(s, projectRefByName(agentName!), true);
      if (!project?.spec) return null;
      return projectSpecToDraft(project.spec, agentName!);
    },
    enabled: editing,
  });

  // 编辑态查询落定后仍拿不到 spec（bad 编辑 URL / 项目被删）→ 视为不存在。
  if (editing && (isError || (isSuccess && loaded === null))) return <p role="alert">找不到这个 AI 助手。</p>;

  // 派生当前草稿（避免在 effect 里同步 setState 触发 lint 警告）：未编辑时用回填/空草稿。
  const current = draft ?? loaded ?? emptyDraft();
  const update = (patch: Partial<AgentDraft>) =>
    setDraft((d) => ({ ...(d ?? loaded ?? emptyDraft()), ...patch }));

  /** 保存（可选保存后立即测试运行一次）：Validate → Apply → 成功才跳转；任何异常都复位 busy 并给人话提示。 */
  async function saveAndRun(runAfter: boolean) {
    setBusy(true);
    setIssues([]);
    try {
      const s = loadConnectionSettings();
      const spec = draftToProjectSpec(current);
      const vres = await validateProject(s, spec);
      if (!vres.valid) {
        setIssues(vres.issues);
        return;
      }
      const ares = await applyProject(s, spec);
      // applied:false 且无 issues 时也按失败处理（不能当成成功继续跳转/跑 Run）。
      if (!ares.applied || ares.issues.length > 0) {
        setIssues(
          ares.issues.length > 0
            ? ares.issues
            : [{ severity: 2, path: '', message: '保存失败，请稍后再试。' }],
        );
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['agents'] });
      if (runAfter) {
        // A test run retains its sandbox conversation; saving still starts no run at all.
        const pid = ares.project?.summary?.projectId ?? '';
        const run = await startInteractiveAgentRun(s, { projectId: pid, agentName: spec.name, prompt: current.prompt });
        navigate(`/console/runs/${run.runId}`);
      } else {
        navigate('/console/agents');
      }
    } catch {
      setIssues([{ severity: 2, path: '', message: '连不上后台服务，请检查连接后重试。' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wizard-shell">
      <div className="wizard-shell__panel">
        <h1>{editing ? '编辑 AI 助手' : '新建 AI 助手'}</h1>
        <WizardStepBar steps={CREATE_STEPS} currentStep={step} onStepClick={goTo} />
        {step > 0 && (
          <button type="button" className="setup-back" onClick={goBack}>← 上一步</button>
        )}
        {step === 0 && <EngineStep draft={current} update={update} goNext={goNext} goBack={goBack} />}
        {step === 1 && <TaskStep draft={current} update={update} goNext={goNext} goBack={goBack} />}
        {step === 2 && <ScheduleStep draft={current} update={update} goNext={goNext} goBack={goBack} />}
        {step === 3 && <MaterialsStep draft={current} update={update} goNext={goNext} goBack={goBack} />}
        {step === 4 && (
          <ConfirmStep
            draft={current}
            issues={issues}
            busy={busy}
            update={update}
            onJumpTo={goTo}
            onTestRun={() => void saveAndRun(true)}
            onSave={() => void saveAndRun(false)}
          />
        )}
      </div>
    </main>
  );
}
