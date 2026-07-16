import type {
    SponsorshipEffectiveQuota,
    SponsorshipGroupCatalogItem,
    SponsorshipGroupSummary
} from '~/types/membership';

export type AdminAnomalyType =
    | 'train_multi_emu'
    | 'train_coupled_model_mismatch'
    | 'train_non_multiple_coupled'
    | 'emu_single_short_route';

export interface AdminAnomalyRouteRecord {
    id: string;
    trainCode: string;
    emuCode: string;
    startStation: string;
    endStation: string;
    startAt: number;
    endAt: number;
    durationSeconds: number;
}

export interface AdminAnomalyItem {
    type: AdminAnomalyType;
    subjectCode: string;
    title: string;
    summary: string;
    trainCodes: string[];
    emuCodes: string[];
    durationSeconds: number | null;
    routes: AdminAnomalyRouteRecord[];
}

export interface AdminAnomalyTypeCount {
    type: AdminAnomalyType;
    label: string;
    count: number;
}

export interface AdminAnomalyScanResponse {
    date: string;
    total: number;
    counts: AdminAnomalyTypeCount[];
    items: AdminAnomalyItem[];
}

export interface AdminAnomalyDeleteRouteResponse {
    date: string;
    routeId: string;
    wasToday: boolean;
    deletedDailyRoute: boolean;
    deletedProbeStatusRows: number;
    clearedRuntimeTrainKey: boolean;
    clearedRuntimeEmuCodes: string[];
    clearedDetectionGroups: number;
}

export interface AdminAnomalyBulkDeleteResponse {
    date: string;
    type: AdminAnomalyType;
    wasToday: false;
    matchedItems: number;
    matchedRoutes: number;
    deletedDailyRoutes: number;
    deletedProbeStatusRows: number;
    skippedRoutes: number;
}

export type AdminDailyRouteTimetableResolution =
    | 'exact'
    | 'latest_fallback'
    | 'unresolved';

export interface AdminDailyRouteRecord {
    id: string;
    serviceDate: string;
    trainCode: string;
    emuCode: string;
    timetableId: number | null;
    startStation: string;
    endStation: string;
    startAt: number;
    endAt: number;
}

export interface AdminDailyRouteSearchResponse {
    date: string;
    trainCode: string;
    emuCode: string;
    total: number;
    items: AdminDailyRouteRecord[];
}

export interface AdminDailyRouteTimetableCandidate {
    timetableId: number | null;
    serviceDateStart: string;
    serviceDateEndExclusive: string;
    startStation: string;
    endStation: string;
    startAt: number;
    endAt: number;
    resolution: AdminDailyRouteTimetableResolution;
    isDefault: boolean;
}

export interface AdminDailyRouteTimetableCandidatesResponse {
    date: string;
    trainCode: string;
    defaultTimetableId: number | null;
    items: AdminDailyRouteTimetableCandidate[];
}

export interface AdminDailyRouteCreateResponse {
    date: string;
    trainCode: string;
    emuCode: string;
    timetableId: number | null;
    createdRecord: AdminDailyRouteRecord | null;
    inserted: boolean;
}

export interface AdminDailyRouteDeleteResponse {
    date: string;
    routeId: string;
    wasToday: boolean;
    deletedDailyRoute: boolean;
    deletedProbeStatusRows: number;
    clearedRuntimeTrainKey: boolean;
    clearedRuntimeEmuCodes: string[];
    clearedDetectionGroups: number;
}

export interface AdminTimetableHistoryCoverageSummary {
    coverageId: number;
    timetableId: number;
    serviceDateStart: string;
    serviceDateEndExclusive: string;
    startStation: string;
    endStation: string;
    stopCount: number;
}

export interface AdminTimetableHistoryCoverageMergeCandidate {
    coverageId: number;
    previous: AdminTimetableHistoryCoverageSummary;
    middle: AdminTimetableHistoryCoverageSummary;
    next: AdminTimetableHistoryCoverageSummary;
    mergedServiceDateStart: string;
    mergedServiceDateEndExclusive: string;
}

export interface AdminTimetableHistoryMergeCandidatesResponse {
    trainCode: string;
    total: number;
    items: AdminTimetableHistoryCoverageMergeCandidate[];
}

