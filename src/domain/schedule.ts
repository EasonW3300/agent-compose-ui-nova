export type ScheduleInput =
  | { kind: 'manual' }
  | { kind: 'daily'; hour: number; minute: number }
  | { kind: 'weekly'; days: number[]; hour: number; minute: number } // 0=周日
  | { kind: 'interval'; minutes: number };

const WEEK_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** daily/weekly 转标准 5 位 cron 表达式；manual/interval 不是 cron。 */
export function buildCronExpr(
  input: Extract<ScheduleInput, { kind: 'daily' | 'weekly' }>,
): string {
  if (input.kind === 'daily') {
    return `${input.minute} ${input.hour} * * *`;
  }
  const days = [...new Set(input.days)].sort((a, b) => a - b).join(',');
  return `${input.minute} ${input.hour} * * ${days}`;
}

/** 分钟数 → Go duration 风格字符串（与上游 interval 字段一致），如 90 → "1h30m"。 */
export function buildIntervalString(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join('');
}

function formatMinutes(minute: number): string {
  if (minute === 0) return ' 点';
  if (minute === 30) return ' 点半';
  return ` 点 ${String(minute).padStart(2, '0')} 分`;
}

function formatTimeOfDay(hour: number): string {
  if (hour < 11) return '早上';
  if (hour < 13) return '中午';
  if (hour < 18) return '下午';
  return '晚上';
}

function formatHour(hour: number): string {
  return String(hour % 12 === 0 ? 12 : hour % 12);
}

export function describeSchedule(input: ScheduleInput): string {
  switch (input.kind) {
    case 'manual':
      return '我点了它才干活';
    case 'daily':
      return `每天${formatTimeOfDay(input.hour)} ${formatHour(input.hour)}${formatMinutes(input.minute)}`;
    case 'weekly': {
      const dayLabel = input.days.map((d) => WEEK_LABELS[d] ?? '').join('、');
      return `每${dayLabel} ${formatTimeOfDay(input.hour)} ${formatHour(input.hour)}${formatMinutes(input.minute)}`;
    }
    case 'interval': {
      const h = Math.floor(input.minutes / 60);
      const m = input.minutes % 60;
      const span = h > 0 ? (m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`) : `${m} 分钟`;
      return `每 ${span}一次`;
    }
  }
}
