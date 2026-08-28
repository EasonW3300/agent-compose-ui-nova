// src/ui/StepPlaceholder.tsx —— 临时脚手架，Task 4-7 逐个替换，Task 7 删除
export function StepPlaceholder({ title }: { title: string }) {
  return (
    <section className="step-placeholder" aria-label={title}>
      <h2>{title}</h2>
      <p>这一步会在本阶段的后续任务里上线。</p>
    </section>
  );
}
