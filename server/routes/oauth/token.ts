import {
    defineEventHandler,
    readBody,
    setHeader,
    setResponseStatus
} from 'h3';
import { exchangeAuthorizationCode } from '~/server/services/oauthStore';

interface OAuthTokenBody {
    grant_type?: string;
    code?: string;
    client_id?: string;
    redirect_uri?: string;
    code_verifier?: string;
}

export default defineEventHandler(async (event) => {
    const body = await readBody<OAuthTokenBody | null>(event);
    const parsed = body ?? {};

    if (
        parsed.grant_type !== 'authorization_code' ||
        typeof parsed.code !== 'string' ||
        typeof parsed.client_id !== 'string' ||
        typeof parsed.redirect_uri !== 'string' ||
        typeof parsed.code_verifier !== 'string'
    ) {
        setResponseStatus(event, 400);
        return {
            error: 'invalid_request'
        };
    }

    const token = exchangeAuthorizationCode({
        clientId: parsed.client_id,
        code: parsed.code,
        redirectUri: parsed.redirect_uri,
        codeVerifier: parsed.code_verifier
    });
    if (!token) {
        setResponseStatus(event, 400);
        return {
            error: 'invalid_grant'
        };
    }

    setHeader(event, 'cache-control', 'no-store');
    setHeader(event, 'pragma', 'no-cache');
    return token;
});
