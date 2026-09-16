import { WorkspaceHeader } from '@/components/shell/workspace-header';
import { getWebAuthRuntimeConfig } from '@/auth/session';
import { getMessages } from '@/i18n/server';

export default async function SettingsPage() {
  const [messages] = await Promise.all([getMessages()]);
  const config = getWebAuthRuntimeConfig();
  const copy = messages.settingsWorkspace;
  return (
    <div className="workspace-page settings-page">
      <WorkspaceHeader title={messages.pages.settings.title} description={messages.pages.settings.description} />
      <div className="settings-content">
        <section className="settings-panel">
          <div className="management-panel-heading"><h2>{copy.security}</h2></div>
          <div className="settings-row">
            <div><strong>{copy.session}</strong><p>{copy.sessionDescription}</p></div>
            <span className="settings-state" data-enabled={config.enabled && config.configured ? 'true' : undefined}>{config.enabled && config.configured ? copy.enabled : copy.disabled}</span>
          </div>
          <div className="settings-row">
            <div><strong>{copy.apiBoundary}</strong><p>{copy.apiBoundaryDescription}</p></div>
            <span className="settings-state" data-enabled="true">{copy.enabled}</span>
          </div>
          <p className="settings-note">{copy.localOnlyNote}</p>
          {config.enabled && config.configured ? (
            <form method="post" action="/auth/logout" className="settings-logout-form"><button className="action-button" type="submit">{copy.logout}</button></form>
          ) : null}
        </section>

        <section className="settings-panel">
          <div className="management-panel-heading"><h2>{copy.data}</h2></div>
          <div className="settings-row settings-download-row">
            <div><strong>{copy.exportJson}</strong><p>{copy.exportJsonDescription}</p></div>
            <a className="action-button" href="/downloads/export">{copy.download}</a>
          </div>
          <div className="settings-row settings-download-row">
            <div><strong>{copy.backupSqlite}</strong><p>{copy.backupSqliteDescription}</p></div>
            <a className="action-button" href="/downloads/backup">{copy.download}</a>
          </div>
          <p className="settings-note">{copy.backupNote}</p>
        </section>
      </div>
    </div>
  );
}