export interface AdminTimetableHistoryCoverageMergeResponse {
    trainCode: string;
    deletedCoverageIds: number[];
    previous: AdminTimetableHistoryCoverageSummary;
    middle: AdminTimetableHistoryCoverageSummary;
    next: AdminTimetableHistoryCoverageSummary;
    merged: AdminTimetableHistoryCoverageSummary;
}

export type AdminOfficialCirculationMatchType = 'internal_code' | 'all_code';

export interface AdminOfficialCirculationNodePreview {
    internalCode: string;
    allCodes: string[];
    startStation: string;
    endStation: string;
    startAt: number;
    endAt: number;
}

export interface AdminOfficialCirculationSearchItem {
    entryKey: string;
    matchedBy: AdminOfficialCirculationMatchType[];
    matchedCodes: string[];
    refreshedAt: number;
    nodeCount: number;
    nodes: AdminOfficialCirculationNodePreview[];
}

export interface AdminOfficialCirculationSearchResponse {
    keyword: string;
    normalizedKeyword: string;
    filePath: string;
    modifiedAt: number | null;
    total: number;
    items: AdminOfficialCirculationSearchItem[];
}

export interface AdminOfficialCirculationDeleteResponse {
    entryKey: string;
    deletedKeys: string[];
    deletedKeyCount: number;
    modifiedAt: number | null;
}

export type AdminPassiveAlertLevel = 'WARN' | 'ERROR';

export interface AdminPassiveAlertItem {
    id: string;
    timestamp: number;
    level: AdminPassiveAlertLevel;
    logger: string;
    message: string;
}

export interface AdminPassiveAlertTypeCount {
    type: string;
    count: number;
}

export interface AdminAlertLoggerCount {
    logger: string;
    count: number;
}

export interface AdminPassiveAlertsResponse {
    date: string;
    logFile: string | null;
    cursor: string;
    nextCursor: string;
    limit: number;
    total: number;
    filteredTotal: number;
    warnCount: number;
    errorCount: number;
    topLoggers: AdminAlertLoggerCount[];
    typeCounts: AdminPassiveAlertTypeCount[];
    items: AdminPassiveAlertItem[];
}

export type AdminTrafficWindow = '3h' | '24h' | '7d';

export interface AdminTrafficMetricTotals {
    webRequests: number;
    apiCalls: number;
    uniqueVisitors: number;
    activeUsers: number;
}

export type AdminTrafficMetricKey = keyof AdminTrafficMetricTotals;

export interface AdminTrafficMetricPeak {
    startAt: number;
    endAt: number;
    value: number;
}

export interface AdminTrafficBucket extends AdminTrafficMetricTotals {
    startAt: number;
    endAt: number;
}

export interface AdminTrafficWindowSummary {
    key: AdminTrafficWindow;
    label: string;
    bucketSeconds: number;
    bucketCount: number;
    coverageSeconds: number;
    isPartial: boolean;
    estimatedMetrics: AdminTrafficMetricKey[];
    totals: AdminTrafficMetricTotals;
    peaks: AdminTrafficMetricTotals & {
        webRequestsBucket: AdminTrafficMetricPeak | null;
        apiCallsBucket: AdminTrafficMetricPeak | null;
        uniqueVisitorsBucket: AdminTrafficMetricPeak | null;
        activeUsersBucket: AdminTrafficMetricPeak | null;
    };
    buckets: AdminTrafficBucket[];
}

export interface AdminTrafficResponse {
    startedAt: number;
    asOf: number;
    windows: AdminTrafficWindowSummary[];
}

export interface AdminUserListItem {
    userId: string;
    createdAt: number;
    lastLoginAt: number | null;
    isBanned: boolean;
    isAdmin: boolean;
    apiRemainCost: number;
    sponsorshipGroups: SponsorshipGroupSummary[];
    effectiveQuota: SponsorshipEffectiveQuota;
}

export interface AdminUsersResponse {
    totalUsers: number;
    bannedUsers: number;
    asOf: number;
    items: AdminUserListItem[];
}

export type AdminMembershipCodeStatus = 'unused' | 'used';

