import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';

export default function parseOptionalTimestamp(raw: unknown, label: string) {
    if (raw === undefined || raw === null || raw === '') {
        return null;
    }

    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            `${label} 必须是秒级时间戳`
        );
    }
    return value;
}
