import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';

export interface CursorPoint {
    startAt: number;
    id: number;
}

export default function parseCursor(
    raw: unknown,
    label: string
): CursorPoint | null {
    if (raw === undefined || raw === null || raw === '') {
        return null;
    }
    if (typeof raw !== 'string') {
        throw new ApiRequestError(
            400,
            'invalid_param',
            `${label} 必须是字符串`
        );
    }

    const match = raw.trim().match(/^(\d+):(\d+)$/);
    if (!match) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            `${label} 必须是 "timestamp:id" 格式`
        );
    }

    const startAt = Number(match[1]);
    const id = Number(match[2]);
    if (
        !Number.isInteger(startAt) ||
        startAt < 0 ||
        !Number.isInteger(id) ||
        id < 0
    ) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            `${label} 包含非法数字`
        );
    }

    return {
        startAt,
        id
    };
}
