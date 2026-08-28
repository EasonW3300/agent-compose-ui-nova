import { createClient, Code, ConnectError, type Interceptor } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { HealthService } from './gen/health/v1/health_pb';
import { SettingsService } from './gen/agentcompose/v2/agentcompose_pb';

export interface ConnectionSettings {
  /** 空 = 走同源 /api 代理；否则为形如 http://127.0.0.1:7410 的绝对地址 */
  baseUrl: string;
  authToken: string;
}

const STORAGE_KEY = 'acnova.connection';

export function loadConnectionSettings(): ConnectionSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error('empty');
    const parsed = JSON.parse(raw) as Partial<ConnectionSettings>;
    return {
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : '',
      authToken: typeof parsed.authToken === 'string' ? parsed.authToken : '',
    };
  } catch {
    return { baseUrl: '', authToken: '' };
  }
}

export function saveConnectionSettings(s: ConnectionSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function resolveApiBase(s: ConnectionSettings): string {
  if (!s.baseUrl.trim()) return '/api';
  return s.baseUrl.replace(/\/+$/, '');
}

function authInterceptor(token: string): Interceptor {
  return (next) => async (req) => {
    if (token) req.header.set('Authorization', `Bearer ${token}`);
    return next(req);
  };
}

export function createDaemonTransport(s: ConnectionSettings) {
  return createConnectTransport({
    baseUrl: resolveApiBase(s),
    interceptors: [authInterceptor(s.authToken)],
  });
}

/** 探测 daemon 是否在线（Health 服务免鉴权）。任何异常一律判定 down。 */
export async function probeDaemon(s: ConnectionSettings): Promise<'ok' | 'down'> {
  try {
    const client = createClient(HealthService, createDaemonTransport(s));
    await client.status({});
    return 'ok';
  } catch {
    return 'down';
  }
}

export type AccessCheck = 'ok' | 'invalid' | 'unreachable';

/** 探测一个受保护的 RPC：成功=密钥可用（或未启用认证）；401=密钥错误；其他=连不上。 */
export async function checkAccess(s: ConnectionSettings): Promise<AccessCheck> {
  try {
    const client = createClient(SettingsService, createDaemonTransport(s));
    await client.getGlobalEnv({});
    return 'ok';
  } catch (err) {
    if (err instanceof ConnectError && err.code === Code.Unauthenticated) return 'invalid';
    return 'unreachable';
  }
}
