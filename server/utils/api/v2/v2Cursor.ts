import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import { asServiceDay, type ServiceDay } from '~/server/utils/date/serviceDay';

export interface V2CursorPoint {
    serviceDate: ServiceDay;
    id: number;
}

export function parseV2Cursor(
    raw: unknown,
    label: string
): V2CursorPoint | null {
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
            `${label} 必须是 "serviceDay:id" 格式`
        );
    }

    const serviceDay = Number(match[1]);
    const id = Number(match[2]);
    if (
        !Number.isSafeInteger(serviceDay) ||
        serviceDay < 0 ||
        !Number.isSafeInteger(id) ||
        id < 0
    ) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            `${label} 包含非法数字`
        );
    }

    return {
        serviceDate: asServiceDay(serviceDay),
        id
    };
}

export function formatV2Cursor(serviceDay: number, id: number): string {
    return `${serviceDay}:${id}`;
}
