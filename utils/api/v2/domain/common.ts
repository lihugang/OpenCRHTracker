import type { V2ClientOperation } from '#shared/api/v2/registry/types';
import type { AuthSession } from '~/types/auth';
import { V2ApiError } from '~/utils/api/v2/V2ApiError';
import { protoInt64ToNumber } from '~/utils/api/v2/mappers/numbers';
import type { V2ApiResult } from '~/utils/api/v2/transport';

export function requireSuccess<T>(
    entry: V2ClientOperation,
    result: V2ApiResult<T>
) {
    if (result.ok) {
        return result.data;
    }

    throw new V2ApiError(entry.operationName, null, result.error, result.data);
}

export function mapIssuer(value: number): AuthSession['issuer'] {
    switch (value) {
        case 1:
            return 'webapp';
        case 3:
            return 'oauth';
        default:
            return 'api';
    }
}

export function mapSessionData(value: {
    userId: string;
    revokeId: string;
    issuer: number;
    maskedApiKey: string;
    scopes: string[];
    activeFrom: bigint | number;
    expiresAt: bigint | number;
    dailyTokenLimit: number;
}): AuthSession {
    return {
        userId: value.userId,
        revokeId: value.revokeId,
        issuer: mapIssuer(value.issuer),
        maskedApiKey: value.maskedApiKey,
        scopes: value.scopes,
        activeFrom: protoInt64ToNumber(value.activeFrom) ?? 0,
        expiresAt: protoInt64ToNumber(value.expiresAt) ?? 0,
        dailyTokenLimit: value.dailyTokenLimit
    };
}

export function mapQuota(value: {
    tokenLimit: number;
    remain: number;
    refillAmount: number;
    refillIntervalSeconds: number;
    nextRefillAt?: bigint | number | undefined;
}) {
    return {
        tokenLimit: value.tokenLimit,
        remain: value.remain,
        refillAmount: value.refillAmount,
        refillIntervalSeconds: value.refillIntervalSeconds,
        nextRefillAt: protoInt64ToNumber(value.nextRefillAt)
    };
}
