import type { TrackerApiFailure } from '~/types/homepage';

export default function getApiErrorMessage(
    error: unknown,
    fallback = '璇锋眰澶辫触锛岃绋嶅悗閲嶈瘯銆?'
) {
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
