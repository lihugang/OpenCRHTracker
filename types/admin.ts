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

export type AdminPassiveAlertLevel = 'WARN' | 'ERROR';

export interface AdminPassiveAlertItem {
    timestamp: number;
    level: AdminPassiveAlertLevel;
    logger: string;
    message: string;
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
    total: number;
    warnCount: number;
    errorCount: number;
    topLoggers: AdminAlertLoggerCount[];
    truncated: boolean;
    requestBuckets: Admin12306RequestBucket[];
    items: AdminPassiveAlertItem[];
}
