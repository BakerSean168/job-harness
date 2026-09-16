import { LoadingState } from '@/components/ui/loading-state';
import { getMessages } from '@/i18n/server';

export default async function Loading() {
  const messages = await getMessages();
  return <LoadingState label={messages.common.loading} />;
}
