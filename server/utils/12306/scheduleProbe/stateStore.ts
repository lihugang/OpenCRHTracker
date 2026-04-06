import fs from 'fs';
import path from 'path';
import getCurrentDateString from '../../date/getCurrentDateString';
import normalizeCode from '../normalizeCode';
import uniqueNormalizedCodes from '../uniqueNormalizedCodes';
import { getInitialKeywords } from './prefixTree';
import type {
    ScheduleDocument,
    ScheduleItem,
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

const SCHEDULE_SCHEMA_RELATIVE_PATH = '../assets/json/scheduleScheme.json';
const CURRENT_SCHEDULE_DOCUMENT_VERSION = 4;

function cloneScheduleState(state: ScheduleState): ScheduleState {
    return JSON.parse(JSON.stringify(state)) as ScheduleState;
}

function compareRefreshTime(left: number | null, right: number | null): number {
    const normalizedLeft = left ?? -1;
    const normalizedRight = right ?? -1;
    return normalizedLeft - normalizedRight;
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

    return {
        stationNo,
        stationName,
        arriveAt,
        departAt,
        stationTrainCode:
            typeof stop.stationTrainCode === 'string'
                ? stop.stationTrainCode.trim().toUpperCase()
                : '',
        wicket: typeof stop.wicket === 'string' ? stop.wicket.trim() : '',
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
    if (version !== 3 && version !== CURRENT_SCHEDULE_DOCUMENT_VERSION) {
        return {
            document: null,
            migrated: false
        };
    }
    const migrated = version !== CURRENT_SCHEDULE_DOCUMENT_VERSION;

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

function hasUsableTimetableData(state: ScheduleState): boolean {
    return state.items.some(
        (item) =>
            item.startAt !== null &&
            item.endAt !== null &&
            item.stops.length > 0
    );
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
        published: null,
        building: null
    };
}

export function loadScheduleDocument(
    scheduleFilePath: string
): ScheduleDocument | null {
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

        if (parsed.migrated) {
            saveScheduleDocument(scheduleFilePath, parsed.document);
        }

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
    const absolutePath = path.resolve(scheduleFilePath);
    const directory = path.dirname(absolutePath);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
        absolutePath,
        `${JSON.stringify(document, null, 4)}\n`,
        'utf8'
    );
}

export function loadPublishedScheduleState(
    scheduleFilePath: string
): ScheduleState | null {
    const document = loadScheduleDocument(scheduleFilePath);
    return document?.published ? cloneScheduleState(document.published) : null;
}

export function loadActiveScheduleState(
    scheduleFilePath: string
): ScheduleState | null {
    const document = loadScheduleDocument(scheduleFilePath);
    if (!document) {
        return null;
    }

    const today = getCurrentDateString();
    const published = document.published;
    if (published && published.date === today) {
        return cloneScheduleState(published);
    }

    const building = document.building;
    if (building && building.date === today && hasUsableTimetableData(building)) {
        return cloneScheduleState(building);
    }

    if (published) {
        return cloneScheduleState(published);
    }

    if (building && building.date === today) {
        return cloneScheduleState(building);
    }

    return building ? cloneScheduleState(building) : null;
}

export function savePublishedScheduleState(
    scheduleFilePath: string,
    state: ScheduleState | null
): void {
    const document =
        loadScheduleDocument(scheduleFilePath) ??
        createInitialScheduleDocument();
    document.published = state ? cloneScheduleState(state) : null;
    saveScheduleDocument(scheduleFilePath, document);
}

export function loadBuildingScheduleState(
    scheduleFilePath: string
): ScheduleState | null {
    const document = loadScheduleDocument(scheduleFilePath);
    return document?.building ? cloneScheduleState(document.building) : null;
}

export function saveBuildingScheduleState(
    scheduleFilePath: string,
    state: ScheduleState | null
): void {
    const document =
        loadScheduleDocument(scheduleFilePath) ??
        createInitialScheduleDocument();
    document.building = state ? cloneScheduleState(state) : null;
    saveScheduleDocument(scheduleFilePath, document);
}

export function promoteBuildingScheduleState(
    scheduleFilePath: string,
    fallbackState: ScheduleState
): ScheduleState {
    const document =
        loadScheduleDocument(scheduleFilePath) ??
        createInitialScheduleDocument();
    const buildingState = document.building
        ? cloneScheduleState(document.building)
        : cloneScheduleState(fallbackState);
    const promotedState = mergePublishedRouteInfo(
        buildingState,
        document.published ? cloneScheduleState(document.published) : null
    );
    document.published = promotedState;
    document.building = null;
    saveScheduleDocument(scheduleFilePath, document);
    return cloneScheduleState(promotedState);
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
