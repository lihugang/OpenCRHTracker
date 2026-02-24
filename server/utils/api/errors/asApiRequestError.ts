import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';

export default function asApiRequestError(error: unknown) {
    if (error instanceof ApiRequestError) {
        return error;
    }
    return new ApiRequestError(
        500,
        'internal_error',
        '服务内部错误，请稍后再试'
    );
}
