import type { TrainCirculationNode } from '~/types/lookup';

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
    bureauCode: string;
    trainDepartment: string;
    passengerDepartment: string;
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

export interface ScheduleRouteRefreshQueueEntry {
    trainCode: string;
    serviceDate: string;
    enqueuedAt: number;
}

export interface ScheduleCirculationEntry {
    refreshedAt: number;
    nodes: TrainCirculationNode[];
}

export type ScheduleCirculationMap = Record<string, ScheduleCirculationEntry>;

export interface ScheduleDocument {
    $schema: string;
    version: 5;
    circulation: ScheduleCirculationMap;
    routeRefreshQueue: ScheduleRouteRefreshQueueEntry[];
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
