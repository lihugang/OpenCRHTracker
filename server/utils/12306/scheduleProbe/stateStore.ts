import fs from 'fs';
import path from 'path';
import getCurrentDateString from '../../date/getCurrentDateString';
import normalizeCode from '../normalizeCode';
import uniqueNormalizedCodes from '../uniqueNormalizedCodes';
import {
    CURRENT_SCHEDULE_DOCUMENT_VERSION,
    LEGACY_SCHEDULE_JSON_PATH,
    SCHEDULE_SCHEMA_RELATIVE_PATH
} from './constants';
import { filterInvalidScheduleItems } from './filterInvalidScheduleItems';
import { getInitialKeywords } from './prefixTree';
import {
    appendScheduleRouteRefreshQueueEntries,
    consumeScheduleRouteRefreshQueueEntries,
    deleteScheduleCirculationEntryFromDatabase,
    hasScheduleDatabaseDocument,
    loadScheduleCirculationEntryFromDatabase,
    loadScheduleCirculationMapFromDatabase,
    loadScheduleDocumentFromDatabase,
    loadScheduleStateFromDatabase,
    loadScheduleStateSummaryByKind,
    resolveActiveScheduleStateKind,
    saveScheduleCirculationEntriesToDatabase,
    saveScheduleDocumentToDatabase,
    saveScheduleStopMetadataByStateKind,
    type ScheduleStateSummary
} from './sqliteStore';
import type {
    ScheduleCirculationEntry,
    ScheduleCirculationMap,
    ScheduleDocument,
    ScheduleItem,
    ScheduleRouteRefreshQueueEntry,
    ScheduleStationEntry,
    ScheduleStationMap,
    ScheduleStop,
    ScheduleState,
    ScheduleProbeRuntimeConfig
} from './types';

interface LoadedBuildingScheduleState {
    state: ScheduleState;
    resumed: boolean;
    publishPending: boolean;
    reason:
        | 'resume'
        | 'publish_pending'
        | 'reuse_published_terminal'
        | 'refresh_non_running'
        | 'refresh_cross_day'
        | 'refresh_scope_or_strategy_changed'
        | 'init_missing_file'
        | 'reset_invalid_file';
}

export interface ScheduleStopMetadataUpdate {
    trainNo: string;
    stationTrainCode: string;
    stationTelecode: string;
    distance: number | null;
    platformNo: number | null;
}

export interface SaveScheduleStopMetadataResult {
    updatedStopCount: number;
}

let scheduleStateVersion = 0;

function cloneScheduleState(state: ScheduleState): ScheduleState {
    return JSON.parse(JSON.stringify(state)) as ScheduleState;
}

function cloneScheduleCirculationEntry(
    entry: ScheduleCirculationEntry
): ScheduleCirculationEntry {
    return JSON.parse(JSON.stringify(entry)) as ScheduleCirculationEntry;
}

function cloneScheduleCirculationMap(
    circulation: ScheduleCirculationMap
): ScheduleCirculationMap {
    return JSON.parse(JSON.stringify(circulation)) as ScheduleCirculationMap;
}

function cloneScheduleStationMap(
    stations: ScheduleStationMap
): ScheduleStationMap {
    return JSON.parse(JSON.stringify(stations)) as ScheduleStationMap;
}

function cloneScheduleDocument(document: ScheduleDocument): ScheduleDocument {
    return JSON.parse(JSON.stringify(document)) as ScheduleDocument;
}

function bumpPublishedScheduleStateVersion() {
    // This version tracks published timetable replacement only.
    scheduleStateVersion += 1;
}

function compareRefreshTime(left: number | null, right: number | null): number {
    const normalizedLeft = left ?? -1;
    const normalizedRight = right ?? -1;
    return normalizedLeft - normalizedRight;
}

function normalizeScheduleStationEntry(
    key: string,
    value: unknown
): ScheduleStationEntry | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }

    const row = value as Partial<ScheduleStationEntry>;
    const stationTelecode = normalizeCode(
        typeof row.stationTelecode === 'string' ? row.stationTelecode : key
    );
    const stationName =
        typeof row.stationName === 'string' ? row.stationName.trim() : '';
    const lat = row.lat;
    const lon = row.lon;

    if (
        stationTelecode.length === 0 ||
        stationName.length === 0 ||
        typeof lat !== 'number' ||
        !Number.isFinite(lat) ||
        typeof lon !== 'number' ||
        !Number.isFinite(lon)
    ) {
        return null;
    }

    return {
        stationTelecode,
        stationName,
        lat,
        lon
    };
}

function normalizeScheduleStations(value: unknown): {
    stations: ScheduleStationMap;
    migrated: boolean;
} {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return {
            stations: {},
            migrated: true
        };
    }

    let migrated = false;
    const stations: ScheduleStationMap = {};

    for (const [key, entry] of Object.entries(value)) {
        const normalizedEntry = normalizeScheduleStationEntry(key, entry);
        if (!normalizedEntry) {
            migrated = true;
            continue;
        }

        const normalizedKey = normalizedEntry.stationTelecode;
        if (stations[normalizedKey]) {
            migrated = true;
        }
        stations[normalizedKey] = normalizedEntry;
    }

    return {
        stations,
        migrated
    };
}

