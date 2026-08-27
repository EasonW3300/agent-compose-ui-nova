const STEPS = ['欢迎与图解', '环境自检与安装引导', '首次登录', '密钥配置', '完成'];

export function SetupShell() {
  return (
    <main className="setup-shell">
      <h1>把 AI 助手装进这台电脑</h1>
      <ol className="steps">
        {STEPS.map((step, i) => (
          <li key={step}>
            <span>第 {i + 1} 步</span> · <span>{step}</span>
          </li>
        ))}
      </ol>
      <p className="hint">分步安装向导将在下一个阶段上线。</p>
    </main>
  );
}
