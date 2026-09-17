import { startResumeRendererServer } from './server';

const host = process.env.JOB_HARNESS_RENDERER_HOST ?? '127.0.0.1';
const port = Number.parseInt(process.env.JOB_HARNESS_RENDERER_PORT ?? '3002', 10);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid JOB_HARNESS_RENDERER_PORT');
const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH ?? '/usr/bin/chromium';
const authToken = process.env.JOB_HARNESS_RENDERER_TOKEN ?? null;

const running = await startResumeRendererServer({ host, port, executablePath, authToken });
console.log(`Resume renderer listening at ${running.url}`);
console.log(`Renderer: ${running.rendererId}@${running.rendererVersion}`);

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  console.log(`Received ${signal}; shutting down Resume renderer`);
  await running.close();
  process.exit(0);
}
process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
