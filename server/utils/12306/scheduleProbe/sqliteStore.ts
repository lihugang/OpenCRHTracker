import fs from 'fs';
import path from 'path';
import useConfig from '~/server/config';
import { useScheduleDatabase } from '~/server/libs/database/schedule';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import {
    CURRENT_SCHEDULE_DOCUMENT_VERSION,
    SCHEDULE_SCHEMA_RELATIVE_PATH
} from './constants';
import type {
    ScheduleCirculationEntry,
    ScheduleCirculationMap,
    ScheduleDocument,
    ScheduleItem,
    ScheduleRouteRefreshQueueEntry,
    ScheduleState,
    ScheduleStationEntry,
    ScheduleStationMap,
    ScheduleStop
} from './types';

export type ScheduleStateKind = 'published' | 'building';

type ScheduleSqlKey =
    | 'deleteAllScheduleCirculationEntries'
    | 'deleteAllScheduleRouteRefreshQueueEntries'
    | 'deleteAllScheduleStations'
    | 'deleteScheduleCirculationByEntryKey'
    | 'deleteScheduleCirculationLookupsByEntryKey'
    | 'deleteScheduleItemByStateKindAndCode'
    | 'deleteScheduleItemsByStateKind'
    | 'deleteScheduleRouteRefreshQueueEntry'
    | 'deleteScheduleStateByKind'
    | 'insertScheduleCirculation'
    | 'insertScheduleCirculationLookup'
    | 'insertScheduleItem'
    | 'insertScheduleItemAlias'
    | 'insertScheduleRouteRefreshQueueEntry'
    | 'insertScheduleRouteRefreshQueueEntryIfAbsent'
    | 'insertScheduleStation'
    | 'insertScheduleStop'
    | 'selectAllScheduleCirculations'
    | 'selectAllScheduleRouteRefreshQueueEntries'
    | 'selectAllScheduleStations'
    | 'selectScheduleCirculationsByLookupCode'
    | 'selectScheduleCirculationByEntryKey'
    | 'selectScheduleAliasesByStateKind'
    | 'selectScheduleAliasesByStateKindAndItemCode'
    | 'selectScheduleItemByStateKindAndCode'
    | 'selectScheduleItemCodeByStateKindAndAlias'
    | 'selectScheduleItemsByStateKindAndAlias'
    | 'selectScheduleItemsByStateKindAndInternalCode'
    | 'selectScheduleItemsByStateKind'
    | 'selectScheduleMetaValue'
    | 'selectScheduleRouteRefreshQueueEntriesByServiceDate'
    | 'selectScheduleRouteRefreshQueueEntry'
    | 'selectScheduleStateByKind'
    | 'selectScheduleStateSummaries'
    | 'selectScheduleStationByTelecode'
    | 'selectScheduleStationPlatformInfoCache'
    | 'selectSchedulePlatformInfoCandidatesByStation'
    | 'selectScheduleStopMetadataTargets'
    | 'selectScheduleStopStationCandidateRowsByStateKind'
    | 'selectScheduleStopsByStateKind'
    | 'selectScheduleStopsByStateKindAndItemCode'
    | 'selectScheduleStopsByStateKindAndStationName'
    | 'selectScheduleStationLookupRowsByStateKind'
    | 'selectScheduleTrainLookupRowsByStateKind'
    | 'updateScheduleStopMetadata'
    | 'updateScheduleStopStationPlatformInfo'
    | 'upsertScheduleStationPlatformInfoCache'
    | 'upsertScheduleMetaValue'
    | 'upsertScheduleState';

export interface ScheduleStateSummary {
    kind: ScheduleStateKind;
    date: string;
    status: ScheduleState['status'];
    phase: ScheduleState['progress']['phase'];
    generatedAt: number;
    startedAtMs: number;
    uniqueItems: number;
    usableTimetableCount: number;
    updatedAt: number;
}

interface ScheduleStateRow extends ScheduleStateSummary {
    stateJson: string;
}

export interface ScheduleDbItemRow {
    itemCode: string;
    itemIndex: number;
    internalCode: string;
    bureauCode: string;
    trainStyle: string;
    trainDepartment: string;
    passengerDepartment: string;
    startStation: string;
    endStation: string;
    startAt: number | null;
    endAt: number | null;
    lastRouteRefreshAt: number | null;
}

export interface ScheduleDbStopRow {
    stationNo: number;
    stationName: string;
    stationTelecode: string;
    arriveAt: number | null;
    departAt: number | null;
    stationTrainCode: string;
    wicket: string;
    distance: number | null;
    platformNo: number | null;
    stationPlatformInfoFetchedAt: number | null;
    isStart: number;
    isEnd: number;
}

interface ScheduleDbItemStopRow extends ScheduleDbStopRow {
    itemCode: string;
}

export interface ScheduleItemRecord {
    itemIndex: number;
    item: ScheduleItem;
}

export interface SavePublishedScheduleItemsResult {
    status: 'saved' | 'date_mismatch' | 'published_not_found';
    currentDate: string | null;
    itemCount: number;
    aliasCount: number;
    stopCount: number;
    stationCount: number;
}

export interface ScheduleDbStationStopRow
    extends ScheduleDbItemRow, ScheduleDbStopRow {}

export interface ScheduleTrainLookupRow {
    itemCode: string;
    startStation: string;
    endStation: string;
}

export interface ScheduleStationLookupRow {
    stationName: string;
    stopCount: number;
}

export interface ScheduleStopStationCandidateRow {
    stationName: string;
    stationTelecode: string;
}

export interface ScheduleCandidateCodeInput {
    internalCodes?: readonly string[];
    aliasCodes?: readonly string[];
}

export interface ScheduleCirculationRecord {
    entryKey: string;
    refreshedAt: number;
    entry: ScheduleCirculationEntry;
}

export interface ScheduleStopMetadataUpdateInput {
    trainNo: string;
    stationTrainCode: string;
    stationTelecode: string;
    distance: number | null;
    platformNo: number | null;
}

export type SchedulePlatformInfoLookupType =
    | 'origin_transport'
    | 'arrival_exit';

