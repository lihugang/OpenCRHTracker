import useConfig from '~/server/config';
import getLogger from '~/server/libs/log4js';
import fetchStationExitInfo from '~/server/utils/12306/network/fetchStationExitInfo';
import fetchStationTransportInfo from '~/server/utils/12306/network/fetchStationTransportInfo';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import {
    listScheduleCandidateItemsForCodes,
    listSchedulePlatformInfoCandidatesByStateKindAndStationName,
    loadScheduleStateSummaryByKind,
    loadScheduleStationPlatformInfoCacheEntry,
    persistScheduleStationPlatformInfoByStateKind,
    type SchedulePlatformInfoCandidateRow,
    type SchedulePlatformInfoLookupType,
    type ScheduleStationPlatformInfoCacheEntry,
    type ScheduleStationPlatformInfoPersistInput
} from '~/server/utils/12306/scheduleProbe/sqliteStore';
import type {
    ScheduleItem,
    ScheduleStop
} from '~/server/utils/12306/scheduleProbe/types';
import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import { formatShanghaiDateString } from '~/server/utils/date/getCurrentDateString';
import { toUnixSecondsFromShanghaiDayOffset } from '~/server/utils/date/shanghaiDateTime';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

const logger = getLogger('station-platform-info-service');
const DAY_SECONDS = 24 * 60 * 60;

interface StationPlatformInfoCandidate {
    lookupType: SchedulePlatformInfoLookupType;
    internalCode: string;
    stationName: string;
    stationTelecode: string;
    stationNo: number;
    trainDate: string;
    stationTrainCodes: string[];
}

interface BuiltStationPlatformInfoCandidates {
    localRowCount: number;
    skippedRowCount: number;
    candidates: StationPlatformInfoCandidate[];
}

interface FetchedStationPlatformInfo {
    platformNo: number | null;
    wicket: string | null;
}

export interface StationPlatformInfoRefreshResult {
    localRowCount: number;
    candidateCount: number;
    cacheHitCount: number;
    cacheFallbackCount: number;
    requestCount: number;
    dataCount: number;
    failedTrainCount: number;
    skippedRowCount: number;
    updatedCacheEntryCount: number;
    updatedStopCount: number;
}

export interface RefreshStationPlatformInfoForStationInput {
    serviceDate: string;
    stationName: string;
    stationTelecode: string;
}

export interface ForceRefreshStationPlatformInfoForTrainCodesInput {
    serviceDate: string;
    trainCodes: readonly string[];
}

export function createEmptyStationPlatformInfoRefreshResult(): StationPlatformInfoRefreshResult {
    return {
        localRowCount: 0,
        candidateCount: 0,
        cacheHitCount: 0,
        cacheFallbackCount: 0,
        requestCount: 0,
        dataCount: 0,
        failedTrainCount: 0,
        skippedRowCount: 0,
        updatedCacheEntryCount: 0,
        updatedStopCount: 0
    };
}

function isValidServiceDate(value: string) {
    return /^\d{8}$/.test(value);
}

function isValidDayOffset(value: number | null): value is number {
    return value !== null && Number.isInteger(value) && value >= 0;
}

function isValidStationNo(value: number) {
    return Number.isInteger(value) && value > 0;
}

