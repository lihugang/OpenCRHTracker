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
