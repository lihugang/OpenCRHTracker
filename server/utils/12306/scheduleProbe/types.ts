export interface ScheduleProbePrefixRule {
    prefix: string;
    minNo: number;
    maxNo: number;
}

export interface ScheduleProbeRuntimeConfig {
    retryAttempts: number;
    maxBatchSize: number;
    checkpointFlushEvery: number;
    prefixRules: ScheduleProbePrefixRule[];
}

export interface ScheduleStop {
    stationNo: number;
    stationName: string;
    arriveAt: number | null;
    departAt: number | null;
    stationTrainCode: string;
    wicket: string;
    isStart: boolean;
    isEnd: boolean;
}

export interface ScheduleItem {
    code: string;
    internalCode: string;
    allCodes: string[];
    startStation: string;
    endStation: string;
    startAt: number | null;
    endAt: number | null;
    lastRouteRefreshAt: number | null;
    stops: ScheduleStop[];
}

export type ScheduleStatus = 'running' | 'done' | 'partial_failed';

export type SchedulePhase = 'discover' | 'enrich' | 'done';

export type ScheduleDiscoverMode = 'full' | 'retry';

export interface ScheduleProgress {
    phase: SchedulePhase;
    discoverMode: ScheduleDiscoverMode;
    discoverQueue: string[];
    discoverProcessed: string[];
    enrichCursor: number;
    failedKeywords: string[];
    failedEnrichCodes: string[];
    counters: {
        apiCalls: number;
        apiRetries: number;
    };
}

export interface ScheduleStats {
    rawItems: number;
    uniqueItems: number;
    durationMs: number;
}

export interface ScheduleState {
    date: string;
    lastBuildDate: string;
    status: ScheduleStatus;
    strategy: {
        retryAttempts: number;
        maxBatchSize: number;
        checkpointFlushEvery: number;
    };
    scope: {
        prefixRules: ScheduleProbePrefixRule[];
    };
    progress: ScheduleProgress;
    items: ScheduleItem[];
    stats: ScheduleStats;
    startedAtMs: number;
    generatedAt: number;
}

export interface ScheduleDocument {
    $schema: string;
    version: 4;
    published: ScheduleState | null;
    building: ScheduleState | null;
}

export interface BuildScheduleResult {
    ok: boolean;
    resumed: boolean;
    date: string;
    file: string;
    stats: {
        apiCalls: number;
        apiRetries: number;
        processedKeywords: number;
        pendingKeywords: number;
        rawItems: number;
        uniqueItems: number;
        durationMs: number;
    };
    failedKeywords: string[];
    failedEnrichCodes: string[];
}
