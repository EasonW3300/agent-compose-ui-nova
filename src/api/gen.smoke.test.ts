import { describe, expect, it } from 'vitest';
import * as healthPb from './gen/health/v1/health_pb';
import * as acPb from './gen/agentcompose/v2/agentcompose_pb';

describe('buf 生成物', () => {
  it('导出 HealthService 且注册了 status 方法', () => {
    const svc = healthPb.HealthService as unknown as {
      method?: Record<string, unknown>;
    };
    expect(healthPb.HealthService).toBeDefined();
    // protobuf-es v2 运行时：method 为键控方法记录（methods 为数组）
    expect(Object.keys(svc.method ?? {})).toContain('status');
  });
  it('导出 ProjectService 与 RunService', () => {
    const mod = acPb as Record<string, unknown>;
    expect(mod.ProjectService).toBeDefined();
    expect(mod.RunService).toBeDefined();
  });
});