function mergeScheduleStationMaps(
    base: ScheduleStationMap,
    updates: ScheduleStationMap | null | undefined
): ScheduleStationMap {
    const merged = cloneScheduleStationMap(base);
    if (!updates) {
        return merged;
    }

    for (const [key, entry] of Object.entries(updates)) {
        const normalizedEntry = normalizeScheduleStationEntry(key, entry);
        if (!normalizedEntry) {
            continue;
        }

        merged[normalizedEntry.stationTelecode] = normalizedEntry;
    }

    return merged;
}

function normalizeRouteRefreshQueueEntry(
    value: unknown
): ScheduleRouteRefreshQueueEntry | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }

    const row = value as Partial<ScheduleRouteRefreshQueueEntry>;
    const trainCode = normalizeCode(String(row.trainCode ?? ''));
    const serviceDate =
        typeof row.serviceDate === 'string' ? row.serviceDate.trim() : '';
    const enqueuedAt = row.enqueuedAt;

    if (
        trainCode.length === 0 ||
        !/^\d{8}$/.test(serviceDate) ||
        typeof enqueuedAt !== 'number' ||
        !Number.isInteger(enqueuedAt) ||
        enqueuedAt < 0
    ) {
        return null;
    }

    return {
        trainCode,
        serviceDate,
        enqueuedAt
    };
}

function normalizeRouteRefreshQueue(value: unknown): {
    queue: ScheduleRouteRefreshQueueEntry[];
    migrated: boolean;
} {
    if (!Array.isArray(value)) {
        return {
            queue: [],
            migrated: true
        };
    }

    let migrated = false;
    const deduplication = new Set<string>();
    const queue: ScheduleRouteRefreshQueueEntry[] = [];

    for (const item of value) {
        const normalized = normalizeRouteRefreshQueueEntry(item);
        if (!normalized) {
            migrated = true;
            continue;
        }

        const dedupeKey = `${normalized.serviceDate}:${normalized.trainCode}`;
        if (deduplication.has(dedupeKey)) {
            migrated = true;
            continue;
        }

        deduplication.add(dedupeKey);
        queue.push(normalized);
    }

    return {
        queue,
        migrated
    };
}

function normalizeScheduleCirculationNode(value: unknown) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }

    const row = value as {
        internalCode?: unknown;
        allCodes?: unknown;
        startStation?: unknown;
        endStation?: unknown;
        startAt?: unknown;
        endAt?: unknown;
    };
    const internalCode = normalizeCode(String(row.internalCode ?? ''));
    const startStation =
        typeof row.startStation === 'string' ? row.startStation.trim() : '';
    const endStation =
        typeof row.endStation === 'string' ? row.endStation.trim() : '';
    const startAt = row.startAt;
    const endAt = row.endAt;

    if (
        internalCode.length === 0 ||
        startStation.length === 0 ||
        endStation.length === 0 ||
        typeof startAt !== 'number' ||
        !Number.isInteger(startAt) ||
        startAt < 0 ||
        typeof endAt !== 'number' ||
        !Number.isInteger(endAt) ||
        endAt < 0
    ) {
        return null;
    }

    const allCodes = uniqueNormalizedCodes(
        Array.isArray(row.allCodes)
            ? [
                  ...row.allCodes.filter(
                      (code): code is string => typeof code === 'string'
                  )
              ]
            : []
    );
    if (allCodes.length === 0) {
        return null;
    }

    return {
        internalCode,
        allCodes,
        startStation,
        endStation,
        startAt,
        endAt
    };
}

function getScheduleCirculationKeyFromEntry(
    entry: Pick<ScheduleCirculationEntry, 'nodes'>
): string {
    return normalizeCode(entry.nodes[0]?.internalCode ?? '');
}

function getScheduleCirculationKeysFromEntry(
    entry: Pick<ScheduleCirculationEntry, 'nodes'>
): string[] {
    return uniqueNormalizedCodes(
        entry.nodes.map((node) => normalizeCode(node.internalCode))
    );
}

function normalizeScheduleCirculationEntry(
    key: string,
    value: unknown
): ScheduleCirculationEntry | null {
    const normalizedKey = normalizeCode(key);
    if (
        normalizedKey.length === 0 ||
        typeof value !== 'object' ||
        value === null ||
        Array.isArray(value)
    ) {
        return null;
    }

    const row = value as Partial<ScheduleCirculationEntry>;
    const refreshedAt = row.refreshedAt;
    if (
        typeof refreshedAt !== 'number' ||
        !Number.isInteger(refreshedAt) ||
        refreshedAt < 0 ||
        !Array.isArray(row.nodes)
    ) {
        return null;
    }

    const nodes = row.nodes
        .map((node) => normalizeScheduleCirculationNode(node))
        .filter(
            (node): node is ScheduleCirculationEntry['nodes'][number] =>
                node !== null
        );
    if (nodes.length !== row.nodes.length || nodes.length === 0) {
        return null;
    }

    if (
        !getScheduleCirculationKeysFromEntry({ nodes }).includes(normalizedKey)
    ) {
        return null;
    }

    return {
        refreshedAt,
        nodes
    };
}

