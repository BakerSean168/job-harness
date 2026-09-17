import type { MessageCatalog } from './types';

export const en: MessageCatalog = {
  meta: { description: 'A workspace for AI-assisted job discovery, applications, and durable career-search state.' },
  brand: { name: 'Job Harness', subtitle: 'Career workspace' },
  nav: {
    overview: 'Overview',
    inbox: 'Inbox',
    jobs: 'Jobs',
    applications: 'Applications',
    companies: 'Companies',
    campaigns: 'Campaigns',
    resumes: 'Resumes',
    discovery: 'Discovery',
    analytics: 'Analytics',
    settings: 'Settings',
  },
  topbar: {
    search: 'Search jobs, companies, applications…',
    searchHint: 'Search / command',
    language: 'Language',
    theme: 'Theme',
  },
  common: {
    comingSoon: 'This workspace will connect to live data in the next slice.',
    loading: 'Loading…',
    retry: 'Retry',
    noData: 'No data yet',
    unexpectedError: 'The workspace could not be loaded.',
    notFoundTitle: 'Page not found',
    notFoundDescription: 'This address does not map to a Job Harness workspace.',
    backOverview: 'Back to overview',
    skipToContent: 'Skip to main content',
    mainNavigation: 'Main navigation',
    close: 'Close',
  },
  savedViewsWorkspace: {
    label: 'Saved views', saveCurrent: 'Save current view', namePlaceholder: 'View name', apply: 'Apply', update: 'Overwrite with current filters', delete: 'Delete', empty: 'No saved views yet', saved: 'Saved', updated: 'Updated', deleted: 'Deleted', conflict: 'A view with this name already exists in this workspace.', failed: 'Action failed', currentFilters: 'Current filters'
  },
  authWorkspace: {
    title: 'Sign in to Job Harness', description: 'This is a single-user self-hosted workspace. The login protects the Web session; REST/MCP bearer credentials remain server-only.', password: 'Password', signIn: 'Sign in', invalid: 'Incorrect password.', configError: 'Web login is enabled, but the session secret is not configured correctly.', back: 'Back to workspace', sessionNote: 'Sign-in creates an HttpOnly, SameSite=Strict signed session cookie.'
  },
  settingsWorkspace: {
    security: 'Security & access', session: 'Web session', enabled: 'Enabled', disabled: 'Disabled', sessionDescription: 'When enabled, every workspace page and Server Action requires a valid signed session.', apiBoundary: 'API credential boundary', apiBoundaryDescription: 'JOB_HARNESS_AUTH_TOKEN is used only by the server-side Next REST client and is never sent to the browser.', logout: 'Sign out', localOnlyNote: 'Without a Web password this is appropriate for local or trusted Tailnet access. Public endpoints should enable login and HTTPS.',
    data: 'Data & backup', exportJson: 'Export Career JSON', exportJsonDescription: 'Download a portable, reviewable logical snapshot of companies, jobs, Listings, observations, application timelines, campaigns, resume references, and discovery runs.', backupSqlite: 'Download SQLite backup', backupSqliteDescription: 'Download a physically consistent database generated with SQLite VACUUM INTO for full disaster recovery.', download: 'Download', backupNote: 'The JSON export omits internal idempotency receipts and legacy migration evidence. Use the SQLite backup for full restoration.'
  },
  companiesWorkspace: {
    filters: { query: 'Company', campaign: 'Campaign', all: 'All', apply: 'Filter', reset: 'Reset' },
    table: { company: 'Company', jobs: 'Jobs', shortlisted: 'Shortlisted', applications: 'Applications', activePipeline: 'Active pipeline', cities: 'Cities', sources: 'Sources', lastSeen: 'Last seen', empty: 'No company data yet.' },
    detail: { title: 'Company detail', aliases: 'Aliases', sources: 'Associated sources', pipeline: 'Application stages', jobs: 'Jobs', noJobs: 'No jobs in the current scope.', close: 'Close detail', full: 'Open full detail', openJob: 'View job' },
  },
  analyticsWorkspace: {
    filters: { campaign: 'Campaign', all: 'All campaigns', apply: 'Filter', reset: 'Reset' },
    summary: { knownJobs: 'Known jobs', applications: 'Applications', activeJobs: 'Active jobs', activePipeline: 'Active pipeline' },
    jobs: { title: 'Job state distribution', discovered: 'Discovered', shortlisted: 'Shortlisted', ignored: 'Ignored', closed: 'Closed', archived: 'Archived' },
    applications: { title: 'Application stage distribution', applied: 'Applied', screening: 'Screening', assessment: 'Assessment', interview: 'Interview', offer: 'Offer', rejected: 'Rejected', withdrawn: 'Withdrawn' },
    companies: { title: 'Company association', company: 'Company', jobs: 'Jobs', applications: 'Applications', screening: 'Screening', interview: 'Interview', offer: 'Offer', empty: 'No company data yet.' },
    campaigns: { title: 'Campaign comparison', campaign: 'Campaign', jobs: 'Jobs', applications: 'Applications', screening: 'Screening', interview: 'Interview', offer: 'Offer', empty: 'No campaign data yet.' },
    sources: { title: 'Source association', source: 'Source', jobs: 'Jobs', applications: 'Applications', screening: 'Screening', interview: 'Interview', note: 'An Opportunity can have multiple Listing sources. These numbers do not attribute the actual submission channel.', empty: 'No source data yet.' },
    resumes: { title: 'Resume association', resume: 'Resume', applications: 'Applications', screening: 'Screening', assessment: 'Assessment', interview: 'Interview', offer: 'Offer', note: 'This is correlation, not evidence that a resume caused an outcome.', empty: 'No resume usage data yet.' },
    generatedAt: 'Generated',
  },
  campaignsWorkspace: {
    list: { title: 'Campaigns', empty: 'No campaigns yet. Create one to pin target roles, cities, graduation years, and resume lanes.', create: 'New campaign', updated: 'Updated', roles: 'Roles', cities: 'Cities', resumes: 'Resume lanes' },
    form: { titleNew: 'New campaign', titleEdit: 'Edit campaign', name: 'Name', targetRoles: 'Target roles', targetRolesHint: 'Comma or newline separated; at least one', cities: 'Cities', graduationYears: 'Graduation years', experience: 'Experience', keywords: 'Keywords', exclusions: 'Exclusions', sources: 'Discovery sources', resumes: 'Resume lanes', status: 'Status', save: 'Save', saving: 'Saving…', saved: 'Saved', failed: 'Could not save campaign', required: 'Enter a name and at least one target role.' },
    status: { active: 'Active', paused: 'Paused', completed: 'Completed', archived: 'Archived' },
    links: { jobs: 'View jobs', applications: 'View applications', dashboard: 'View overview' },
  },
  resumesWorkspace: {
    filters: { campaign: 'Campaign', all: 'All', apply: 'Filter', reset: 'Reset' },
    summary: { registry: 'Registered resumes', used: 'Used resumes', applications: 'Linked applications', missingArtifact: 'Missing artifacts' },
    table: { resume: 'Resume', targetRole: 'Target role', version: 'Version', applications: 'Applications', screening: 'Screening', assessment: 'Assessment', interview: 'Interview', offer: 'Offer', lastUsed: 'Last used', artifact: 'Artifact', linked: 'Linked', missing: 'Missing', updated: 'Updated', empty: 'No Resume Registry data yet.', viewApplications: 'View applications' },
    builder: { profiles: 'Resume profiles', preview: 'Live preview', details: 'Resume editor', targetRole: 'Target role', locale: 'Locale', template: 'Template', profileVersion: 'Profile version', libraryVersion: 'Library version', usage: 'Application usage', noProfiles: 'No Profile has been imported into the new Resume Domain yet. Legacy Registry data remains available during migration.', readOnly: 'The editor uses the new Resume Domain; Save only updates mutable drafts and does not publish a historical Revision.', editProfile: 'Current Profile', editShared: 'Shared content', formMode: 'Form', sourceMode: 'Source YAML', save: 'Save', saving: 'Saving…', saved: 'Saved', saveFailed: 'Save failed', sourceInvalid: 'Invalid Source YAML', previewFailed: 'Preview failed', sharedWarning: 'This edits the shared ResumeLibrary and can affect every Profile selecting the content. The server validates all Profiles before committing.', name: 'Profile name', positioning: 'Positioning', documentTitle: 'Document title', pdfName: 'PDF filename', header: 'Header layout', displayName: 'Display name', email: 'Email', phone: 'Phone', website: 'Website', github: 'GitHub', unsavedChanges: 'You have unsaved resume changes. Leave without saving?' },
    note: 'Resume is now a first-class Job Harness domain. The legacy Resume Registry remains temporarily as an application compatibility projection.',
  },
  discoveryWorkspace: {
    filters: { campaign: 'Campaign', executor: 'Executor', all: 'All', apply: 'Filter', reset: 'Reset' },
    list: { runs: 'discovery runs', empty: 'No discovery runs yet. External ChatGPT, importers, and other executors will appear here.', running: 'Running', completed: 'Completed', started: 'Started', campaign: 'Campaign', executor: 'Executor', candidates: 'Candidates', inserted: 'New', duplicates: 'Duplicates', rejected: 'Rejected' },
    detail: { title: 'Discovery run detail', observations: 'Observations', affectedJobs: 'Affected jobs', context: 'Execution context', completedAt: 'Completed at', noCampaign: 'No campaign', noAffectedJobs: 'This run has no related jobs.', openJob: 'View job', close: 'Close detail', full: 'Open full detail' },
    executors: { 'chatgpt-web': 'ChatGPT Web', 'memoflow-ai': 'MemoFlow AI', import: 'Import', manual: 'Manual', other: 'Other' },
  },
  dashboardWorkspace: {
    campaign: { label: 'Campaign', all: 'All campaigns', active: 'Active target', noActive: 'No active campaign is configured; global data is shown below.', roles: 'Target roles', cities: 'Cities', graduation: 'Graduation', experience: 'Experience' },
    kpis: { knownJobs: 'Known jobs', inbox: 'Inbox', shortlisted: 'Shortlisted', applications: 'Applications', activePipeline: 'Active pipeline', interviews: 'Interview stage' },
    funnel: { title: 'Hiring funnel', discovered: 'Discovered', shortlisted: 'Shortlisted', applied: 'Applied', screening: 'Screening', assessment: 'Assessment', interview: 'Interview', offer: 'Offer' },
    attention: {
      title: 'Needs attention', empty: 'No current items match the deterministic attention rules.', since: 'Since',
      severity: { info: 'Info', warning: 'Attention', critical: 'High priority' },
      kinds: {
        stale_application: 'Active application has had no new event for more than 7 days',
        shortlisted_unapplied: 'Shortlisted opportunity has been known for more than 3 days without an application',
        closed_listing_active_application: 'A listing is closed while the application pipeline is still active',
        stale_campaign_discovery: 'Active campaign has had no completed discovery run for more than 3 days',
        missing_resume_artifact: 'Resume reference has no usable artifact',
        stale_resume_artifact: 'Resume artifact has not been updated for more than 30 days',
      },
    },
    weekly: { title: 'Last 7 days', jobsObserved: 'Jobs observed', opportunitiesInserted: 'New opportunities', shortlisted: 'Shortlisted', applicationsRecorded: 'Applications', stageChanges: 'Stage changes', interviewsScheduled: 'Interviews scheduled', unavailable: 'No historical event exists', utcNote: 'Currently aggregated by UTC date. Shortlisting is not event-sourced yet, so no historical count is fabricated.' },
    recent: { title: 'Recent discovery runs', empty: 'No discovery runs yet.', candidates: 'Candidates', inserted: 'New', duplicates: 'Duplicates', rejected: 'Rejected', started: 'Started' },
    resumes: { title: 'Resume association', applications: 'Applications', screening: 'Screening', interview: 'Interview', lastUsed: 'Last used', correlationNote: 'This is a correlation view; it does not claim the resume caused an outcome.', empty: 'No resume usage data yet.' },
    sources: { title: 'Source association', source: 'Source', opportunities: 'Jobs', applications: 'Applications', screening: 'Screening', interview: 'Interview', associationNote: 'An Opportunity may have multiple Listing sources. These are associated sources, not attribution of the actual submission channel.', empty: 'No source data yet.' },
    generatedAt: 'Generated',
  },
  applicationsWorkspace: {
    views: { board: 'Board', table: 'Table' },
    filters: {
      company: 'Company', stage: 'Stage', campaign: 'Campaign', resume: 'Resume', terminal: 'Outcome state', appliedFrom: 'Applied from', appliedTo: 'Applied to',
      any: 'Any', activeOnly: 'Main pipeline only', includeTerminal: 'Include rejected/withdrawn', terminalOnly: 'Rejected/withdrawn only', apply: 'Filter', reset: 'Reset',
    },
    board: {
      results: 'applications', noResults: 'No applications match the current filters.', noStageItems: 'No applications in this stage.', stageAge: 'Stage age', today: 'Today', days: 'days', submissions: 'submissions',
      dragHint: 'Drag cards to advance stages; the server domain state machine validates every transition again.', moveTo: 'Move to', moving: 'Updating stage…', transitionFailed: 'Could not update application stage.', invalidTransition: 'The current stage cannot transition to that stage.', outcomes: 'Outcomes / archive',
    },
    table: {
      opportunity: 'Role / Company', stage: 'Stage', appliedAt: 'Applied at', resume: 'Resume', campaign: 'Campaign', stageAge: 'Stage age', submissions: 'Submissions', updated: 'Updated', noResults: 'No applications match the current filters.',
    },
    detail: {
      summary: 'Application summary', timeline: 'Timeline', appliedAt: 'First applied', stageEntered: 'Entered current stage', resume: 'Resume used', submissions: 'Submissions', source: 'Primary source', campaigns: 'Campaigns', latestEvent: 'Latest event',
      optionalNote: 'Note (optional)', notePlaceholder: 'Example: recruiter email confirmation, reason for withdrawal…', transition: 'Update stage', reject: 'Mark rejected', withdraw: 'Mark withdrawn', closePanel: 'Close detail', openFullPage: 'Open full detail', openJob: 'View job',
    },
  },
  jobsWorkspace: {
    filters: {
      title: 'Role', company: 'Company', city: 'City', state: 'Job state', source: 'Source', applied: 'Application', campaign: 'Campaign',
      any: 'Any', yes: 'Applied', no: 'Not applied', apply: 'Filter', reset: 'Reset',
    },
    table: {
      opportunity: 'Role / Company', city: 'City', state: 'State', application: 'Application', source: 'Primary source',
      resume: 'Resume', lastSeen: 'Last seen', listings: 'Listings', results: 'jobs', noResults: 'No opportunities match the current filters.',
    },
    detail: {
      overview: 'Overview', listings: 'Listings', application: 'Application', timeline: 'Timeline', observations: 'Observations',
      firstSeen: 'First seen', lastSeen: 'Last seen', description: 'Description', noDescription: 'No job description is stored yet.',
      noApplication: 'This opportunity has not been applied to yet.', appliedAt: 'Applied at', currentStage: 'Current stage', resume: 'Resume', submissions: 'Submissions',
      openOriginal: 'Open original', closePanel: 'Close detail', openFullPage: 'Open full detail', sourceSeen: 'Observed at',
    },
    actions: { shortlist: 'Shortlist', ignore: 'Ignore', close: 'Mark closed', rediscover: 'Rediscover', updating: 'Updating…', failed: 'Could not update job state.' },
    pagination: { showing: 'Showing', previous: 'Previous', next: 'Next' },
    states: { discovered: 'Inbox', shortlisted: 'Shortlisted', ignored: 'Ignored', closed: 'Closed', archived: 'Archived' },
    applicationStages: { applied: 'Applied', screening: 'Screening', assessment: 'Assessment', interview: 'Interview', offer: 'Offer', rejected: 'Rejected', withdrawn: 'Withdrawn' },
    listingStatuses: { active: 'Active', closed: 'Closed', unknown: 'Unknown' },
    eventTypes: { application_recorded: 'Application recorded', submission_recorded: 'Additional submission', stage_changed: 'Stage changed', interview_scheduled: 'Interview scheduled', note_added: 'Note added' },
    sourceKinds: { official: 'Official', boss: 'BOSS', zhilian: 'Zhilian', liepin: 'Liepin', moka: 'Moka', greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', email: 'Email', manual: 'Manual', other: 'Other' },
  },
  pages: {
    overview: { title: 'Overview', description: 'See active search targets, funnel state, and recent changes.' },
    inbox: { title: 'Inbox', description: 'Triage opportunities discovered by Agents and imports.' },
    jobs: { title: 'Jobs', description: 'Search, compare, and manage known Opportunities and Listings.' },
    applications: { title: 'Applications', description: 'Operate the hiring pipeline from Applied through Offer.' },
    companies: { title: 'Companies', description: 'Browse canonical companies and their related opportunities.' },
    campaigns: { title: 'Campaigns', description: 'Define target roles, locations, resume lanes, and search constraints.' },
    resumes: { title: 'Resumes', description: 'Inspect Resume Harness references and application usage.' },
    discovery: { title: 'Discovery', description: 'Audit job discovery runs from ChatGPT, importers, and other executors.' },
    analytics: { title: 'Analytics', description: 'Explore explainable funnel, resume, and discovery projections.' },
    settings: { title: 'Settings', description: 'Manage language, appearance, and Job Harness connection settings.' },
  },
};
