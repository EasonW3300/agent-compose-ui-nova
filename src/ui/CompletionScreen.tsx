export function CompletionScreen() {
  return (
    <section className="completion" aria-label="完成">
      <div className="completion__hero" role="img" aria-label="庆祝">
        🎉
      </div>
      <h2>搞定了！</h2>
      <p>agent-compose 正在自动接入，马上就带你进入主控台。</p>
      <p className="completion__hint">
        如果页面没有自动跳转，稍等几秒——它每 3 秒会自动检查一次。
      </p>
    </section>
  );
}
