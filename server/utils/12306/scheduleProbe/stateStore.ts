import fs from 'fs';
import path from 'path';
import getCurrentDateString from '../../date/getCurrentDateString';
import normalizeCode from '../normalizeCode';
import { getInitialKeywords } from './prefixTree';
import type {
    ScheduleDocument,
    ScheduleItem,
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
        | 'retry_partial_failed'
        | 'refresh_done'
        | 'refresh_non_running'
        | 'refresh_cross_day'
        | 'refresh_scope_or_strategy_changed'
        | 'init_missing_file'
        | 'reset_invalid_file';
}

const SCHEDULE_SCHEMA_RELATIVE_PATH = '../assets/json/scheduleScheme.json';

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
        delete (row as { isRunningToday?: unknown }).isRunningToday;
    }

    return state as ScheduleState;
}

function asScheduleDocument(value: unknown): ScheduleDocument | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }

    const document = value as Partial<ScheduleDocument>;
    if (document.version !== 3) {
        return null;
    }

    let published: ScheduleState | null = null;
    if (
        document.published !== null &&
        typeof document.published !== 'undefined'
    ) {
        published = asScheduleState(document.published);
        if (!published) {
            return null;
        }
    }

    let building: ScheduleState | null = null;
    if (
        document.building !== null &&
        typeof document.building !== 'undefined'
    ) {
        building = asScheduleState(document.building);
        if (!building) {
            return null;
        }
    }

    return {
        $schema: SCHEDULE_SCHEMA_RELATIVE_PATH,
        version: 3,
        published,
        building
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

function preparePartialRetryState(
    existing: ScheduleState,
    config: ScheduleProbeRuntimeConfig
): ScheduleState {
    const failedKeywords = Array.from(
        new Set(
            existing.progress.failedKeywords
                .map((item) => item.trim())
                .filter((item) => item.length > 0)
        )
    );
    const failedEnrichCodeSet = new Set(
        existing.progress.failedEnrichCodes
            .map((item) => item.trim().toUpperCase())
            .filter((item) => item.length > 0)
    );

    existing.status = 'running';
    existing.startedAtMs = Date.now();
    existing.stats.durationMs = 0;
    existing.generatedAt = 0;
    existing.strategy = {
        retryAttempts: config.retryAttempts,
        maxBatchSize: config.maxBatchSize,
        checkpointFlushEvery: config.checkpointFlushEvery
    };
    existing.scope = {
        prefixRules: config.prefixRules
    };

    if (failedKeywords.length > 0) {
        const failedKeywordSet = new Set(failedKeywords);
        existing.progress.phase = 'discover';
        existing.progress.discoverMode = 'retry';
        existing.progress.discoverQueue = failedKeywords;
        existing.progress.discoverProcessed =
            existing.progress.discoverProcessed.filter(
                (item) => !failedKeywordSet.has(item)
            );
    } else {
        existing.progress.phase = 'enrich';
        existing.progress.discoverMode = 'retry';
        existing.progress.discoverQueue = [];
    }

    existing.progress.enrichCursor = 0;
    existing.progress.failedKeywords = [];
    existing.progress.failedEnrichCodes = [];

    if (failedEnrichCodeSet.size > 0) {
        for (const item of existing.items) {
            if (failedEnrichCodeSet.has(item.code.toUpperCase())) {
                item.startAt = null;
                item.endAt = null;
                item.lastRouteRefreshAt = null;
            }
        }
    }

    return existing;
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

        item.startAt = currentItem.startAt;
        item.endAt = currentItem.endAt;
        item.lastRouteRefreshAt = currentItem.lastRouteRefreshAt;
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
        version: 3,
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
        return asScheduleDocument(raw);
    } catch {
        return null;
    }
}

export function saveScheduleDocument(
    scheduleFilePath: string,
    document: ScheduleDocument
): void {
    document.$schema = SCHEDULE_SCHEMA_RELATIVE_PATH;
    document.version = 3;
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
        published.status === 'partial_failed' &&
        isSameScopeAndStrategy(published, config)
    ) {
        return {
            state: preparePartialRetryState(
                cloneScheduleState(published),
                config
            ),
            resumed: true,
            publishPending: false,
            reason: 'retry_partial_failed'
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

    if (
        published &&
        published.date === today &&
        published.status === 'partial_failed' &&
        !isSameScopeAndStrategy(published, config)
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

    if (published && published.date === today && published.status === 'done') {
        return {
            state: createInitialScheduleState(today, config),
            resumed: false,
            publishPending: false,
            reason: 'refresh_done'
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
