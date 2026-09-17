import { execFileSync } from 'node:child_process';

const env = {
  ...process.env,
  JOB_HARNESS_AUTH_TOKEN: 'deployment-check-token',
  JOB_HARNESS_DATA_DIR: '/tmp/job-harness-deployment-check-data',
  JOB_HARNESS_WEB_BIND: '127.0.0.1',
  JOB_HARNESS_WEB_PORT: '3199',
  JOB_HARNESS_IMAGE: 'job-harness:deployment-check',
  JOB_HARNESS_RENDERER_IMAGE: 'job-harness-renderer:deployment-check',
};

const raw = execFileSync('docker', ['compose', 'config', '--format', 'json'], {
  cwd: new URL('..', import.meta.url),
  env,
  encoding: 'utf8',
});
const config = JSON.parse(raw);
const server = config.services?.server;
const web = config.services?.web;
const renderer = config.services?.renderer;

function invariant(condition, message) {
  if (!condition) throw new Error(`Deployment invariant failed: ${message}`);
}

invariant(renderer && server && web, 'compose must define renderer, server and web services');
invariant(!renderer.ports || renderer.ports.length === 0, 'renderer must not publish a host port');
invariant((renderer.expose ?? []).map(String).includes('3002'), 'renderer must expose port 3002 only to the compose network');
invariant(!server.ports || server.ports.length === 0, 'server must not publish a host port');
invariant((server.expose ?? []).map(String).includes('3000'), 'server must expose port 3000 only to the compose network');
invariant(Array.isArray(web.ports) && web.ports.length === 1, 'web must publish exactly one host port');
const webPort = web.ports[0];
invariant(String(webPort.host_ip) === '127.0.0.1', 'web must bind to loopback by default');
invariant(String(webPort.published) === '3199' && Number(webPort.target) === 3001, 'web port mapping must honor deployment env');
invariant(web.environment?.JOB_HARNESS_API_URL === 'http://server:3000/api/v1', 'web must reach API through the private compose network');
invariant(server.environment?.JOB_HARNESS_AUTH_TOKEN === 'deployment-check-token', 'server bearer must be injected');
invariant(web.environment?.JOB_HARNESS_AUTH_TOKEN === 'deployment-check-token', 'web must receive the bearer only in server-side runtime');
invariant(server.depends_on?.renderer?.condition === 'service_healthy', 'server must wait for renderer health');
invariant(server.environment?.JOB_HARNESS_RESUME_RENDERER_URL === 'http://renderer:3002', 'server must reach renderer through the private compose network');
invariant(server.environment?.JOB_HARNESS_RESUME_ARTIFACT_DIR === '/data/resume-artifacts', 'server must persist Resume artifacts in the durable data mount');
invariant(web.depends_on?.server?.condition === 'service_healthy', 'web must wait for server health');
invariant((renderer.security_opt ?? []).includes('no-new-privileges:true'), 'renderer must enable no-new-privileges');
invariant(renderer.read_only === true, 'renderer filesystem must be read-only except tmpfs');
invariant((server.security_opt ?? []).includes('no-new-privileges:true'), 'server must enable no-new-privileges');
invariant((web.security_opt ?? []).includes('no-new-privileges:true'), 'web must enable no-new-privileges');

console.log('deployment topology ok: private renderer/API, durable Resume artifacts, loopback Web, bearer boundary, health dependency');
