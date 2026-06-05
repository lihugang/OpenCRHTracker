import { defineEventHandler, getRequestURL } from 'h3';
import useConfig from '~/server/config';
import type { OidcDiscoveryDocument } from '~/types/auth';

function buildBaseUrl(event: Parameters<typeof defineEventHandler>[0] extends never ? never : any) {
    const config = useConfig().oauth;
    return config.discovery.enabled
        ? config.discovery.externalBaseUrl
        : getRequestURL(event).origin;
}

export default defineEventHandler((event) => {
    const config = useConfig().oauth;
    const baseUrl = buildBaseUrl(event).replace(/\/+$/, '');
    const scopesSupported = useConfig().api.permissions.creatableKeyMaxScopes;
    const response: OidcDiscoveryDocument = {
        issuer: config.issuer,
        authorization_endpoint: `${baseUrl}/oauth/authorize`,
        token_endpoint: `${baseUrl}/oauth/token`,
        userinfo_endpoint: `${baseUrl}/oauth/userinfo`,
        jwks_uri: `${baseUrl}/.well-known/jwks.json`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
        scopes_supported: scopesSupported
    };

    return response;
});
