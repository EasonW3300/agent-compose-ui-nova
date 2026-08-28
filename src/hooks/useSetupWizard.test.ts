import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSetupWizard } from './useSetupWizard';

describe('useSetupWizard', () => {
  it('初始在第 0 步，canGoBack=false，isLast=false', () => {
    const { result } = renderHook(() => useSetupWizard(5));
    expect(result.current.step).toBe(0);
    expect(result.current.canGoBack).toBe(false);
    expect(result.current.isLast).toBe(false);
  });
  it('goNext 前进到第 1 步并允许返回', () => {
    const { result } = renderHook(() => useSetupWizard(5));
    act(() => result.current.goNext());
    expect(result.current.step).toBe(1);
    expect(result.current.canGoBack).toBe(true);
  });
  it('到达最后一屏后 goNext 不再前进，isLast=true', () => {
    const { result } = renderHook(() => useSetupWizard(2));
    act(() => result.current.goNext());
    act(() => result.current.goNext());
    expect(result.current.step).toBe(1);
    expect(result.current.isLast).toBe(true);
  });
  it('goBack 不会低于第 0 步', () => {
    const { result } = renderHook(() => useSetupWizard(5));
    act(() => result.current.goBack());
    expect(result.current.step).toBe(0);
  });
  it('支持指定初始步（编辑态直达确认页）', () => {
    const { result } = renderHook(() => useSetupWizard(5, 4));
    expect(result.current.step).toBe(4);
    expect(result.current.isLast).toBe(true);
    act(() => result.current.goNext()); // 最后一屏不再前进
    expect(result.current.step).toBe(4);
    act(() => result.current.goBack());
    expect(result.current.step).toBe(3);
  });
  it('goTo 只能跳到已访问过的步（≤ 当前步）', () => {
    const { result } = renderHook(() => useSetupWizard(5));
    act(() => result.current.goTo(3)); // 未访问过，被忽略
    expect(result.current.step).toBe(0);
    act(() => result.current.goNext()); // step 1
    act(() => result.current.goTo(2)); // 超过当前步，被忽略
    expect(result.current.step).toBe(1);
    act(() => result.current.goTo(0));
    expect(result.current.step).toBe(0);
  });
});
