import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  FileText,
  Inbox,
  LayoutDashboard,
  Radar,
  Bot,
  Send,
  Settings,
  Target,
} from 'lucide-react';
import type { MessageCatalog } from '@/i18n';

export interface NavigationItem {
  href: string;
  labelKey: keyof MessageCatalog['nav'];
  icon: LucideIcon;
}

export const primaryNavigation: readonly NavigationItem[] = [
  { href: '/', labelKey: 'overview', icon: LayoutDashboard },
  { href: '/inbox', labelKey: 'inbox', icon: Inbox },
  { href: '/jobs', labelKey: 'jobs', icon: BriefcaseBusiness },
  { href: '/applications', labelKey: 'applications', icon: Send },
  { href: '/companies', labelKey: 'companies', icon: Building2 },
  { href: '/campaigns', labelKey: 'campaigns', icon: Target },
  { href: '/resumes', labelKey: 'resumes', icon: FileText },
  { href: '/discovery', labelKey: 'discovery', icon: Radar },
  { href: '/executors', labelKey: 'executors', icon: Bot },
  { href: '/analytics', labelKey: 'analytics', icon: BarChart3 },
] as const;

export const secondaryNavigation: readonly NavigationItem[] = [
  { href: '/settings', labelKey: 'settings', icon: Settings },
] as const;
