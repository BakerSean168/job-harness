import { execFileSync } from 'node:child_process';

const env = {
  ...process.env,
  JOB_HARNESS_AUTH_TOKEN: 'deployment-check-token',
  JOB_HARNESS_DATA_DIR: '/tmp/job-harness-deployment-check-data',
  JOB_HARNESS_WEB_BIND: '127.0.0.1',
  JOB_HARNESS_WEB_PORT: '3199',
  JOB_HARNESS_IMAGE: 'job-harness:deployment-check',
};

const raw = execFileSync('docker', ['compose', 'config', '--format', 'json'], {
  cwd: new URL('..', import.meta.url),
  env,
  encoding: 'utf8',
});
const config = JSON.parse(raw);
const server = config.services?.server;
const web = config.services?.web;

function invariant(condition, message) {
  if (!condition) throw new Error(`Deployment invariant failed: ${message}`);
}

invariant(server && web, 'compose must define server and web services');
invariant(!server.ports || server.ports.length === 0, 'server must not publish a host port');
invariant((server.expose ?? []).map(String).includes('3000'), 'server must expose port 3000 only to the compose network');
invariant(Array.isArray(web.ports) && web.ports.length === 1, 'web must publish exactly one host port');
const webPort = web.ports[0];
invariant(String(webPort.host_ip) === '127.0.0.1', 'web must bind to loopback by default');
invariant(String(webPort.published) === '3199' && Number(webPort.target) === 3001, 'web port mapping must honor deployment env');
invariant(web.environment?.JOB_HARNESS_API_URL === 'http://server:3000/api/v1', 'web must reach API through the private compose network');
invariant(server.environment?.JOB_HARNESS_AUTH_TOKEN === 'deployment-check-token', 'server bearer must be injected');
invariant(web.environment?.JOB_HARNESS_AUTH_TOKEN === 'deployment-check-token', 'web must receive the bearer only in server-side runtime');
invariant(server.depends_on == null, 'server must not depend on web');
invariant(web.depends_on?.server?.condition === 'service_healthy', 'web must wait for server health');
invariant((server.security_opt ?? []).includes('no-new-privileges:true'), 'server must enable no-new-privileges');
invariant((web.security_opt ?? []).includes('no-new-privileges:true'), 'web must enable no-new-privileges');

console.log('deployment topology ok: private API, loopback Web, bearer boundary, health dependency');
