export type PageKey = 'overview' | 'inbox' | 'jobs' | 'applications' | 'companies' | 'campaigns' | 'resumes' | 'discovery' | 'executors' | 'analytics' | 'settings';

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
    executors: string;
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
    skipToContent: string;
    mainNavigation: string;
    close: string;
  };
  pages: Record<PageKey, { title: string; description: string }>;
  savedViewsWorkspace: {
    label: string; saveCurrent: string; namePlaceholder: string; apply: string; update: string; delete: string; empty: string; saved: string; updated: string; deleted: string; conflict: string; failed: string; currentFilters: string;
  };
  authWorkspace: {
    title: string; description: string; password: string; signIn: string; invalid: string; configError: string; back: string; sessionNote: string;
  };
  settingsWorkspace: {
    security: string; session: string; enabled: string; disabled: string; sessionDescription: string; apiBoundary: string; apiBoundaryDescription: string; logout: string; localOnlyNote: string;
    browserExtension: { title: string; description: string; bridgeUrl: string; unavailable: string; generate: string; generating: string; code: string; expires: string; instructions: string; error: string; };
    data: string; exportJson: string; exportJsonDescription: string; backupSqlite: string; backupSqliteDescription: string; download: string; backupNote: string;
  };
  companiesWorkspace: {
    filters: { query: string; campaign: string; all: string; apply: string; reset: string; };
    table: { company: string; jobs: string; shortlisted: string; applications: string; activePipeline: string; cities: string; sources: string; lastSeen: string; empty: string; };
    detail: { title: string; aliases: string; sources: string; pipeline: string; jobs: string; noJobs: string; close: string; full: string; openJob: string; };
  };
  analyticsWorkspace: {
    filters: { campaign: string; all: string; apply: string; reset: string; };
    summary: { knownJobs: string; applications: string; activeJobs: string; activePipeline: string; };
    jobs: { title: string; discovered: string; shortlisted: string; ignored: string; closed: string; archived: string; };
    applications: { title: string; applied: string; screening: string; assessment: string; interview: string; offer: string; rejected: string; withdrawn: string; };
    companies: { title: string; company: string; jobs: string; applications: string; screening: string; interview: string; offer: string; empty: string; };
    campaigns: { title: string; campaign: string; jobs: string; applications: string; screening: string; interview: string; offer: string; empty: string; };
    sources: { title: string; source: string; jobs: string; applications: string; screening: string; interview: string; note: string; empty: string; };
    resumes: { title: string; resume: string; applications: string; submissions: string; screening: string; assessment: string; interview: string; offer: string; note: string; empty: string; };
    generatedAt: string;
  };
  campaignsWorkspace: {
    list: { title: string; empty: string; create: string; updated: string; roles: string; cities: string; resumes: string; };
    form: { titleNew: string; titleEdit: string; name: string; targetRoles: string; targetRolesHint: string; cities: string; graduationYears: string; experience: string; keywords: string; exclusions: string; sources: string; resumes: string; status: string; save: string; saving: string; saved: string; failed: string; required: string; };
    status: Record<'active' | 'paused' | 'completed' | 'archived', string>;
    links: { jobs: string; applications: string; dashboard: string; };
  };
  resumesWorkspace: {
    filters: { campaign: string; all: string; apply: string; reset: string; };
    summary: { registry: string; used: string; applications: string; missingArtifact: string; };
    table: { resume: string; targetRole: string; version: string; applications: string; submissions: string; screening: string; assessment: string; interview: string; offer: string; lastUsed: string; artifact: string; linked: string; missing: string; updated: string; empty: string; viewApplications: string; };
    builder: { profiles: string; preview: string; fastPreview: string; exactPreview: string; renderingPdf: string; pdfPreviewFailed: string; details: string; targetRole: string; locale: string; template: string; profileVersion: string; libraryVersion: string; usage: string; noProfiles: string; readOnly: string; editProfile: string; editShared: string; formMode: string; composeMode: string; sourceMode: string; save: string; saving: string; saved: string; saveFailed: string; sourceInvalid: string; previewFailed: string; sharedWarning: string; name: string; positioning: string; documentTitle: string; pdfName: string; header: string; displayName: string; email: string; phone: string; website: string; github: string; unsavedChanges: string; history: string; noRevisions: string; publish: string; publishing: string; publishNote: string; published: string; reusedRevision: string; saveBeforePublish: string; comparePrevious: string; compareCurrent: string; changes: string; noChanges: string; diffFailed: string; downloadPdf: string; downloadHtml: string; downloadJson: string; revisionUnused: string; revisionLastUsed: string; composer: { title: string; selected: string; available: string; skills: string; work: string; projects: string; education: string; summaries: string; certificates: string; bullets: string; highlights: string; presentation: string; include: string; noItems: string; sectionOrder: string; moveUp: string; moveDown: string; }; };
    note: string;
  };
  discoveryWorkspace: {
    filters: { campaign: string; executor: string; all: string; apply: string; reset: string; };
    list: { runs: string; empty: string; running: string; completed: string; started: string; campaign: string; executor: string; candidates: string; inserted: string; duplicates: string; rejected: string; };
    detail: { title: string; observations: string; affectedJobs: string; context: string; completedAt: string; noCampaign: string; noAffectedJobs: string; openJob: string; close: string; full: string; };
    executors: Record<'chatgpt-web' | 'memoflow-ai' | 'import' | 'manual' | 'other', string>;
  };
  executorsWorkspace: {
    summary: { registered: string; ready: string; active: string; waiting: string; uncertain: string; prepared: string; };
    executors: { title: string; empty: string; status: string; backends: string; adapters: string; modes: string; heartbeat: string; concurrency: string; };
    dispatch: { title: string; empty: string; prepared: string; target: string; resume: string; created: string; safeFill: string; safeFillHint: string; missingExecutor: string; missingResume: string; missingTarget: string; alreadyDispatched: string; openJob: string; openAttempt: string; };
    attempts: { title: string; empty: string; target: string; state: string; mode: string; executor: string; adapter: string; backend: string; checkpoint: string; effect: string; created: string; openBrowser: string; handoffExpires: string; };
    detail: { back: string; overview: string; review: string; authorizations: string; events: string; noReview: string; noAuthorization: string; reviewReady: string; reviewBlocked: string; authorize: string; resumeAuthorized: string; revoke: string; authorizationExpires: string; oneTimeWarning: string; formHash: string; reviewHash: string; fieldSummary: string; resumeEvidence: string; noResume: string; handoff: string; humanAction: string; humanActionDescription: string; waitingReason: string; continueAfterHuman: string; handoffExpired: string; };
    states: Record<'queued' | 'claimed' | 'running' | 'waiting_for_user' | 'completed' | 'failed' | 'cancelled' | 'abandoned', string>;
    executorStatuses: Record<'ready' | 'busy' | 'degraded' | 'login_required' | 'human_action_required' | 'offline', string>;
    modes: Record<'fill_only' | 'review_then_submit' | 'auto_submit', string>;
    effects: Record<'not_crossed' | 'crossed' | 'uncertain', string>;
    note: string;
  };
  dashboardWorkspace: {
    campaign: { label: string; all: string; active: string; noActive: string; roles: string; cities: string; graduation: string; experience: string; };
    kpis: { knownJobs: string; inbox: string; shortlisted: string; applications: string; activePipeline: string; interviews: string; };
    funnel: { title: string; discovered: string; shortlisted: string; applied: string; screening: string; assessment: string; interview: string; offer: string; };
    attention: {
      title: string; empty: string; since: string;
      severity: Record<'info' | 'warning' | 'critical', string>;
      kinds: Record<'stale_application' | 'shortlisted_unapplied' | 'closed_listing_active_application' | 'stale_campaign_discovery' | 'missing_resume_artifact' | 'stale_resume_artifact', string>;
    };
    weekly: { title: string; jobsObserved: string; opportunitiesInserted: string; shortlisted: string; applicationsRecorded: string; stageChanges: string; interviewsScheduled: string; unavailable: string; utcNote: string; };
    recent: { title: string; empty: string; candidates: string; inserted: string; duplicates: string; rejected: string; started: string; };
    resumes: { title: string; applications: string; submissions: string; screening: string; interview: string; lastUsed: string; correlationNote: string; empty: string; };
    sources: { title: string; source: string; opportunities: string; applications: string; screening: string; interview: string; associationNote: string; empty: string; };
    generatedAt: string;
  };
  applicationsWorkspace: {
    views: { board: string; table: string };
    filters: {
      company: string; stage: string; campaign: string; resume: string; terminal: string; appliedFrom: string; appliedTo: string;
      any: string; activeOnly: string; includeTerminal: string; terminalOnly: string; apply: string; reset: string;
    };
    board: {
      results: string; noResults: string; noStageItems: string; stageAge: string; today: string; days: string; submissions: string;
      dragHint: string; moveTo: string; moving: string; transitionFailed: string; invalidTransition: string; outcomes: string; loadMore: string; loadingMore: string;
    };
    table: {
      opportunity: string; stage: string; appliedAt: string; resume: string; campaign: string; stageAge: string; submissions: string; updated: string; noResults: string;
    };
    detail: {
      summary: string; timeline: string; appliedAt: string; stageEntered: string; resume: string; submissions: string; source: string; campaigns: string; latestEvent: string;
      optionalNote: string; notePlaceholder: string; transition: string; reject: string; withdraw: string; closePanel: string; openFullPage: string; openJob: string;
      submissionHistory: string; submittedAt: string; channel: string; listing: string; profile: string; revision: string; artifact: string; unknown: string;
    };
    submissionChannels: Record<'official' | 'boss' | 'zhilian' | 'liepin' | 'moka' | 'greenhouse' | 'lever' | 'ashby' | 'email' | 'referral' | 'manual' | 'other', string>;
  };
  jobsWorkspace: {
    add: { trigger: string; title: string; description: string; company: string; role: string; city: string; source: string; url: string; externalId: string; jd: string; save: string; saving: string; saved: string; failed: string; };
    record: { title: string; recordAgain: string; hint: string; appliedAt: string; listing: string; channel: string; resume: string; none: string; linkLatestRevision: string; linkLatestRevisionHint: string; note: string; notePlaceholder: string; save: string; saving: string; saved: string; failed: string; };
    filters: {
      title: string;
      company: string;
      city: string;
      state: string;
      source: string;
      applied: string;
      campaign: string;
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
