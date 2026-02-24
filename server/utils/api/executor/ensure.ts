import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';

export default function ensure(
    condition: unknown,
    statusCode: number,
    errorCode: string,
    userMessage: string
): asserts condition {
    if (!condition) {
        throw new ApiRequestError(statusCode, errorCode, userMessage);
    }
}
