import type { TrainCodeParts } from '~/server/utils/12306/trainCode';
import type { ServiceDay } from '~/server/utils/date/serviceDay';

export interface ScheduleProbePrefixRule {
    prefix: string;
    minNo: number;
    maxNo: number;
    track: boolean;
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
    stationTelecode: string;
    arriveAt: number | null;
    departAt: number | null;
    stationTrainCode: TrainCodeParts;
    wicket: string;
    distance?: number | null;
    platformNo?: number | null;
    stationPlatformInfoFetchedAt?: number | null;
    isStart: boolean;
    isEnd: boolean;
}

export interface ScheduleStationEntry {
    stationTelecode: string;
    stationName: string;
    lat: number;
    lon: number;
}

export type ScheduleStationMap = Record<string, ScheduleStationEntry>;

export interface ScheduleItem {
    code: TrainCodeParts;
    internalCode: string;
    allCodes: TrainCodeParts[];
    bureauCode: string;
    trainStyle: string;
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
    failedEnrichCodes: TrainCodeParts[];
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
    date: ServiceDay;
    lastBuildDate: ServiceDay;
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
    trainCode: TrainCodeParts;
    serviceDate: ServiceDay;
    enqueuedAt: number;
}

export interface ScheduleCirculationEntry {
    refreshedAt: number;
    nodes: ScheduleCirculationNode[];
}

export interface ScheduleCirculationNode {
    internalCode: string;
    allCodes: TrainCodeParts[];
    startStation: string;
    endStation: string;
    startAt: number;
    endAt: number;
}

export type ScheduleCirculationMap = Record<string, ScheduleCirculationEntry>;

export interface ScheduleDocument {
    $schema: string;
    version: 8;
    stations: ScheduleStationMap;
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
    stationPlatformTaskCandidates: BuildScheduleStationPlatformTaskCandidate[];
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

export interface BuildScheduleStationPlatformTaskCandidate {
    trainCode: TrainCodeParts;
    trainInternalCode: string;
    startAt: number;
    stopCount: number;
}
