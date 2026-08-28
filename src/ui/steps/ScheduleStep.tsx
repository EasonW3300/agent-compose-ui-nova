import { useState } from 'react';
import type { ScheduleInput } from '../../domain/schedule';
import { describeSchedule } from '../../domain/schedule';
import type { WizardStepProps } from './WizardStepProps';

const WEEK_OPTIONS = [
  { value: 1, label: '周一' }, { value: 2, label: '周二' }, { value: 3, label: '周三' },
  { value: 4, label: '周四' }, { value: 5, label: '周五' }, { value: 6, label: '周六' }, { value: 0, label: '周日' },
];

type Mode = 'manual' | 'scheduled' | 'interval';
function modeOf(s: ScheduleInput): Mode {
  return s.kind === 'manual' ? 'manual' : s.kind === 'interval' ? 'interval' : 'scheduled';
}

export function ScheduleStep({ draft, update, goNext }: WizardStepProps) {
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const mode = modeOf(draft.schedule);

  function setMode(next: Mode) {
    if (next === 'manual') update({ schedule: { kind: 'manual' } });
    else if (next === 'interval') update({ schedule: { kind: 'interval', minutes: 0 } });
    else update({ schedule: { kind: 'daily', hour: 9, minute: 0 } });
  }

  function next() {
    if (mode === 'interval' && draft.schedule.kind === 'interval' && draft.schedule.minutes <= 0) {
      setError('间隔要大于 0 分钟。');
      return;
    }
    goNext();
  }

  const sched = draft.schedule;

  return (
    <section aria-label="什么时候干活">
      <h2>什么时候让它干活？</h2>
      <fieldset>
        <legend className="sr-only">触发方式</legend>
        <label className="engine-card">
          <input type="radio" name="mode" checked={mode === 'manual'} onChange={() => setMode('manual')} />
          <strong>手动</strong><span>我点「立即运行」它才干活</span>
        </label>
        <label className="engine-card">
          <input type="radio" name="mode" checked={mode === 'scheduled'} onChange={() => setMode('scheduled')} />
          <strong>定时</strong><span>每天或每周固定时间自动干</span>
        </label>
        <label className="engine-card">
          <input type="radio" name="mode" checked={mode === 'interval'} onChange={() => setMode('interval')} />
          <strong>固定间隔</strong><span>每隔一段时间自动干一次</span>
        </label>
      </fieldset>

      {mode === 'scheduled' && (sched.kind === 'daily' || sched.kind === 'weekly') && (
        <fieldset>
          <legend>定时间隔</legend>
          <label>
            <input type="radio" name="submode" checked={sched.kind === 'daily'} onChange={() => update({ schedule: { kind: 'daily', hour: 9, minute: 0 } })} />
            每天
          </label>
          <label>
            <input type="radio" name="submode" checked={sched.kind === 'weekly'} onChange={() => update({ schedule: { kind: 'weekly', days: [1], hour: 9, minute: 0 } })} />
            每周
          </label>
          {sched.kind === 'weekly' && (
            <div className="week-picker">
              {WEEK_OPTIONS.map((w) => (
                <label key={w.value}>
                  <input
                    type="checkbox"
                    checked={sched.days.includes(w.value)}
                    onChange={(e) => {
                      const days = e.target.checked
                        ? [...new Set([...sched.days, w.value])].sort()
                        : sched.days.filter((d) => d !== w.value);
                      update({ schedule: { ...sched, days } });
                    }}
                  />
                  {w.label}
                </label>
              ))}
            </div>
          )}
          <label htmlFor="sched-hour">几点</label>
          <input id="sched-hour" type="number" min={0} max={23} value={sched.hour} onChange={(e) => update({ schedule: { ...sched, hour: Number(e.target.value) } })} />
          <label htmlFor="sched-minute">几分</label>
          <input id="sched-minute" type="number" min={0} max={59} value={sched.minute} onChange={(e) => update({ schedule: { ...sched, minute: Number(e.target.value) } })} />
        </fieldset>
      )}

      {mode === 'interval' && sched.kind === 'interval' && (
        <label htmlFor="sched-interval">间隔分钟数</label>
      )}
      {mode === 'interval' && sched.kind === 'interval' && (
        <input id="sched-interval" type="number" min={1} value={sched.minutes} onChange={(e) => update({ schedule: { ...sched, minutes: Number(e.target.value) } })} />
      )}

      <p className="agent-card__meta">当前选择：{describeSchedule(draft.schedule)}</p>
      {error && <p role="alert">{error}</p>}

      <button type="button" className="setup-btn setup-btn--ghost" onClick={() => setShowAdvanced((v) => !v)}>
        {showAdvanced ? '收起高级设置' : '高级设置'}
      </button>
      {showAdvanced && (
        <div className="wizard-advanced">
          <label htmlFor="sched-timeout">超时分钟数</label>
          <input
            id="sched-timeout"
            type="number"
            min={1}
            value={draft.timeoutMinutes ?? ''}
            placeholder="留空用默认"
            onChange={(e) => update({ timeoutMinutes: e.target.value ? Number(e.target.value) : undefined })}
          />
        </div>
      )}
      <div className="wizard-nav">
        <button type="button" className="setup-btn" onClick={next}>继续</button>
      </div>
    </section>
  );
}
