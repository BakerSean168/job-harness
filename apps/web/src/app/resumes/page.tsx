import { WorkspacePlaceholder } from '@/components/ui/workspace-placeholder';
import { getMessages } from '@/i18n/server';

export default async function Page() {
  return <WorkspacePlaceholder page="resumes" messages={await getMessages()} />;
}