function normalizeScheduleCirculation(value: unknown): {
    circulation: ScheduleCirculationMap;
    migrated: boolean;
} {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return {
            circulation: {},
            migrated: true
        };
    }

    let migrated = false;
    const circulation: ScheduleCirculationMap = {};
    for (const [key, entry] of Object.entries(value)) {
        const normalizedEntry = normalizeScheduleCirculationEntry(key, entry);
        if (!normalizedEntry) {
            migrated = true;
            continue;
        }

        const normalizedKeys =
            getScheduleCirculationKeysFromEntry(normalizedEntry);
        for (const normalizedKey of normalizedKeys) {
            if (circulation[normalizedKey]) {
                continue;
            }
            circulation[normalizedKey] =
                cloneScheduleCirculationEntry(normalizedEntry);
        }
    }

    return {
        circulation,
        migrated
    };
}

function ensureScheduleItem(
    value: unknown
): value is Partial<ScheduleItem> & { code: string } {
    return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        typeof (value as { code?: unknown }).code === 'string' &&
        (value as { code: string }).code.length > 0
    );
}

function normalizeOptionalNonNegativeInteger(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        return null;
    }

    return value;
}

function normalizeScheduleStop(
    value: unknown,
    fallbackStationNo: number
): ScheduleStop | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }

    const stop = value as Partial<ScheduleStop>;
    const stationNo =
        typeof stop.stationNo === 'number' &&
        Number.isInteger(stop.stationNo) &&
        stop.stationNo > 0
            ? stop.stationNo
            : fallbackStationNo;
    const stationName =
        typeof stop.stationName === 'string' ? stop.stationName.trim() : '';
    if (stationName.length === 0) {
        return null;
    }

    const arriveAt =
        typeof stop.arriveAt === 'number' &&
        Number.isInteger(stop.arriveAt) &&
        stop.arriveAt >= 0
            ? stop.arriveAt
            : null;
    const departAt =
        typeof stop.departAt === 'number' &&
        Number.isInteger(stop.departAt) &&
        stop.departAt >= 0
            ? stop.departAt
            : null;
    const distance = normalizeOptionalNonNegativeInteger(stop.distance);
    const platformNo = normalizeOptionalNonNegativeInteger(stop.platformNo);

    return {
        stationNo,
        stationName,
        stationTelecode:
            typeof stop.stationTelecode === 'string'
                ? normalizeCode(stop.stationTelecode)
                : '',
        arriveAt,
        departAt,
        stationTrainCode:
            typeof stop.stationTrainCode === 'string'
                ? stop.stationTrainCode.trim().toUpperCase()
                : '',
        wicket: typeof stop.wicket === 'string' ? stop.wicket.trim() : '',
        ...(distance !== null ? { distance } : {}),
        ...(platformNo !== null ? { platformNo } : {}),
        isStart: stop.isStart === true,
        isEnd: stop.isEnd === true
    };
}

