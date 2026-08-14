import useConfig from '~/server/config';
import {
    createOauthClient,
    deleteOauthClientByOwner,
    getOauthClientByIdAndOwner,
    listOauthClientsByOwner,
    updateOauthClientByOwner
} from '~/server/services/oauthStore';
import {
    getAuthorizeContextDecision,
    type OAuthAuthorizeSessionContext
} from '~/server/utils/oauth/authorizeRequest';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import hasScope from '~/server/utils/api/scopes/hasScope';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import type {
    OAuthAuthorizeRequest,
    OAuthClientCreateInput
} from '~/types/auth';

export function getOauthAuthorizeContext(
    authorizeRequest: OAuthAuthorizeRequest,
    session: OAuthAuthorizeSessionContext | null
) {
    return getAuthorizeContextDecision(authorizeRequest, session);
}

export function getOauthClients(userId: string) {
    return {
        items: listOauthClientsByOwner(userId),
        allowedScopes: useConfig().api.permissions.creatableKeyMaxScopes
    };
}

export function postOauthClients(
    userId: string,
    input: OAuthClientCreateInput
) {
    ensureNoNotificationScopeRequest(input.requestedScopes);
    return {
        client: createOauthClient(userId, input)
    };
}

export function getOauthClient(userId: string, clientId: string) {
    const client = getOauthClientByIdAndOwner(clientId, userId);
    if (!client) {
        throw new ApiRequestError(404, 'not_found', 'OAuth 客户端不存在');
    }
    return {
        client
    };
}

export function patchOauthClient(
    userId: string,
    clientId: string,
    input: OAuthClientCreateInput
) {
    ensureNoNotificationScopeRequest(input.requestedScopes);
    const client = updateOauthClientByOwner(clientId, userId, input);
    if (!client) {
        throw new ApiRequestError(404, 'not_found', 'OAuth 客户端不存在');
    }
    return {
        client
    };
}

export function deleteOauthClient(userId: string, clientId: string) {
    const deleted = deleteOauthClientByOwner(clientId, userId);
    if (!deleted) {
        throw new ApiRequestError(404, 'not_found', 'OAuth 客户端不存在');
    }
    return {
        deleted: true,
        clientId
    };
}

function ensureNoNotificationScopeRequest(requestedScopes: string[]) {
    if (
        requestedScopes.some((scope) =>
            hasScope([scope], API_SCOPES.notifications.send)
        )
    ) {
        throw new ApiRequestError(
            403,
            'forbidden_scope',
            '该权限只能由管理员在后台启用'
        );
    }
}