export interface AdminMembershipCodeBatchSummary {
    batchId: string;
    groupId: string;
    groupName: string;
    durationDays: number;
    quantity: number;
    createdBy: string;
    createdAt: number;
}

export interface AdminMembershipCodeItem extends AdminMembershipCodeBatchSummary {
    code: string;
    status: AdminMembershipCodeStatus;
    usedAt: number | null;
    usedBy: string | null;
}

export interface AdminMembershipCodeListResponse {
    asOf: number;
    total: number;
    usedCount: number;
    unusedCount: number;
    limit: number;
    nextCursor: string;
    catalog: SponsorshipGroupCatalogItem[];
    items: AdminMembershipCodeItem[];
}

export interface AdminCreateMembershipCodeBatchRequest {
    groupId: string;
    quantity: number;
    durationDays: number;
}

export interface AdminCreateMembershipCodeBatchResponse {
    batch: AdminMembershipCodeBatchSummary;
}

export interface AdminUpdateUserBanStateRequest {
    userId: string;
    banned: boolean;
}

export interface AdminUpdateUserBanStateResponse {
    userId: string;
    isBanned: boolean;
    changed: boolean;
    revokedWebappApiKeyCount: number;
    updatedAt: number;
}

export type AdminUserBanAction = 'ban' | 'unban';

export type AdminUserBanActionStatus =
    | 'pending'
    | 'succeeded'
    | 'failed'
    | 'skipped';

export type AdminUserBanActionSource =
    | 'admin_manual'
    | 'qq_ban_list'
    | 'fingerprint_match';

export interface AdminQqBanListItem {
    qqNumber: string;
    addedAt: number;
    addedBy: string;
}

export interface AdminUserBanActionItem {
    id: number;
    userId: string;
    action: AdminUserBanAction;
    status: AdminUserBanActionStatus;
    source: AdminUserBanActionSource;
    reason: string;
    actorUserId: string | null;
    qqNumber: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    matchedActionId: number | null;
    changed: boolean | null;
    requestedAt: number;
    completedAt: number | null;
    errorMessage: string | null;
}

export type AdminUserRiskCaseStatus =
    | 'pending'
    | 'active'
    | 'escalating'
    | 'escalated'
    | 'failed'
    | 'cleared';

export interface AdminUserRiskCaseItem {
    id: number;
    userId: string;
    status: AdminUserRiskCaseStatus;
    fingerprintId: number | null;
    matchedActionId: number;
    ipAddress: string;
    userAgent: string;
    qqNumber: string | null;
    banActionId: number | null;
    detectedAt: number;
    updatedAt: number;
    escalatedAt: number | null;
    clearedAt: number | null;
    clearedBy: string | null;
    errorMessage: string | null;
}

export interface AdminUserSecurityResponse {
    asOf: number;
    banCorrelationWindowSeconds: number;
    qqBanList: AdminQqBanListItem[];
    banActions: AdminUserBanActionItem[];
    riskCases: AdminUserRiskCaseItem[];
}

export interface AdminClearUserRiskResponse {
    userId: string;
    riskCaseId: number | null;
    changed: boolean;
    exemptionExpiresAt: number | null;
    clearedAt: number;
}

export interface AdminAddQqBanListResponse {
    created: boolean;
    item: AdminQqBanListItem;
}

export interface AdminRemoveQqBanListResponse {
    qqNumber: string;
    removed: boolean;
}

export interface AdminResetUserQuotaRequest {
    userId: string;
}

export interface AdminResetUserQuotaResponse {
    userId: string;
    apiRemainCost: number;
    effectiveQuota: {
        tokenLimit: number;
        refillAmount: number;
        refillIntervalSeconds: number;
    };
}

export type AdminConfigFileTarget =
    | 'config'
    | 'EMUList'
    | 'QRCode'
    | 'stationCoord'
    | 'trainStyleMapping'
    | 'qrcodeDetection';

export type AdminConfigFileAction = 'reload_local' | 'refresh_remote';

export interface AdminConfigFileItem {
    target: AdminConfigFileTarget;
    title: string;
    description: string;
    filePath: string;
    provider: string | null;
    exists: boolean;
    modifiedAt: number | null;
    supportedActions: AdminConfigFileAction[];
}

