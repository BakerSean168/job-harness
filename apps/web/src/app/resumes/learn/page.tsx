import { ResumeLearningWorkspace } from '@/components/management/resume-learning-workspace';
import '../../resume-learning.css';

export default async function ResumeLearningPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <ResumeLearningWorkspace searchParams={await searchParams} />;
}