function appendCandidate(
    candidatesByKey: Map<string, StationPlatformInfoCandidate>,
    serviceDate: string,
    input: {
        lookupType: SchedulePlatformInfoLookupType;
        internalCode: string;
        stationName: string;
        stationTelecode: string;
        stationNo: number;
        dateOffset: number | null;
        stationTrainCode: string;
    }
): boolean {
    const internalCode = normalizeCode(input.internalCode);
    const stationTelecode = normalizeCode(input.stationTelecode);
    const stationTrainCode = normalizeCode(input.stationTrainCode);
    if (
        internalCode.length === 0 ||
        stationTelecode.length === 0 ||
        stationTrainCode.length === 0 ||
        !isValidStationNo(input.stationNo) ||
        !isValidDayOffset(input.dateOffset)
    ) {
        return false;
    }

    const trainDate = formatShanghaiDateString(
        toUnixSecondsFromShanghaiDayOffset(serviceDate, input.dateOffset) * 1000
    );
    const key = `${input.lookupType}:${internalCode}:${stationTelecode}:${input.stationNo}:${trainDate}`;
    const existing = candidatesByKey.get(key);
    if (existing) {
        if (!existing.stationTrainCodes.includes(stationTrainCode)) {
            existing.stationTrainCodes.push(stationTrainCode);
        }
        return true;
    }

    candidatesByKey.set(key, {
        lookupType: input.lookupType,
        internalCode,
        stationName: input.stationName.trim(),
        stationTelecode,
        stationNo: input.stationNo,
        trainDate,
        stationTrainCodes: [stationTrainCode]
    });
    return true;
}

function buildCandidatesFromStationRows(
    serviceDate: string,
    stationName: string,
    stationTelecode: string,
    rows: readonly SchedulePlatformInfoCandidateRow[]
): BuiltStationPlatformInfoCandidates {
    const candidatesByKey = new Map<string, StationPlatformInfoCandidate>();
    let skippedRowCount = 0;

    for (const row of rows) {
        const isOrigin = row.stopIndex === 0 || row.isStart === 1;
        const lookupType: SchedulePlatformInfoLookupType = isOrigin
            ? 'origin_transport'
            : 'arrival_exit';
        const dateOffset = isOrigin
            ? (row.departAt ?? row.arriveAt)
            : row.arriveAt;
        const stationTrainCode = isOrigin
            ? row.currentStationTrainCode
            : (row.arrivalStationTrainCode ?? '');

        if (
            !appendCandidate(candidatesByKey, serviceDate, {
                lookupType,
                internalCode: row.internalCode,
                stationName,
                stationTelecode,
                stationNo: row.stationNo,
                dateOffset,
                stationTrainCode
            })
        ) {
            skippedRowCount += 1;
            logger.warn(
                `skip_station_candidate lookupType=${lookupType} serviceDate=${serviceDate} stationName=${stationName} stationTelecode=${stationTelecode} itemCode=${row.itemCode} stopIndex=${row.stopIndex} stationNo=${row.stationNo} internalCode=${row.internalCode} dateOffset=${String(dateOffset)} stationTrainCode=${stationTrainCode}`
            );
        }
    }

    return {
        localRowCount: rows.length,
        skippedRowCount,
        candidates: [...candidatesByKey.values()]
    };
}

function appendRouteItemCandidates(
    candidatesByKey: Map<string, StationPlatformInfoCandidate>,
    serviceDate: string,
    item: ScheduleItem
) {
    let localRowCount = 0;
    let skippedRowCount = 0;

    for (const [index, stop] of item.stops.entries()) {
        localRowCount += 1;
        const isOrigin = index === 0 || stop.isStart;
        const previousStop: ScheduleStop | undefined = item.stops[index - 1];
        const lookupType: SchedulePlatformInfoLookupType = isOrigin
            ? 'origin_transport'
            : 'arrival_exit';
        const dateOffset = isOrigin
            ? (stop.departAt ?? stop.arriveAt)
            : stop.arriveAt;
        const stationTrainCode = isOrigin
            ? stop.stationTrainCode
            : (previousStop?.stationTrainCode ?? '');

        if (
            !appendCandidate(candidatesByKey, serviceDate, {
                lookupType,
                internalCode: item.internalCode,
                stationName: stop.stationName,
                stationTelecode: stop.stationTelecode,
                stationNo: stop.stationNo,
                dateOffset,
                stationTrainCode
            })
        ) {
            skippedRowCount += 1;
            logger.warn(
                `skip_route_candidate lookupType=${lookupType} serviceDate=${serviceDate} trainCode=${item.code} internalCode=${item.internalCode} stationName=${stop.stationName} stationTelecode=${stop.stationTelecode} stationNo=${stop.stationNo} dateOffset=${String(dateOffset)} stationTrainCode=${stationTrainCode}`
            );
        }
    }

    return {
        localRowCount,
        skippedRowCount
    };
}

