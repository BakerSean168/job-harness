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
  applicationsWorkspace: {
    views: { board: string; table: string };
    filters: {
      company: string; stage: string; campaign: string; resume: string; terminal: string; appliedFrom: string; appliedTo: string;
      any: string; activeOnly: string; includeTerminal: string; terminalOnly: string; apply: string; reset: string;
    };
    board: {
      results: string; noResults: string; noStageItems: string; stageAge: string; today: string; days: string; submissions: string;
      dragHint: string; moveTo: string; moving: string; transitionFailed: string; invalidTransition: string; outcomes: string;
    };
    table: {
      opportunity: string; stage: string; appliedAt: string; resume: string; campaign: string; stageAge: string; submissions: string; updated: string; noResults: string;
    };
    detail: {
      summary: string; timeline: string; appliedAt: string; stageEntered: string; resume: string; submissions: string; source: string; campaigns: string; latestEvent: string;
      optionalNote: string; notePlaceholder: string; transition: string; reject: string; withdraw: string; closePanel: string; openFullPage: string; openJob: string;
    };
  };
  jobsWorkspace: {
    filters: {
      title: string;
      company: string;
      city: string;
      state: string;
      source: string;
      applied: string;
      any: string;
      yes: string;
      no: string;
      apply: string;
      reset: string;
    };
    table: {
      opportunity: string;
      city: string;
      state: string;
      application: string;
      source: string;
      resume: string;
      lastSeen: string;
      listings: string;
      results: string;
      noResults: string;
    };
    detail: {
      overview: string;
      listings: string;
      application: string;
      timeline: string;
      observations: string;
      firstSeen: string;
      lastSeen: string;
      description: string;
      noDescription: string;
      noApplication: string;
      appliedAt: string;
      currentStage: string;
      resume: string;
      submissions: string;
      openOriginal: string;
      closePanel: string;
      openFullPage: string;
      sourceSeen: string;
    };
    actions: {
      shortlist: string;
      ignore: string;
      close: string;
      rediscover: string;
      updating: string;
      failed: string;
    };
    pagination: {
      showing: string;
      previous: string;
      next: string;
    };
    states: Record<'discovered' | 'shortlisted' | 'ignored' | 'closed' | 'archived', string>;
    applicationStages: Record<'applied' | 'screening' | 'assessment' | 'interview' | 'offer' | 'rejected' | 'withdrawn', string>;
    listingStatuses: Record<'active' | 'closed' | 'unknown', string>;
    eventTypes: Record<'application_recorded' | 'submission_recorded' | 'stage_changed' | 'interview_scheduled' | 'note_added', string>;
    sourceKinds: Record<'official' | 'boss' | 'zhilian' | 'liepin' | 'moka' | 'greenhouse' | 'lever' | 'ashby' | 'email' | 'manual' | 'other', string>;
  };
}
