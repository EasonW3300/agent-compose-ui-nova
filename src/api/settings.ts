import { createClient } from '@connectrpc/connect';
import { createDaemonTransport, type ConnectionSettings } from './connection';
import { SettingsService, type EnvVarSpec } from './gen/agentcompose/v2/agentcompose_pb';
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