function buildCandidatesForTrainCodes(
    serviceDate: string,
    trainCodes: readonly string[]
): BuiltStationPlatformInfoCandidates {
    const normalizedTrainCodes = uniqueNormalizedCodes([...trainCodes]);
    const initialItems = listScheduleCandidateItemsForCodes('published', {
        aliasCodes: normalizedTrainCodes
    });
    const internalCodes = uniqueNormalizedCodes(
        initialItems.map((item) => item.internalCode)
    );
    const items = listScheduleCandidateItemsForCodes('published', {
        aliasCodes: normalizedTrainCodes,
        internalCodes
    });
    const candidatesByKey = new Map<string, StationPlatformInfoCandidate>();
    let localRowCount = 0;
    let skippedRowCount = 0;

    for (const item of items) {
        const counts = appendRouteItemCandidates(
            candidatesByKey,
            serviceDate,
            item
        );
        localRowCount += counts.localRowCount;
        skippedRowCount += counts.skippedRowCount;
    }

    return {
        localRowCount,
        skippedRowCount,
        candidates: [...candidatesByKey.values()]
    };
}

function loadCandidateCacheEntries(
    candidate: StationPlatformInfoCandidate
): ScheduleStationPlatformInfoCacheEntry[] {
    const entries: ScheduleStationPlatformInfoCacheEntry[] = [];
    for (const stationTrainCode of candidate.stationTrainCodes) {
        const entry = loadScheduleStationPlatformInfoCacheEntry({
            lookupType: candidate.lookupType,
            internalCode: candidate.internalCode,
            stationTelecode: candidate.stationTelecode,
            stationTrainCode
        });
        if (entry) {
            entries.push(entry);
        }
    }

    return entries.sort((left, right) => right.fetchedAt - left.fetchedAt);
}

function toCachedPersistInput(
    candidate: StationPlatformInfoCandidate,
    entry: ScheduleStationPlatformInfoCacheEntry
): ScheduleStationPlatformInfoPersistInput {
    return {
        ...entry,
        stationNo: candidate.stationNo,
        overwritePlatform: false,
        writeCache: false
    };
}

async function fetchCandidatePlatformInfo(
    candidate: StationPlatformInfoCandidate,
    stationTrainCode: string
): Promise<FetchedStationPlatformInfo | null> {
    if (candidate.lookupType === 'origin_transport') {
        const result = await fetchStationTransportInfo(
            candidate.stationTelecode,
            stationTrainCode
        );
        return result
            ? {
                  platformNo: result.platformNo,
                  wicket: null
              }
            : null;
    }

    return fetchStationExitInfo(
        candidate.trainDate,
        candidate.stationTelecode,
        stationTrainCode
    );
}

