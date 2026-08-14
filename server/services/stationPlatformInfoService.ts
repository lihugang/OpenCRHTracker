import useConfig from '~/server/config';
import getLogger from '~/server/libs/log4js';
import { getPreferredTrainCirculation } from '~/server/services/trainCirculationIndexStore';
import {
    getTodayStationTimetableByStationName,
    getTodayScheduleTimetableByTrainCode,
    type TodayScheduleStationIndexRow,
    type TodayScheduleTimetable
} from '~/server/services/todayScheduleCache';
import fetchStationExitInfo from '~/server/utils/12306/network/fetchStationExitInfo';
import fetchStationTransportInfo from '~/server/utils/12306/network/fetchStationTransportInfo';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import {
    formatExternalTrainCode,
    formatExternalTrainCodes,
    formatExternalServiceDate,
    parseExternalTrainCodeOrThrow
} from '~/server/utils/internal/boundaries';
import {
    trainCodeKey,
    type TrainCodeParts
} from '~/server/utils/12306/trainCode';
import {
    serviceDateToDay,
    serviceDayToShanghaiDayStartUnixSeconds,
    type ServiceDay
} from '~/server/utils/date/serviceDay';
import {
    listScheduleCandidateItemsForCodes,
    listScheduleAliasesByStateKindAndItemCode,
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
import { formatShanghaiDateString } from '~/server/utils/date/getCurrentDateString';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import type { StationPlatformRefreshEntryStatus } from '~/server/services/trainProvenanceStore';

const logger = getLogger('station-platform-info-service');
const DAY_SECONDS = 24 * 60 * 60;
const PLATFORM_FALLBACK_WINDOW_SECONDS = 4 * 60 * 60;

interface StationPlatformInfoCandidate {
    lookupType: SchedulePlatformInfoLookupType;
    internalCode: string;
    stationName: string;
    stationTelecode: string;
    stationNo: number;
    stationOrder: number;
    trainDate: ServiceDay;
    stationTrainCodes: TrainCodeParts[];
    routeReferences: StationPlatformInfoRouteReference[];
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

export interface StationPlatformInfoRouteReference {
    trainCodes: TrainCodeParts[];
    startAt: number | null;
}

export interface StationPlatformInfoRefreshEntry {
    lookupType: SchedulePlatformInfoLookupType;
    stationName: string;
    stationTelecode: string;
    stationNo: number;
    stationOrder: number;
    trainDate: ServiceDay;
    stationTrainCodes: TrainCodeParts[];
    attemptedTrainCodes: TrainCodeParts[];
    status: StationPlatformRefreshEntryStatus;
    platformNo: number | null;
    wicket: string | null;
    fetchedAt: number | null;
    errorMessage: string;
    routeReferences: StationPlatformInfoRouteReference[];
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
    persistenceErrorMessage: string;
    entries: StationPlatformInfoRefreshEntry[];
}

export interface RefreshStationPlatformInfoForStationInput {
    serviceDate: ServiceDay;
    stationName: string;
    stationTelecode: string;
}

export interface ForceRefreshStationPlatformInfoForTrainCodesInput {
    serviceDate: ServiceDay;
    trainCodes: readonly TrainCodeParts[];
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
        updatedStopCount: 0,
        persistenceErrorMessage: '',
        entries: []
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

function toRouteReference(
    serviceDate: ServiceDay,
    item: Pick<ScheduleItem, 'code' | 'allCodes' | 'startAt'> | null
): StationPlatformInfoRouteReference | null {
    if (!item) {
        return null;
    }

    return {
        trainCodes: [item.code, ...item.allCodes],
        startAt: isValidDayOffset(item.startAt)
            ? serviceDayToShanghaiDayStartUnixSeconds(serviceDate) +
              item.startAt
            : null
    };
}

function appendRouteReference(
    target: StationPlatformInfoRouteReference[],
    value: StationPlatformInfoRouteReference | null
) {
    if (!value || value.trainCodes.length === 0) {
        return;
    }

    const key = `${value.startAt ?? 'null'}:${value.trainCodes
        .map(trainCodeKey)
        .sort()
        .join('/')}`;
    if (
        target.some(
            (item) =>
                `${item.startAt ?? 'null'}:${item.trainCodes
                    .map(trainCodeKey)
                    .sort()
                    .join('/')}` === key
        )
    ) {
        return;
    }
    target.push(value);
}

function appendCandidate(
    candidatesByKey: Map<string, StationPlatformInfoCandidate>,
    serviceDate: ServiceDay,
    input: {
        lookupType: SchedulePlatformInfoLookupType;
        internalCode: string;
        stationName: string;
        stationTelecode: string;
        stationNo: number;
        stationOrder: number;
        dateOffset: number | null;
        stationTrainCode: TrainCodeParts;
        routeReference: StationPlatformInfoRouteReference | null;
    }
): boolean {
    const internalCode = normalizeCode(input.internalCode);
    const stationTelecode = normalizeCode(input.stationTelecode);
    const stationTrainCode = input.stationTrainCode;
    if (
        internalCode.length === 0 ||
        stationTelecode.length === 0 ||
        trainCodeKey(stationTrainCode).length === 0 ||
        !isValidStationNo(input.stationNo) ||
        !isValidDayOffset(input.dateOffset)
    ) {
        return false;
    }

    const trainDate = serviceDateToDay(
        formatShanghaiDateString(
            (serviceDayToShanghaiDayStartUnixSeconds(serviceDate) +
                input.dateOffset) *
                1000
        )
    );
    const key = `${input.lookupType}:${internalCode}:${stationTelecode}:${input.stationNo}:${trainDate}`;
    const existing = candidatesByKey.get(key);
    if (existing) {
        if (
            !existing.stationTrainCodes.some(
                (code) => trainCodeKey(code) === trainCodeKey(stationTrainCode)
            )
        ) {
            existing.stationTrainCodes.push(stationTrainCode);
        }
        appendRouteReference(existing.routeReferences, input.routeReference);
        return true;
    }

    candidatesByKey.set(key, {
        lookupType: input.lookupType,
        internalCode,
        stationName: input.stationName.trim(),
        stationTelecode,
        stationNo: input.stationNo,
        stationOrder: input.stationOrder,
        trainDate,
        stationTrainCodes: [stationTrainCode],
        routeReferences: input.routeReference ? [input.routeReference] : []
    });
    return true;
}

function buildCandidatesFromStationRows(
    serviceDate: ServiceDay,
    stationName: string,
    stationTelecode: string,
    rows: readonly SchedulePlatformInfoCandidateRow[]
): BuiltStationPlatformInfoCandidates {
    const candidatesByKey = new Map<string, StationPlatformInfoCandidate>();
    const routeReferenceCache = new Map<
        string,
        StationPlatformInfoRouteReference
    >();
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
            : row.arrivalStationTrainCode;
        if (!stationTrainCode) {
            skippedRowCount += 1;
            continue;
        }
        const itemCodeKey = trainCodeKey(row.itemCode);
        let routeReference = routeReferenceCache.get(itemCodeKey);
        if (!routeReference) {
            routeReference = toRouteReference(serviceDate, {
                code: row.itemCode,
                allCodes: listScheduleAliasesByStateKindAndItemCode(
                    'published',
                    row.itemCode
                ),
                startAt: row.itemStartAt
            })!;
            routeReferenceCache.set(itemCodeKey, routeReference);
        }

        if (
            !appendCandidate(candidatesByKey, serviceDate, {
                lookupType,
                internalCode: row.internalCode,
                stationName,
                stationTelecode,
                stationNo: row.stationNo,
                stationOrder: row.stopIndex,
                dateOffset,
                stationTrainCode,
                routeReference
            })
        ) {
            skippedRowCount += 1;
            logger.warn(
                `skip_station_candidate lookupType=${lookupType} serviceDate=${formatExternalServiceDate(serviceDate)} stationName=${stationName} stationTelecode=${stationTelecode} itemCode=${formatExternalTrainCode(row.itemCode)} stopIndex=${row.stopIndex} stationNo=${row.stationNo} internalCode=${row.internalCode} dateOffset=${String(dateOffset)} stationTrainCode=${formatExternalTrainCode(stationTrainCode)}`
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
    serviceDate: ServiceDay,
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
            : (previousStop?.stationTrainCode ?? stop.stationTrainCode);

        if (
            !appendCandidate(candidatesByKey, serviceDate, {
                lookupType,
                internalCode: item.internalCode,
                stationName: stop.stationName,
                stationTelecode: stop.stationTelecode,
                stationNo: stop.stationNo,
                stationOrder: index,
                dateOffset,
                stationTrainCode,
                routeReference: toRouteReference(serviceDate, item)
            })
        ) {
            skippedRowCount += 1;
            logger.warn(
                `skip_route_candidate lookupType=${lookupType} serviceDate=${formatExternalServiceDate(serviceDate)} trainCode=${formatExternalTrainCode(item.code)} internalCode=${item.internalCode} stationName=${stop.stationName} stationTelecode=${stop.stationTelecode} stationNo=${stop.stationNo} dateOffset=${String(dateOffset)} stationTrainCode=${formatExternalTrainCode(stationTrainCode)}`
            );
        }
    }

    return {
        localRowCount,
        skippedRowCount
    };
}

function buildCandidatesForTrainCodes(
    serviceDate: ServiceDay,
    trainCodes: readonly TrainCodeParts[]
): BuiltStationPlatformInfoCandidates {
    const initialItems = listScheduleCandidateItemsForCodes('published', {
        aliasCodes: trainCodes
    });
    const internalCodes = initialItems.flatMap((item) =>
        item.internalCode ? [item.internalCode] : []
    );
    const items = listScheduleCandidateItemsForCodes('published', {
        aliasCodes: trainCodes,
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
    stationTrainCode: TrainCodeParts
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

interface TrainCodeNumber {
    prefix: string;
    number: number;
}

function parseTrainCodeNumber(
    trainCode: TrainCodeParts
): TrainCodeNumber | null {
    if (trainCode.number < 0) {
        return null;
    }
    return {
        prefix: trainCode.prefix,
        number: trainCode.number
    };
}

function getCandidateTrainCodes(candidate: StationPlatformInfoCandidate) {
    const seen = new Set<string>();
    const result: TrainCodeParts[] = [];
    for (const code of [
        ...candidate.stationTrainCodes,
        ...candidate.routeReferences.flatMap(
            (reference) => reference.trainCodes
        )
    ]) {
        const key = trainCodeKey(code);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(code);
    }
    return result;
}

function getCandidateStartAt(candidate: StationPlatformInfoCandidate) {
    return (
        candidate.routeReferences.find(
            (reference) => reference.startAt !== null
        )?.startAt ?? null
    );
}

function findTerminalStop(
    timetable: TodayScheduleTimetable,
    stationName: string
) {
    for (let index = timetable.stops.length - 1; index >= 0; index -= 1) {
        const stop = timetable.stops[index]!;
        if (!stop.isEnd || stop.stationName.trim() !== stationName.trim()) {
            continue;
        }

        return { index, stop };
    }

    return null;
}

function getArrivalStationTrainCode(
    timetable: TodayScheduleTimetable,
    stopIndex: number
): TrainCodeParts | null {
    return stopIndex > 0
        ? (timetable.stops[stopIndex - 1]?.stationTrainCode ?? null)
        : (timetable.stops[stopIndex]?.stationTrainCode ?? null);
}

function getReusableArrivalPlatform(
    timetable: TodayScheduleTimetable,
    stationName: string,
    stationTelecode: string
): number | null {
    const terminal = findTerminalStop(timetable, stationName);
    if (!terminal) {
        return null;
    }

    const stopPlatformNo = terminal.stop.platformNo;
    if (
        typeof stopPlatformNo === 'number' &&
        Number.isInteger(stopPlatformNo) &&
        stopPlatformNo > 0
    ) {
        return stopPlatformNo;
    }

    const stationTrainCode = getArrivalStationTrainCode(
        timetable,
        terminal.index
    );
    const internalCode = timetable.trainInternalCode;
    if (internalCode.length === 0 || stationTrainCode === null) {
        return null;
    }

    const cached = loadScheduleStationPlatformInfoCacheEntry({
        lookupType: 'arrival_exit',
        internalCode,
        stationTelecode,
        stationTrainCode
    });
    return cached &&
        typeof cached.platformNo === 'number' &&
        Number.isInteger(cached.platformNo) &&
        cached.platformNo > 0
        ? cached.platformNo
        : null;
}

function findCurrentCirculationNodeIndex(
    candidate: StationPlatformInfoCandidate,
    circulation: ReturnType<typeof getPreferredTrainCirculation>
) {
    if (!circulation) {
        return -1;
    }

    const candidateCodes = new Set(
        getCandidateTrainCodes(candidate).map(formatExternalTrainCode)
    );
    return circulation.nodes.findIndex(
        (node) =>
            normalizeCode(node.internalCode) === candidate.internalCode ||
            node.allCodes.some((code) =>
                candidateCodes.has(normalizeCode(code))
            )
    );
}

function resolvePlatformFromCirculation(
    candidate: StationPlatformInfoCandidate,
    circulation: ReturnType<typeof getPreferredTrainCirculation>
): number | null {
    if (!circulation || circulation.nodes.length === 0) {
        return null;
    }

    const currentIndex = findCurrentCirculationNodeIndex(
        candidate,
        circulation
    );
    if (currentIndex <= 0) {
        return null;
    }

    const currentNode = circulation.nodes[currentIndex]!;
    const previousNode = circulation.nodes[currentIndex - 1]!;
    const timeGap = currentNode.startAt - previousNode.endAt;
    if (
        previousNode.endStation.trim() !== candidate.stationName.trim() ||
        timeGap < 0 ||
        timeGap > PLATFORM_FALLBACK_WINDOW_SECONDS
    ) {
        return null;
    }

    for (const externalTrainCode of previousNode.allCodes) {
        const trainCode = parseExternalTrainCodeOrThrow(
            externalTrainCode,
            'circulation.previousNode.allCodes'
        );
        const timetable = getTodayScheduleTimetableByTrainCode(trainCode);
        if (!timetable) {
            continue;
        }

        const platformNo = getReusableArrivalPlatform(
            timetable,
            candidate.stationName,
            candidate.stationTelecode
        );
        if (platformNo !== null) {
            logger.info(
                `platform_fallback circulation current=${candidate.stationTrainCodes[0] ? formatExternalTrainCode(candidate.stationTrainCodes[0]) : candidate.internalCode} previous=${formatExternalTrainCode(trainCode)} station=${candidate.stationName} gapSeconds=${timeGap}`
            );
            return platformNo;
        }
    }

    return null;
}

function resolvePlatformFromStationArrivals(
    candidate: StationPlatformInfoCandidate
): number | null {
    const startAt = getCandidateStartAt(candidate);
    const currentTrainNumbers = getCandidateTrainCodes(candidate)
        .map(parseTrainCodeNumber)
        .filter((value): value is TrainCodeNumber => value !== null);
    if (startAt === null || currentTrainNumbers.length === 0) {
        return null;
    }

    const currentInternalCode = candidate.internalCode;
    const rows = getTodayStationTimetableByStationName(candidate.stationName);
    const matches: Array<{
        row: TodayScheduleStationIndexRow;
        platformNo: number;
    }> = [];
    for (const row of rows) {
        if (
            row.trainInternalCode === currentInternalCode ||
            normalizeCode(row.endStation) !==
                normalizeCode(candidate.stationName) ||
            row.arriveAt === null ||
            row.arriveAt > startAt ||
            startAt - row.arriveAt > PLATFORM_FALLBACK_WINDOW_SECONDS
        ) {
            continue;
        }

        const rowPlatformNo = row.platformNo;
        if (
            typeof rowPlatformNo !== 'number' ||
            !Number.isInteger(rowPlatformNo) ||
            rowPlatformNo <= 0
        ) {
            continue;
        }

        const rowTrainNumbers = [row.trainCode, ...row.allCodes]
            .map(parseTrainCodeNumber)
            .filter((value): value is TrainCodeNumber => value !== null);
        if (
            !rowTrainNumbers.some((rowNumber) =>
                currentTrainNumbers.some(
                    (currentNumber) =>
                        currentNumber.prefix === rowNumber.prefix &&
                        Math.abs(currentNumber.number - rowNumber.number) <= 4
                )
            )
        ) {
            continue;
        }

        matches.push({ row, platformNo: rowPlatformNo });
    }

    matches.sort(
        (left, right) => (right.row.arriveAt ?? 0) - (left.row.arriveAt ?? 0)
    );
    const match = matches[0];
    if (!match) {
        return null;
    }

    logger.info(
        `platform_fallback station_arrival current=${candidate.stationTrainCodes[0] ? formatExternalTrainCode(candidate.stationTrainCodes[0]) : candidate.internalCode} previous=${formatExternalTrainCode(match.row.trainCode)} station=${candidate.stationName} gapSeconds=${startAt - (match.row.arriveAt ?? startAt)}`
    );
    return match.platformNo;
}

function resolveOriginPlatformFallback(
    candidate: StationPlatformInfoCandidate
): number | null {
    try {
        const circulation = getPreferredTrainCirculation({
            trainInternalCode: candidate.internalCode,
            allCodes: getCandidateTrainCodes(candidate)
        });
        const circulationPlatformNo = resolvePlatformFromCirculation(
            candidate,
            circulation
        );
        if (circulationPlatformNo !== null) {
            return circulationPlatformNo;
        }

        const currentIndex = findCurrentCirculationNodeIndex(
            candidate,
            circulation
        );
        return circulation === null || currentIndex === 0
            ? resolvePlatformFromStationArrivals(candidate)
            : null;
    } catch (error) {
        logger.warn(
            `platform_fallback_failed current=${candidate.stationTrainCodes[0] ? formatExternalTrainCode(candidate.stationTrainCodes[0]) : candidate.internalCode} station=${candidate.stationName} error=${toBoundedErrorMessage(error)}`
        );
        return null;
    }
}

function toBoundedErrorMessage(error: unknown) {
    const message =
        error instanceof Error
            ? `${error.name}: ${error.message}`
            : String(error);
    return message.trim().slice(0, 500);
}

function toRefreshEntry(
    candidate: StationPlatformInfoCandidate,
    input: {
        attemptedTrainCodes: TrainCodeParts[];
        status: StationPlatformRefreshEntryStatus;
        platformNo?: number | null;
        wicket?: string | null;
        fetchedAt?: number | null;
        errorMessage?: string;
    }
): StationPlatformInfoRefreshEntry {
    return {
        lookupType: candidate.lookupType,
        stationName: candidate.stationName,
        stationTelecode: candidate.stationTelecode,
        stationNo: candidate.stationNo,
        stationOrder: candidate.stationOrder,
        trainDate: candidate.trainDate,
        stationTrainCodes: [...candidate.stationTrainCodes],
        attemptedTrainCodes: input.attemptedTrainCodes.filter(
            (code, index, codes) =>
                codes.findIndex(
                    (candidateCode) =>
                        trainCodeKey(candidateCode) === trainCodeKey(code)
                ) === index
        ),
        status: input.status,
        platformNo: input.platformNo ?? null,
        wicket: input.wicket?.trim() || null,
        fetchedAt: input.fetchedAt ?? null,
        errorMessage: input.errorMessage?.trim().slice(0, 500) ?? '',
        routeReferences: candidate.routeReferences.map((item) => ({
            trainCodes: [...item.trainCodes],
            startAt: item.startAt
        }))
    };
}

async function refreshCandidates(
    built: BuiltStationPlatformInfoCandidates,
    expiresAt: number,
    forceRefresh: boolean
): Promise<StationPlatformInfoRefreshResult> {
    const updates: ScheduleStationPlatformInfoPersistInput[] = [];
    const entries: StationPlatformInfoRefreshEntry[] = [];
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
            if (
                candidate.lookupType === 'origin_transport' &&
                freshCache.platformNo === 1
            ) {
                const fallbackPlatformNo =
                    resolveOriginPlatformFallback(candidate);
                if (fallbackPlatformNo !== null) {
                    const fetchedAt = getNowSeconds();
                    updates.push({
                        ...freshCache,
                        stationNo: candidate.stationNo,
                        platformNo: fallbackPlatformNo,
                        wicket: null,
                        fetchedAt,
                        overwritePlatform: false,
                        writeCache: true
                    });
                    entries.push(
                        toRefreshEntry(candidate, {
                            attemptedTrainCodes: [freshCache.stationTrainCode],
                            status: 'updated',
                            platformNo: fallbackPlatformNo,
                            fetchedAt
                        })
                    );
                    continue;
                }
            }

            cacheHitCount += 1;
            updates.push(toCachedPersistInput(candidate, freshCache));
            entries.push(
                toRefreshEntry(candidate, {
                    attemptedTrainCodes: [freshCache.stationTrainCode],
                    status: 'cache_hit',
                    platformNo: freshCache.platformNo,
                    wicket: freshCache.wicket,
                    fetchedAt: freshCache.fetchedAt
                })
            );
            continue;
        }

        const fallbackCache = cacheEntries[0] ?? null;
        let resolved = false;
        let failed = false;
        let errorMessage = '';
        const attemptedTrainCodes: TrainCodeParts[] = [];
        for (const stationTrainCode of candidate.stationTrainCodes) {
            requestCount += 1;
            attemptedTrainCodes.push(stationTrainCode);

            try {
                const result = await fetchCandidatePlatformInfo(
                    candidate,
                    stationTrainCode
                );
                if (!result) {
                    continue;
                }

                let resolvedResult = result;
                if (
                    candidate.lookupType === 'origin_transport' &&
                    result.platformNo === 1
                ) {
                    // 12306 returns platform 1 when this endpoint has no platform information.
                    const fallbackPlatformNo =
                        resolveOriginPlatformFallback(candidate);
                    if (fallbackPlatformNo !== null) {
                        resolvedResult = {
                            platformNo: fallbackPlatformNo,
                            wicket: null
                        };
                    }
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
                    platformNo: resolvedResult.platformNo,
                    wicket: resolvedResult.wicket,
                    trainDate: candidate.trainDate,
                    fetchedAt,
                    overwritePlatform: forceRefresh,
                    writeCache: true
                });
                entries.push(
                    toRefreshEntry(candidate, {
                        attemptedTrainCodes,
                        status: 'updated',
                        platformNo: resolvedResult.platformNo,
                        wicket: resolvedResult.wicket,
                        fetchedAt
                    })
                );
                break;
            } catch (error) {
                failed = true;
                errorMessage = toBoundedErrorMessage(error);
                logger.warn(
                    `request_failed lookupType=${candidate.lookupType} trainDate=${formatExternalServiceDate(candidate.trainDate)} stationName=${candidate.stationName} stationTelecode=${candidate.stationTelecode} stationNo=${candidate.stationNo} internalCode=${candidate.internalCode} stationTrainCode=${formatExternalTrainCode(stationTrainCode)} forceRefresh=${forceRefresh} error=${errorMessage}`
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
            entries.push(
                toRefreshEntry(candidate, {
                    attemptedTrainCodes,
                    status: 'cache_fallback',
                    platformNo: fallbackCache.platformNo,
                    wicket: fallbackCache.wicket,
                    fetchedAt: fallbackCache.fetchedAt,
                    errorMessage:
                        errorMessage || '12306 未返回可用的最新站台信息'
                })
            );
        } else if (!resolved) {
            entries.push(
                toRefreshEntry(candidate, {
                    attemptedTrainCodes,
                    status: failed ? 'request_failed' : 'no_data',
                    errorMessage: errorMessage || '12306 未返回可用的站台信息'
                })
            );
        }
    }

    let updatedCacheEntryCount = 0;
    let updatedStopCount = 0;
    let persistenceErrorMessage = '';
    try {
        const persisted = persistScheduleStationPlatformInfoByStateKind(
            'published',
            updates
        );
        updatedCacheEntryCount = persisted.updatedCacheEntryCount;
        updatedStopCount = persisted.updatedStopCount;
    } catch (error) {
        persistenceErrorMessage = toBoundedErrorMessage(error);
        for (const entry of entries) {
            if (
                entry.status === 'updated' ||
                entry.status === 'cache_hit' ||
                entry.status === 'cache_fallback'
            ) {
                entry.status = 'persist_failed';
                entry.errorMessage = persistenceErrorMessage;
            }
        }
    }

    return {
        localRowCount: built.localRowCount,
        candidateCount: built.candidates.length,
        cacheHitCount,
        cacheFallbackCount,
        requestCount,
        dataCount,
        failedTrainCount,
        skippedRowCount: built.skippedRowCount,
        updatedCacheEntryCount,
        updatedStopCount,
        persistenceErrorMessage,
        entries
    };
}

function createFailedStationPlatformInfoRefreshResult(
    built: BuiltStationPlatformInfoCandidates,
    error: unknown
): StationPlatformInfoRefreshResult {
    const errorMessage = toBoundedErrorMessage(error);
    logger.warn(`refresh_failed error=${errorMessage}`);
    return {
        localRowCount: built.localRowCount,
        candidateCount: built.candidates.length,
        cacheHitCount: 0,
        cacheFallbackCount: 0,
        requestCount: 0,
        dataCount: 0,
        failedTrainCount: built.candidates.length,
        skippedRowCount: built.skippedRowCount,
        updatedCacheEntryCount: 0,
        updatedStopCount: 0,
        persistenceErrorMessage: errorMessage,
        entries: built.candidates.map((candidate) =>
            toRefreshEntry(candidate, {
                attemptedTrainCodes: [],
                status: 'request_failed',
                errorMessage
            })
        )
    };
}

function hasMatchingPublishedSchedule(serviceDate: ServiceDay) {
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
    const serviceDate = input.serviceDate;
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
    const built = buildCandidatesFromStationRows(
        serviceDate,
        stationName,
        stationTelecode,
        rows
    );
    try {
        return await refreshCandidates(built, expiresAt, false);
    } catch (error) {
        return createFailedStationPlatformInfoRefreshResult(built, error);
    }
}

export async function forceRefreshStationPlatformInfoForTrainCodes(
    input: ForceRefreshStationPlatformInfoForTrainCodesInput
): Promise<StationPlatformInfoRefreshResult> {
    const serviceDate = input.serviceDate;
    if (!hasMatchingPublishedSchedule(serviceDate)) {
        return createEmptyStationPlatformInfoRefreshResult();
    }

    const built = buildCandidatesForTrainCodes(serviceDate, input.trainCodes);
    try {
        return await refreshCandidates(
            built,
            getPlatformInfoExpiresAt(getNowSeconds()),
            true
        );
    } catch (error) {
        return createFailedStationPlatformInfoRefreshResult(built, error);
    }
}

export async function refreshStationPlatformInfoForTrainCodes(
    input: ForceRefreshStationPlatformInfoForTrainCodesInput
): Promise<StationPlatformInfoRefreshResult> {
    const serviceDate = input.serviceDate;
    if (!hasMatchingPublishedSchedule(serviceDate)) {
        return createEmptyStationPlatformInfoRefreshResult();
    }

    const built = buildCandidatesForTrainCodes(serviceDate, input.trainCodes);
    try {
        return await refreshCandidates(
            built,
            getPlatformInfoExpiresAt(getNowSeconds()),
            false
        );
    } catch (error) {
        return createFailedStationPlatformInfoRefreshResult(built, error);
    }
}
