export function PagePlaceholder({ title, note }: { title: string; note: string }) {
  return (
    <section className="console-page">
      <h2>{title}</h2>
      <p>{note}</p>
    </section>
  );
}
