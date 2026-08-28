import { describeSchedule } from '../../domain/schedule';
import { draftToComposeYaml } from '../../domain/composeYaml';
import { issuePathToStep } from '../../domain/projectSpec';
import type { AgentDraft } from '../../domain/agentDraft';

export interface ConfirmIssue {
  severity: number;
  path: string;
  message: string;
}

interface Props {
  draft: AgentDraft;
  issues: ConfirmIssue[];
  busy: boolean;
  update: (patch: Partial<AgentDraft>) => void;
  onTestRun: () => void;
  onSave: () => void;
  onJumpTo: (step: number) => void;
}

export function ConfirmStep({ draft, issues, busy, update, onTestRun, onSave, onJumpTo }: Props) {
  const yaml = draftToComposeYaml({ ...draft, name: draft.name || draft.displayName });
  return (
    <section aria-label="确认创建">
      <h2>确认一下</h2>
      <label htmlFor="confirm-name">AI 助手名字</label>
      <input
        id="confirm-name"
        type="text"
        value={draft.displayName}
        onChange={(e) => update({ displayName: e.target.value })}
      />
      <dl className="confirm-summary">
        <dt>名字</dt><dd>{draft.displayName}</dd>
        <dt>AI 引擎</dt><dd>{draft.provider}</dd>
        <dt>什么时候干活</dt><dd>{describeSchedule(draft.schedule)}</dd>
        <dt>任务说明</dt><dd>{draft.prompt}</dd>
        <dt>工作材料</dt>
        <dd>
          {draft.workspace.kind === 'local' ? `本地：${draft.workspace.path}` : draft.workspace.kind === 'git' ? `Git：${draft.workspace.url}` : '隔离工作台'}
        </dd>
      </dl>
      {issues.length > 0 && (
        <div role="alert" className="confirm-issues">
          {issues.map((issue, i) => {
            const targetStep = issuePathToStep(issue.path);
            return (
              <p key={i}>
                {issue.message}
                {/* 定位不到具体步骤（项目级/name 问题）就停在确认页，隐藏回跳按钮 */}
                {targetStep < 4 && (
                  <button type="button" className="setup-btn setup-btn--ghost" onClick={() => onJumpTo(targetStep)}>
                    回第 {targetStep + 1} 步修改
                  </button>
                )}
              </p>
            );
          })}
        </div>
      )}
      <details role="region" aria-label="YAML 预览">
        <summary>YAML 预览</summary>
        <pre>{yaml}</pre>
      </details>
      <div className="wizard-nav">
        <button type="button" className="setup-btn" disabled={busy} onClick={onTestRun}>测试运行一次</button>
        <button type="button" className="setup-btn" disabled={busy} onClick={onSave}>保存</button>
      </div>
    </section>
  );
}
