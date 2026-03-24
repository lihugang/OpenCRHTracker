import { defineEventHandler, getQuery } from 'h3';
import useConfig from '~/server/config';
import { readPassiveAlerts } from '~/server/services/adminPassiveAlertStore';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

interface PassiveAlertCursorPoint {
    timestamp: number;
    lineIndex: number;
}

function parsePassiveAlertCursor(rawValue: unknown) {
    if (rawValue === undefined || rawValue === null || rawValue === '') {
        return {
            rawCursor: '',
            cursor: null as PassiveAlertCursorPoint | null
        };
    }

    if (typeof rawValue !== 'string') {
        throw new ApiRequestError(400, 'invalid_param', 'cursor 必须是字符串');
    }

    const rawCursor = rawValue.trim();
    const match = rawCursor.match(/^(\d+):(\d+)$/);
    ensure(
        !!match,
        400,
        'invalid_param',
        'cursor 必须是 "timestamp:lineIndex" 格式'
    );

    const timestamp = Number(match[1]);
    const lineIndex = Number(match[2]);
    ensure(
        Number.isInteger(timestamp) &&
            timestamp >= 0 &&
            Number.isInteger(lineIndex) &&
            lineIndex >= 0,
        400,
        'invalid_param',
        'cursor 包含非法数字'
    );

    return {
        rawCursor,
        cursor: {
            timestamp,
            lineIndex
        }
    };
}

function parsePassiveAlertLimit(rawValue: unknown) {
    const config = useConfig();

    if (rawValue === undefined || rawValue === null || rawValue === '') {
        return config.api.pagination.defaultLimit;
    }

    const value = Number(rawValue);
    ensure(
        Number.isInteger(value) && value > 0,
        400,
        'invalid_param',
        'limit 必须是正整数'
    );

    return Math.min(value, config.api.pagination.maxLimit);
}

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            cors: true,
            requiredScopes: [API_SCOPES.admin]
        },
        async () => {
            const query = getQuery(event);
            const date =
                typeof query.date === 'string' ? query.date.trim() : '';
            const type =
                typeof query.type === 'string' ? query.type.trim() : '';
            const { rawCursor, cursor } = parsePassiveAlertCursor(query.cursor);
            const limit = parsePassiveAlertLimit(query.limit);

            ensure(
                /^\d{8}$/.test(date),
                400,
                'invalid_param',
                'date 必须是 YYYYMMDD'
            );

            return readPassiveAlerts({
                date,
                type: type === 'all' ? '' : type,
                limit,
                cursor,
                rawCursor
            });
        }
    );
});
