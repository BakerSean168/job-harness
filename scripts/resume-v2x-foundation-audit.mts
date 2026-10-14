/**
 * Pure read-only acceptance check for the frozen v2.x resume foundation.
 * No ResumeLibrary/Profile/Revision mutation and no PDF generation.
 *
 *   JOB_HARNESS_DB=/data/job-harness.db tsx scripts/resume-v2x-foundation-audit.mts
 *   tsx scripts/resume-v2x-foundation-audit.mts ai-frontend-v2-3 --pdf=/data/resumes-v2-3/filename.pdf
 */
import { execFileSync } from 'node:child_process';
import { SqliteResumeStore } from '../packages/persistence-sqlite/src/resume-store.ts';
import { resolveResume } from '../packages/resume-application/src/resolver.ts';
import { renderResumeHtml } from '../packages/resume-renderer/src/renderer.ts';
import { auditV2xFoundation } from './resume-v2x-foundation-policy.ts';

const args = process.argv.slice(2);
const profileId = args.find(a => !a.startsWith('--')) ?? 'ai-frontend-v2-3';
const pdfFlag = args.find(a => a.startsWith('--pdf='));
const pdfPath = pdfFlag?.slice('--pdf='.length);
const db = new SqliteResumeStore(process.env.JOB_HARNESS_DB || '/data/job-harness.db');

try {
  const profile = await db.getProfile(profileId);
  if (!profile) throw new Error('Unknown Resume Profile: '+profileId);
  const library = await db.getLibrary(profile.libraryId);
  if (!library) throw new Error('Missing source ResumeLibrary: '+profile.libraryId);
  const resolved = resolveResume(library,profile);
  const report = auditV2xFoundation(profile,resolved);
  const html = renderResumeHtml(resolved);

  for (const project of resolved.projects) {
    for (const link of project.links) {
      if (!html.includes(`href="${link.url}"`)) {
        report.errors.push({ severity:'error',code:'HTML_LINK',message:project.id+': actual rendered HTML is missing the project hyperlink' });
      }
    }
  }
  if (html.includes('项目亮点：')) report.errors.push({severity:'error',code:'REDUNDANT_LABEL',message:'Compact resume still renders redundant 项目亮点：'});
  if (html.includes('求职意向：')) report.errors.push({severity:'error',code:'REDUNDANT_POSITIONING',message:'Header still renders 求职意向：'});

  if (pdfPath) {
    const info = execFileSync('pdfinfo',[pdfPath],{encoding:'utf8'});
    if (!/^Pages:\s+1\s*$/m.test(info)) report.errors.push({severity:'error',code:'PDF_PAGES',message:'Formal PDF must be one page'});
    if (!/^Page size:\s+595\.9\d+ x 842\.\d+ pts \(A4\)/m.test(info)) report.errors.push({severity:'error',code:'PDF_A4',message:'Formal PDF must be A4'});
    const text = execFileSync('pdftotext',['-layout',pdfPath,'-'],{encoding:'utf8'});
    if (text.includes('项目亮点：')) report.errors.push({severity:'error',code:'PDF_LABEL',message:'PDF has redundant 项目亮点：'});
    if (!text.includes('CET-6')) report.warnings.push({severity:'warning',code:'PDF_CERTIFICATE',message:'Confirm intended certificate is visible'});
    const pdfHtml = execFileSync('pdftohtml',['-i','-s','-stdout',pdfPath],{encoding:'utf8',stdio:['ignore','pipe','ignore']});
    for (const project of resolved.projects) {
      for (const link of project.links) {
        if (!pdfHtml.includes(`href="${link.url}"`)) {
          report.errors.push({ severity:'error',code:'PDF_LINK',message:project.id+': missing a clickable PDF hyperlink' });
        }
      }
    }
  }

  console.log(JSON.stringify({
    standard:'resume-v2x-foundation-20261014',
    profileId:report.profileId,
    profileVersion:profile.version,
    libraryVersion:library.version,
    templateId:report.templateId,
    role:report.role,
    projectNames:report.projectNames,
    checks:{skills:resolved.skills.length,work:resolved.workExperiences.length,projects:resolved.projects.length,links:resolved.projects.reduce((n,p)=>n+p.links.length,0)},
    pdfVerified:Boolean(pdfPath),
    errors:report.errors,
    warnings:report.warnings,
  },null,2));
  if (report.errors.length) process.exitCode=1;
} catch (error) {
  console.error('V2X_BASELINE_FAILED:',error instanceof Error?error.message:String(error));
  process.exitCode=1;
} finally {
  db.close();
}
