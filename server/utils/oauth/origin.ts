import { getHeader, readBody, type H3Event } from 'h3';
import { getOauthClientById } from '~/server/services/oauthStore';
import resolveIdentity from '~/server/utils/api/identity/resolveIdentity';

interface OAuthTokenBody {
    client_id?: string;
}

function normalizeOrigin(value: string) {
    return value.trim();
}

function resolveRegisteredOrigins(clientId: string) {
    const client = getOauthClientById(clientId);
    if (!client || client.status !== 'active') {
        return new Set<string>();
    }

    return new Set(
        client.redirectUris
            .map((item) => {
                try {
                    const url = new URL(item.value);
                    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                        return null;
                    }
                    return url.origin;
                } catch {
                    return null;
                }
            })
            .filter((origin): origin is string => origin !== null)
    );
}

export async function validateOauthTokenOrigin(event: H3Event) {
    const origin = getHeader(event, 'origin');
    if (!origin) {
        return true;
    }

    const body = (await readBody<OAuthTokenBody | null>(event)) ?? {};
    const clientId =
        typeof body.client_id === 'string' ? body.client_id.trim() : '';
    if (!clientId) {
        return false;
    }

    return resolveRegisteredOrigins(clientId).has(normalizeOrigin(origin));
}

export function validateOauthUserInfoOrigin(event: H3Event) {
    const origin = getHeader(event, 'origin');
    if (!origin) {
        return true;
    }

    const identity = resolveIdentity(event);
    if (
        identity.type !== 'user' ||
        identity.issuer !== 'oauth' ||
        !identity.oauthClientId
    ) {
        return false;
    }

    return resolveRegisteredOrigins(identity.oauthClientId).has(
        normalizeOrigin(origin)
    );
}