export interface AdminConfigFilesResponse {
    asOf: number;
    items: AdminConfigFileItem[];
}

export interface AdminConfigFileActionRequest {
    target: AdminConfigFileTarget;
    action: AdminConfigFileAction;
}

export interface AdminConfigFileActionResponse {
    target: AdminConfigFileTarget;
    action: AdminConfigFileAction;
    summary: string;
    item: AdminConfigFileItem;
}

export type AdminServerMetricsWindow = '4h' | '24h';

export interface AdminServerMetricsPeak {
    startAt: number;
    endAt: number;
    value: number;
}

export interface AdminServerMetricsBucket {
    startAt: number;
    endAt: number;
    systemSampleCount: number;
    cpuPercent: number | null;
    memoryUsedRatio: number | null;
    memoryUsedBytes: number | null;
    memoryTotalBytes: number | null;
    load1m: number | null;
    ssrRequestCount: number;
    ssrAvgDurationMs: number | null;
    ssrP50DurationMs: number | null;
    ssrP75DurationMs: number | null;
    ssrP95DurationMs: number | null;
    apiRequestCount: number;
    apiAvgDurationMs: number | null;
    apiP50DurationMs: number | null;
    apiP75DurationMs: number | null;
    apiP95DurationMs: number | null;
}

export interface AdminServerMetricsTopRoute {
    path: string;
    requestCount: number;
    avgDurationMs: number | null;
    p50DurationMs: number | null;
    p75DurationMs: number | null;
    p95DurationMs: number | null;
}

export interface AdminServerMetricsWindowSummary {
    key: AdminServerMetricsWindow;
    label: string;
    bucketSeconds: number;
    bucketCount: number;
    coverageSeconds: number;
    isPartial: boolean;
    latest: AdminServerMetricsBucket | null;
    peaks: {
        cpuPercentBucket: AdminServerMetricsPeak | null;
        memoryUsedRatioBucket: AdminServerMetricsPeak | null;
        load1mBucket: AdminServerMetricsPeak | null;
        ssrAvgDurationMsBucket: AdminServerMetricsPeak | null;
        ssrP50DurationMsBucket: AdminServerMetricsPeak | null;
        ssrP75DurationMsBucket: AdminServerMetricsPeak | null;
        ssrP95DurationMsBucket: AdminServerMetricsPeak | null;
        apiAvgDurationMsBucket: AdminServerMetricsPeak | null;
        apiP50DurationMsBucket: AdminServerMetricsPeak | null;
        apiP75DurationMsBucket: AdminServerMetricsPeak | null;
        apiP95DurationMsBucket: AdminServerMetricsPeak | null;
    };
    topRoutes: {
        ssr: AdminServerMetricsTopRoute[];
        api: AdminServerMetricsTopRoute[];
    };
    buckets: AdminServerMetricsBucket[];
}

export interface AdminServerMetricsResponse {
    startedAt: number;
    asOf: number;
    lastSampleAt: number | null;
    loadAverageSupported: boolean;
    windows: AdminServerMetricsWindowSummary[];
}

export type AdminTaskTemplateType =
    | 'regenerate_daily_export'
    | 'refresh_route_info_now'
    | 'refresh_train_circulation_now'
    | 'refresh_all_routes_and_requeue_probe_now'
    | 'detect_coupled_emu_group_now'
    | 'run_qrcode_detection_now'
    | 'dispatch_station_board_tasks_now';

export interface AdminCreatedTask {
    taskId: number;
    executor: string;
    executionTime: number;
}

export interface AdminRegenerateDailyExportTaskRequest {
    type: 'regenerate_daily_export';
    payload: {
        date: string;
    };
}

export interface AdminRefreshRouteInfoNowTaskRequest {
    type: 'refresh_route_info_now';
    payload: {
        trainCodes: string[];
    };
}

export interface AdminRefreshTrainCirculationNowTaskRequest {
    type: 'refresh_train_circulation_now';
    payload: {
        trainCode: string;
    };
}

