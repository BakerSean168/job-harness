import { z } from 'zod';

const PortSchema = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(65_535));
function optionalTrimmed(value: string | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized || null;
}

export interface ResumeRendererRuntimeConfig {
  readonly host: string;
  readonly port: number;
  readonly executablePath: string;
  readonly authToken: string | null;
}

export function readResumeRendererRuntimeConfig(env: NodeJS.ProcessEnv = process.env): ResumeRendererRuntimeConfig {
  const host = z.string().trim().min(1).max(255).parse(optionalTrimmed(env.JOB_HARNESS_RENDERER_HOST) ?? '127.0.0.1');
  const authToken = optionalTrimmed(env.JOB_HARNESS_RENDERER_TOKEN);
  if ((host === '0.0.0.0' || host === '::') && !authToken) {
    throw new Error('JOB_HARNESS_RENDERER_TOKEN is required when binding the renderer to a non-loopback interface');
  }
  return {
    host,
    port: PortSchema.parse(optionalTrimmed(env.JOB_HARNESS_RENDERER_PORT) ?? '3002'),
    executablePath: z.string().trim().min(1).max(2000).parse(optionalTrimmed(env.CHROMIUM_EXECUTABLE_PATH) ?? '/usr/bin/chromium'),
    authToken,
  };
}
