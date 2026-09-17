import { startResumeRendererServer } from './server';
import { readResumeRendererRuntimeConfig } from './runtime-config';

const config = readResumeRendererRuntimeConfig();

const running = await startResumeRendererServer(config);
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