function asScheduleState(value: unknown): ScheduleState | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }

    const state = value as Partial<ScheduleState>;
    if (typeof state.date !== 'string') {
        return null;
    }
    if (
        state.status !== 'running' &&
        state.status !== 'done' &&
        state.status !== 'partial_failed'
    ) {
        return null;
    }
    if (
        typeof state.startedAtMs !== 'number' ||
        !Number.isFinite(state.startedAtMs)
    ) {
        return null;
    }
    if (
        typeof state.generatedAt !== 'number' ||
        !Number.isFinite(state.generatedAt)
    ) {
        return null;
    }
    if (
        typeof state.strategy !== 'object' ||
        state.strategy === null ||
        typeof state.scope !== 'object' ||
        state.scope === null ||
        typeof state.progress !== 'object' ||
        state.progress === null ||
        typeof state.stats !== 'object' ||
        state.stats === null ||
        !Array.isArray(state.items)
    ) {
        return null;
    }
    if (
        state.progress.phase !== 'discover' &&
        state.progress.phase !== 'enrich' &&
        state.progress.phase !== 'done'
    ) {
        return null;
    }
    if (
        typeof state.progress.enrichCursor !== 'number' ||
        !Number.isFinite(state.progress.enrichCursor)
    ) {
        return null;
    }
    if (
        typeof state.stats.rawItems !== 'number' ||
        !Number.isFinite(state.stats.rawItems) ||
        typeof state.stats.uniqueItems !== 'number' ||
        !Number.isFinite(state.stats.uniqueItems) ||
        typeof state.stats.durationMs !== 'number' ||
        !Number.isFinite(state.stats.durationMs)
    ) {
        return null;
    }
    if (
        !Array.isArray(state.progress.discoverQueue) ||
        !Array.isArray(state.progress.discoverProcessed) ||
        !Array.isArray(state.progress.failedKeywords) ||
        !Array.isArray(state.progress.failedEnrichCodes)
    ) {
        return null;
    }

    if (typeof state.lastBuildDate !== 'string') {
        state.lastBuildDate = state.date;
    }
    if (
        state.progress.discoverMode !== 'full' &&
        state.progress.discoverMode !== 'retry'
    ) {
        state.progress.discoverMode = 'full';
    }
    if (
        typeof state.progress.counters !== 'object' ||
        state.progress.counters === null
    ) {
        state.progress.counters = {
            apiCalls: 0,
            apiRetries: 0
        };
    }
    if (
        typeof state.progress.counters.apiCalls !== 'number' ||
        !Number.isFinite(state.progress.counters.apiCalls)
    ) {
        state.progress.counters.apiCalls = 0;
    }
    if (
        typeof state.progress.counters.apiRetries !== 'number' ||
        !Number.isFinite(state.progress.counters.apiRetries)
    ) {
        state.progress.counters.apiRetries = 0;
    }

    for (const item of state.items) {
        if (!ensureScheduleItem(item)) {
            return null;
        }

        const row = item as Partial<ScheduleItem>;
        if (typeof row.internalCode !== 'string') {
            row.internalCode = '';
        }
        if (typeof row.bureauCode !== 'string') {
            row.bureauCode = '';
        }
        if (typeof row.trainStyle !== 'string') {
            row.trainStyle = '';
        }
        if (typeof row.trainDepartment !== 'string') {
            row.trainDepartment = '';
        }
        if (typeof row.passengerDepartment !== 'string') {
            row.passengerDepartment = '';
        }
        if (typeof row.startStation !== 'string') {
            row.startStation = '';
        }
        if (typeof row.endStation !== 'string') {
            row.endStation = '';
        }
        if (
            row.startAt !== null &&
            (typeof row.startAt !== 'number' ||
                !Number.isInteger(row.startAt) ||
                row.startAt < 0)
        ) {
            row.startAt = null;
        }
        if (
            row.endAt !== null &&
            (typeof row.endAt !== 'number' ||
                !Number.isInteger(row.endAt) ||
                row.endAt < 0)
        ) {
            row.endAt = null;
        }
        if (
            row.lastRouteRefreshAt !== null &&
            (typeof row.lastRouteRefreshAt !== 'number' ||
                !Number.isInteger(row.lastRouteRefreshAt) ||
                row.lastRouteRefreshAt < 0)
        ) {
            row.lastRouteRefreshAt = null;
        }
        if (typeof row.lastRouteRefreshAt === 'undefined') {
            row.lastRouteRefreshAt = null;
        }
        const normalizedCode = normalizeCode(String(row.code ?? ''));
        row.allCodes = uniqueNormalizedCodes(
            Array.isArray(row.allCodes)
                ? [
                      normalizedCode,
                      ...row.allCodes.filter(
                          (code): code is string => typeof code === 'string'
                      )
                  ]
                : [normalizedCode]
        );
        row.stops = Array.isArray(row.stops)
            ? row.stops
                  .map((stop, index) => normalizeScheduleStop(stop, index + 1))
                  .filter((stop): stop is ScheduleStop => stop !== null)
            : [];
        delete (row as { isRunningToday?: unknown }).isRunningToday;
    }

    return state as ScheduleState;
}

function scheduleStateNeedsRouteMetadataMigration(value: unknown): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }

    const items = (value as { items?: unknown }).items;
    if (!Array.isArray(items)) {
        return false;
    }

    return items.some((item) => {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
            return false;
        }

        const row = item as {
            bureauCode?: unknown;
            trainStyle?: unknown;
            trainDepartment?: unknown;
            passengerDepartment?: unknown;
        };
        return (
            typeof row.bureauCode !== 'string' ||
            typeof row.trainStyle !== 'string' ||
            typeof row.trainDepartment !== 'string' ||
            typeof row.passengerDepartment !== 'string'
        );
    });
}

function scheduleStateNeedsStopTelecodeMigration(value: unknown): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }

    const items = (value as { items?: unknown }).items;
    if (!Array.isArray(items)) {
        return false;
    }

    return items.some((item) => {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
            return false;
        }

        const stops = (item as { stops?: unknown }).stops;
        if (!Array.isArray(stops)) {
            return false;
        }

        return stops.some(
            (stop) =>
                typeof stop !== 'object' ||
                stop === null ||
                Array.isArray(stop) ||
                typeof (stop as { stationTelecode?: unknown })
                    .stationTelecode !== 'string'
        );
    });
}

