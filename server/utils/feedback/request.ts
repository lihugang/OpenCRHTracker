import useConfig from '~/server/config';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import ensurePayloadStringLength from '~/server/utils/api/payload/ensurePayloadStringLength';

export function parseFeedbackTopicId(value: unknown) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new ApiRequestError(400, 'invalid_param', 'id 必须是正整数');
    }

    return parsed;
}

export function ensureFeedbackString(
    value: unknown,
    fieldName: string,
    minLength: number,
    maxLength: number
) {
    if (typeof value !== 'string') {
        throw new ApiRequestError(
            400,
            'invalid_param',
            `${fieldName} 必须是字符串`
        );
    }

    const trimmedValue = value.trim();
    ensurePayloadStringLength(
        trimmedValue,
        fieldName,
        useConfig().api.payload.maxStringLength
    );

    if (trimmedValue.length < minLength || trimmedValue.length > maxLength) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            `${fieldName} 长度必须在 ${minLength} 到 ${maxLength} 之间`
        );
    }

    return trimmedValue;
}
