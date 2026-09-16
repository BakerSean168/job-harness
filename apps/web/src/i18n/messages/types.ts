export type PageKey = 'overview' | 'inbox' | 'jobs' | 'applications' | 'companies' | 'campaigns' | 'resumes' | 'discovery' | 'analytics' | 'settings';

export interface MessageCatalog {
  brand: {
    name: string;
    subtitle: string;
  };
  meta: { description: string };
  nav: {
    overview: string;
    inbox: string;
    jobs: string;
    applications: string;
    companies: string;
    campaigns: string;
    resumes: string;
    discovery: string;
    analytics: string;
    settings: string;
  };
  topbar: {
    search: string;
    searchHint: string;
    language: string;
    theme: string;
  };
  common: {
    comingSoon: string;
    loading: string;
    retry: string;
    noData: string;
    unexpectedError: string;
    notFoundTitle: string;
    notFoundDescription: string;
    backOverview: string;
  };
  pages: Record<PageKey, { title: string; description: string }>;
}