export interface AdminRefreshAllRoutesAndRequeueProbeNowTaskRequest {
    type: 'refresh_all_routes_and_requeue_probe_now';
    payload: Record<string, never>;
}

export interface AdminDetectCoupledEmuGroupNowTaskRequest {
    type: 'detect_coupled_emu_group_now';
    payload: {
        bureau: string;
        model: string;
    };
}

export interface AdminRunQrcodeDetectionNowTaskRequest {
    type: 'run_qrcode_detection_now';
    payload: Record<string, never>;
}

export interface AdminDispatchStationBoardTasksNowTaskRequest {
    type: 'dispatch_station_board_tasks_now';
    payload: Record<string, never>;
}

export type AdminCreateTaskRequest =
    | AdminRegenerateDailyExportTaskRequest
    | AdminRefreshRouteInfoNowTaskRequest
    | AdminRefreshTrainCirculationNowTaskRequest
    | AdminRefreshAllRoutesAndRequeueProbeNowTaskRequest
    | AdminDetectCoupledEmuGroupNowTaskRequest
    | AdminRunQrcodeDetectionNowTaskRequest
    | AdminDispatchStationBoardTasksNowTaskRequest;

export interface AdminCreateTaskResponse {
    type: AdminTaskTemplateType;
    createdCount: number;
    createdTasks: AdminCreatedTask[];
    summary: string;
    date?: string;
    normalizedTrainCodes?: string[];
}

export interface AdminCouplingScanOptionGroup {
    bureau: string;
    models: string[];
}

export interface AdminTaskOverviewResponse {
    asOf: number;
    nextTaskId: number | null;
    remainingTotal: number;
    remainingWithin10Minutes: number;
    remainingWithin30Minutes: number;
    remainingWithin1Hour: number;
    couplingScanOptions: AdminCouplingScanOptionGroup[];
}
export interface AdminRevokeAllWebappTokensResponse {
    issuer: 'webapp';
    revokedCount: number;
    revokedAt: number;
    revokedCurrentSession: boolean;
}

export type AdminTrainProvenanceTaskRunStatus =
    | 'running'
    | 'success'
    | 'failed'
    | 'skipped';

export type AdminTrainProvenanceLatestStatus =
    | 'unknown'
    | 'pending'
    | 'single'
    | 'coupled';

export interface AdminDailyRouteTrackingRecord {
    id: number;
    trainCode: string;
    emuCode: string;
    serviceDate: string;
    timetableId: number | null;
    startStation: string;
    endStation: string;
    startAt: number;
    endAt: number;
    isTimetableResolved: boolean;
}

export interface AdminProbeStatusRecord {
    id: number;
    trainCode: string;
    emuCode: string;
    serviceDate: string;
    timetableId: number | null;
    status: number;
    statusLabel: AdminTrainProvenanceLatestStatus;
    startAt: number;
    isTimetableResolved: boolean;
}

export type AdminTrackingMutationTable = 'daily_emu_routes' | 'probe_status';

export type AdminTrackingMutationAction =
    | 'created'
    | 'updated'
    | 'deleted'
    | 'unchanged'
    | 'cleared'
    | 'downgraded';

export interface AdminTrackingMutation {
    table: AdminTrackingMutationTable;
    action: AdminTrackingMutationAction;
    id: number | null;
    trainCode: string;
    emuCode: string;
    serviceDate: string;
    timetableId: number | null;
    startAt: number | null;
    previousStatus: number | null;
    nextStatus: number | null;
    rowCount: number;
}

export interface AdminTrackingMutationSummary {
    mutations: AdminTrackingMutation[];
    dailyRouteCreated: number;
    dailyRouteUpdated: number;
    dailyRouteDeleted: number;
    probeStatusCreated: number;
    probeStatusUpdated: number;
    probeStatusDeleted: number;
    probeStatusUnchanged: number;
}

export interface AdminTrainProvenanceDeparture {
    startAt: number;
    endAt: number | null;
    startStation: string;
    endStation: string;
    latestStatus: AdminTrainProvenanceLatestStatus;
    emuCodes: string[];
    dailyRouteRows: AdminDailyRouteTrackingRecord[];
    probeStatusRows: AdminProbeStatusRecord[];
}

