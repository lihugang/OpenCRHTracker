import crypto from 'crypto';
import useConfig from '~/server/config';
import type { OidcJwk, OidcJwksDocument } from '~/types/auth';

let cachedJwks: OidcJwksDocument | null = null;

function toBase64UrlUInt(buffer: Buffer) {
    let start = 0;
    while (start < buffer.length - 1 && buffer[start] === 0) {
        start += 1;
    }

    return buffer.subarray(start).toString('base64url');
}

export function getOidcJwks() {
    if (cachedJwks) {
        return cachedJwks;
    }

    const keyObject = crypto.createPrivateKey(
        useConfig().oauth.idTokenSigning.privateKeyPem
    );
    const publicKey = crypto.createPublicKey(keyObject);
    const jwk = publicKey.export({ format: 'jwk' }) as JsonWebKey;

    const key: OidcJwk = {
        kty: 'RSA',
        use: 'sig',
        kid: useConfig().oauth.idTokenSigning.kid,
        alg: 'RS256',
        n:
            typeof jwk.n === 'string'
                ? jwk.n
                : toBase64UrlUInt(Buffer.from([])),
        e:
            typeof jwk.e === 'string'
                ? jwk.e
                : toBase64UrlUInt(Buffer.from([1, 0, 1]))
    };

    cachedJwks = {
        keys: [key]
    };
    return cachedJwks;
}
