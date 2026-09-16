export function StatusBadge({ label, value }: { label: string; value: string }) {
  return <span className="status-badge" data-status={value}>{label}</span>;
}