async function refreshCandidates(
    built: BuiltStationPlatformInfoCandidates,
    expiresAt: number,
    forceRefresh: boolean
): Promise<StationPlatformInfoRefreshResult> {
    const updates: ScheduleStationPlatformInfoPersistInput[] = [];
    let cacheHitCount = 0;
    let cacheFallbackCount = 0;
    let requestCount = 0;
    let dataCount = 0;
    let failedTrainCount = 0;

    for (const candidate of built.candidates) {
        const cacheEntries = loadCandidateCacheEntries(candidate);
        const freshCache = cacheEntries.find(
            (entry) => entry.fetchedAt > expiresAt
        );
        if (!forceRefresh && freshCache) {
            cacheHitCount += 1;
            updates.push(toCachedPersistInput(candidate, freshCache));
            continue;
        }

        const fallbackCache = cacheEntries[0] ?? null;
        let resolved = false;
        let failed = false;
        for (const stationTrainCode of candidate.stationTrainCodes) {
            requestCount += 1;

            try {
                const result = await fetchCandidatePlatformInfo(
                    candidate,
                    stationTrainCode
                );
                if (!result) {
                    continue;
                }

                const fetchedAt = getNowSeconds();
                dataCount += 1;
                resolved = true;
                updates.push({
                    lookupType: candidate.lookupType,
                    internalCode: candidate.internalCode,
                    stationTelecode: candidate.stationTelecode,
                    stationTrainCode,
                    stationNo: candidate.stationNo,
                    platformNo: result.platformNo,
                    wicket: result.wicket,
                    trainDate: candidate.trainDate,
                    fetchedAt,
                    overwritePlatform: forceRefresh,
                    writeCache: true
                });
                break;
            } catch (error) {
                failed = true;
                const message =
                    error instanceof Error
                        ? `${error.name}: ${error.message}`
                        : String(error);
                logger.warn(
                    `request_failed lookupType=${candidate.lookupType} trainDate=${candidate.trainDate} stationName=${candidate.stationName} stationTelecode=${candidate.stationTelecode} stationNo=${candidate.stationNo} internalCode=${candidate.internalCode} stationTrainCode=${stationTrainCode} forceRefresh=${forceRefresh} error=${message}`
                );
                break;
            }
        }

        if (failed) {
            failedTrainCount += 1;
        }
        if (!resolved && fallbackCache) {
            cacheFallbackCount += 1;
            updates.push(toCachedPersistInput(candidate, fallbackCache));
        }
    }

    const persisted = persistScheduleStationPlatformInfoByStateKind(
        'published',
        updates
    );
    return {
        localRowCount: built.localRowCount,
        candidateCount: built.candidates.length,
        cacheHitCount,
        cacheFallbackCount,
        requestCount,
        dataCount,
        failedTrainCount,
        skippedRowCount: built.skippedRowCount,
        updatedCacheEntryCount: persisted.updatedCacheEntryCount,
        updatedStopCount: persisted.updatedStopCount
    };
}

function hasMatchingPublishedSchedule(serviceDate: string) {
    if (!isValidServiceDate(serviceDate)) {
        return false;
    }

    return loadScheduleStateSummaryByKind('published')?.date === serviceDate;
}

function getPlatformInfoExpiresAt(now: number) {
    return Math.max(
        0,
        now - useConfig().spider.stationPlatformInfo.ttlDays * DAY_SECONDS
    );
}

export async function refreshStationPlatformInfoForStation(
    input: RefreshStationPlatformInfoForStationInput
): Promise<StationPlatformInfoRefreshResult> {
    const serviceDate = input.serviceDate.trim();
    const stationName = input.stationName.trim();
    const stationTelecode = normalizeCode(input.stationTelecode);
    if (
        !hasMatchingPublishedSchedule(serviceDate) ||
        stationName.length === 0 ||
        stationTelecode.length === 0
    ) {
        return createEmptyStationPlatformInfoRefreshResult();
    }

    const expiresAt = getPlatformInfoExpiresAt(getNowSeconds());
    const rows = listSchedulePlatformInfoCandidatesByStateKindAndStationName(
        'published',
        stationName,
        expiresAt
    );
    return refreshCandidates(
        buildCandidatesFromStationRows(
            serviceDate,
            stationName,
            stationTelecode,
            rows
        ),
        expiresAt,
        false
    );
}

export async function forceRefreshStationPlatformInfoForTrainCodes(
    input: ForceRefreshStationPlatformInfoForTrainCodesInput
): Promise<StationPlatformInfoRefreshResult> {
    const serviceDate = input.serviceDate.trim();
    if (!hasMatchingPublishedSchedule(serviceDate)) {
        return createEmptyStationPlatformInfoRefreshResult();
    }

    return refreshCandidates(
        buildCandidatesForTrainCodes(serviceDate, input.trainCodes),
        getPlatformInfoExpiresAt(getNowSeconds()),
        true
    );
}