export interface SchedulePlatformInfoCandidateRow {
    itemCode: string;
    internalCode: string;
    stopIndex: number;
    stationNo: number;
    stationTelecode: string;
    arriveAt: number | null;
    departAt: number | null;
    currentStationTrainCode: string;
    arrivalStationTrainCode: string | null;
    isStart: number;
}

export interface ScheduleStationPlatformInfoCacheEntry {
    lookupType: SchedulePlatformInfoLookupType;
    internalCode: string;
    stationTelecode: string;
    stationTrainCode: string;
    platformNo: number | null;
    wicket: string | null;
    trainDate: string;
    fetchedAt: number;
}

export interface ScheduleStationPlatformInfoPersistInput extends ScheduleStationPlatformInfoCacheEntry {
    stationNo: number;
    overwritePlatform: boolean;
    writeCache: boolean;
}

export interface ScheduleStationPlatformInfoPersistResult {
    updatedCacheEntryCount: number;
    updatedStopCount: number;
}

interface ScheduleAliasRow {
    itemCode?: string;
    aliasCode: string;
}

interface ScheduleItemCodeRow {
    itemCode: string;
}

interface ScheduleMetaRow {
    value: string;
}

interface ScheduleStationRow {
    stationTelecode: string;
    stationName: string;
    lat: number;
    lon: number;
}

interface ScheduleCirculationRow {
    entryKey: string;
    refreshedAt: number;
    entryJson: string;
}

interface ScheduleStopMetadataTargetRow {
    stopIndex: number;
    stationNo: number;
    arriveAt: number | null;
    wicket: string;
    distance: number | null;
    platformNo: number | null;
    stationPlatformInfoFetchedAt: number | null;
}

const DOCUMENT_VERSION_META_KEY = 'document_version';
const DOCUMENT_UPDATED_AT_META_KEY = 'document_updated_at';
const MIGRATED_FROM_JSON_PATH_META_KEY = 'migrated_from_json_path';
const MIGRATED_FROM_JSON_MTIME_MS_META_KEY = 'migrated_from_json_mtime_ms';
const queries = createPreparedSqlStore<ScheduleSqlKey>({
    dbName: 'schedule',
    scope: 'schedule',
    sql: importSqlBatch('schedule/queries') as Record<ScheduleSqlKey, string>
});

