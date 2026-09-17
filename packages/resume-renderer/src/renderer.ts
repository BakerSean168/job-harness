import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nunjucks from 'nunjucks';
import { ResolvedResumeSchema, type ResolvedResume } from '@job-harness/resume-contracts';
import { toResumeTemplateContext, type ResumeTemplateContextOptions } from './context';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templatesDir = path.join(packageRoot, 'templates');
const cssPath = path.join(templatesDir, 'styles', 'resume.css');


let rendererFingerprint: string | null = null;

function templateFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? templateFiles(full) : [full];
  }).sort();
}

export function getResumeRendererFingerprint(): string {
  if (rendererFingerprint) return rendererFingerprint;
  const hash = createHash('sha256');
  for (const file of templateFiles(templatesDir)) {
    hash.update(path.relative(templatesDir, file));
    hash.update('\0');
    hash.update(fs.readFileSync(file));
    hash.update('\0');
  }
  rendererFingerprint = hash.digest('hex');
  return rendererFingerprint;
}

function createEnvironment(): nunjucks.Environment {
  return new nunjucks.Environment(
    new nunjucks.FileSystemLoader(templatesDir, { watch: false, noCache: true }),
    { autoescape: true },
  );
}

export interface RenderResumeHtmlOptions extends ResumeTemplateContextOptions {}

export function renderResumeHtml(input: ResolvedResume, options: RenderResumeHtmlOptions = {}): string {
  const resume = ResolvedResumeSchema.parse(input);
  return createEnvironment().render('resume.njk', toResumeTemplateContext(resume, options));
}


export function renderResumePreviewHtml(input: ResolvedResume, options: RenderResumeHtmlOptions = {}): string {
  const html = renderResumeHtml(input, options);
  const css = getResumeCss().replace(/<\/style/gi, '<\\/style');
  return html.replace('<link rel="stylesheet" href="./resume.css" />', `<style data-resume-preview>\n${css}\n</style>`);
}

export function getResumeCss(): string {
  return fs.readFileSync(cssPath, 'utf8');
}


export function rewriteResumePreviewHtml(
  html: string,
  { cssHref = '/api/resume.css', assetsBase = '/assets' }: { cssHref?: string; assetsBase?: string } = {},
): string {
  return html
    .replace(/href="\.\/resume\.css"/g, `href="${cssHref}"`)
    .replace(/src="\.\/assets\//g, `src="${assetsBase}/`);
}
