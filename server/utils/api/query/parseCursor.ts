import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';

export interface CursorPoint {
    serviceDate: string;
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
            `${label} 蹇呴』鏄瓧绗︿覆`
        );
    }

    const match = raw.trim().match(/^(\d{8}):(\d+)$/);
    if (!match) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            `${label} 蹇呴』鏄?"serviceDate:id" 鏍煎紡`
        );
    }

    const serviceDate = match[1] ?? '';
    const id = Number(match[2]);
    if (!/^\d{8}$/.test(serviceDate) || !Number.isInteger(id) || id < 0) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            `${label} 鍖呭惈闈炴硶鏁板瓧`
        );
    }

    return {
        serviceDate,
        id
    };
}
