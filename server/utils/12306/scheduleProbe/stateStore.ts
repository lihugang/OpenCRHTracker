import getCurrentDateString from '../../date/getCurrentDateString';
import normalizeCode from '../normalizeCode';
import uniqueNormalizedCodes from '../uniqueNormalizedCodes';
import { trainCodeKey, type TrainCodeParts } from '../trainCode';
import {
    asServiceDay,
    serviceDateToDay,
    type ServiceDay
} from '~/server/utils/date/serviceDay';
import {
    CURRENT_SCHEDULE_DOCUMENT_VERSION,
    SCHEDULE_SCHEMA_RELATIVE_PATH
} from './constants';
import { filterInvalidScheduleItems } from './filterInvalidScheduleItems';
import { getInitialKeywords } from './prefixTree';
import {
    appendScheduleRouteRefreshQueueEntries,
    consumeScheduleRouteRefreshQueueEntries,
    deleteScheduleCirculationEntryFromDatabase,
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
        | 'init_missing_file';
}

export interface ScheduleStopMetadataUpdate {
    trainNo: string | null;
    stationTrainCode: TrainCodeParts;
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

    const allCodes: TrainCodeParts[] = [];
    const seenCodes = new Set<string>();
    for (const code of Array.isArray(row.allCodes) ? row.allCodes : []) {
        if (
            typeof code !== 'object' ||
            code === null ||
            typeof (code as { prefix?: unknown }).prefix !== 'string' ||
            typeof (code as { number?: unknown }).number !== 'number'
        ) {
            return null;
        }
        const parsedCode = {
            prefix: (code as { prefix: string }).prefix,
            number: (code as { number: number }).number
        } satisfies TrainCodeParts;
        const codeKey = trainCodeKey(parsedCode);
        if (seenCodes.has(codeKey)) {
            continue;
        }
        seenCodes.add(codeKey);
        allCodes.push(parsedCode);
    }
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

function normalizeOptionalNonNegativeInteger(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        return null;
    }

    return value;
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
            left.maxNo !== right.maxNo ||
            left.track !== right.track
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
        currentItemsByCode.set(trainCodeKey(item.code), item);
    }

    for (const item of nextPublished.items) {
        const currentItem = currentItemsByCode.get(trainCodeKey(item.code));
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
        if (!item.internalCode && currentItem.internalCode) {
            item.internalCode = currentItem.internalCode;
        }
    }

    return nextPublished;
}

