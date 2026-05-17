import fs from 'fs';
import path from 'path';
import useConfig from '~/server/config';
import getLogger from '~/server/libs/log4js';
import { invalidateTrainCirculationIndexCache } from '~/server/services/trainCirculationIndexStore';
import {
    deleteScheduleCirculationEntry,
    loadScheduleDocument
} from '~/server/utils/12306/scheduleProbe/stateStore';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import type {
    AdminOfficialCirculationDeleteResponse,
    AdminOfficialCirculationMatchType,
    AdminOfficialCirculationSearchItem,
    AdminOfficialCirculationSearchResponse
} from '~/types/admin';

const logger = getLogger('admin-official-circulation-store');

function toTimestampSeconds(value: number): number {
    return Math.floor(value / 1000);
}

function getScheduleFilePath() {
    return useConfig().data.assets.schedule.file;
}

function getResolvedScheduleFilePath() {
    return path.resolve(getScheduleFilePath());
}

function getScheduleFileModifiedAt(filePath: string) {
    try {
        return toTimestampSeconds(fs.statSync(filePath).mtimeMs);
    } catch {
        return null;
    }
}

function createSearchItem(
    entryKey: string,
    normalizedKeyword: string,
    entry: NonNullable<ReturnType<typeof loadScheduleDocument>>['circulation'][string]
): AdminOfficialCirculationSearchItem | null {
    const matchedBy = new Set<AdminOfficialCirculationMatchType>();
    const matchedCodes = new Set<string>();

    if (normalizeCode(entryKey) === normalizedKeyword) {
        matchedBy.add('internal_code');
        matchedCodes.add(entryKey);
    }

    for (const node of entry.nodes) {
        if (normalizeCode(node.internalCode) === normalizedKeyword) {
            matchedBy.add('internal_code');
            matchedCodes.add(node.internalCode);
        }

        for (const code of node.allCodes) {
            if (normalizeCode(code) !== normalizedKeyword) {
                continue;
            }

            matchedBy.add('all_code');
            matchedCodes.add(code);
        }
    }

    if (matchedBy.size === 0) {
        return null;
    }

    return {
        entryKey,
        matchedBy: [...matchedBy],
        matchedCodes: [...matchedCodes].sort((left, right) =>
            left.localeCompare(right)
        ),
        refreshedAt: entry.refreshedAt,
        nodeCount: entry.nodes.length,
        nodes: entry.nodes.map((node) => ({
            internalCode: node.internalCode,
            allCodes: [...node.allCodes],
            startStation: node.startStation,
            endStation: node.endStation,
            startAt: node.startAt,
            endAt: node.endAt
        }))
    };
}

export function searchAdminOfficialCirculations(
    keyword: string
): AdminOfficialCirculationSearchResponse {
    const normalizedKeyword = normalizeCode(keyword);
    if (normalizedKeyword.length === 0) {
        throw new ApiRequestError(400, 'invalid_param', 'keyword 不能为空');
    }

    const scheduleFilePath = getScheduleFilePath();
    const resolvedFilePath = getResolvedScheduleFilePath();
    const document = loadScheduleDocument(scheduleFilePath);
    if (!document) {
        throw new ApiRequestError(
            404,
            'not_found',
            'schedule.json 不存在或内容无效'
        );
    }

    const matchedItems = Object.entries(document.circulation)
        .map(([entryKey, entry]) =>
            createSearchItem(entryKey, normalizedKeyword, entry)
        )
        .filter(
            (
                item
            ): item is NonNullable<
                ReturnType<typeof createSearchItem>
            > => item !== null
        )
        .sort((left, right) => {
            if (left.refreshedAt !== right.refreshedAt) {
                return right.refreshedAt - left.refreshedAt;
            }

            return left.entryKey.localeCompare(right.entryKey);
        });
    const items = matchedItems[0] ? [matchedItems[0]] : [];

    return {
        keyword,
        normalizedKeyword,
        filePath: resolvedFilePath,
        modifiedAt: getScheduleFileModifiedAt(resolvedFilePath),
        total: items.length,
        items
    };
}

export function deleteAdminOfficialCirculation(
    entryKey: string
): AdminOfficialCirculationDeleteResponse {
    const normalizedEntryKey = normalizeCode(entryKey);
    if (normalizedEntryKey.length === 0) {
        throw new ApiRequestError(400, 'invalid_param', 'entryKey 不能为空');
    }

    const scheduleFilePath = getScheduleFilePath();
    const resolvedFilePath = getResolvedScheduleFilePath();
    const document = loadScheduleDocument(scheduleFilePath);
    if (!document) {
        throw new ApiRequestError(
            404,
            'not_found',
            'schedule.json 不存在或内容无效'
        );
    }

    if (!document.circulation[normalizedEntryKey]) {
        throw new ApiRequestError(404, 'not_found', '官方交路表不存在');
    }

    const deletedKeys = deleteScheduleCirculationEntry(
        scheduleFilePath,
        normalizedEntryKey
    );
    if (deletedKeys.length === 0) {
        throw new ApiRequestError(409, 'conflict', '官方交路表删除失败');
    }

    invalidateTrainCirculationIndexCache();
    logger.info(
        `admin_official_circulation_deleted entryKey=${normalizedEntryKey} deletedKeys=${deletedKeys.join(',')}`
    );

    return {
        entryKey: normalizedEntryKey,
        deletedKeys,
        deletedKeyCount: deletedKeys.length,
        modifiedAt: getScheduleFileModifiedAt(resolvedFilePath)
    };
}
