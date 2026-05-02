export type AdminAnomalyType = 'train_multi_emu' | 'emu_single_short_route';

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
    apiRemainCost: number;
}

export interface AdminUsersResponse {
    totalUsers: number;
    asOf: number;
    items: AdminUserListItem[];
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
    | 'refresh_route_info_now';

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

export type AdminCreateTaskRequest =
    | AdminRegenerateDailyExportTaskRequest
    | AdminRefreshRouteInfoNowTaskRequest;

export interface AdminCreateTaskResponse {
    type: AdminTaskTemplateType;
    createdCount: number;
    createdTasks: AdminCreatedTask[];
    summary: string;
    date?: string;
    normalizedTrainCodes?: string[];
}

export interface AdminTaskOverviewResponse {
    asOf: number;
    remainingTotal: number;
    remainingWithin10Minutes: number;
    remainingWithin30Minutes: number;
    remainingWithin1Hour: number;
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

export interface AdminTrainProvenanceDeparture {
    startAt: number;
    endAt: number | null;
    startStation: string;
    endStation: string;
    latestStatus: AdminTrainProvenanceLatestStatus;
    emuCodes: string[];
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

export interface AdminTrainProvenanceEvent {
    id: number;
    taskRunId: number;
    schedulerTaskId: number;
    executor: string;
    taskStatus: AdminTrainProvenanceTaskRunStatus;
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
    historicalReuse: AdminTrainProvenanceHistoricalReuseDetail | null;
    coupledResolution: AdminTrainProvenanceCoupledResolutionDetail | null;
    payload: unknown;
}

export type AdminTrainDataRequestType =
    | 'search_train_code'
    | 'fetch_route_info'
    | 'fetch_emu_by_route'
    | 'fetch_emu_by_seat_code';

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
    extends AdminTrainDataRequestMetrics,
        AdminTrainDataRequestComparison {}

export interface AdminTrainDataRequestTypeSummary
    extends AdminTrainDataRequestSummary {
    type: AdminTrainDataRequestType;
}

export interface AdminTrainDataRequestHourBucket
    extends AdminTrainDataRequestSummary {
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
