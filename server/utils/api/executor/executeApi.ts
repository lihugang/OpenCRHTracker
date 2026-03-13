import type { H3Event } from 'h3';
import asApiRequestError from '~/server/utils/api/errors/asApiRequestError';
import getAnonymousIdentity from '~/server/utils/api/identity/getAnonymousIdentity';
import resolveIdentity from '~/server/utils/api/identity/resolveIdentity';
import formatRetryAfterMessage from '~/server/utils/api/quota/formatRetryAfterMessage';
import getRemainTokens from '~/server/utils/api/quota/getRemainTokens';
import tryConsumeTokens from '~/server/utils/api/quota/tryConsumeTokens';
import apiFailure from '~/server/utils/api/response/apiFailure';
import apiSuccess from '~/server/utils/api/response/apiSuccess';
import type ApiIdentity from '~/server/utils/api/identity/ApiIdentity';
import type {
    ExecuteApiContext,
    ExecuteApiOptions
} from '~/server/utils/api/executor/ExecuteApiTypes';

export default async function executeApi<TData>(
    event: H3Event,
    options: ExecuteApiOptions<TData>,
    handler: (context: ExecuteApiContext) => Promise<TData>
) {
    const minimumRequestCost = 1;
    const fixedCost = options.fixedCost ?? 0;
    let identity: ApiIdentity | null = null;
    let remain = 0;
    let costApplied = 0;

    try {
        identity = resolveIdentity(event, options.requireApiKey ?? false);
        const resolvedIdentity = identity;
        remain = getRemainTokens(resolvedIdentity);

        const consumeToTargetCost = (rawTargetCost: number) => {
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
                formatRetryAfterMessage(fixedConsume.retryAfter),
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
                    formatRetryAfterMessage(dynamicConsume.retryAfter),
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

        if (costApplied < minimumRequestCost) {
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