export function createInitialScheduleState(
    date: ServiceDay,
    config: ScheduleProbeRuntimeConfig
): ScheduleState {
    return {
        date,
        lastBuildDate: asServiceDay(0),
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
    serviceDate: ServiceDay,
    trainCodes: readonly TrainCodeParts[],
    enqueuedAt: number
): ScheduleRouteRefreshQueueEntry[] {
    if (!Number.isInteger(enqueuedAt) || enqueuedAt < 0) {
        return [];
    }

    const seenTrainCodes = new Set<string>();
    const normalizedTrainCodes: TrainCodeParts[] = [];
    for (const trainCode of trainCodes) {
        const key = trainCodeKey(trainCode);
        if (seenTrainCodes.has(key)) {
            continue;
        }
        seenTrainCodes.add(key);
        normalizedTrainCodes.push(trainCode);
    }
    if (normalizedTrainCodes.length === 0) {
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
    entries: readonly Pick<
        ScheduleRouteRefreshQueueEntry,
        'serviceDate' | 'trainCode'
    >[]
): ScheduleRouteRefreshQueueEntry[] {
    if (entries.length === 0) {
        return [];
    }

    const consumptionEntries: Pick<
        ScheduleRouteRefreshQueueEntry,
        'serviceDate' | 'trainCode'
    >[] = [];
    const consumptionKeys = new Set<string>();
    for (const entry of entries) {
        const key = `${entry.serviceDate}:${trainCodeKey(entry.trainCode)}`;
        if (consumptionKeys.has(key)) {
            continue;
        }
        consumptionKeys.add(key);
        consumptionEntries.push(entry);
    }

    if (consumptionEntries.length === 0) {
        return [];
    }

    return consumeScheduleRouteRefreshQueueEntries(consumptionEntries);
}

export function loadScheduleDocument(): ScheduleDocument | null {
    return loadScheduleDocumentFromDatabase();
}

export function saveScheduleDocument(document: ScheduleDocument): void {
    document.$schema = SCHEDULE_SCHEMA_RELATIVE_PATH;
    document.version = CURRENT_SCHEDULE_DOCUMENT_VERSION;
    document.stations = cloneScheduleStationMap(document.stations);
    document.circulation = cloneScheduleCirculationMap(document.circulation);
    saveScheduleDocumentToDatabase(document);
}

export function loadPublishedScheduleState(): ScheduleState | null {
    const state = loadScheduleStateFromDatabase('published');
    return state ? cloneScheduleState(state) : null;
}

export function loadPublishedScheduleStateSummary(): ScheduleStateSummary | null {
    return loadScheduleStateSummaryByKind('published');
}

export function loadScheduleCirculationMap(): ScheduleCirculationMap {
    const circulation = loadScheduleCirculationMapFromDatabase();
    return circulation ? cloneScheduleCirculationMap(circulation) : {};
}

export function loadScheduleCirculationEntry(
    internalCode: string
): ScheduleCirculationEntry | null {
    const normalizedInternalCode = normalizeCode(internalCode);
    if (normalizedInternalCode.length === 0) {
        return null;
    }

    const entry = loadScheduleCirculationEntryFromDatabase(
        normalizedInternalCode
    );
    return entry ? cloneScheduleCirculationEntry(entry) : null;
}

export function saveScheduleCirculationEntry(
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

    const savedKeys = saveScheduleCirculationEntriesToDatabase([
        normalizedEntry
    ]);
    return savedKeys.includes(normalizedKey) ? normalizedKey : null;
}

export function saveScheduleCirculationEntries(
    entries: readonly ScheduleCirculationEntry[]
): string[] {
    if (entries.length === 0) {
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
    serviceDate: ServiceDay,
    updates: readonly ScheduleStopMetadataUpdate[]
): SaveScheduleStopMetadataResult {
    const normalizedUpdates = updates
        .map((update) => ({
            trainNo: update.trainNo,
            stationTrainCode: update.stationTrainCode,
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

export function deleteScheduleCirculationEntry(entryKey: string): string[] {
    const normalizedEntryKey = normalizeCode(entryKey);
    if (normalizedEntryKey.length === 0) {
        return [];
    }

    return deleteScheduleCirculationEntryFromDatabase(normalizedEntryKey);
}

export function loadActiveScheduleState(): ScheduleState | null {
    const today = getCurrentDateString();
    const activeKind = resolveActiveScheduleStateKind(today);
    if (!activeKind) {
        return null;
    }

    const state = loadScheduleStateFromDatabase(activeKind);
    return state ? cloneScheduleState(state) : null;
}

export function savePublishedScheduleState(
    state: ScheduleState | null,
    stations?: ScheduleStationMap
): void {
    const document = cloneScheduleDocument(
        loadScheduleDocument() ?? createInitialScheduleDocument()
    );
    document.published = state
        ? filterInvalidScheduleItems(cloneScheduleState(state)).state
        : null;
    document.stations = mergeScheduleStationMaps(document.stations, stations);
    saveScheduleDocument(document);
}

export function loadBuildingScheduleState(): ScheduleState | null {
    const state = loadScheduleStateFromDatabase('building');
    return state ? cloneScheduleState(state) : null;
}

export function saveBuildingScheduleState(
    state: ScheduleState | null,
    stations?: ScheduleStationMap
): void {
    const document = cloneScheduleDocument(
        loadScheduleDocument() ?? createInitialScheduleDocument()
    );
    document.building = state
        ? filterInvalidScheduleItems(cloneScheduleState(state)).state
        : null;
    document.stations = mergeScheduleStationMaps(document.stations, stations);
    saveScheduleDocument(document);
}

export function promoteBuildingScheduleState(
    fallbackState: ScheduleState
): ScheduleState {
    const document = cloneScheduleDocument(
        loadScheduleDocument() ?? createInitialScheduleDocument()
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
    saveScheduleDocument(document);
    bumpPublishedScheduleStateVersion();
    return cloneScheduleState(promotedState);
}

export function getScheduleStateVersion() {
    return scheduleStateVersion;
}

export function loadOrInitBuildingScheduleState(
    config: ScheduleProbeRuntimeConfig
): LoadedBuildingScheduleState {
    const today = serviceDateToDay(getCurrentDateString());
    const document = loadScheduleDocument();
    if (!document) {
        return {
            state: createInitialScheduleState(today, config),
            resumed: false,
            publishPending: false,
            reason: 'init_missing_file'
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