export type AdminTrainProvenanceConflictState =
    | 'running'
    | 'not_running'
    | 'request_failed';

export interface AdminTrainProvenanceConflictCurrentGroup {
    trainCodes: string[];
    startAt: number | null;
    endAt: number | null;
    startStation: string;
    endStation: string;
}

export interface AdminTrainProvenanceConflictGroup {
    trainCodes: string[];
    startAt: number | null;
    endAt: number | null;
    overlapStartAt: number | null;
    overlapEndAt: number | null;
    startStation: string;
    endStation: string;
    state: AdminTrainProvenanceConflictState;
}

export interface AdminTrainProvenanceConflictDetail {
    mode: 'requeued' | 'dropped';
    currentGroup: AdminTrainProvenanceConflictCurrentGroup | null;
    conflictGroups: AdminTrainProvenanceConflictGroup[];
}

export type AdminTrainProvenanceCouplingScanState = 'queued' | 'resolved';

export interface AdminTrainProvenanceCouplingScanDetail {
    state: AdminTrainProvenanceCouplingScanState;
    queuedSchedulerTaskId: number | null;
    queuedTaskRunId: number | null;
    resultSchedulerTaskId: number | null;
    resultTaskRunId: number | null;
    canOpenDetail: boolean;
}

export interface AdminTrainRouteSnapshot {
    serviceDate: string;
    trainCodes: string[];
    internalCode: string;
    startAt: number | null;
    endAt: number | null;
    startStation: string;
    endStation: string;
    cacheStatus: 'hit' | 'miss' | 'not_applicable';
    cacheNote: string;
}

export interface AdminTrainProvenanceHistoricalReuseDetail {
    historicalRoute: AdminTrainRouteSnapshot | null;
    resultStatus: 'single' | 'coupled';
    emuCodes: string[];
}

export interface AdminTrainProvenanceCoupledResolutionDetail {
    route: AdminTrainRouteSnapshot | null;
    emuCodes: string[];
    upgradedFromSingle: boolean;
}

export type AdminTrainProvenanceOutcomeStatus =
    | 'success'
    | 'partial'
    | 'failed'
    | 'skipped';

export type AdminStationPlatformRefreshTrigger =
    | 'route_refresh'
    | 'station_board';

export type AdminStationPlatformRefreshStatus =
    AdminTrainProvenanceOutcomeStatus;

export type AdminStationPlatformRefreshEntryStatus =
    | 'updated'
    | 'cache_hit'
    | 'cache_fallback'
    | 'no_data'
    | 'request_failed'
    | 'persist_failed';

export interface AdminStationPlatformRefreshSummary {
    resultId: number;
    trigger: AdminStationPlatformRefreshTrigger;
    status: AdminStationPlatformRefreshStatus;
    candidateCount: number;
    updatedCount: number;
    cacheHitCount: number;
    cacheFallbackCount: number;
    noDataCount: number;
    failedCount: number;
}

export interface AdminStationPlatformRefreshEntry {
    id: number;
    stationOrder: number;
    lookupType: string;
    stationName: string;
    stationTelecode: string;
    stationNo: number;
    trainDate: string;
    stationTrainCodes: string[];
    attemptedTrainCodes: string[];
    status: AdminStationPlatformRefreshEntryStatus;
    platformNo: number | null;
    wicket: string | null;
    fetchedAt: number | null;
    errorMessage: string;
}

export interface AdminTrainProvenanceEvent {
    id: number;
    taskRunId: number;
    schedulerTaskId: number;
    executor: string;
    taskStatus: AdminTrainProvenanceTaskRunStatus;
    outcomeStatus: AdminTrainProvenanceOutcomeStatus | null;
    createdAt: number;
    trainCode: string;
    startAt: number | null;
    emuCode: string;
    relatedTrainCode: string;
    relatedEmuCode: string;
    eventType: string;
    result: string;
    summary: string;
    linkedSchedulerTaskId: number | null;
    linkedTaskRunId: number | null;
    conflictDetail: AdminTrainProvenanceConflictDetail | null;
    couplingScan: AdminTrainProvenanceCouplingScanDetail | null;
    scannedRoute: AdminTrainRouteSnapshot | null;
    historicalReuse: AdminTrainProvenanceHistoricalReuseDetail | null;
    coupledResolution: AdminTrainProvenanceCoupledResolutionDetail | null;
    trackingMutations: AdminTrackingMutationSummary | null;
    stationPlatformRefresh: AdminStationPlatformRefreshSummary | null;
    payload: unknown;
}

