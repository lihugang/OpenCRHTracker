import crypto from 'crypto';
import useConfig from '~/server/config';

interface IdTokenClaims {
    iss: string;
    sub: string;
    aud: string;
    azp: string;
    exp: number;
    iat: number;
    auth_time: number;
    at_hash: string;
    nonce?: string;
    preferred_username?: string;
}

function encodeBase64UrlJson(value: unknown) {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function signOidcIdToken(claims: IdTokenClaims) {
    const config = useConfig().oauth;
    const header = encodeBase64UrlJson({
        alg: config.idTokenSigning.alg,
        kid: config.idTokenSigning.kid,
        typ: 'JWT'
    });
    const payload = encodeBase64UrlJson(claims);
    const signingInput = `${header}.${payload}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();
    const signature = signer.sign(
        config.idTokenSigning.privateKeyPem,
        'base64url'
    );
    return `${signingInput}.${signature}`;
}
