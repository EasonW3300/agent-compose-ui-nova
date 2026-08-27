import { describe, expect, it } from 'vitest';
import { buildCronExpr, buildIntervalString, describeSchedule } from './schedule';

describe('buildCronExpr', () => {
  it('每天 8 点 -> "0 8 * * *"', () => {
    expect(buildCronExpr({ kind: 'daily', hour: 8, minute: 0 })).toBe('0 8 * * *');
  });
  it('周一和周五 9 点半 -> "30 9 * * 1,5"', () => {
    expect(buildCronExpr({ kind: 'weekly', days: [5, 1], hour: 9, minute: 30 })).toBe(
      '30 9 * * 1,5',
    );
  });
});

describe('buildIntervalString', () => {
  it('90 分钟 -> 1h30m', () => {
    expect(buildIntervalString(90)).toBe('1h30m');
  });
  it('45 分钟 -> 45m', () => {
    expect(buildIntervalString(45)).toBe('45m');
  });
  it('24 小时整 -> 24h', () => {
    expect(buildIntervalString(1440)).toBe('24h');
  });
});

describe('describeSchedule', () => {
  it('手动触发的人话', () => {
    expect(describeSchedule({ kind: 'manual' })).toBe('我点了它才干活');
  });
  it('定时的人话（整点）', () => {
    expect(describeSchedule({ kind: 'daily', hour: 8, minute: 0 })).toBe('每天早上 8 点');
  });
  it('定时的人话（半点）', () => {
    expect(describeSchedule({ kind: 'daily', hour: 14, minute: 30 })).toBe('每天下午 2 点半');
  });
  it('间隔的人话', () => {
    expect(describeSchedule({ kind: 'interval', minutes: 90 })).toBe('每 1 小时 30 分钟一次');
  });
  it('周几的人话', () => {
    expect(describeSchedule({ kind: 'weekly', days: [1], hour: 9, minute: 30 })).toBe(
      '每周一 早上 9 点半',
    );
  });
});
