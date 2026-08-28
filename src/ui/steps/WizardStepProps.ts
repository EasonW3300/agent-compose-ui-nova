import type { AgentDraft } from '../../domain/agentDraft';

export interface WizardStepProps {
  draft: AgentDraft;
  update: (patch: Partial<AgentDraft>) => void;
  goNext: () => void;
  goBack: () => void;
}