function parseScheduleDocument(value: unknown): {
    document: ScheduleDocument | null;
    migrated: boolean;
} {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return {
            document: null,
            migrated: false
        };
    }

    const document = value as Record<string, unknown>;
    const version =
        typeof document.version === 'number' ? document.version : undefined;
    if (
        version !== 3 &&
        version !== 4 &&
        version !== 5 &&
        version !== 6 &&
        version !== CURRENT_SCHEDULE_DOCUMENT_VERSION
    ) {
        return {
            document: null,
            migrated: false
        };
    }
    const normalizedStations = normalizeScheduleStations(document.stations);
    const normalizedQueue = normalizeRouteRefreshQueue(
        document.routeRefreshQueue
    );
    const normalizedCirculation = normalizeScheduleCirculation(
        document.circulation
    );
    const publishedNeedsMigration =
        document.published !== null &&
        typeof document.published !== 'undefined' &&
        (scheduleStateNeedsRouteMetadataMigration(document.published) ||
            scheduleStateNeedsStopTelecodeMigration(document.published));
    const buildingNeedsMigration =
        document.building !== null &&
        typeof document.building !== 'undefined' &&
        (scheduleStateNeedsRouteMetadataMigration(document.building) ||
            scheduleStateNeedsStopTelecodeMigration(document.building));
    const migrated =
        version !== CURRENT_SCHEDULE_DOCUMENT_VERSION ||
        normalizedStations.migrated ||
        normalizedCirculation.migrated ||
        normalizedQueue.migrated ||
        publishedNeedsMigration ||
        buildingNeedsMigration;

    let published: ScheduleState | null = null;
    if (
        document.published !== null &&
        typeof document.published !== 'undefined'
    ) {
        published = asScheduleState(document.published);
        if (!published) {
            return {
                document: null,
                migrated: false
            };
        }
    }

    let building: ScheduleState | null = null;
    if (
        document.building !== null &&
        typeof document.building !== 'undefined'
    ) {
        building = asScheduleState(document.building);
        if (!building) {
            return {
                document: null,
                migrated: false
            };
        }
    }

    return {
        document: {
            $schema: SCHEDULE_SCHEMA_RELATIVE_PATH,
            version: CURRENT_SCHEDULE_DOCUMENT_VERSION,
            stations: normalizedStations.stations,
            circulation: normalizedCirculation.circulation,
            routeRefreshQueue: normalizedQueue.queue,
            published,
            building
        },
        migrated
    };
}

function isSameScopeAndStrategy(
    state: ScheduleState,
    config: ScheduleProbeRuntimeConfig
): boolean {
    const strategyMatched =
        state.strategy.retryAttempts === config.retryAttempts &&
        state.strategy.maxBatchSize === config.maxBatchSize &&
        state.strategy.checkpointFlushEvery === config.checkpointFlushEvery;
    if (!strategyMatched) {
        return false;
    }

    if (state.scope.prefixRules.length !== config.prefixRules.length) {
        return false;
    }

    for (let index = 0; index < config.prefixRules.length; index += 1) {
        const left = state.scope.prefixRules[index]!;
        const right = config.prefixRules[index]!;
        if (
            left.prefix !== right.prefix ||
            left.minNo !== right.minNo ||
            left.maxNo !== right.maxNo
        ) {
            return false;
        }
    }

    return true;
}

function mergePublishedRouteInfo(
    nextPublished: ScheduleState,
    currentPublished: ScheduleState | null
): ScheduleState {
    if (!currentPublished || currentPublished.date !== nextPublished.date) {
        return nextPublished;
    }

    const currentItemsByCode = new Map<string, ScheduleItem>();
    for (const item of currentPublished.items) {
        currentItemsByCode.set(normalizeCode(item.code), item);
    }

    for (const item of nextPublished.items) {
        const currentItem = currentItemsByCode.get(normalizeCode(item.code));
        if (!currentItem) {
            continue;
        }

        if (
            compareRefreshTime(
                currentItem.lastRouteRefreshAt,
                item.lastRouteRefreshAt
            ) <= 0
        ) {
            continue;
        }

        item.startStation = currentItem.startStation;
        item.endStation = currentItem.endStation;
        item.bureauCode = currentItem.bureauCode;
        item.trainStyle = currentItem.trainStyle;
        item.trainDepartment = currentItem.trainDepartment;
        item.passengerDepartment = currentItem.passengerDepartment;
        item.startAt = currentItem.startAt;
        item.endAt = currentItem.endAt;
        item.lastRouteRefreshAt = currentItem.lastRouteRefreshAt;
        item.allCodes = [...currentItem.allCodes];
        item.stops = currentItem.stops.map((stop) => ({
            ...stop
        }));
        if (
            item.internalCode.length === 0 &&
            currentItem.internalCode.length > 0
        ) {
            item.internalCode = currentItem.internalCode;
        }
    }

    return nextPublished;
}

