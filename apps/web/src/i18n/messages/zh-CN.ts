import type { MessageCatalog } from './types';

export const zhCN: MessageCatalog = {
  meta: { description: '面向 AI 辅助求职流程的岗位、投递与发现记录工作台。' },
  brand: { name: 'Job Harness', subtitle: '求职工作台' },
  nav: {
    overview: '概览',
    inbox: '收件箱',
    jobs: '岗位',
    applications: '投递',
    companies: '公司',
    campaigns: '求职目标',
    resumes: '简历',
    discovery: '发现记录',
    analytics: '分析',
    settings: '设置',
  },
  topbar: {
    search: '搜索岗位、公司、投递…',
    searchHint: '搜索 / 命令',
    language: '语言',
    theme: '主题',
  },
  common: {
    comingSoon: '该工作区将在下一阶段接入真实数据。',
    loading: '正在加载…',
    retry: '重试',
    noData: '暂无数据',
    unexpectedError: '加载工作区时发生错误。',
    notFoundTitle: '页面不存在',
    notFoundDescription: '这个地址没有对应的 Job Harness 工作区。',
    backOverview: '返回概览',
    skipToContent: '跳到主要内容',
    mainNavigation: '主导航',
    close: '关闭',
  },
  savedViewsWorkspace: {
    label: '已保存视图', saveCurrent: '保存当前视图', namePlaceholder: '视图名称', apply: '应用', update: '用当前条件覆盖', delete: '删除', empty: '还没有保存视图', saved: '已保存', updated: '已更新', deleted: '已删除', conflict: '同一工作区已经有同名视图。', failed: '操作失败', currentFilters: '当前筛选'
  },
  authWorkspace: {
    title: '登录 Job Harness', description: '这是单用户自托管工作台。登录只保护 Web 会话；REST/MCP 的 Bearer Token 仍只保留在服务端。', password: '密码', signIn: '登录', invalid: '密码不正确。', configError: 'Web 登录已启用，但 Session Secret 未正确配置。', back: '返回工作台', sessionNote: '登录会创建 HttpOnly、SameSite=Strict 的签名 Session Cookie。'
  },
  settingsWorkspace: {
    security: '安全与访问', session: 'Web Session', enabled: '已启用', disabled: '未启用', sessionDescription: '启用后，所有工作区页面和 Server Action 都要求有效的签名 Session。', apiBoundary: 'API 凭据边界', apiBoundaryDescription: 'JOB_HARNESS_AUTH_TOKEN 仅由 Next 服务端 REST client 使用，不会发送到浏览器。', logout: '退出登录', localOnlyNote: '未配置 Web 密码时适合本地或受信 Tailnet 使用；公开入口应启用登录并使用 HTTPS。',
    data: '数据与备份', exportJson: '导出 Career JSON', exportJsonDescription: '下载可移植、可审阅的业务真值快照：公司、岗位、Listing、观察记录、投递时间线、求职目标、简历引用和发现任务。', backupSqlite: '下载 SQLite 备份', backupSqliteDescription: '下载通过 SQLite VACUUM INTO 生成的物理一致性数据库，可用于完整灾备恢复。', download: '下载', backupNote: 'JSON 导出不包含内部幂等收据和旧迁移证据；需要完整恢复时请使用 SQLite 备份。'
  },
  companiesWorkspace: {
    filters: { query: '公司', campaign: '求职目标', all: '全部', apply: '筛选', reset: '重置' },
    table: { company: '公司', jobs: '岗位', shortlisted: '候选', applications: '投递', activePipeline: '活跃 Pipeline', cities: '城市', sources: '来源', lastSeen: '最近发现', empty: '暂无公司数据。' },
    detail: { title: '公司详情', aliases: '别名', sources: '关联来源', pipeline: '投递阶段', jobs: '岗位', noJobs: '当前范围内没有岗位。', close: '关闭详情', full: '打开完整详情', openJob: '查看岗位' },
  },
  analyticsWorkspace: {
    filters: { campaign: '求职目标', all: '全部求职目标', apply: '筛选', reset: '重置' },
    summary: { knownJobs: '已知岗位', applications: '投递', activeJobs: '活跃岗位', activePipeline: '活跃 Pipeline' },
    jobs: { title: '岗位状态分布', discovered: '发现', shortlisted: '候选', ignored: '忽略', closed: '关闭', archived: '归档' },
    applications: { title: '投递阶段分布', applied: '已投递', screening: '筛选', assessment: '测评', interview: '面试', offer: 'Offer', rejected: '拒绝', withdrawn: '撤回' },
    companies: { title: '公司关联表现', company: '公司', jobs: '岗位', applications: '投递', screening: '筛选', interview: '面试', offer: 'Offer', empty: '暂无公司数据。' },
    campaigns: { title: '求职目标对比', campaign: '求职目标', jobs: '岗位', applications: '投递', screening: '筛选', interview: '面试', offer: 'Offer', empty: '暂无求职目标数据。' },
    sources: { title: '来源关联表现', source: '来源', jobs: '岗位', applications: '投递', screening: '筛选', interview: '面试', note: '一个 Opportunity 可以关联多个 Listing 来源；这些数字不是实际提交渠道归因。', empty: '暂无来源数据。' },
    resumes: { title: '简历关联表现', resume: '简历', applications: '投递', screening: '筛选', assessment: '测评', interview: '面试', offer: 'Offer', note: '这是相关性统计，不表示简历本身造成了招聘结果。', empty: '暂无简历使用数据。' },
    generatedAt: '生成时间',
  },
  campaignsWorkspace: {
    list: { title: '求职目标', empty: '还没有求职目标。创建一个 Campaign 来固定岗位、城市、届次和简历方向。', create: '新建目标', updated: '更新于', roles: '岗位', cities: '城市', resumes: '简历方向' },
    form: { titleNew: '新建求职目标', titleEdit: '编辑求职目标', name: '名称', targetRoles: '目标岗位', targetRolesHint: '逗号或换行分隔，至少一个', cities: '城市', graduationYears: '毕业届次', experience: '经验范围', keywords: '关键词', exclusions: '排除词', sources: '发现来源', resumes: '简历方向', status: '状态', save: '保存', saving: '正在保存…', saved: '已保存', failed: '保存失败', required: '请至少填写名称和一个目标岗位。' },
    status: { active: '活跃', paused: '暂停', completed: '完成', archived: '归档' },
    links: { jobs: '查看岗位', applications: '查看投递', dashboard: '查看概览' },
  },
  resumesWorkspace: {
    filters: { campaign: '求职目标', all: '全部', apply: '筛选', reset: '重置' },
    summary: { registry: '注册简历', used: '已使用简历', applications: '关联投递', missingArtifact: '缺少 artifact' },
    table: { resume: '简历', targetRole: '目标方向', version: '版本', applications: '投递', screening: '筛选', assessment: '测评', interview: '面试', offer: 'Offer', lastUsed: '最近使用', artifact: 'Artifact', linked: '已关联', missing: '缺失', updated: '最近更新', empty: '暂无 Resume Registry 数据。', viewApplications: '查看投递' },
    builder: { profiles: '简历版本', preview: '实时预览', details: 'Profile 配置', targetRole: '目标方向', locale: '语言', template: '模板', profileVersion: 'Profile 版本', libraryVersion: '内容库版本', usage: '投递使用', noProfiles: '新的 Resume Domain 还没有导入 Profile。迁移完成前仍保留旧 Registry 数据。', readOnly: '当前阶段已切到新的 Resume Domain 与实时渲染链路；结构化编辑、Source 编辑和发布 Revision 将在下一小步接入。' },
    note: 'Resume 已成为 Job Harness 内的一等领域；旧 Resume Registry 暂时保留为投递兼容投影。',
  },
  discoveryWorkspace: {
    filters: { campaign: '求职目标', executor: '执行器', all: '全部', apply: '筛选', reset: '重置' },
    list: { runs: '次发现任务', empty: '暂无发现任务。外部 ChatGPT、导入器或其他执行器运行后会出现在这里。', running: '运行中', completed: '已完成', started: '开始', campaign: '求职目标', executor: '执行器', candidates: '候选', inserted: '新增', duplicates: '重复', rejected: '拒绝' },
    detail: { title: '发现任务详情', observations: '观察记录', affectedJobs: '受影响岗位', context: '执行上下文', completedAt: '完成时间', noCampaign: '未绑定求职目标', noAffectedJobs: '该任务没有关联岗位。', openJob: '查看岗位', close: '关闭详情', full: '打开完整详情' },
    executors: { 'chatgpt-web': 'ChatGPT Web', 'memoflow-ai': 'MemoFlow AI', import: '历史导入', manual: '手动', other: '其他' },
  },
  dashboardWorkspace: {
    campaign: { label: '求职目标', all: '全部求职目标', active: '当前目标', noActive: '当前没有活跃的求职目标，以下展示全局数据。', roles: '目标岗位', cities: '城市', graduation: '毕业届次', experience: '经验范围' },
    kpis: { knownJobs: '已知岗位', inbox: '待分流', shortlisted: '候选岗位', applications: '已投递', activePipeline: '活跃 Pipeline', interviews: '面试阶段' },
    funnel: { title: '招聘漏斗', discovered: '发现', shortlisted: '候选', applied: '已投递', screening: '筛选', assessment: '测评', interview: '面试', offer: 'Offer' },
    attention: {
      title: '需要关注', empty: '当前没有命中规则的待处理事项。', since: '自',
      severity: { info: '提示', warning: '关注', critical: '高优先级' },
      kinds: {
        stale_application: '活跃投递超过 7 天没有新事件',
        shortlisted_unapplied: '候选岗位已知超过 3 天仍未投递',
        closed_listing_active_application: '岗位来源已关闭，但投递仍处于活跃阶段',
        stale_campaign_discovery: '活跃求职目标超过 3 天没有完成新的发现任务',
        missing_resume_artifact: '简历引用缺少可用 artifact',
        stale_resume_artifact: '简历 artifact 超过 30 天未更新',
      },
    },
    weekly: { title: '最近 7 天活动', jobsObserved: '观察岗位', opportunitiesInserted: '新增 Opportunity', shortlisted: '加入候选', applicationsRecorded: '新增投递', stageChanges: '阶段变化', interviewsScheduled: '安排面试', unavailable: '尚未记录历史事件', utcNote: '当前按 UTC 日期边界聚合；“加入候选”没有独立历史事件，因此不伪造计数。' },
    recent: { title: '最近发现任务', empty: '暂无发现任务记录。', candidates: '候选', inserted: '新增', duplicates: '重复', rejected: '拒绝', started: '开始于' },
    resumes: { title: '简历关联表现', applications: '投递', screening: '筛选', interview: '面试', lastUsed: '最近使用', correlationNote: '这是相关性视图，不表示某份简历导致了结果。', empty: '暂无简历使用数据。' },
    sources: { title: '来源关联表现', source: '来源', opportunities: '岗位', applications: '投递', screening: '筛选', interview: '面试', associationNote: '一个 Opportunity 可以同时有多个 Listing 来源；这里统计“关联来源”，不是实际提交渠道归因。', empty: '暂无来源数据。' },
    generatedAt: '生成时间',
  },
  applicationsWorkspace: {
    views: { board: '看板', table: '表格' },
    filters: {
      company: '公司', stage: '阶段', campaign: '求职目标', resume: '简历', terminal: '结果状态', appliedFrom: '投递起始', appliedTo: '投递截止',
      any: '全部', activeOnly: '仅主 Pipeline', includeTerminal: '包含拒绝/撤回', terminalOnly: '仅拒绝/撤回', apply: '筛选', reset: '重置',
    },
    board: {
      results: '条投递', noResults: '没有符合当前筛选条件的投递。', noStageItems: '这一阶段暂无投递。', stageAge: '阶段时长', today: '今天', days: '天', submissions: '次提交',
      dragHint: '拖动卡片可推进招聘阶段；服务端状态机仍会再次校验。', moveTo: '移动到', moving: '正在更新阶段…', transitionFailed: '更新投递阶段失败。', invalidTransition: '当前阶段不能移动到目标阶段。', outcomes: '结果 / 归档',
    },
    table: {
      opportunity: '岗位 / 公司', stage: '阶段', appliedAt: '投递时间', resume: '简历', campaign: '求职目标', stageAge: '阶段时长', submissions: '提交次数', updated: '最近更新', noResults: '没有符合当前筛选条件的投递。',
    },
    detail: {
      summary: '投递概览', timeline: '时间线', appliedAt: '首次投递', stageEntered: '进入当前阶段', resume: '使用简历', submissions: '提交次数', source: '主要来源', campaigns: '求职目标', latestEvent: '最近事件',
      optionalNote: '备注（可选）', notePlaceholder: '例如：HR 邮件确认、主动撤回原因…', transition: '更新阶段', reject: '标记拒绝', withdraw: '标记撤回', closePanel: '关闭详情', openFullPage: '打开完整详情', openJob: '查看岗位',
    },
  },
  jobsWorkspace: {
    filters: {
      title: '岗位名称', company: '公司', city: '城市', state: '岗位状态', source: '来源', applied: '投递状态', campaign: '求职目标',
      any: '全部', yes: '已投递', no: '未投递', apply: '筛选', reset: '重置',
    },
    table: {
      opportunity: '岗位 / 公司', city: '城市', state: '状态', application: '投递', source: '主要来源',
      resume: '简历', lastSeen: '最近发现', listings: '来源数', results: '条岗位', noResults: '没有符合当前筛选条件的岗位。',
    },
    detail: {
      overview: '概览', listings: '发布来源', application: '投递状态', timeline: '时间线', observations: '发现记录',
      firstSeen: '首次发现', lastSeen: '最近发现', description: '岗位描述', noDescription: '尚未保存岗位描述。',
      noApplication: '尚未投递这个岗位。', appliedAt: '投递时间', currentStage: '当前阶段', resume: '使用简历', submissions: '提交次数',
      openOriginal: '打开原岗位', closePanel: '关闭详情', openFullPage: '打开完整详情', sourceSeen: '观察时间',
    },
    actions: { shortlist: '加入候选', ignore: '忽略', close: '标记关闭', rediscover: '重新发现', updating: '正在更新…', failed: '更新岗位状态失败。' },
    pagination: { showing: '当前显示', previous: '上一页', next: '下一页' },
    states: { discovered: '待分流', shortlisted: '候选', ignored: '已忽略', closed: '已关闭', archived: '已归档' },
    applicationStages: { applied: '已投递', screening: '筛选中', assessment: '测评', interview: '面试', offer: 'Offer', rejected: '已拒绝', withdrawn: '已撤回' },
    listingStatuses: { active: '可用', closed: '已关闭', unknown: '未知' },
    eventTypes: { application_recorded: '首次投递', submission_recorded: '再次提交', stage_changed: '阶段变化', interview_scheduled: '安排面试', note_added: '添加备注' },
    sourceKinds: { official: '官网', boss: 'BOSS', zhilian: '智联', liepin: '猎聘', moka: 'Moka', greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', email: '邮件', manual: '手动', other: '其他' },
  },
  pages: {
    overview: { title: '概览', description: '查看当前求职目标、漏斗状态和最近变化。' },
    inbox: { title: '收件箱', description: '审核 Agent 与导入流程发现、但尚未完成分流的岗位。' },
    jobs: { title: '岗位', description: '搜索、比较和管理所有已知 Opportunity 与 Listing。' },
    applications: { title: '投递', description: '跟踪从已投递到 Offer 的完整招聘 Pipeline。' },
    companies: { title: '公司', description: '管理规范化公司主体与相关岗位。' },
    campaigns: { title: '求职目标', description: '定义角色、城市和简历方向等搜索约束。' },
    resumes: { title: '简历', description: '查看 Resume Harness 注册的简历及其投递使用情况。' },
    discovery: { title: '发现记录', description: '审计 ChatGPT、导入器和其他外部执行器的岗位发现过程。' },
    analytics: { title: '分析', description: '查看漏斗、简历和搜索活动的可解释统计。' },
    settings: { title: '设置', description: '管理界面语言、外观和 Job Harness 连接信息。' },
  },
};
