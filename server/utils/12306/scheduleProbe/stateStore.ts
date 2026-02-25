import fs from 'fs';
import path from 'path';
import getCurrentDateString from '../../date/getCurrentDateString';
import { getInitialKeywords } from './prefixTree';
import type { ScheduleFile, ScheduleProbeRuntimeConfig } from './types';

interface LoadedScheduleState {
    state: ScheduleFile;
    resumed: boolean;
    reason:
        | 'resume'
        | 'retry_partial_failed'
        | 'refresh_done'
        | 'refresh_non_running'
        | 'refresh_cross_day'
        | 'refresh_scope_or_strategy_changed'
        | 'init_missing_file'
        | 'reset_invalid_file';
}

function createInitialScheduleState(
    date: string,
    config: ScheduleProbeRuntimeConfig
): ScheduleFile {
    return {
        version: 1,
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

function isSameScopeAndStrategy(
    state: ScheduleFile,
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

function asScheduleFile(value: unknown): ScheduleFile | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return null;
    }

    const file = value as Partial<ScheduleFile>;
    if (file.version !== 1) {
        return null;
    }
    if (typeof file.date !== 'string') {
        return null;
    }
    if (
        file.status !== 'running' &&
        file.status !== 'done' &&
        file.status !== 'partial_failed'
    ) {
        return null;
    }
    if (
        typeof file.startedAtMs !== 'number' ||
        !Number.isFinite(file.startedAtMs)
    ) {
        return null;
    }
    if (
        typeof file.generatedAt !== 'number' ||
        !Number.isFinite(file.generatedAt)
    ) {
        return null;
    }
    if (
        typeof file.strategy !== 'object' ||
        file.strategy === null ||
        typeof file.scope !== 'object' ||
        file.scope === null ||
        typeof file.progress !== 'object' ||
        file.progress === null ||
        typeof file.stats !== 'object' ||
        file.stats === null ||
        !Array.isArray(file.items)
    ) {
        return null;
    }
    if (
        file.progress.phase !== 'discover' &&
        file.progress.phase !== 'enrich' &&
        file.progress.phase !== 'done'
    ) {
        return null;
    }
    if (
        typeof file.progress.enrichCursor !== 'number' ||
        !Number.isFinite(file.progress.enrichCursor)
    ) {
        return null;
    }
    if (
        typeof file.stats.rawItems !== 'number' ||
        !Number.isFinite(file.stats.rawItems) ||
        typeof file.stats.uniqueItems !== 'number' ||
        !Number.isFinite(file.stats.uniqueItems) ||
        typeof file.stats.durationMs !== 'number' ||
        !Number.isFinite(file.stats.durationMs)
    ) {
        return null;
    }
    if (
        !Array.isArray(file.progress.discoverQueue) ||
        !Array.isArray(file.progress.discoverProcessed) ||
        !Array.isArray(file.progress.failedKeywords) ||
        !Array.isArray(file.progress.failedEnrichCodes)
    ) {
        return null;
    }

    if (typeof file.lastBuildDate !== 'string') {
        file.lastBuildDate = file.date;
    }
    if (
        file.progress.discoverMode !== 'full' &&
        file.progress.discoverMode !== 'retry'
    ) {
        file.progress.discoverMode = 'full';
    }
    if (
        typeof file.progress.counters !== 'object' ||
        file.progress.counters === null
    ) {
        file.progress.counters = {
            apiCalls: 0,
            apiRetries: 0
        };
    }
    if (
        typeof file.progress.counters.apiCalls !== 'number' ||
        !Number.isFinite(file.progress.counters.apiCalls)
    ) {
        file.progress.counters.apiCalls = 0;
    }
    if (
        typeof file.progress.counters.apiRetries !== 'number' ||
        !Number.isFinite(file.progress.counters.apiRetries)
    ) {
        file.progress.counters.apiRetries = 0;
    }

    for (const item of file.items) {
        if (typeof item !== 'object' || item === null) {
            return null;
        }

        const row = item as Partial<ScheduleFile['items'][number]>;
        if (typeof row.code !== 'string' || row.code.length === 0) {
            return null;
        }
        if (typeof row.internalCode !== 'string') {
            row.internalCode = '';
        }
        if (row.startAt !== null && typeof row.startAt !== 'number') {
            row.startAt = null;
        }
        if (row.endAt !== null && typeof row.endAt !== 'number') {
            row.endAt = null;
        }
        if (
            row.lastRouteRefreshAt !== null &&
            typeof row.lastRouteRefreshAt !== 'number'
        ) {
            row.lastRouteRefreshAt = null;
        }
        if (typeof row.lastRouteRefreshAt === 'undefined') {
            row.lastRouteRefreshAt = null;
        }
        if (typeof row.isRunningToday !== 'boolean') {
            row.isRunningToday = false;
        }
    }

    return file as ScheduleFile;
}

function preparePartialRetryState(
    existing: ScheduleFile,
    config: ScheduleProbeRuntimeConfig
): ScheduleFile {
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
        existing.progress.discoverProcessed = existing.progress.discoverProcessed.filter(
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

function prepareDailyRefreshState(
    existing: ScheduleFile,
    date: string,
    config: ScheduleProbeRuntimeConfig
): ScheduleFile {
    existing.date = date;
    existing.status = 'running';
    existing.startedAtMs = Date.now();
    existing.generatedAt = 0;
    existing.strategy = {
        retryAttempts: config.retryAttempts,
        maxBatchSize: config.maxBatchSize,
        checkpointFlushEvery: config.checkpointFlushEvery
    };
    existing.scope = {
        prefixRules: config.prefixRules
    };
    existing.progress = {
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
    };

    for (const item of existing.items) {
        item.isRunningToday = false;
    }

    existing.stats = {
        rawItems: 0,
        uniqueItems: existing.items.length,
        durationMs: 0
    };
    return existing;
}

export function loadOrInitScheduleState(
    scheduleFilePath: string,
    config: ScheduleProbeRuntimeConfig
): LoadedScheduleState {
    const today = getCurrentDateString();
    const absolutePath = path.resolve(scheduleFilePath);
    if (!fs.existsSync(absolutePath)) {
        return {
            state: createInitialScheduleState(today, config),
            resumed: false,
            reason: 'init_missing_file'
        };
    }

    try {
        const raw = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
        const existing = asScheduleFile(raw);
        if (!existing) {
            return {
                state: createInitialScheduleState(today, config),
                resumed: false,
                reason: 'reset_invalid_file'
            };
        }
        if (existing.date !== today) {
            return {
                state: prepareDailyRefreshState(existing, today, config),
                resumed: false,
                reason: 'refresh_cross_day'
            };
        }

        if (existing.status === 'partial_failed') {
            if (!isSameScopeAndStrategy(existing, config)) {
                return {
                    state: prepareDailyRefreshState(existing, today, config),
                    resumed: false,
                    reason: 'refresh_scope_or_strategy_changed'
                };
            }

            return {
                state: preparePartialRetryState(existing, config),
                resumed: true,
                reason: 'retry_partial_failed'
            };
        }

        if (existing.status === 'done') {
            return {
                state: prepareDailyRefreshState(existing, today, config),
                resumed: true,
                reason: 'refresh_done'
            };
        }

        if (existing.status !== 'running') {
            return {
                state: prepareDailyRefreshState(existing, today, config),
                resumed: false,
                reason: 'refresh_non_running'
            };
        }

        if (!isSameScopeAndStrategy(existing, config)) {
            return {
                state: prepareDailyRefreshState(existing, today, config),
                resumed: false,
                reason: 'refresh_scope_or_strategy_changed'
            };
        }

        return {
            state: existing,
            resumed: true,
            reason: 'resume'
        };
    } catch {
        return {
            state: createInitialScheduleState(today, config),
            resumed: false,
            reason: 'reset_invalid_file'
        };
    }
}

export function loadExistingScheduleState(scheduleFilePath: string): ScheduleFile | null {
    const absolutePath = path.resolve(scheduleFilePath);
    if (!fs.existsSync(absolutePath)) {
        return null;
    }

    try {
        const raw = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
        return asScheduleFile(raw);
    } catch {
        return null;
    }
}

export function saveScheduleState(
    scheduleFilePath: string,
    state: ScheduleFile
): void {
    const absolutePath = path.resolve(scheduleFilePath);
    const directory = path.dirname(absolutePath);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(absolutePath, `${JSON.stringify(state, null, 4)}\n`, 'utf8');
}