export function createInitialScheduleState(
    date: string,
    config: ScheduleProbeRuntimeConfig
): ScheduleState {
    return {
        date,
        lastBuildDate: '',
        status: 'running',
        strategy: {
            retryAttempts: config.retryAttempts,
            maxBatchSize: config.maxBatchSize,
            checkpointFlushEvery: config.checkpointFlushEvery
        },
        scope: {
            prefixRules: config.prefixRules
        },
        progress: {
            phase: 'discover',
            discoverMode: 'full',
            discoverQueue: getInitialKeywords(config.prefixRules),
            discoverProcessed: [],
            enrichCursor: 0,
            failedKeywords: [],
            failedEnrichCodes: [],
            counters: {
                apiCalls: 0,
                apiRetries: 0
            }
        },
        items: [],
        stats: {
            rawItems: 0,
            uniqueItems: 0,
            durationMs: 0
        },
        startedAtMs: Date.now(),
        generatedAt: 0
    };
}

export function createInitialScheduleDocument(): ScheduleDocument {
    return {
        $schema: SCHEDULE_SCHEMA_RELATIVE_PATH,
        version: CURRENT_SCHEDULE_DOCUMENT_VERSION,
        stations: {},
        circulation: {},
        routeRefreshQueue: [],
        published: null,
        building: null
    };
}

export function appendRouteRefreshQueueTrainCodes(
    scheduleFilePath: string,
    serviceDate: string,
    trainCodes: readonly string[],
    enqueuedAt: number
): ScheduleRouteRefreshQueueEntry[] {
    if (
        !/^\d{8}$/.test(serviceDate) ||
        !Number.isInteger(enqueuedAt) ||
        enqueuedAt < 0
    ) {
        return [];
    }

    const normalizedTrainCodes = uniqueNormalizedCodes([...trainCodes]);
    if (normalizedTrainCodes.length === 0) {
        return [];
    }

    if (!ensureScheduleDocumentMigrated(scheduleFilePath)) {
        return [];
    }

    return appendScheduleRouteRefreshQueueEntries(
        normalizedTrainCodes.map((trainCode) => ({
            trainCode,
            serviceDate,
            enqueuedAt
        }))
    );
}

export function consumeRouteRefreshQueueEntries(
    scheduleFilePath: string,
    entries: readonly Pick<
        ScheduleRouteRefreshQueueEntry,
        'serviceDate' | 'trainCode'
    >[]
): ScheduleRouteRefreshQueueEntry[] {
    if (entries.length === 0) {
        return [];
    }

    const consumptionKeys = new Set<string>();
    for (const entry of entries) {
        const trainCode = normalizeCode(String(entry.trainCode ?? ''));
        const serviceDate =
            typeof entry.serviceDate === 'string'
                ? entry.serviceDate.trim()
                : '';
        if (trainCode.length === 0 || !/^\d{8}$/.test(serviceDate)) {
            continue;
        }

        consumptionKeys.add(`${serviceDate}:${trainCode}`);
    }

    if (consumptionKeys.size === 0) {
        return [];
    }

    if (!ensureScheduleDocumentMigrated(scheduleFilePath)) {
        return [];
    }
    return consumeScheduleRouteRefreshQueueEntries(
        [...consumptionKeys].map((consumptionKey) => {
            const [serviceDate = '', trainCode = ''] =
                consumptionKey.split(':');
            return {
                serviceDate,
                trainCode
            };
        })
    );
}

export function loadScheduleDocument(
    scheduleFilePath: string = LEGACY_SCHEDULE_JSON_PATH
): ScheduleDocument | null {
    const databaseDocument = loadScheduleDocumentFromDatabase();
    if (databaseDocument) {
        return databaseDocument;
    }

    if (hasScheduleDatabaseDocument()) {
        return null;
    }

    const absolutePath = path.resolve(scheduleFilePath);
    if (!fs.existsSync(absolutePath)) {
        return null;
    }

    try {
        const raw = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
        const parsed = parseScheduleDocument(raw);
        if (!parsed.document) {
            return null;
        }

        const stat = fs.statSync(absolutePath);
        saveScheduleDocumentToDatabase(parsed.document, {
            jsonPath: absolutePath,
            jsonMtimeMs: Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : null
        });
        return parsed.document;
    } catch {
        return null;
    }
}

export function saveScheduleDocument(
    scheduleFilePath: string,
    document: ScheduleDocument
): void {
    document.$schema = SCHEDULE_SCHEMA_RELATIVE_PATH;
    document.version = CURRENT_SCHEDULE_DOCUMENT_VERSION;
    document.stations = cloneScheduleStationMap(document.stations);
    document.circulation = cloneScheduleCirculationMap(document.circulation);
    saveScheduleDocumentToDatabase(document);
}

export function ensureScheduleDocumentMigrated(
    scheduleFilePath: string = LEGACY_SCHEDULE_JSON_PATH
): boolean {
    if (hasScheduleDatabaseDocument()) {
        return true;
    }

    return loadScheduleDocument(scheduleFilePath) !== null;
}

export function loadPublishedScheduleState(
    scheduleFilePath: string = LEGACY_SCHEDULE_JSON_PATH
): ScheduleState | null {
    if (!ensureScheduleDocumentMigrated(scheduleFilePath)) {
        return null;
    }

    const state = loadScheduleStateFromDatabase('published');
    return state ? cloneScheduleState(state) : null;
}

