import {
    getOauthClientById,
    listAllOauthClients,
    updateOauthClientAdmin
} from '~/server/services/oauthStore';
import { revokeApiKeysByOauthClientId } from '~/server/services/authStore';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';

export function getAdminOauthClients() {
    return {
        items: listAllOauthClients()
    };
}

export function patchAdminOauthClient(
    clientId: string,
    input: Omit<Parameters<typeof updateOauthClientAdmin>[1], 'reviewedBy'>,
    actorUserId: string
) {
    const client = updateOauthClientAdmin(clientId, {
        ...input,
        reviewedBy: actorUserId
    });
    if (!client) {
        throw new ApiRequestError(404, 'not_found', 'OAuth 客户端不存在');
    }
    return {
        client
    };
}

export function postAdminOauthClientRevokeTokens(clientId: string) {
    const client = getOauthClientById(clientId);
    if (!client) {
        throw new ApiRequestError(404, 'not_found', 'OAuth 客户端不存在');
    }
    return revokeApiKeysByOauthClientId(clientId);
}
