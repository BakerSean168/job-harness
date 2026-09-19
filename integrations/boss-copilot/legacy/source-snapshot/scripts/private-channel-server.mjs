import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const channelRoot = path.join(root, '.local', 'channel');
const host = process.env.JAC_CHANNEL_HOST || '127.0.0.1';
const port = Number(process.env.JAC_CHANNEL_PORT || 18789);

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    setCommonHeaders(res);
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method_not_allowed' });
    if (url.pathname === '/api/health') return sendJson(res, 200, { ok: true, service: 'job-application-copilot-private-channel' }, req.method === 'HEAD');
    if (url.pathname === '/channel.json' || url.pathname === '/api/channel.json') return sendFile(res, path.join(channelRoot, 'channel.json'), 'application/json; charset=utf-8', req.method === 'HEAD', 'no-store');
    if (url.pathname === '/api/profile-bundle.json') return sendFile(res, path.join(channelRoot, 'profile-bundle.json'), 'application/json; charset=utf-8', req.method === 'HEAD', 'no-store');
    if (url.pathname === '/install.ps1') return sendFile(res, path.join(channelRoot, 'install.ps1'), 'text/plain; charset=utf-8', req.method === 'HEAD', 'no-store');
    if (url.pathname === '/boss-chrome.ps1') return sendFile(res, path.join(channelRoot, 'boss-chrome.ps1'), 'text/plain; charset=utf-8', req.method === 'HEAD', 'no-store');
    if (url.pathname.startsWith('/boss/')) {
      const name = path.basename(url.pathname);
      if (!/^[A-Za-z0-9._-]+\.user\.js$/.test(name)) return sendJson(res, 404, { error: 'not_found' });
      return sendFile(res, path.join(channelRoot, 'boss', name), 'text/javascript; charset=utf-8', req.method === 'HEAD', 'private, max-age=60');
    }
    if (url.pathname.startsWith('/api/resumes/')) {
      const name = path.basename(url.pathname);
      if (!/^[A-Za-z0-9._-]+\.pdf$/.test(name)) return sendJson(res, 404, { error: 'not_found' });
      return sendFile(res, path.join(channelRoot, 'resumes', name), 'application/pdf', req.method === 'HEAD', 'private, max-age=60');
    }
    if (url.pathname.startsWith('/download/')) {
      const name = path.basename(url.pathname);
      if (!/^job-application-copilot-[A-Za-z0-9._-]+\.zip$/.test(name)) return sendJson(res, 404, { error: 'not_found' });
      res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
      return sendFile(res, path.join(channelRoot, name), 'application/zip', req.method === 'HEAD', 'private, max-age=60');
    }
    if (url.pathname === '/' || url.pathname === '/index.html') return sendIndex(res, req.method === 'HEAD');
    return sendJson(res, 404, { error: 'not_found' });
  } catch (error) {
    return sendJson(res, 500, { error: 'internal_error', message: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, host, () => console.log(`Job Application Copilot private channel listening on http://${host}:${port}`));

function sendIndex(res, headOnly) {
  const channelPath = path.join(channelRoot, 'channel.json');
  if (!fs.existsSync(channelPath)) {
    return sendHtml(res, 503, '<h1>Private channel not published yet</h1><p>Run <code>pnpm private:publish</code>.</p>', headOnly);
  }

  const channel = JSON.parse(fs.readFileSync(channelPath, 'utf8'));
  const version = escapeHtml(channel.extension?.version || 'unknown');
  const publishedAt = escapeHtml(channel.publishedAt || '');
  const sha = escapeHtml(channel.extension?.sha256 || '');
  const profileNames = (channel.profile?.profiles || []).map((item) => escapeHtml(item.label || item.id)).join(' / ');
  const bossBaseUrl = escapeHtml(channel.boss?.publicBaseUrl || '');
  const steelViewerUrl = escapeHtml(channel.browser?.liveViewUrl || 'https://oracle.taile92a8e.ts.net:10445/ui');
  const localChromeLauncherPath = escapeHtml(channel.browser?.localChromeLauncherPath || '/boss-chrome.ps1');
  const bossUserscripts = Array.isArray(channel.boss?.userscripts) ? channel.boss.userscripts : [];
  const bossLinks = bossUserscripts.length > 0
    ? `<ul>${bossUserscripts.map((item) => {
        const mode = item.mode === 'screening-only' ? '筛查测试' : '自动首次打招呼';
        return `<li><a href="${escapeHtml(item.path || '#')}">${escapeHtml(item.label || item.id)} · ${escapeHtml(mode)}</a> <code>${escapeHtml(item.id || '')}</code></li>`;
      }).join('')}</ul>`
    : '<p class="muted">BOSS userscript 尚未发布。</p>';

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Job Application Copilot Private Channel</title>
  <style>
    body{font-family:system-ui,sans-serif;max-width:800px;margin:48px auto;padding:0 20px;line-height:1.6;color:#222}
    a.button{display:inline-block;padding:10px 16px;border-radius:10px;background:#0f6b4f;color:#fff;text-decoration:none}
    code{word-break:break-all;background:#f2f2f2;padding:2px 5px;border-radius:5px}
    .muted{color:#666}.card{border:1px solid #ddd;border-radius:14px;padding:18px;margin:18px 0}
    li{margin:6px 0}
  </style>
</head>
<body>
  <h1>Job Application Copilot</h1>
  <p class="muted">Oracle2 私有 Tailnet 下载 / 同步通道。只有能访问该 Tailscale tailnet 的设备才能连接。</p>

  <div class="card">
    <h2>扩展 ${version}</h2>
    <p><a class="button" href="${escapeHtml(channel.extension?.latestDownloadPath || '#')}">下载最新版 ZIP</a></p>
    <p>发布时间：${publishedAt}</p>
    <p>SHA-256：<code>${sha}</code></p>
  </div>

  <div class="card">
    <h2>Resume Profile Bundle</h2>
    <p>${profileNames}</p>
    <p>扩展内点击“从 Oracle2 同步资料”即可拉取最新资料，无需重新安装扩展。</p>
  </div>

  <div class="card">
    <h2>BOSS Browser Provider</h2>
    <p><a class="button" href="${steelViewerUrl}">打开 Steel Live View</a></p>
    <p>当前主路径：Oracle2 自建 Steel + Playwright。登录、短信验证或安全验证由你在 Live View 中人工完成；登录态会保存为本地 Context，后续筛查 Session 复用。</p>
    <p><a href="${localChromeLauncherPath}">下载 Windows 专用 Chrome 启动脚本</a>，用于本机 Chrome + CDP 备用路径。</p>
    <p class="muted">Steel Live View 仅通过 Tailscale tailnet 暴露；浏览器筛查 runner 只读取岗位和 JD，不创建聊天、不发送简历。</p>
  </div>

  <div class="card">
    <h2>BOSS screening-first companion</h2>
    <p><strong>先安装“筛查测试”脚本。</strong>它会读取真实岗位和 JD、调用 Oracle2 评分并记录结果，但不会创建聊天、不会打招呼、不会发送简历。筛查结果稳定后，再切换到“自动首次打招呼”脚本。</p>
    ${bossLinks}
    <p class="muted">后端：<code>${bossBaseUrl}</code>。筛查汇总接口：<code>${bossBaseUrl}/api/screening-summary</code>。</p>
  </div>

  <div class="card">
    <h2>Windows 安装 / 更新</h2>
    <p><a href="/install.ps1">下载 PowerShell updater</a></p>
    <p>Updater 会校验 SHA-256，并始终安装到 <code>%LOCALAPPDATA%\JobApplicationCopilot\extension</code>。首次在 Chrome 加载该稳定目录，以后代码升级只需重新运行 updater 后点一次 Reload。</p>
  </div>

  <div class="card">
    <h2>手动安装</h2>
    <ol>
      <li>下载并解压 ZIP。</li>
      <li>打开 <code>chrome://extensions</code>。</li>
      <li>开启开发者模式 → 加载已解压的扩展。</li>
      <li>之后简历内容更新只需要在扩展里同步；只有扩展代码升级时才需要重新下载 ZIP。</li>
    </ol>
  </div>
</body>
</html>`;
  return sendHtml(res, 200, html, headOnly);
}
function sendFile(res, filePath, contentType, headOnly, cacheControl) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return sendJson(res, 404, { error: 'not_found' });
  const stat = fs.statSync(filePath);
  res.statusCode = 200; res.setHeader('Content-Type', contentType); res.setHeader('Content-Length', stat.size); res.setHeader('Cache-Control', cacheControl);
  if (headOnly) return res.end();
  fs.createReadStream(filePath).pipe(res);
}
function sendJson(res, status, value, headOnly = false) { const body = `${JSON.stringify(value, null, 2)}\n`; res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); if (headOnly) return res.end(); res.end(body); }
function sendHtml(res, status, html, headOnly = false) { res.statusCode = status; res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); if (headOnly) return res.end(); res.end(html); }
function setCommonHeaders(res) { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'DENY'); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
