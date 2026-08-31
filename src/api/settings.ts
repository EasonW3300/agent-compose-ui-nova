import { createClient } from '@connectrpc/connect';
import { createDaemonTransport, type ConnectionSettings } from './connection';
import { SettingsService, type CapabilityGatewayConfig, type EnvVarSpec, type WorkspacePreset } from './gen/agentcompose/v2/agentcompose_pb';
import { classifyError, type ErrorKind } from './classify';
import type { ProviderKeyEnvVar } from '../domain/providerKeys';

function settingsClient(s: ConnectionSettings) {
  return createClient(SettingsService, createDaemonTransport(s));
}

export async function getGlobalEnv(s: ConnectionSettings): Promise<EnvVarSpec[]> {
  const res = await settingsClient(s).getGlobalEnv({});
  return res.env;
}

export async function updateGlobalEnv(s: ConnectionSettings, env: ProviderKeyEnvVar[]): Promise<EnvVarSpec[]> {
  const res = await settingsClient(s).updateGlobalEnv({ env });
  return res.env;
}

// 兼容 ProviderKeysScreen 的既有引用：errorKind 即 classifyError。
export const errorKind: (err: unknown) => ErrorKind = classifyError;

export async function getWorkspacePresets(s: ConnectionSettings): Promise<WorkspacePreset[]> {
  const res = await settingsClient(s).listWorkspacePresets({ offset: 0, limit: 100 });
  return res.presets;
}
export async function createWorkspacePreset(s: ConnectionSettings, p: { name: string; type: string; configJson: string }): Promise<void> {
  await settingsClient(s).createWorkspacePreset({ name: p.name, type: p.type, configJson: p.configJson });
}
export async function updateWorkspacePreset(s: ConnectionSettings, p: { presetId: string; name: string; type: string; configJson: string }): Promise<void> {
  await settingsClient(s).updateWorkspacePreset({ presetId: p.presetId, name: p.name, type: p.type, configJson: p.configJson });
}
export async function deleteWorkspacePreset(s: ConnectionSettings, presetId: string): Promise<void> {
  await settingsClient(s).deleteWorkspacePreset({ presetId });
}
export async function getCapabilityGatewayConfig(s: ConnectionSettings): Promise<CapabilityGatewayConfig | undefined> {
  const res = await settingsClient(s).getCapabilityGatewayConfig({});
  return res.config;
}
export async function updateCapabilityGatewayConfig(s: ConnectionSettings, cfg: { addr?: string; token?: string }): Promise<void> {
  await settingsClient(s).updateCapabilityGatewayConfig({ addr: cfg.addr, token: cfg.token });
}
