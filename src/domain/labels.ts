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
