import crypto from 'crypto';
import useConfig from '~/server/config';
import normalizeScopeList from '~/server/utils/api/scopes/normalizeScopeList';

export type ApiKeyIssuer = 'webapp' | 'api';

export interface SignedApiKeyPayload {
    kid: string;
    sub: string;
    scopes: string[];
    iat: number;
    exp: number;
    limit: number;
}

function toBase64Url(input: Buffer | string) {
    return Buffer.from(input).toString('base64url');
}

function parsePayload(encodedPayload: string) {
    try {
        return JSON.parse(
            Buffer.from(encodedPayload, 'base64url').toString('utf8')
        ) as unknown;
    } catch {
        return null;
    }
}

function signPayload(encodedPayload: string) {
    return crypto
        .createHmac('sha256', useConfig().user.signKey)
        .update(encodedPayload)
        .digest('base64url');
}

function getApiKeyPrefix(issuer: ApiKeyIssuer) {
    return useConfig().user.apiKeyPrefixes[issuer];
}

function getMatchingApiKeyPrefix(token: string) {
    return Object.values(useConfig().user.apiKeyPrefixes)
        .sort((left, right) => right.length - left.length)
        .find((prefix) => token.startsWith(prefix));
}

export function createSignedApiKeyToken(
    payload: SignedApiKeyPayload,
    issuer: ApiKeyIssuer
) {
    const encodedPayload = toBase64Url(
        JSON.stringify({
            kid: payload.kid,
            sub: payload.sub,
            scopes: normalizeScopeList(payload.scopes),
            iat: payload.iat,
            exp: payload.exp,
            limit: payload.limit
        } satisfies SignedApiKeyPayload)
    );

    return `${getApiKeyPrefix(issuer)}${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function parseSignedApiKeyToken(token: string) {
    const matchedPrefix = getMatchingApiKeyPrefix(token);
    if (!matchedPrefix) {
        return null;
    }

    const rawToken = token.slice(matchedPrefix.length);
    const dotIndex = rawToken.indexOf('.');
    if (dotIndex <= 0 || dotIndex === rawToken.length - 1) {
        return null;
    }

    const encodedPayload = rawToken.slice(0, dotIndex);
    const encodedSignature = rawToken.slice(dotIndex + 1);
    const expectedSignature = signPayload(encodedPayload);
    const actualSignature = Buffer.from(encodedSignature);
    const expectedSignatureBuffer = Buffer.from(expectedSignature);

    if (
        actualSignature.length !== expectedSignatureBuffer.length ||
        !crypto.timingSafeEqual(actualSignature, expectedSignatureBuffer)
    ) {
        return null;
    }

    const parsedPayload = parsePayload(encodedPayload);
    if (
        typeof parsedPayload !== 'object' ||
        parsedPayload === null ||
        Array.isArray(parsedPayload)
    ) {
        return null;
    }

    const candidate = parsedPayload as Partial<SignedApiKeyPayload>;
    if (
        typeof candidate.kid !== 'string' ||
        typeof candidate.sub !== 'string' ||
        !Array.isArray(candidate.scopes) ||
        typeof candidate.iat !== 'number' ||
        typeof candidate.exp !== 'number' ||
        typeof candidate.limit !== 'number'
    ) {
        return null;
    }

    try {
        return {
            kid: candidate.kid,
            sub: candidate.sub,
            scopes: normalizeScopeList(candidate.scopes),
            iat: candidate.iat,
            exp: candidate.exp,
            limit: candidate.limit
        } satisfies SignedApiKeyPayload;
    } catch {
        return null;
    }
}
