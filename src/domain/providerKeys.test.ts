import { describe, expect, it } from 'vitest';
import { applyProviderKeyUpdates, providerKeyStatus, PROVIDER_KEY_DEFS } from './providerKeys';

describe('applyProviderKeyUpdates', () => {
  const existing = [
    { name: 'FOO', value: 'bar', secret: false },
    { name: 'ANTHROPIC_API_KEY', value: 'redacted', secret: true },
  ];
  it('保留既有项；secret 项省略 value 以保留原值', () => {
    const next = applyProviderKeyUpdates(existing, []);
    expect(next).toEqual([
      { name: 'FOO', value: 'bar', secret: false },
      { name: 'ANTHROPIC_API_KEY', secret: true },
    ]);
  });
  it('设置新密钥（secret），同名的旧项被替换去重', () => {
    const next = applyProviderKeyUpdates(existing, [
      { envVarName: 'ANTHROPIC_API_KEY', value: 'sk-new' },
      { envVarName: 'OPENAI_API_KEY', value: 'sk-oa' },
    ]);
    expect(next).toEqual([
      { name: 'FOO', value: 'bar', secret: false },
      { name: 'ANTHROPIC_API_KEY', value: 'sk-new', secret: true },
      { name: 'OPENAI_API_KEY', value: 'sk-oa', secret: true },
    ]);
  });
  it('值为空串表示不动该密钥（保留原值）', () => {
    const next = applyProviderKeyUpdates(existing, [{ envVarName: 'ANTHROPIC_API_KEY', value: '' }]);
    expect(next).toEqual([
      { name: 'FOO', value: 'bar', secret: false },
      { name: 'ANTHROPIC_API_KEY', secret: true },
    ]);
  });
});

describe('providerKeyStatus', () => {
  it('按 envVarName 判定已配置/缺失', () => {
    const status = providerKeyStatus([{ name: 'ANTHROPIC_API_KEY', value: 'x', secret: true }], PROVIDER_KEY_DEFS);
    expect(status.ANTHROPIC_API_KEY).toBe('configured');
    expect(status.OPENAI_API_KEY).toBe('missing');
  });
});
