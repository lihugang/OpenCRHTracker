import type { H3Event } from 'h3';
import applyApiCorsHeaders from '~/server/utils/api/cors/applyApiCorsHeaders';
import asApiRequestError from '~/server/utils/api/errors/asApiRequestError';
import type {
    ExecuteApiContext,
    ExecuteApiOptions
} from '~/server/utils/api/executor/ExecuteApiTypes';
import getAnonymousIdentity from '~/server/utils/api/identity/getAnonymousIdentity';
import type ApiIdentity from '~/server/utils/api/identity/ApiIdentity';
import resolveIdentity from '~/server/utils/api/identity/resolveIdentity';
import getRemainTokens from '~/server/utils/api/quota/getRemainTokens';
import formatRetryAfterMessage from '~/server/utils/api/quota/formatRetryAfterMessage';
import tryConsumeTokens from '~/server/utils/api/quota/tryConsumeTokens';
import apiFailure from '~/server/utils/api/response/apiFailure';
import apiSuccess from '~/server/utils/api/response/apiSuccess';
import assertRequiredScopes from '~/server/utils/api/scopes/assertRequiredScopes';

export default async function executeApi<TData>(
    event: H3Event,
    options: ExecuteApiOptions<TData>,
    handler: (context: ExecuteApiContext) => Promise<TData>
) {
    const minimumRequestCost = 1;
    const corsEnabled = options.cors ?? false;
    const bypassAnonymousQuota = options.bypassAnonymousQuota ?? false;
    const fixedCost = options.fixedCost ?? 0;
    let identity: ApiIdentity | null = null;
    let remain = 0;
    let costApplied = 0;

    if (corsEnabled) {
        applyApiCorsHeaders(event);
    }

    const getQuotaExceededMessage = (retryAfter?: number) => {
        return formatRetryAfterMessage(
            retryAfter,
            identity?.type === 'anonymous' ? 'quota_anonymous' : 'quota_user'
        );
    };

    try {
        identity = resolveIdentity(event);
        assertRequiredScopes(identity, options.requiredScopes);

        const resolvedIdentity = identity;
        remain = getRemainTokens(resolvedIdentity);
        const shouldBypassQuota =
            bypassAnonymousQuota && resolvedIdentity.type === 'anonymous';

        const consumeToTargetCost = (rawTargetCost: number) => {
            if (shouldBypassQuota) {
                return {
                    ok: true,
                    remain,
                    cost: 0
                };
            }

            const targetCost = Math.max(
                minimumRequestCost,
                Math.floor(rawTargetCost)
            );
            if (targetCost <= costApplied) {
                return {
                    ok: true,
                    remain,
                    cost: 0
                };
            }

            return tryConsumeTokens(resolvedIdentity, targetCost - costApplied);
        };

        const fixedConsume = consumeToTargetCost(fixedCost);
        if (!fixedConsume.ok) {
            if (fixedConsume.impossible) {
                return apiFailure(
                    event,
                    403,
                    '当前身份额度上限不足，无法调用该接口',
                    'cost_exceeds_quota_limit',
                    { remain: fixedConsume.remain, cost: 0 }
                );
            }

            return apiFailure(
                event,
                429,
                getQuotaExceededMessage(fixedConsume.retryAfter),
                'quota_exceeded',
                {
                    remain: fixedConsume.remain,
                    cost: 0,
                    retryAfter: fixedConsume.retryAfter
                }
            );
        }

        remain = fixedConsume.remain;
        costApplied += fixedConsume.cost;

        const data = await handler({
            event,
            identity: resolvedIdentity
        });

        if (options.dynamicCostFromData) {
            const dynamicCost = options.dynamicCostFromData(data);
            const dynamicConsume = consumeToTargetCost(fixedCost + dynamicCost);
            if (!dynamicConsume.ok) {
                if (dynamicConsume.impossible) {
                    return apiFailure(
                        event,
                        403,
                        '当前身份额度上限不足，无法调用该接口',
                        'cost_exceeds_quota_limit',
                        { remain: dynamicConsume.remain, cost: costApplied }
                    );
                }

                return apiFailure(
                    event,
                    429,
                    getQuotaExceededMessage(dynamicConsume.retryAfter),
                    'quota_exceeded',
                    {
                        remain: dynamicConsume.remain,
                        cost: costApplied,
                        retryAfter: dynamicConsume.retryAfter
                    }
                );
            }

            remain = dynamicConsume.remain;
            costApplied += dynamicConsume.cost;
        }

        if (options.successHeaders) {
            options.successHeaders(event, data);
        }

        return apiSuccess(
            event,
            data,
            {
                remain,
                cost: costApplied
            },
            options.successStatusCode ?? 200
        );
    } catch (error) {
        const apiError = asApiRequestError(error);
        if (!identity) {
            identity = getAnonymousIdentity(event);
        }

        if (
            !(bypassAnonymousQuota && identity.type === 'anonymous') &&
            costApplied < minimumRequestCost
        ) {
            const minimumConsume = tryConsumeTokens(
                identity,
                minimumRequestCost - costApplied
            );
            if (minimumConsume.ok) {
                remain = minimumConsume.remain;
                costApplied += minimumConsume.cost;
            } else {
                remain = minimumConsume.remain;
            }
        } else {
            remain = getRemainTokens(identity);
        }

        return apiFailure(
            event,
            apiError.statusCode,
            apiError.userMessage,
            apiError.errorCode,
            {
                remain,
                cost: costApplied,
                retryAfter: apiError.retryAfter
            }
        );
    }
}
