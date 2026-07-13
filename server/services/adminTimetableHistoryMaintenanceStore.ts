import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import {
    formatTimetableHistoryServiceDate,
    isTimetableHistoryMergeCandidate,
    listTimetableHistoryCoveragesByTrainCode,
    mergeTimetableHistoryCoverageByMiddleId,
    type TimetableHistoryCoverageRow
} from '~/server/services/timetableHistoryStore';
import {
    getHistoricalTimetableContent,
    getHistoricalTimetableSummary
} from '~/server/services/historicalTimetableResolver';
import type {
    AdminTimetableHistoryCoverageMergeCandidate,
    AdminTimetableHistoryCoverageMergeResponse,
    AdminTimetableHistoryCoverageSummary,
    AdminTimetableHistoryMergeCandidatesResponse
} from '~/types/admin';

function assertTrainCode(value: string) {
    const normalized = normalizeCode(value);
    if (normalized.length === 0) {
        throw new ApiRequestError(400, 'invalid_param', 'trainCode 不能为空');
    }

    return normalized;
}

function toCoverageSummary(
    row: TimetableHistoryCoverageRow
): AdminTimetableHistoryCoverageSummary {
    const summary = getHistoricalTimetableSummary(row.content_id);

    return {
        coverageId: row.id,
        timetableId: row.content_id,
        serviceDateStart: formatTimetableHistoryServiceDate(
            row.service_date_start
        ),
        serviceDateEndExclusive: formatTimetableHistoryServiceDate(
            row.service_date_end_exclusive
        ),
        startStation: summary?.startStation ?? '',
        endStation: summary?.endStation ?? '',
        stopCount: summary ? getStopCount(row.content_id) : 0
    };
}

function getStopCount(timetableId: number) {
    const content = getHistoricalTimetableContent(timetableId);
    return content?.stops.length ?? 0;
}

function toMergeCandidate(
    previous: TimetableHistoryCoverageRow,
    middle: TimetableHistoryCoverageRow,
    next: TimetableHistoryCoverageRow
): AdminTimetableHistoryCoverageMergeCandidate {
    return {
        coverageId: middle.id,
        previous: toCoverageSummary(previous),
        middle: toCoverageSummary(middle),
        next: toCoverageSummary(next),
        mergedServiceDateStart: formatTimetableHistoryServiceDate(
            previous.service_date_start
        ),
        mergedServiceDateEndExclusive: formatTimetableHistoryServiceDate(
            next.service_date_end_exclusive
        )
    };
}

export function listAdminTimetableHistoryMergeCandidates(
    trainCode: string
): AdminTimetableHistoryMergeCandidatesResponse {
    const normalizedTrainCode = assertTrainCode(trainCode);
    const rows = listTimetableHistoryCoveragesByTrainCode(normalizedTrainCode);
    const items: AdminTimetableHistoryCoverageMergeCandidate[] = [];

    for (let index = 1; index < rows.length - 1; index += 1) {
        const previous = rows[index - 1]!;
        const middle = rows[index]!;
        const next = rows[index + 1]!;

        if (isTimetableHistoryMergeCandidate(previous, middle, next)) {
            items.push(toMergeCandidate(previous, middle, next));
        }
    }

    return {
        trainCode: normalizedTrainCode,
        total: items.length,
        items
    };
}

export function mergeAdminTimetableHistoryCoverage(
    coverageId: number
): AdminTimetableHistoryCoverageMergeResponse {
    if (!Number.isInteger(coverageId) || coverageId <= 0) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            'coverageId 必须是正整数'
        );
    }

    const result = mergeTimetableHistoryCoverageByMiddleId(coverageId);
    if (!result) {
        throw new ApiRequestError(
            409,
            'conflict',
            '该时刻表覆盖段当前不可合并，请重新扫描后再试'
        );
    }

    return {
        trainCode: result.trainCode,
        deletedCoverageIds: result.deletedCoverageIds,
        previous: toCoverageSummary(result.previous),
        middle: toCoverageSummary(result.middle),
        next: toCoverageSummary(result.next),
        merged: toCoverageSummary(result.merged)
    };
}
