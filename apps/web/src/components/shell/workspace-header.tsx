export function WorkspaceHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="workspace-header">
      <div className="workspace-title-block">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="workspace-actions">{actions}</div> : null}
    </header>
  );
}
