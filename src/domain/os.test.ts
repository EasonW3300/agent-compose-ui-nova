import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectOS } from './os';

afterEach(() => vi.unstubAllGlobals());

describe('detectOS', () => {
  it('macOS：userAgent 含 mac os', () => {
    vi.stubGlobal('navigator', { ...window.navigator, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' });
    expect(detectOS()).toBe('macos');
  });
  it('Windows：userAgent 含 Windows', () => {
    vi.stubGlobal('navigator', { ...window.navigator, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
    expect(detectOS()).toBe('windows');
  });
  it('Linux：platform 为 Linux', () => {
    vi.stubGlobal('navigator', { ...window.navigator, userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', platform: 'Linux x86_64' });
    expect(detectOS()).toBe('linux');
  });
  it('未知系统返回 unsupported', () => {
    vi.stubGlobal('navigator', { ...window.navigator, userAgent: 'whatever', platform: '' });
    expect(detectOS()).toBe('unsupported');
  });
});
