import { Code, ConnectError, createClient } from '@connectrpc/connect';
import { createDaemonTransport, type ConnectionSettings } from './connection';
import { SettingsService, type EnvVarSpec } from './gen/agentcompose/v2/agentcompose_pb';
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

export function errorKind(err: unknown): 'auth' | 'unreachable' | 'other' {
  if (err instanceof ConnectError) {
    if (err.code === Code.Unauthenticated) return 'auth';
    if (err.code === Code.Unavailable || err.code === Code.DeadlineExceeded) return 'unreachable';
  }
  return 'other';
}
