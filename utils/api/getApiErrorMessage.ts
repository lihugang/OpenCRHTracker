import type { TrackerApiFailure } from '~/types/homepage';
import { V2ApiError } from '~/utils/api/v2/V2ApiError';

export default function getApiErrorMessage(
    error: unknown,
    fallback = '请求失败，请稍后重试。'
) {
    if (error instanceof V2ApiError) {
        return error.userMessage;
    }

    if (typeof error === 'object' && error !== null) {
        const candidate = error as {
            data?: unknown;
            response?: {
                _data?: unknown;
            };
            message?: unknown;
        };
        const payload = (candidate.data ?? candidate.response?._data) as
            | Partial<TrackerApiFailure>
            | undefined;

        if (
            payload &&
            typeof payload.data === 'string' &&
            payload.data.length
        ) {
            return payload.data;
        }

        if (
            typeof candidate.message === 'string' &&
            candidate.message.length > 0
        ) {
            return candidate.message;
        }
    }

    return fallback;
}
