import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nunjucks from 'nunjucks';
import { ResolvedResumeSchema, type ResolvedResume } from '@job-harness/resume-contracts';
import { toResumeTemplateContext, type ResumeTemplateContextOptions } from './context';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templatesDir = path.join(packageRoot, 'templates');
const cssPath = path.join(templatesDir, 'styles', 'resume.css');

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
