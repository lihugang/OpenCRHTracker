import { defineEventHandler, getRouterParam, readBody } from 'h3';
import { updateOauthClientByOwner } from '~/server/services/oauthStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import type {
    OAuthClientCreateInput,
    OAuthClientMutationResponse
} from '~/types/auth';

interface OAuthClientUpdateBody {
    name?: unknown;
    description?: unknown;
    homepageUrl?: unknown;
    redirectUris?: unknown;
    requestedScopes?: unknown;
}

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: ['api.auth.api-keys.create']
        },
        async ({ identity }) => {
            const clientId = getRouterParam(event, 'clientId') ?? '';
            const body = (await readBody<OAuthClientUpdateBody | null>(event)) ?? {};

            ensure(typeof body.name === 'string' && body.name.trim().length > 0, 400, 'invalid_param', 'name 不能为空');
            ensure(Array.isArray(body.redirectUris) && body.redirectUris.length > 0, 400, 'invalid_param', 'redirectUris 不能为空');
            ensure(Array.isArray(body.requestedScopes), 400, 'invalid_param', 'requestedScopes 必须为数组');

            const input: OAuthClientCreateInput = {
                name: body.name.trim(),
                description:
                    typeof body.description === 'string' && body.description.trim().length > 0
                        ? body.description.trim()
                        : null,
                homepageUrl:
                    typeof body.homepageUrl === 'string' && body.homepageUrl.trim().length > 0
                        ? body.homepageUrl.trim()
                        : null,
                redirectUris: body.redirectUris.map((item) => String(item ?? '').trim()),
                requestedScopes: body.requestedScopes.map((item) => String(item ?? '').trim())
            };

            const client = updateOauthClientByOwner(clientId, identity.id, input);
            ensure(client, 404, 'not_found', 'OAuth 客户端不存在');

            const response: OAuthClientMutationResponse = {
                client
            };
            return response;
        }
    );
});
