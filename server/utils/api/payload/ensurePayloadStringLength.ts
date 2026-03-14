import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';

export default function ensurePayloadStringLength(
    value: string,
    fieldName: string,
    maxStringLength: number
) {
    if (value.length > maxStringLength) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            `${fieldName} length exceeds limit`
        );
    }
}
