import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { updateOauthClientAdmin } from '~/server/services/oauthStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import type {
    OAuthClientMutationResponse,
    OAuthClientScopeReviewStatus,
    OAuthClientStatus
} from '~/types/auth';

interface AdminOAuthClientUpdateBody {
    status?: unknown;
    isTrusted?: unknown;
    scopeReviews?: unknown;
}

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.admin]
        },
        async ({ identity }) => {
            const clientId = getRouterParam(event, 'clientId') ?? '';
            const body = (await readBody<AdminOAuthClientUpdateBody | null>(event)) ?? {};
            ensure(body.status === 'active' || body.status === 'disabled', 400, 'invalid_param', 'status 必须为 active 或 disabled');
            ensure(typeof body.isTrusted === 'boolean', 400, 'invalid_param', 'isTrusted 必须为布尔值');
            ensure(Array.isArray(body.scopeReviews), 400, 'invalid_param', 'scopeReviews 必须为数组');

            const client = updateOauthClientAdmin(clientId, {
                status: body.status as OAuthClientStatus,
                isTrusted: body.isTrusted,
                scopeReviews: body.scopeReviews.map((item) => {
                    const row = item as Record<string, unknown>;
                    const reviewStatus = row.reviewStatus;
                    ensure(
                        reviewStatus === 'pending' ||
                            reviewStatus === 'approved' ||
                            reviewStatus === 'rejected',
                        400,
                        'invalid_param',
                        'reviewStatus 无效'
                    );
                    return {
                        scope: String(row.scope ?? ''),
                        reviewStatus: reviewStatus as OAuthClientScopeReviewStatus
                    };
                }),
                reviewedBy: identity.id
            });
            ensure(client, 404, 'not_found', 'OAuth 客户端不存在');

            const response: OAuthClientMutationResponse = {
                client
            };
            return response;
        }
    );
});
