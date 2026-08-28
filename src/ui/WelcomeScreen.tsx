export function WelcomeScreen({ onNext }: { onNext: () => void }) {
  return (
    <section className="welcome" aria-label="欢迎">
      <div className="welcome__hero" role="img" aria-label="一个 AI 助手在小屋里替主人干活的插图">
        🏠🤖🧹
      </div>
      <h2>欢迎使用 agent-compose</h2>
      <p className="welcome__lead">
        <strong>AI 助手 = 你描述任务，它到隔离的小屋里替你干。</strong>
      </p>
      <p>你不用懂代码、不用懂配置文件。跟着下面的向导，几分钟就能让它跑起来。</p>
      <button type="button" className="setup-btn" onClick={onNext}>开始安装</button>
    </section>
  );
}
