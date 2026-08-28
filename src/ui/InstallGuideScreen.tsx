import { useMemo, useState } from 'react';
import { detectOS } from '../domain/os';
import { installPlanFor, OS_LABEL } from '../domain/install';

export function InstallGuideScreen({ onNext }: { onNext: () => void }) {
  const os = useMemo(() => detectOS(), []);
  const plan = useMemo(() => installPlanFor(os), [os]);
  const [copied, setCopied] = useState(false);

  const copyCommand = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="install-guide" aria-label="环境自检与安装引导">
      <h2>环境自检与安装引导</h2>
      <p className="install-guide__os">检测到你的系统：{OS_LABEL[os]}</p>
      <ol className="install-plan">
        {plan.map((s, i) => (
          <li key={i} className={`install-plan__item install-plan__item--${s.kind}`}>
            {s.kind === 'command' ? (
              <>
                <pre className="install-plan__code">{s.code}</pre>
                <button type="button" className="setup-btn setup-btn--ghost" onClick={() => copyCommand(s.code ?? '')}>
                  {copied ? '已复制' : '复制命令'}
                </button>
              </>
            ) : s.kind === 'link' ? (
              <a href={s.href} target="_blank" rel="noreferrer">
                {s.text}
              </a>
            ) : (
              <span>{s.text}</span>
            )}
          </li>
        ))}
      </ol>
      <p className="install-guide__hint">
        跑完安装后，页面会自动检测到 agent-compose 并带你进入主控台。也可以点下面按钮继续手动走完向导。
      </p>
      <button type="button" className="setup-btn" onClick={onNext}>
        我已运行安装脚本，继续
      </button>
    </section>
  );
}