export function loadPublishedScheduleStateSummary(
    scheduleFilePath: string = LEGACY_SCHEDULE_JSON_PATH
): ScheduleStateSummary | null {
    if (!ensureScheduleDocumentMigrated(scheduleFilePath)) {
        return null;
    }

    return loadScheduleStateSummaryByKind('published');
}

export function loadScheduleCirculationMap(
    scheduleFilePath: string = LEGACY_SCHEDULE_JSON_PATH
): ScheduleCirculationMap {
    if (!ensureScheduleDocumentMigrated(scheduleFilePath)) {
        return {};
    }

    const circulation = loadScheduleCirculationMapFromDatabase();
    return circulation ? cloneScheduleCirculationMap(circulation) : {};
}

export function loadScheduleCirculationEntry(
    scheduleFilePath: string,
    internalCode: string
): ScheduleCirculationEntry | null {
    const normalizedInternalCode = normalizeCode(internalCode);
    if (normalizedInternalCode.length === 0) {
        return null;
    }

    if (!ensureScheduleDocumentMigrated(scheduleFilePath)) {
        return null;
    }

    const entry = loadScheduleCirculationEntryFromDatabase(
        normalizedInternalCode
    );
    return entry ? cloneScheduleCirculationEntry(entry) : null;
}

export function saveScheduleCirculationEntry(
    scheduleFilePath: string,
    entry: ScheduleCirculationEntry
): string | null {
    const normalizedEntry = normalizeScheduleCirculationEntry(
        getScheduleCirculationKeyFromEntry(entry),
        entry
    );
    if (!normalizedEntry) {
        return null;
    }

    const normalizedKey = getScheduleCirculationKeyFromEntry(normalizedEntry);
    if (normalizedKey.length === 0) {
        return null;
    }

    if (!ensureScheduleDocumentMigrated(scheduleFilePath)) {
        return null;
    }

    const savedKeys = saveScheduleCirculationEntriesToDatabase([
        normalizedEntry
    ]);
    return savedKeys.includes(normalizedKey) ? normalizedKey : null;
}

export function saveScheduleCirculationEntries(
    scheduleFilePath: string,
    entries: readonly ScheduleCirculationEntry[]
): string[] {
    if (entries.length === 0) {
        return [];
    }

    if (!ensureScheduleDocumentMigrated(scheduleFilePath)) {
        return [];
    }

    const normalizedEntries: ScheduleCirculationEntry[] = [];
    for (const entry of entries) {
        const normalizedEntry = normalizeScheduleCirculationEntry(
            getScheduleCirculationKeyFromEntry(entry),
            entry
        );
        if (!normalizedEntry) {
            continue;
        }

        normalizedEntries.push(normalizedEntry);
    }

    return saveScheduleCirculationEntriesToDatabase(normalizedEntries);
}

function hasScheduleStopMetadataUpdate(update: ScheduleStopMetadataUpdate) {
    return update.distance !== null || update.platformNo !== null;
}

export function saveScheduleStopMetadataFromStationBoard(
    scheduleFilePath: string,
    serviceDate: string,
    updates: readonly ScheduleStopMetadataUpdate[]
): SaveScheduleStopMetadataResult {
    if (!/^\d{8}$/.test(serviceDate)) {
        return {
            updatedStopCount: 0
        };
    }

    const normalizedUpdates = updates
        .map((update) => ({
            trainNo: normalizeCode(update.trainNo),
            stationTrainCode: normalizeCode(update.stationTrainCode),
            stationTelecode: normalizeCode(update.stationTelecode),
            distance: normalizeOptionalNonNegativeInteger(update.distance),
            platformNo: normalizeOptionalNonNegativeInteger(update.platformNo)
        }))
        .filter(
            (update): update is ScheduleStopMetadataUpdate =>
                update.stationTelecode.length > 0 &&
                hasScheduleStopMetadataUpdate(update)
        );
    if (normalizedUpdates.length === 0) {
        return {
            updatedStopCount: 0
        };
    }

    if (!ensureScheduleDocumentMigrated(scheduleFilePath)) {
        return {
            updatedStopCount: 0
        };
    }

    const published = loadScheduleStateSummaryByKind('published');
    if (!published || published.date !== serviceDate) {
        return {
            updatedStopCount: 0
        };
    }

    return {
        updatedStopCount: saveScheduleStopMetadataByStateKind(
            'published',
            normalizedUpdates
        )
    };
}

export function deleteScheduleCirculationEntry(
    scheduleFilePath: string,
    entryKey: string
): string[] {
    const normalizedEntryKey = normalizeCode(entryKey);
    if (normalizedEntryKey.length === 0) {
        return [];
    }

    if (!ensureScheduleDocumentMigrated(scheduleFilePath)) {
        return [];
    }
    return deleteScheduleCirculationEntryFromDatabase(normalizedEntryKey);
}

