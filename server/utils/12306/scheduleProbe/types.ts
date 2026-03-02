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

export interface ScheduleItem {
    code: string;
    internalCode: string;
    startAt: number | null;
    endAt: number | null;
    lastRouteRefreshAt: number | null;
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

export interface ScheduleFile {
    $schema: string;
    version: 1;
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
