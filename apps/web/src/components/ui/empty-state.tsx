import type { LucideIcon } from 'lucide-react';

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <section className="empty-state" aria-labelledby="empty-state-title">
      <div className="empty-state-icon"><Icon aria-hidden="true" size={20} /></div>
      <h2 id="empty-state-title">{title}</h2>
      <p>{description}</p>
    </section>
  );
}
