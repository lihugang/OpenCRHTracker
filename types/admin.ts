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

export interface Admin12306RequestBucket {
    startAt: number;
    endAt: number;
    total: number;
    byOperation: Record<string, number>;
}

export type Admin12306TraceStatus = 'running' | 'success' | 'warning' | 'error';

export type Admin12306TraceEventKind =
    | 'function'
    | 'request'
    | 'conflict'
    | 'decision'
    | 'database'
    | 'summary';

export type Admin12306TraceEventLevel = 'INFO' | 'WARN' | 'ERROR';

export interface Admin12306TraceEventBase {
    id: string;
    timestamp: number;
    kind: Admin12306TraceEventKind;
    level: Admin12306TraceEventLevel;
    title: string;
    message: string;
    durationMs: number | null;
    invocationId: string;
    parentInvocationId: string | null;
    context: Record<string, string>;
}

export interface Admin12306TraceFunctionEvent extends Admin12306TraceEventBase {
    kind: 'function';
    functionName: string;
    status: 'success' | 'warning' | 'error';
}

export interface Admin12306TraceRequestEvent extends Admin12306TraceEventBase {
    kind: 'request';
    operation: string;
    requestType: 'query' | 'search';
    method: string;
    url: string;
    responseStatus: number | null;
    businessStatus: string;
    errorCode: string;
    errorMessage: string;
}

export interface Admin12306TraceConflictEvent extends Admin12306TraceEventBase {
    kind: 'conflict';
    operation: string;
}

export interface Admin12306TraceDecisionEvent extends Admin12306TraceEventBase {
    kind: 'decision';
    operation: string;
}

export interface Admin12306TraceDatabaseEvent extends Admin12306TraceEventBase {
    kind: 'database';
    operation: string;
    database: string;
    table: string;
    changes: number | null;
}

export interface Admin12306TraceSummaryEvent extends Admin12306TraceEventBase {
    kind: 'summary';
    status: Admin12306TraceStatus;
}

export type Admin12306TraceEvent =
    | Admin12306TraceFunctionEvent
    | Admin12306TraceRequestEvent
    | Admin12306TraceConflictEvent
    | Admin12306TraceDecisionEvent
    | Admin12306TraceDatabaseEvent
    | Admin12306TraceSummaryEvent;

export interface Admin12306TraceListItem {
    traceId: string;
    title: string;
    subtitle: string;
    primaryTrainCode: string;
    allTrainCodes: string[];
    trainInternalCode: string;
    startAt: number | null;
    taskId: number | null;
    executor: string;
    status: Admin12306TraceStatus;
    startedAt: number;
    endedAt: number | null;
    requestCount: number;
    conflictCount: number;
    functionCount: number;
}

export interface Admin12306TraceDetailItem extends Admin12306TraceListItem {
    events: Admin12306TraceEvent[];
}

export interface Admin12306TraceListResponse {
    date: string;
    cursor: string;
    nextCursor: string;
    limit: number;
    total: number;
    filteredTotal: number;
    requestMetricsEnabled: boolean;
    requestMetricsRetentionDays: number;
    requestMetricsRetained: boolean;
    items: Admin12306TraceListItem[];
}

export interface Admin12306TraceDetailResponse {
    date: string;
    requestMetricsEnabled: boolean;
    requestMetricsRetentionDays: number;
    requestMetricsRetained: boolean;
    trace: Admin12306TraceDetailItem | null;
}

export type Admin12306TrainTraceResultStatus =
    | 'single'
    | 'coupled'
    | 'pending'
    | 'unknown';

export type Admin12306TrainTraceSourceKind =
    | 'route_query'
    | 'reuse_status'
    | 'coupling_scan'
    | 'asset_resolve'
    | 'history_validation';

export interface Admin12306TrainTraceSourceRow {
    id: string;
    timestamp: number;
    source: string;
    result: string;
    detail: string;
    kind: Admin12306TrainTraceSourceKind;
    level: Admin12306TraceEventLevel;
    clickable: boolean;
    actionType: 'open_coupling_task' | null;
    couplingTaskId: number | null;
    couplingTaskDate: string | null;
}

export interface Admin12306TrainTraceDayItem {
    date: string;
    queryTrainCode: string;
    matchedTrainCodes: string[];
    relatedEmuCodes: string[];
    traceCount: number;
    resultStatus: Admin12306TrainTraceResultStatus;
    resultLabel: string;
    rows: Admin12306TrainTraceSourceRow[];
}

export interface Admin12306TrainTraceSearchResponse {
    date: string;
    queryTrainCode: string;
    searchedDayCount: number;
    matchedDayCount: number;
    requestMetricsEnabled: boolean;
    requestMetricsRetentionDays: number;
    requestMetricsRetained: boolean;
    items: Admin12306TrainTraceDayItem[];
}

export type Admin12306CouplingTaskEntryTone =
    | 'neutral'
    | 'success'
    | 'warning'
    | 'danger';

export interface Admin12306CouplingTaskSummaryItem {
    id: string;
    timestamp: number;
    title: string;
    detail: string;
    level: Admin12306TraceEventLevel;
}

export interface Admin12306CouplingTaskResultEntry {
    id: string;
    timestamp: number;
    title: string;
    result: string;
    detail: string;
    startAt: number | null;
    groupKey: string;
    emuCodes: string[];
    level: Admin12306TraceEventLevel;
    tone: Admin12306CouplingTaskEntryTone;
}

export interface Admin12306CouplingTaskTrainGroup {
    key: string;
    primaryTrainCode: string;
    trainCodes: string[];
    isUnassigned: boolean;
    items: Admin12306CouplingTaskResultEntry[];
}

export interface Admin12306CouplingTaskMeta {
    taskId: number;
    date: string;
    executor: string;
    status: Admin12306TraceStatus;
    startedAt: number;
    endedAt: number | null;
    bureau: string;
    model: string;
}

export interface Admin12306CouplingTaskResponse {
    date: string;
    taskId: number;
    requestMetricsEnabled: boolean;
    requestMetricsRetentionDays: number;
    requestMetricsRetained: boolean;
    task: Admin12306CouplingTaskMeta | null;
    summaries: Admin12306CouplingTaskSummaryItem[];
    groups: Admin12306CouplingTaskTrainGroup[];
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
    requestMetricsEnabled: boolean;
    requestMetricsRetentionDays: number;
    requestMetricsRetained: boolean;
    requestBuckets: Admin12306RequestBucket[];
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

export interface AdminRevokeAllWebappTokensResponse {
    issuer: 'webapp';
    revokedCount: number;
    revokedAt: number;
    revokedCurrentSession: boolean;
}
