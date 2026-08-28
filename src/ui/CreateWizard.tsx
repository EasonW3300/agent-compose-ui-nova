import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { loadConnectionSettings } from '../api/connection';
import { getProject, projectRefByName } from '../api/projects';
import { projectSpecToDraft } from '../domain/projectSpec';
import { emptyDraft, type AgentDraft } from '../domain/agentDraft';
import { useSetupWizard } from '../hooks/useSetupWizard';
import { CREATE_STEPS } from './createWizardSteps';
import { WizardStepBar } from './WizardStepBar';
import { EngineStep } from './steps/EngineStep';
import { TaskStep } from './steps/TaskStep';

export function CreateWizard() {
  const { agentName } = useParams();
  const editing = Boolean(agentName);
  const { step, goNext, goBack, goTo } = useSetupWizard(CREATE_STEPS.length);
  // 本地草稿：回填数据（loaded）在用户首次编辑前作为初稿；一旦编辑，以本地草稿为准。
  const [draft, setDraft] = useState<AgentDraft | null>(null);

  const { data: loaded, isError } = useQuery({
    queryKey: ['project-for-edit', agentName],
    queryFn: async () => {
      const s = loadConnectionSettings();
      const project = await getProject(s, projectRefByName(agentName!), true);
      if (!project?.spec) return null;
      return projectSpecToDraft(project.spec, agentName!);
    },
    enabled: editing,
  });

  if (editing && isError) return <p role="alert">找不到这个 AI 助手。</p>;

  // 派生当前草稿（避免在 effect 里同步 setState 触发 lint 警告）：未编辑时用回填/空草稿。
  const current = draft ?? loaded ?? emptyDraft();
  const update = (patch: Partial<AgentDraft>) =>
    setDraft((d) => ({ ...(d ?? loaded ?? emptyDraft()), ...patch }));

  return (
    <main className="wizard-shell">
      <h1>{editing ? '编辑 AI 助手' : '新建 AI 助手'}</h1>
      <WizardStepBar steps={CREATE_STEPS} currentStep={step} onStepClick={goTo} />
      {step > 0 && (
        <button type="button" className="setup-back" onClick={goBack}>← 上一步</button>
      )}
      {step === 0 && <EngineStep draft={current} update={update} goNext={goNext} goBack={goBack} />}
      {step === 1 && <TaskStep draft={current} update={update} goNext={goNext} goBack={goBack} />}
    </main>
  );
}
