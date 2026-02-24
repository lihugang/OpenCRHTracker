import { getQuery, type H3Event } from 'h3';
import useConfig from '~/server/config';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';

export default function parseLimit(event: H3Event) {
    const config = useConfig();
    const query = getQuery(event);
    const raw = query.limit;
    if (raw === undefined) {
        return config.api.pagination.defaultLimit;
    }

    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
        throw new ApiRequestError(400, 'invalid_param', 'limit 必须是正整数');
    }
    if (value > config.api.pagination.maxLimit) {
        return config.api.pagination.maxLimit;
    }
    return value;
}