function toNullableInteger(value: number | null | undefined): number | null {
    return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function toSqlBoolean(value: boolean): number {
    return value ? 1 : 0;
}

function parseSqlBoolean(value: number): boolean {
    return value === 1;
}

function parseJson<T>(value: string): T | null {
    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

function getNowSeconds(): number {
    return Math.floor(Date.now() / 1000);
}

function countUsableTimetableItems(state: ScheduleState): number {
    return state.items.filter(
        (item) =>
            item.startAt !== null &&
            item.endAt !== null &&
            item.stops.length > 0
    ).length;
}

function getStatePhase(
    state: ScheduleState
): ScheduleState['progress']['phase'] {
    return state.progress.phase;
}

function serializeState(state: ScheduleState): string {
    return JSON.stringify(state);
}

function normalizeItemCode(item: Pick<ScheduleItem, 'code'>): string {
    return normalizeCode(item.code);
}

function listItemAliases(item: ScheduleItem): string[] {
    return uniqueNormalizedCodes([item.code, ...item.allCodes]);
}

function toScheduleStop(row: ScheduleDbStopRow): ScheduleStop {
    return {
        stationNo: row.stationNo,
        stationName: row.stationName,
        stationTelecode: row.stationTelecode,
        arriveAt: row.arriveAt,
        departAt: row.departAt,
        stationTrainCode: row.stationTrainCode,
        wicket: row.wicket,
        distance: row.distance,
        platformNo: row.platformNo,
        stationPlatformInfoFetchedAt: row.stationPlatformInfoFetchedAt,
        isStart: parseSqlBoolean(row.isStart),
        isEnd: parseSqlBoolean(row.isEnd)
    };
}

function toScheduleStation(row: ScheduleStationRow): ScheduleStationEntry {
    return {
        stationTelecode: row.stationTelecode,
        stationName: row.stationName,
        lat: row.lat,
        lon: row.lon
    };
}

function toScheduleItem(
    row: ScheduleDbItemRow,
    aliases: string[],
    stops: ScheduleStop[]
): ScheduleItem {
    const itemCode = normalizeCode(row.itemCode);
    return {
        code: itemCode,
        internalCode: normalizeCode(row.internalCode),
        allCodes: aliases.filter((aliasCode) => aliasCode !== itemCode),
        bureauCode: row.bureauCode.trim(),
        trainStyle: row.trainStyle.trim(),
        trainDepartment: row.trainDepartment.trim(),
        passengerDepartment: row.passengerDepartment.trim(),
        startStation: row.startStation.trim(),
        endStation: row.endStation.trim(),
        startAt: row.startAt,
        endAt: row.endAt,
        lastRouteRefreshAt: row.lastRouteRefreshAt,
        stops
    };
}

function toScheduleCirculationRecord(
    row: ScheduleCirculationRow
): ScheduleCirculationRecord | null {
    const entry = parseJson<ScheduleCirculationEntry>(row.entryJson);
    if (!entry) {
        return null;
    }

    return {
        entryKey: row.entryKey,
        refreshedAt: row.refreshedAt,
        entry
    };
}

function getScheduleCirculationKeysFromEntry(
    entry: Pick<ScheduleCirculationEntry, 'nodes'>
): string[] {
    return uniqueNormalizedCodes(
        entry.nodes.map((node) => normalizeCode(node.internalCode))
    );
}

function insertScheduleCirculationRecord(
    entryKey: string,
    entry: ScheduleCirculationEntry,
    updatedAt: number
): void {
    const normalizedEntryKey = normalizeCode(entryKey);
    if (normalizedEntryKey.length === 0) {
        return;
    }

    queries.run(
        'insertScheduleCirculation',
        normalizedEntryKey,
        entry.refreshedAt,
        JSON.stringify(entry),
        updatedAt
    );

    for (const node of entry.nodes) {
        const internalCode = normalizeCode(node.internalCode);
        if (internalCode.length > 0) {
            queries.run(
                'insertScheduleCirculationLookup',
                normalizedEntryKey,
                internalCode,
                'internal_code'
            );
        }

        for (const allCode of uniqueNormalizedCodes(node.allCodes)) {
            queries.run(
                'insertScheduleCirculationLookup',
                normalizedEntryKey,
                allCode,
                'all_code'
            );
        }
    }
}

function deleteScheduleCirculationEntryKey(entryKey: string): boolean {
    const normalizedEntryKey = normalizeCode(entryKey);
    if (normalizedEntryKey.length === 0) {
        return false;
    }

    queries.run(
        'deleteScheduleCirculationLookupsByEntryKey',
        normalizedEntryKey
    );
    const result = queries.run(
        'deleteScheduleCirculationByEntryKey',
        normalizedEntryKey
    );
    return result.changes > 0;
}

function upsertMetaValue(key: string, value: string): void {
    queries.run('upsertScheduleMetaValue', key, value);
}

function loadMetaValue(key: string): string | null {
    return (
        queries.get<ScheduleMetaRow>('selectScheduleMetaValue', key)?.value ??
        null
    );
}

function saveScheduleStateRows(
    kind: ScheduleStateKind,
    state: ScheduleState | null
): void {
    if (!state) {
        queries.run('deleteScheduleStateByKind', kind);
        return;
    }

    const updatedAt = getNowSeconds();
    queries.run(
        'upsertScheduleState',
        kind,
        state.date,
        state.status,
        getStatePhase(state),
        state.generatedAt,
        Math.floor(state.startedAtMs),
        state.stats.uniqueItems,
        countUsableTimetableItems(state),
        serializeState(state),
        updatedAt
    );
    queries.run('deleteScheduleItemsByStateKind', kind);

    for (const [itemIndex, item] of state.items.entries()) {
        insertScheduleItemRows(kind, itemIndex, item);
    }
}

function insertScheduleItemRows(
    kind: ScheduleStateKind,
    itemIndex: number,
    item: ScheduleItem
): { aliasCount: number; stopCount: number } {
    const itemCode = normalizeItemCode(item);
    if (itemCode.length === 0) {
        return { aliasCount: 0, stopCount: 0 };
    }

    queries.run(
        'insertScheduleItem',
        kind,
        itemCode,
        itemIndex,
        normalizeCode(item.internalCode),
        item.bureauCode.trim(),
        item.trainStyle.trim(),
        item.trainDepartment.trim(),
        item.passengerDepartment.trim(),
        item.startStation.trim(),
        item.endStation.trim(),
        toNullableInteger(item.startAt),
        toNullableInteger(item.endAt),
        toNullableInteger(item.lastRouteRefreshAt)
    );

    const aliases = listItemAliases(item);
    for (const [aliasIndex, aliasCode] of aliases.entries()) {
        queries.run(
            'insertScheduleItemAlias',
            kind,
            itemCode,
            aliasCode,
            aliasIndex
        );
    }

    for (const [stopIndex, stop] of item.stops.entries()) {
        queries.run(
            'insertScheduleStop',
            kind,
            itemCode,
            stopIndex,
            stop.stationNo,
            stop.stationName.trim(),
            normalizeCode(stop.stationTelecode),
            toNullableInteger(stop.arriveAt),
            toNullableInteger(stop.departAt),
            stop.stationTrainCode.trim(),
            stop.wicket.trim(),
            toNullableInteger(stop.distance),
            toNullableInteger(stop.platformNo),
            toNullableInteger(stop.stationPlatformInfoFetchedAt),
            toSqlBoolean(stop.isStart),
            toSqlBoolean(stop.isEnd)
        );
    }

    return {
        aliasCount: aliases.length,
        stopCount: item.stops.length
    };
}

function saveScheduleStations(stations: ScheduleStationMap): void {
    queries.run('deleteAllScheduleStations');

    for (const entry of Object.values(stations)) {
        const stationTelecode = normalizeCode(entry.stationTelecode);
        const stationName = entry.stationName.trim();
        if (stationTelecode.length === 0 || stationName.length === 0) {
            continue;
        }

        queries.run(
            'insertScheduleStation',
            stationTelecode,
            stationName,
            entry.lat,
            entry.lon
        );
    }
}

function saveScheduleRouteRefreshQueue(
    queue: ScheduleRouteRefreshQueueEntry[]
): void {
    queries.run('deleteAllScheduleRouteRefreshQueueEntries');

    for (const entry of queue) {
        queries.run(
            'insertScheduleRouteRefreshQueueEntry',
            entry.serviceDate,
            normalizeCode(entry.trainCode),
            entry.enqueuedAt
        );
    }
}

function saveScheduleCirculation(circulation: ScheduleCirculationMap): void {
    const updatedAt = getNowSeconds();
    queries.run('deleteAllScheduleCirculationEntries');

    for (const [entryKey, entry] of Object.entries(circulation)) {
        insertScheduleCirculationRecord(entryKey, entry, updatedAt);
    }
}

function loadScheduleStations(): ScheduleStationMap {
    const stations: ScheduleStationMap = {};
    for (const row of queries.all<ScheduleStationRow>(
        'selectAllScheduleStations'
    )) {
        const station = toScheduleStation(row);
        stations[station.stationTelecode] = station;
    }

    return stations;
}

function loadScheduleItemWithStopsFromRow(
    kind: ScheduleStateKind,
    row: ScheduleDbItemRow
): ScheduleItem {
    const aliases = listScheduleAliasesByStateKindAndItemCode(
        kind,
        row.itemCode
    );
    const stops = listScheduleStopsByStateKindAndItemCode(kind, row.itemCode);
    return toScheduleItem(row, aliases, stops);
}

export function loadScheduleCirculationMapFromDatabase(): ScheduleCirculationMap | null {
    const circulation: ScheduleCirculationMap = {};
    for (const row of queries.all<ScheduleCirculationRow>(
        'selectAllScheduleCirculations'
    )) {
        const record = toScheduleCirculationRecord(row);
        if (!record) {
            return null;
        }
        circulation[record.entryKey] = record.entry;
    }

    return circulation;
}

export function listScheduleCirculationRecordsByLookupCode(
    lookupCode: string
): ScheduleCirculationRecord[] {
    const normalizedLookupCode = normalizeCode(lookupCode);
    if (normalizedLookupCode.length === 0) {
        return [];
    }

    return queries
        .all<ScheduleCirculationRow>(
            'selectScheduleCirculationsByLookupCode',
            normalizedLookupCode,
            normalizedLookupCode
        )
        .map(toScheduleCirculationRecord)
        .filter(
            (record): record is ScheduleCirculationRecord => record !== null
        );
}

export function loadScheduleCirculationEntryFromDatabase(
    entryKey: string
): ScheduleCirculationEntry | null {
    const row = queries.get<ScheduleCirculationRow>(
        'selectScheduleCirculationByEntryKey',
        normalizeCode(entryKey)
    );
    if (!row) {
        return null;
    }

    return toScheduleCirculationRecord(row)?.entry ?? null;
}

export function loadScheduleCirculationRecordFromDatabase(
    entryKey: string
): ScheduleCirculationRecord | null {
    const row = queries.get<ScheduleCirculationRow>(
        'selectScheduleCirculationByEntryKey',
        normalizeCode(entryKey)
    );
    if (!row) {
        return null;
    }

    return toScheduleCirculationRecord(row);
}

export function saveScheduleCirculationEntriesToDatabase(
    entries: readonly ScheduleCirculationEntry[]
): string[] {
    if (entries.length === 0) {
        return [];
    }

    const db = useScheduleDatabase();
    const savedKeys = new Set<string>();
    const transaction = db.transaction(() => {
        const updatedAt = getNowSeconds();

        for (const entry of entries) {
            const entryKeys = getScheduleCirculationKeysFromEntry(entry);
            if (entryKeys.length === 0) {
                continue;
            }

            const staleKeys = new Set<string>();
            for (const entryKey of entryKeys) {
                const existingEntry =
                    loadScheduleCirculationEntryFromDatabase(entryKey);
                if (!existingEntry) {
                    continue;
                }

                for (const existingKey of getScheduleCirculationKeysFromEntry(
                    existingEntry
                )) {
                    staleKeys.add(existingKey);
                }
            }

            for (const staleKey of staleKeys) {
                deleteScheduleCirculationEntryKey(staleKey);
            }

            for (const entryKey of entryKeys) {
                insertScheduleCirculationRecord(entryKey, entry, updatedAt);
                savedKeys.add(entryKey);
            }
        }
    });

    transaction();
    return [...savedKeys];
}

export function deleteScheduleCirculationEntryFromDatabase(
    entryKey: string
): string[] {
    const normalizedEntryKey = normalizeCode(entryKey);
    if (normalizedEntryKey.length === 0) {
        return [];
    }

    const entry = loadScheduleCirculationEntryFromDatabase(normalizedEntryKey);
    if (!entry) {
        return [];
    }

    const deletedKeys: string[] = [];
    const deletionKeys = uniqueNormalizedCodes([
        normalizedEntryKey,
        ...getScheduleCirculationKeysFromEntry(entry)
    ]);
    const db = useScheduleDatabase();
    const transaction = db.transaction(() => {
        for (const deletionKey of deletionKeys) {
            if (deleteScheduleCirculationEntryKey(deletionKey)) {
                deletedKeys.push(deletionKey);
            }
        }
    });

    transaction();
    return deletedKeys;
}

function loadRouteRefreshQueue(): ScheduleRouteRefreshQueueEntry[] {
    return queries.all<ScheduleRouteRefreshQueueEntry>(
        'selectAllScheduleRouteRefreshQueueEntries'
    );
}

export function listScheduleRouteRefreshQueueEntries(
    serviceDate?: string
): ScheduleRouteRefreshQueueEntry[] {
    if (typeof serviceDate === 'string') {
        const normalizedServiceDate = serviceDate.trim();
        if (!/^\d{8}$/.test(normalizedServiceDate)) {
            return [];
        }

        return queries.all<ScheduleRouteRefreshQueueEntry>(
            'selectScheduleRouteRefreshQueueEntriesByServiceDate',
            normalizedServiceDate
        );
    }

    return loadRouteRefreshQueue();
}

export function appendScheduleRouteRefreshQueueEntries(
    entries: readonly ScheduleRouteRefreshQueueEntry[]
): ScheduleRouteRefreshQueueEntry[] {
    const appendedEntries: ScheduleRouteRefreshQueueEntry[] = [];
    const seenKeys = new Set<string>();

    for (const entry of entries) {
        const serviceDate = entry.serviceDate.trim();
        const trainCode = normalizeCode(entry.trainCode);
        if (
            !/^\d{8}$/.test(serviceDate) ||
            trainCode.length === 0 ||
            !Number.isInteger(entry.enqueuedAt) ||
            entry.enqueuedAt < 0
        ) {
            continue;
        }

        const queueKey = `${serviceDate}:${trainCode}`;
        if (seenKeys.has(queueKey)) {
            continue;
        }
        seenKeys.add(queueKey);

        const result = queries.run(
            'insertScheduleRouteRefreshQueueEntryIfAbsent',
            serviceDate,
            trainCode,
            entry.enqueuedAt
        );
        if (result.changes > 0) {
            appendedEntries.push({
                serviceDate,
                trainCode,
                enqueuedAt: entry.enqueuedAt
            });
        }
    }

    return appendedEntries;
}

export function consumeScheduleRouteRefreshQueueEntries(
    entries: readonly Pick<
        ScheduleRouteRefreshQueueEntry,
        'serviceDate' | 'trainCode'
    >[]
): ScheduleRouteRefreshQueueEntry[] {
    const removedEntries: ScheduleRouteRefreshQueueEntry[] = [];
    const seenKeys = new Set<string>();

    for (const entry of entries) {
        const serviceDate =
            typeof entry.serviceDate === 'string'
                ? entry.serviceDate.trim()
                : '';
        const trainCode = normalizeCode(String(entry.trainCode ?? ''));
        if (!/^\d{8}$/.test(serviceDate) || trainCode.length === 0) {
            continue;
        }

        const queueKey = `${serviceDate}:${trainCode}`;
        if (seenKeys.has(queueKey)) {
            continue;
        }
        seenKeys.add(queueKey);

        const existingEntry = queries.get<ScheduleRouteRefreshQueueEntry>(
            'selectScheduleRouteRefreshQueueEntry',
            serviceDate,
            trainCode
        );
        if (!existingEntry) {
            continue;
        }

        const result = queries.run(
            'deleteScheduleRouteRefreshQueueEntry',
            serviceDate,
            trainCode
        );
        if (result.changes > 0) {
            removedEntries.push(existingEntry);
        }
    }

    return removedEntries;
}

function loadScheduleStateFromRow(row: ScheduleStateRow): ScheduleState | null {
    return parseJson<ScheduleState>(row.stateJson);
}

export function getScheduleDatabaseFilePath(): string {
    return path.resolve(useConfig().data.databases.schedule);
}

export function getScheduleDatabaseModifiedAtMs(): number {
    try {
        return fs.statSync(getScheduleDatabaseFilePath()).mtimeMs;
    } catch {
        return -1;
    }
}

export function hasScheduleDatabaseDocument(): boolean {
    if (loadMetaValue(DOCUMENT_VERSION_META_KEY) !== null) {
        return true;
    }

    return loadScheduleStateSummaries().length > 0;
}

export function saveScheduleDocumentToDatabase(
    document: ScheduleDocument,
    migrationSource?: { jsonPath: string; jsonMtimeMs: number | null }
): void {
    const db = useScheduleDatabase();
    const transaction = db.transaction(() => {
        saveScheduleStateRows('published', document.published);
        saveScheduleStateRows('building', document.building);
        saveScheduleStations(document.stations);
        saveScheduleCirculation(document.circulation);
        saveScheduleRouteRefreshQueue(document.routeRefreshQueue);
        upsertMetaValue(
            DOCUMENT_VERSION_META_KEY,
            String(CURRENT_SCHEDULE_DOCUMENT_VERSION)
        );
        upsertMetaValue(DOCUMENT_UPDATED_AT_META_KEY, String(getNowSeconds()));

        if (migrationSource) {
            upsertMetaValue(
                MIGRATED_FROM_JSON_PATH_META_KEY,
                path.resolve(migrationSource.jsonPath)
            );
            if (migrationSource.jsonMtimeMs !== null) {
                upsertMetaValue(
                    MIGRATED_FROM_JSON_MTIME_MS_META_KEY,
                    String(Math.floor(migrationSource.jsonMtimeMs))
                );
            }
        }
    });

    transaction();
}

export function loadScheduleDocumentFromDatabase(): ScheduleDocument | null {
    if (!hasScheduleDatabaseDocument()) {
        return null;
    }

    const published = loadScheduleStateFromDatabase('published');
    const building = loadScheduleStateFromDatabase('building');
    const circulation = loadScheduleCirculationMapFromDatabase();
    if (!circulation) {
        return null;
    }

    return {
        $schema: SCHEDULE_SCHEMA_RELATIVE_PATH,
        version: CURRENT_SCHEDULE_DOCUMENT_VERSION,
        stations: loadScheduleStations(),
        circulation,
        routeRefreshQueue: loadRouteRefreshQueue(),
        published,
        building
    };
}

export function loadScheduleStateFromDatabase(
    kind: ScheduleStateKind
): ScheduleState | null {
    const row = queries.get<ScheduleStateRow>(
        'selectScheduleStateByKind',
        kind
    );
    return row ? loadScheduleStateFromRow(row) : null;
}

export function listScheduleItemRecordsByStateKind(
    kind: ScheduleStateKind
): ScheduleItemRecord[] {
    const aliasesByItemCode = listScheduleAliasesByStateKind(kind);
    const stopsByItemCode = new Map<string, ScheduleStop[]>();
    for (const row of queries.all<ScheduleDbItemStopRow>(
        'selectScheduleStopsByStateKind',
        kind
    )) {
        const stops = stopsByItemCode.get(row.itemCode) ?? [];
        stops.push(toScheduleStop(row));
        stopsByItemCode.set(row.itemCode, stops);
    }

    return listScheduleItemsByStateKind(kind).map((row) => ({
        itemIndex: row.itemIndex,
        item: toScheduleItem(
            row,
            aliasesByItemCode.get(row.itemCode) ?? [],
            stopsByItemCode.get(row.itemCode) ?? []
        )
    }));
}

export function loadScheduleStateSummaries(): ScheduleStateSummary[] {
    return queries.all<ScheduleStateSummary>('selectScheduleStateSummaries');
}

export function loadScheduleStateSummaryByKind(
    kind: ScheduleStateKind
): ScheduleStateSummary | null {
    return (
        loadScheduleStateSummaries().find((summary) => summary.kind === kind) ??
        null
    );
}

export function resolveActiveScheduleStateSummary(
    currentDate: string
): ScheduleStateSummary | null {
    const summaries = loadScheduleStateSummaries();
    const published =
        summaries.find((summary) => summary.kind === 'published') ?? null;
    const building =
        summaries.find((summary) => summary.kind === 'building') ?? null;

    if (published && published.date === currentDate) {
        return published;
    }

    if (
        building &&
        building.date === currentDate &&
        building.usableTimetableCount > 0
    ) {
        return building;
    }

    if (published) {
        return published;
    }

    if (building && building.date === currentDate) {
        return building;
    }

    return building;
}

export function resolveActiveScheduleStateKind(
    currentDate: string
): ScheduleStateKind | null {
    return resolveActiveScheduleStateSummary(currentDate)?.kind ?? null;
}

export function listScheduleItemsByStateKind(
    kind: ScheduleStateKind
): ScheduleDbItemRow[] {
    return queries.all<ScheduleDbItemRow>(
        'selectScheduleItemsByStateKind',
        kind
    );
}

export function listScheduleAliasesByStateKind(
    kind: ScheduleStateKind
): Map<string, string[]> {
    const aliasesByItemCode = new Map<string, string[]>();
    for (const row of queries.all<ScheduleAliasRow>(
        'selectScheduleAliasesByStateKind',
        kind
    )) {
        const itemCode = row.itemCode ?? '';
        const aliases = aliasesByItemCode.get(itemCode) ?? [];
        aliases.push(row.aliasCode);
        aliasesByItemCode.set(itemCode, aliases);
    }

    return aliasesByItemCode;
}

export function loadScheduleItemByStateKindAndCode(
    kind: ScheduleStateKind,
    itemCode: string
): ScheduleDbItemRow | null {
    return (
        queries.get<ScheduleDbItemRow>(
            'selectScheduleItemByStateKindAndCode',
            kind,
            normalizeCode(itemCode)
        ) ?? null
    );
}

export function listScheduleItemsByStateKindAndInternalCode(
    kind: ScheduleStateKind,
    internalCode: string
): ScheduleDbItemRow[] {
    const normalizedInternalCode = normalizeCode(internalCode);
    if (normalizedInternalCode.length === 0) {
        return [];
    }

    return queries.all<ScheduleDbItemRow>(
        'selectScheduleItemsByStateKindAndInternalCode',
        kind,
        normalizedInternalCode
    );
}

export function listScheduleItemsByStateKindAndAlias(
    kind: ScheduleStateKind,
    aliasCode: string
): ScheduleDbItemRow[] {
    const normalizedAliasCode = normalizeCode(aliasCode);
    if (normalizedAliasCode.length === 0) {
        return [];
    }

    const rowsByItemCode = new Map<string, ScheduleDbItemRow>();
    for (const row of queries.all<ScheduleDbItemRow>(
        'selectScheduleItemsByStateKindAndAlias',
        kind,
        normalizedAliasCode
    )) {
        rowsByItemCode.set(row.itemCode, row);
    }

    const directRow = loadScheduleItemByStateKindAndCode(
        kind,
        normalizedAliasCode
    );
    if (directRow) {
        rowsByItemCode.set(directRow.itemCode, directRow);
    }

    return [...rowsByItemCode.values()].sort((left, right) => {
        if (left.itemIndex !== right.itemIndex) {
            return left.itemIndex - right.itemIndex;
        }

        return left.itemCode.localeCompare(right.itemCode);
    });
}

export function loadScheduleItemWithStopsByStateKindAndCode(
    kind: ScheduleStateKind,
    itemCode: string
): ScheduleItem | null {
    const row = loadScheduleItemByStateKindAndCode(kind, itemCode);
    return row ? loadScheduleItemWithStopsFromRow(kind, row) : null;
}

export function listScheduleItemsWithStopsByStateKindAndCodes(
    kind: ScheduleStateKind,
    itemCodes: readonly string[]
): ScheduleItem[] {
    const items: ScheduleItem[] = [];
    const visitedItemCodes = new Set<string>();

    for (const itemCode of uniqueNormalizedCodes([...itemCodes])) {
        if (visitedItemCodes.has(itemCode)) {
            continue;
        }
        const item = loadScheduleItemWithStopsByStateKindAndCode(
            kind,
            itemCode
        );
        if (!item) {
            continue;
        }

        visitedItemCodes.add(item.code);
        items.push(item);
    }

    return items;
}

export function listScheduleItemsWithStopsByStateKindAndInternalCode(
    kind: ScheduleStateKind,
    internalCode: string
): ScheduleItem[] {
    return listScheduleItemsByStateKindAndInternalCode(kind, internalCode).map(
        (row) => loadScheduleItemWithStopsFromRow(kind, row)
    );
}

export function listScheduleCandidateItemsForCodes(
    kind: ScheduleStateKind,
    input: ScheduleCandidateCodeInput
): ScheduleItem[] {
    const rowsByItemCode = new Map<string, ScheduleDbItemRow>();

    for (const internalCode of uniqueNormalizedCodes([
        ...(input.internalCodes ?? [])
    ])) {
        for (const row of listScheduleItemsByStateKindAndInternalCode(
            kind,
            internalCode
        )) {
            rowsByItemCode.set(row.itemCode, row);
        }
    }

    for (const aliasCode of uniqueNormalizedCodes([
        ...(input.aliasCodes ?? [])
    ])) {
        for (const row of listScheduleItemsByStateKindAndAlias(
            kind,
            aliasCode
        )) {
            rowsByItemCode.set(row.itemCode, row);
        }
    }

    return [...rowsByItemCode.values()]
        .sort((left, right) => {
            if (left.itemIndex !== right.itemIndex) {
                return left.itemIndex - right.itemIndex;
            }

            return left.itemCode.localeCompare(right.itemCode);
        })
        .map((row) => loadScheduleItemWithStopsFromRow(kind, row));
}

export function listScheduleCandidateItemRecordsForCodes(
    kind: ScheduleStateKind,
    input: ScheduleCandidateCodeInput
): ScheduleItemRecord[] {
    const rowsByItemCode = new Map<string, ScheduleDbItemRow>();

    for (const internalCode of uniqueNormalizedCodes([
        ...(input.internalCodes ?? [])
    ])) {
        for (const row of listScheduleItemsByStateKindAndInternalCode(
            kind,
            internalCode
        )) {
            rowsByItemCode.set(row.itemCode, row);
        }
    }

    for (const aliasCode of uniqueNormalizedCodes([
        ...(input.aliasCodes ?? [])
    ])) {
        for (const row of listScheduleItemsByStateKindAndAlias(
            kind,
            aliasCode
        )) {
            rowsByItemCode.set(row.itemCode, row);
        }
    }

    return [...rowsByItemCode.values()]
        .sort((left, right) => {
            if (left.itemIndex !== right.itemIndex) {
                return left.itemIndex - right.itemIndex;
            }
            return left.itemCode.localeCompare(right.itemCode);
        })
        .map((row) => ({
            itemIndex: row.itemIndex,
            item: loadScheduleItemWithStopsFromRow(kind, row)
        }));
}

export function savePublishedScheduleItemsIncrementally(
    expectedDate: string,
    records: readonly ScheduleItemRecord[],
    stations: ScheduleStationMap
): SavePublishedScheduleItemsResult {
    const db = useScheduleDatabase();
    const transaction = db.transaction((): SavePublishedScheduleItemsResult => {
        const summary = loadScheduleStateSummaryByKind('published');
        if (!summary) {
            return {
                status: 'published_not_found',
                currentDate: null,
                itemCount: 0,
                aliasCount: 0,
                stopCount: 0,
                stationCount: 0
            };
        }
        if (summary.date !== expectedDate) {
            return {
                status: 'date_mismatch',
                currentDate: summary.date,
                itemCount: 0,
                aliasCount: 0,
                stopCount: 0,
                stationCount: 0
            };
        }

        let itemCount = 0;
        let aliasCount = 0;
        let stopCount = 0;
        for (const record of records) {
            const itemCode = normalizeItemCode(record.item);
            if (itemCode.length === 0) {
                continue;
            }
            queries.run(
                'deleteScheduleItemByStateKindAndCode',
                'published',
                itemCode
            );
            const counts = insertScheduleItemRows(
                'published',
                record.itemIndex,
                record.item
            );
            itemCount += 1;
            aliasCount += counts.aliasCount;
            stopCount += counts.stopCount;
        }

        let stationCount = 0;
        for (const entry of Object.values(stations)) {
            const stationTelecode = normalizeCode(entry.stationTelecode);
            const stationName = entry.stationName.trim();
            if (stationTelecode.length === 0 || stationName.length === 0) {
                continue;
            }
            queries.run(
                'insertScheduleStation',
                stationTelecode,
                stationName,
                entry.lat,
                entry.lon
            );
            stationCount += 1;
        }

        upsertMetaValue(DOCUMENT_UPDATED_AT_META_KEY, String(getNowSeconds()));
        return {
            status: 'saved',
            currentDate: summary.date,
            itemCount,
            aliasCount,
            stopCount,
            stationCount
        };
    });

    return transaction();
}

export function syncPublishedScheduleSnapshotFromItems(): ScheduleState | null {
    const state = loadScheduleStateFromDatabase('published');
    if (!state) {
        return null;
    }

    state.items = listScheduleItemRecordsByStateKind('published').map(
        (record) => record.item
    );
    state.stats.uniqueItems = state.items.length;

    const db = useScheduleDatabase();
    db.transaction(() => {
        const updatedAt = getNowSeconds();
        queries.run(
            'upsertScheduleState',
            'published',
            state.date,
            state.status,
            getStatePhase(state),
            state.generatedAt,
            Math.floor(state.startedAtMs),
            state.stats.uniqueItems,
            countUsableTimetableItems(state),
            serializeState(state),
            updatedAt
        );
        upsertMetaValue(DOCUMENT_UPDATED_AT_META_KEY, String(updatedAt));
    })();

    return state;
}

export function loadScheduleItemCodeByStateKindAndAlias(
    kind: ScheduleStateKind,
    aliasCode: string
): string | null {
    return (
        queries.get<ScheduleItemCodeRow>(
            'selectScheduleItemCodeByStateKindAndAlias',
            kind,
            normalizeCode(aliasCode)
        )?.itemCode ?? null
    );
}

export function listScheduleAliasesByStateKindAndItemCode(
    kind: ScheduleStateKind,
    itemCode: string
): string[] {
    return queries
        .all<ScheduleAliasRow>(
            'selectScheduleAliasesByStateKindAndItemCode',
            kind,
            normalizeCode(itemCode)
        )
        .map((row) => row.aliasCode);
}

export function listScheduleStopsByStateKindAndItemCode(
    kind: ScheduleStateKind,
    itemCode: string
): ScheduleStop[] {
    return queries
        .all<ScheduleDbStopRow>(
            'selectScheduleStopsByStateKindAndItemCode',
            kind,
            normalizeCode(itemCode)
        )
        .map(toScheduleStop);
}

export function listScheduleStopsByStateKindAndStationName(
    kind: ScheduleStateKind,
    stationName: string
): ScheduleDbStationStopRow[] {
    return queries.all<ScheduleDbStationStopRow>(
        'selectScheduleStopsByStateKindAndStationName',
        kind,
        stationName.trim()
    );
}

export function listSchedulePlatformInfoCandidatesByStateKindAndStationName(
    kind: ScheduleStateKind,
    stationName: string,
    expiresAt: number
): SchedulePlatformInfoCandidateRow[] {
    if (!Number.isInteger(expiresAt) || expiresAt < 0) {
        return [];
    }

    return queries.all<SchedulePlatformInfoCandidateRow>(
        'selectSchedulePlatformInfoCandidatesByStation',
        kind,
        stationName.trim(),
        expiresAt
    );
}

export function loadScheduleStationPlatformInfoCacheEntry(input: {
    lookupType: SchedulePlatformInfoLookupType;
    internalCode: string;
    stationTelecode: string;
    stationTrainCode: string;
}): ScheduleStationPlatformInfoCacheEntry | null {
    const lookupType = input.lookupType;
    const internalCode = normalizeCode(input.internalCode);
    const stationTelecode = normalizeCode(input.stationTelecode);
    const stationTrainCode = normalizeCode(input.stationTrainCode);
    if (
        internalCode.length === 0 ||
        stationTelecode.length === 0 ||
        stationTrainCode.length === 0
    ) {
        return null;
    }

    return (
        queries.get<ScheduleStationPlatformInfoCacheEntry>(
            'selectScheduleStationPlatformInfoCache',
            lookupType,
            internalCode,
            stationTelecode,
            stationTrainCode
        ) ?? null
    );
}

export function listScheduleStopStationCandidateRowsByStateKind(
    kind: ScheduleStateKind
): ScheduleStopStationCandidateRow[] {
    return queries.all<ScheduleStopStationCandidateRow>(
        'selectScheduleStopStationCandidateRowsByStateKind',
        kind
    );
}

export function saveScheduleStopMetadataByStateKind(
    kind: ScheduleStateKind,
    updates: readonly ScheduleStopMetadataUpdateInput[]
): number {
    const changedStopKeys = new Set<string>();

    for (const update of updates) {
        const stationTelecode = normalizeCode(update.stationTelecode);
        if (
            stationTelecode.length === 0 ||
            (update.distance === null && update.platformNo === null)
        ) {
            continue;
        }

        const trainNo = normalizeCode(update.trainNo);
        const stationTrainCode = normalizeCode(update.stationTrainCode);
        const candidateRows =
            trainNo.length > 0
                ? listScheduleItemsByStateKindAndInternalCode(kind, trainNo)
                : listScheduleItemsByStateKindAndAlias(kind, stationTrainCode);

        for (const item of candidateRows) {
            for (const target of queries.all<ScheduleStopMetadataTargetRow>(
                'selectScheduleStopMetadataTargets',
                kind,
                item.itemCode,
                stationTelecode
            )) {
                const nextDistance =
                    update.distance !== null
                        ? update.distance
                        : target.distance;
                const nextPlatformNo =
                    update.platformNo !== null
                        ? update.platformNo
                        : target.platformNo;
                const shouldClearStationPlatformInfoFetchedAt =
                    update.platformNo !== null &&
                    target.stationPlatformInfoFetchedAt !== null;
                if (
                    nextDistance === target.distance &&
                    nextPlatformNo === target.platformNo &&
                    !shouldClearStationPlatformInfoFetchedAt
                ) {
                    continue;
                }

                queries.run(
                    'updateScheduleStopMetadata',
                    update.distance,
                    update.platformNo,
                    update.platformNo,
                    kind,
                    item.itemCode,
                    target.stopIndex
                );
                changedStopKeys.add(
                    `${kind}:${item.itemCode}:${target.stopIndex}`
                );
            }
        }
    }

    return changedStopKeys.size;
}

export function persistScheduleStationPlatformInfoByStateKind(
    kind: ScheduleStateKind,
    updates: readonly ScheduleStationPlatformInfoPersistInput[]
): ScheduleStationPlatformInfoPersistResult {
    const normalizedUpdates: ScheduleStationPlatformInfoPersistInput[] = [];
    for (const update of updates) {
        const lookupType = update.lookupType;
        const internalCode = normalizeCode(update.internalCode);
        const stationTelecode = normalizeCode(update.stationTelecode);
        const stationTrainCode = normalizeCode(update.stationTrainCode);
        const stationNo =
            Number.isInteger(update.stationNo) && update.stationNo > 0
                ? update.stationNo
                : null;
        const platformNo =
            update.platformNo !== null &&
            Number.isInteger(update.platformNo) &&
            update.platformNo >= 0
                ? update.platformNo
                : null;
        const normalizedWicket = update.wicket?.trim() ?? '';
        const wicket =
            normalizedWicket.length > 0 && normalizedWicket !== '--'
                ? normalizedWicket
                : null;
        const fetchedAt =
            Number.isInteger(update.fetchedAt) && update.fetchedAt >= 0
                ? update.fetchedAt
                : null;
        const trainDate = update.trainDate.trim();
        if (
            internalCode.length === 0 ||
            stationTelecode.length === 0 ||
            stationTrainCode.length === 0 ||
            stationNo === null ||
            fetchedAt === null ||
            !/^\d{8}$/.test(trainDate) ||
            (platformNo === null && wicket === null)
        ) {
            continue;
        }

        normalizedUpdates.push({
            lookupType,
            internalCode,
            stationTelecode,
            stationTrainCode,
            stationNo,
            platformNo,
            wicket,
            trainDate,
            fetchedAt,
            overwritePlatform: update.overwritePlatform,
            writeCache: update.writeCache
        });
    }

    const db = useScheduleDatabase();
    const transaction = db.transaction(
        (): ScheduleStationPlatformInfoPersistResult => {
            const changedCacheKeys = new Set<string>();
            const changedStopKeys = new Set<string>();

            for (const update of normalizedUpdates) {
                if (update.writeCache) {
                    const result = queries.run(
                        'upsertScheduleStationPlatformInfoCache',
                        update.lookupType,
                        update.internalCode,
                        update.stationTelecode,
                        update.stationTrainCode,
                        update.platformNo,
                        update.wicket,
                        update.trainDate,
                        update.fetchedAt
                    );
                    if (result.changes > 0) {
                        changedCacheKeys.add(
                            `${update.lookupType}:${update.internalCode}:${update.stationTelecode}:${update.stationTrainCode}`
                        );
                    }
                }

                for (const item of listScheduleItemsByStateKindAndInternalCode(
                    kind,
                    update.internalCode
                )) {
                    for (const target of queries.all<ScheduleStopMetadataTargetRow>(
                        'selectScheduleStopMetadataTargets',
                        kind,
                        item.itemCode,
                        update.stationTelecode
                    )) {
                        if (target.stationNo !== update.stationNo) {
                            continue;
                        }

                        const canReplacePlatform =
                            update.overwritePlatform ||
                            target.stationPlatformInfoFetchedAt !== null;
                        const nextPlatformNo =
                            update.platformNo === null
                                ? target.platformNo
                                : canReplacePlatform
                                  ? update.platformNo
                                  : (target.platformNo ?? update.platformNo);
                        const nextWicket = update.wicket ?? target.wicket;
                        if (
                            nextPlatformNo === target.platformNo &&
                            nextWicket === target.wicket &&
                            update.fetchedAt ===
                                target.stationPlatformInfoFetchedAt
                        ) {
                            continue;
                        }

                        queries.run(
                            'updateScheduleStopStationPlatformInfo',
                            nextPlatformNo,
                            nextWicket,
                            update.fetchedAt,
                            kind,
                            item.itemCode,
                            target.stopIndex
                        );
                        changedStopKeys.add(
                            `${kind}:${item.itemCode}:${target.stopIndex}`
                        );
                    }
                }
            }

            return {
                updatedCacheEntryCount: changedCacheKeys.size,
                updatedStopCount: changedStopKeys.size
            };
        }
    );

    return transaction();
}

export function loadScheduleStationsByTelecodes(
    telecodes: readonly string[]
): ScheduleStationMap {
    const stations: ScheduleStationMap = {};

    for (const stationTelecode of uniqueNormalizedCodes([...telecodes])) {
        const row = queries.get<ScheduleStationRow>(
            'selectScheduleStationByTelecode',
            stationTelecode
        );
        if (!row) {
            continue;
        }

        const station = toScheduleStation(row);
        stations[station.stationTelecode] = station;
    }

    return stations;
}

export function listScheduleTrainLookupRows(
    kind: ScheduleStateKind
): ScheduleTrainLookupRow[] {
    return queries.all<ScheduleTrainLookupRow>(
        'selectScheduleTrainLookupRowsByStateKind',
        kind
    );
}

export function listScheduleStationLookupRows(
    kind: ScheduleStateKind
): ScheduleStationLookupRow[] {
    return queries.all<ScheduleStationLookupRow>(
        'selectScheduleStationLookupRowsByStateKind',
        kind
    );
}