export type AdminTrainDataRequestType =
    | 'search_train_code'
    | 'fetch_route_info'
    | 'fetch_emu_by_route'
    | 'fetch_emu_by_seat_code'
    | 'fetch_all_stations'
    | 'fetch_station_board'
    | 'fetch_station_exit_info'
    | 'fetch_station_transport_info';

export interface AdminTrainDataRequestMetrics {
    total: number;
    success: number;
    failure: number;
    successRate: number | null;
}

export interface AdminTrainDataRequestComparison {
    compareTotal: number;
    compareSuccess: number;
    compareFailure: number;
    totalDelta: number;
    successDelta: number;
    failureDelta: number;
    totalChangeRatio: number | null;
    successChangeRatio: number | null;
    failureChangeRatio: number | null;
}

export interface AdminTrainDataRequestSummary
    extends AdminTrainDataRequestMetrics, AdminTrainDataRequestComparison {}

export interface AdminTrainDataRequestTypeSummary extends AdminTrainDataRequestSummary {
    type: AdminTrainDataRequestType;
}

export interface AdminTrainDataRequestHourBucket extends AdminTrainDataRequestSummary {
    hour: number;
    startAt: number;
    endAt: number;
    types: AdminTrainDataRequestTypeSummary[];
}

export interface AdminTrainDataRequestStatsResponse {
    enabled: boolean;
    retentionDays: number;
    date: string;
    compareDate: string;
    asOf: number;
    totals: AdminTrainDataRequestSummary;
    types: AdminTrainDataRequestTypeSummary[];
    hours: AdminTrainDataRequestHourBucket[];
}

export interface AdminTrainProvenanceResponse {
    enabled: boolean;
    retentionDays: number;
    date: string;
    trainCode: string;
    selectedStartAt: number | null;
    departures: AdminTrainProvenanceDeparture[];
    timeline: AdminTrainProvenanceEvent[];
}

export interface AdminStationPlatformRefreshDetailResponse {
    enabled: boolean;
    result:
        | (AdminStationPlatformRefreshSummary & {
              taskRunId: number;
              serviceDate: string;
              startAt: number | null;
              primaryTrainCode: string;
              trainCodes: string[];
              errorMessage: string;
              createdAt: number;
          })
        | null;
    entries: AdminStationPlatformRefreshEntry[];
}

export interface AdminCouplingScanTaskRunSummary {
    id: number;
    schedulerTaskId: number;
    executor: string;
    status: AdminTrainProvenanceTaskRunStatus;
    startedAt: number;
    finishedAt: number | null;
    serviceDate: string;
    taskArgs: unknown;
}

export interface AdminCouplingScanTaskListItem {
    taskRunId: number;
    schedulerTaskId: number;
    executor: string;
    status: AdminTrainProvenanceTaskRunStatus;
    startedAt: number;
    finishedAt: number | null;
    serviceDate: string;
    bureau: string;
    model: string;
    taskArgs: unknown;
}

export interface AdminCouplingScanCandidate {
    id: number;
    candidateOrder: number;
    serviceDate: string;
    candidateEmuCode: string;
    status: string;
    reason: string;
    scannedTrainCode: string;
    scannedInternalCode: string;
    scannedStartAt: number | null;
    matchedTrainCode: string;
    matchedStartAt: number | null;
    trainRepeat: string;
    scannedRoute: AdminTrainRouteSnapshot | null;
    matchedRoute: AdminTrainRouteSnapshot | null;
    occupiedRoutes: AdminTrainRouteSnapshot[];
    detail: unknown;
    createdAt: number;
}

export interface AdminCouplingScanDetailResponse {
    enabled: boolean;
    taskRun: AdminCouplingScanTaskRunSummary | null;
    candidates: AdminCouplingScanCandidate[];
}

