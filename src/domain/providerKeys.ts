import type { ProviderId } from './labels';

export interface ProviderKeyDef {
  provider: ProviderId;
  label: string;
  hint: string;
  envVarName: string;
}

/**
 * 单条全局环境变量的结构形态。
 * 注意：daemon 侧的实际类型是带 $typeName 的 Message；这里只按结构使用，
 * 跨 RPC 时由字段 schema 序列化，因此纯对象同样合法。
 */
export interface ProviderKeyEnvVar {
  name: string;
  value?: string;
  secret: boolean;
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
  existing: ProviderKeyEnvVar[],
  updates: { envVarName: string; value: string }[],
): ProviderKeyEnvVar[] {
  const next: ProviderKeyEnvVar[] = existing.map((e) =>
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
  existing: ProviderKeyEnvVar[],
  defs: ProviderKeyDef[],
): Record<string, 'configured' | 'missing'> {
  const present = new Set(existing.map((e) => e.name));
  const status: Record<string, 'configured' | 'missing'> = {};
  for (const def of defs) status[def.envVarName] = present.has(def.envVarName) ? 'configured' : 'missing';
  return status;
}