export function loadActiveScheduleState(
    scheduleFilePath: string = LEGACY_SCHEDULE_JSON_PATH
): ScheduleState | null {
    if (!ensureScheduleDocumentMigrated(scheduleFilePath)) {
        return null;
    }

    const today = getCurrentDateString();
    const activeKind = resolveActiveScheduleStateKind(today);
    if (!activeKind) {
        return null;
    }

    const state = loadScheduleStateFromDatabase(activeKind);
    return state ? cloneScheduleState(state) : null;
}

export function savePublishedScheduleState(
    scheduleFilePath: string,
    state: ScheduleState | null,
    stations?: ScheduleStationMap
): void {
    const document = cloneScheduleDocument(
        loadScheduleDocument(scheduleFilePath) ??
            createInitialScheduleDocument()
    );
    document.published = state
        ? filterInvalidScheduleItems(cloneScheduleState(state)).state
        : null;
    document.stations = mergeScheduleStationMaps(document.stations, stations);
    saveScheduleDocument(scheduleFilePath, document);
}

export function loadBuildingScheduleState(
    scheduleFilePath: string = LEGACY_SCHEDULE_JSON_PATH
): ScheduleState | null {
    if (!ensureScheduleDocumentMigrated(scheduleFilePath)) {
        return null;
    }

    const state = loadScheduleStateFromDatabase('building');
    return state ? cloneScheduleState(state) : null;
}

export function saveBuildingScheduleState(
    scheduleFilePath: string,
    state: ScheduleState | null,
    stations?: ScheduleStationMap
): void {
    const document = cloneScheduleDocument(
        loadScheduleDocument(scheduleFilePath) ??
            createInitialScheduleDocument()
    );
    document.building = state
        ? filterInvalidScheduleItems(cloneScheduleState(state)).state
        : null;
    document.stations = mergeScheduleStationMaps(document.stations, stations);
    saveScheduleDocument(scheduleFilePath, document);
}

export function promoteBuildingScheduleState(
    scheduleFilePath: string,
    fallbackState: ScheduleState
): ScheduleState {
    const document = cloneScheduleDocument(
        loadScheduleDocument(scheduleFilePath) ??
            createInitialScheduleDocument()
    );
    const buildingState = document.building
        ? cloneScheduleState(document.building)
        : cloneScheduleState(fallbackState);
    const promotedState = filterInvalidScheduleItems(
        mergePublishedRouteInfo(
            buildingState,
            document.published ? cloneScheduleState(document.published) : null
        )
    ).state;
    document.published = promotedState;
    document.building = null;
    saveScheduleDocument(scheduleFilePath, document);
    bumpPublishedScheduleStateVersion();
    return cloneScheduleState(promotedState);
}

export function getScheduleStateVersion() {
    return scheduleStateVersion;
}

export function loadOrInitBuildingScheduleState(
    scheduleFilePath: string,
    config: ScheduleProbeRuntimeConfig
): LoadedBuildingScheduleState {
    const today = getCurrentDateString();
    const absolutePath = path.resolve(scheduleFilePath);
    const fileExists = fs.existsSync(absolutePath);
    const document = loadScheduleDocument(scheduleFilePath);
    if (!document) {
        return {
            state: createInitialScheduleState(today, config),
            resumed: false,
            publishPending: false,
            reason: fileExists ? 'reset_invalid_file' : 'init_missing_file'
        };
    }

    const building = document.building;
    if (building && building.date === today) {
        if (
            building.status === 'done' ||
            building.status === 'partial_failed'
        ) {
            return {
                state: cloneScheduleState(building),
                resumed: true,
                publishPending: true,
                reason: 'publish_pending'
            };
        }

        if (
            building.status === 'running' &&
            isSameScopeAndStrategy(building, config)
        ) {
            return {
                state: cloneScheduleState(building),
                resumed: true,
                publishPending: false,
                reason: 'resume'
            };
        }
    }

    const published = document.published;
    if (
        published &&
        published.date === today &&
        (published.status === 'done' || published.status === 'partial_failed')
    ) {
        return {
            state: cloneScheduleState(published),
            resumed: false,
            publishPending: false,
            reason: 'reuse_published_terminal'
        };
    }

    if (
        building &&
        building.date === today &&
        !isSameScopeAndStrategy(building, config)
    ) {
        return {
            state: createInitialScheduleState(today, config),
            resumed: false,
            publishPending: false,
            reason: 'refresh_scope_or_strategy_changed'
        };
    }

    if (published && published.date !== today) {
        return {
            state: createInitialScheduleState(today, config),
            resumed: false,
            publishPending: false,
            reason: 'refresh_cross_day'
        };
    }

    if (published && published.status !== 'running') {
        return {
            state: createInitialScheduleState(today, config),
            resumed: false,
            publishPending: false,
            reason: 'refresh_non_running'
        };
    }

    return {
        state: createInitialScheduleState(today, config),
        resumed: false,
        publishPending: false,
        reason: 'refresh_non_running'
    };
}