export interface AdminCouplingScanTaskListResponse {
    enabled: boolean;
    retentionDays: number;
    date: string;
    items: AdminCouplingScanTaskListItem[];
}

export interface AdminQrcodeScanTaskRunSummary {
    id: number;
    schedulerTaskId: number;
    executor: string;
    status: AdminTrainProvenanceTaskRunStatus;
    startedAt: number;
    finishedAt: number | null;
    serviceDate: string;
    detectedAt: string;
    emuCode: string;
    manualNow: boolean;
    taskArgs: unknown;
}

export interface AdminQrcodeScanTimeSummaryItem {
    detectedAt: string;
    total: number;
    successCount: number;
    failedCount: number;
    skippedCount: number;
    pendingCouplingCount: number;
}

export interface AdminQrcodeScanTaskListResponse {
    enabled: boolean;
    retentionDays: number;
    date: string;
    items: AdminQrcodeScanTimeSummaryItem[];
}

export interface AdminQrcodeScanTimeDetailTaskItem {
    taskRun: AdminQrcodeScanTaskRunSummary;
    timeline: AdminTrainProvenanceEvent[];
}

export interface AdminQrcodeScanDetailResponse {
    enabled: boolean;
    date: string;
    detectedAt: string;
    summary: AdminQrcodeScanTimeSummaryItem | null;
    tasks: AdminQrcodeScanTimeDetailTaskItem[];
}

export interface AdminStationBoardDispatchTaskListItem {
    taskRunId: number;
    schedulerTaskId: number;
    executor: string;
    status: AdminTrainProvenanceTaskRunStatus;
    startedAt: number;
    finishedAt: number | null;
    serviceDate: string;
    candidateGroupCount: number;
    selectedStationCount: number;
    createdTaskCount: number;
    reusedTaskCount: number;
    skippedNotFoundCount: number;
    skippedAmbiguousCount: number;
    selectedStations: string[];
    selectedStationItems: AdminStationBoardSelectedStationItem[];
    taskArgs: unknown;
}

export interface AdminStationBoardTaskListResponse {
    enabled: boolean;
    retentionDays: number;
    date: string;
    items: AdminStationBoardDispatchTaskListItem[];
}

export interface AdminStationBoardRow {
    trainNo: string;
    stationTrainCode: string;
    circulationTrain: string;
    startStationName: string;
    endStationName: string;
    saveStatus: 'saved' | 'not_saved' | 'unknown_legacy';
    saveReasonCode: string;
    saveReasonText: string;
}

export type AdminStationBoardStationTaskAction =
    | 'created'
    | 'reused'
    | 'station_telecode_not_found'
    | 'station_telecode_ambiguous';

export type AdminStationBoardFetchResultStatus =
    | 'saved_entries'
    | 'no_official_entries';

export interface AdminStationBoardSelectedStationItem {
    key: string;
    stationName: string;
    stationTelecode: string;
    displayName: string;
}

export interface AdminStationBoardStationTaskItem {
    key: string;
    stationName: string;
    stationTelecode: string;
    displayName: string;
    action: AdminStationBoardStationTaskAction;
    schedulerTaskId: number | null;
    taskRunId: number | null;
    taskStatus: AdminTrainProvenanceTaskRunStatus | null;
    startedAt: number | null;
    finishedAt: number | null;
    resultStatus: AdminStationBoardFetchResultStatus | null;
    rowCount: number;
    parsedEntryCount: number;
    savedEntryCount: number;
    consumedQueueEntryCount: number;
    rows: AdminStationBoardRow[];
    ambiguousTelecodes: string[];
}

export interface AdminStationBoardDispatchDetailResponse {
    enabled: boolean;
    taskRunId: number;
    schedulerTaskId: number | null;
    serviceDate: string;
    status: AdminTrainProvenanceTaskRunStatus | null;
    startedAt: number | null;
    finishedAt: number | null;
    candidateGroupCount: number;
    selectedStations: string[];
    selectedStationItems: AdminStationBoardSelectedStationItem[];
    createdTaskCount: number;
    reusedTaskCount: number;
    skippedNotFoundCount: number;
    skippedAmbiguousCount: number;
    stations: AdminStationBoardStationTaskItem[];
}
