import crypto from 'crypto';
import useConfig from '~/server/config';

export type ApiKeyIssuer = 'webapp' | 'api' | 'oauth';

export interface SignedApiKeyPayload {
    kid: string;
    sub: string;
    nbf: number;
    exp: number;
}

export interface ParsedSignedApiKeyPayload extends SignedApiKeyPayload {
    issuer: ApiKeyIssuer;
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

function getMatchingApiKeyIssuer(token: string) {
    const matchedEntry = (
        Object.entries(useConfig().user.apiKeyPrefixes) as Array<
            [ApiKeyIssuer, string]
        >
    )
        .sort((left, right) => right[1].length - left[1].length)
        .find(([, prefix]) => token.startsWith(prefix));

    return matchedEntry ?? null;
}

export function createSignedApiKeyToken(
    payload: SignedApiKeyPayload,
    issuer: ApiKeyIssuer
) {
    const encodedPayload = toBase64Url(
        JSON.stringify({
            v: 2,
            kid: payload.kid,
            sub: payload.sub,
            nbf: payload.nbf,
            exp: payload.exp
        })
    );

    return `${getApiKeyPrefix(issuer)}${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function parseSignedApiKeyToken(token: string) {
    const matchedEntry = getMatchingApiKeyIssuer(token);
    if (!matchedEntry) {
        return null;
    }

    const [issuer, prefix] = matchedEntry;
    const rawToken = token.slice(prefix.length);
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

    const candidate = parsedPayload as Partial<SignedApiKeyPayload> & {
        v?: unknown;
        scopes?: unknown;
    };
    if (
        (candidate.v !== undefined && candidate.v !== 2) ||
        typeof candidate.kid !== 'string' ||
        typeof candidate.sub !== 'string' ||
        typeof candidate.nbf !== 'number' ||
        typeof candidate.exp !== 'number'
    ) {
        return null;
    }

    return {
        issuer,
        kid: candidate.kid,
        sub: candidate.sub,
        nbf: candidate.nbf,
        exp: candidate.exp
    } satisfies ParsedSignedApiKeyPayload;
}
