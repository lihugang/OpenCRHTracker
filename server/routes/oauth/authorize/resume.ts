import { defineEventHandler, sendRedirect } from 'h3';
import { consumeOauthLoginContinuation } from '~/server/services/oauthStore';
import {
    clearOauthContinuationCookie,
    readOauthContinuationCookie
} from '~/server/utils/oauth/continuationCookie';

export default defineEventHandler((event) => {
    const continuationId = readOauthContinuationCookie(event);
    if (!continuationId) {
        return sendRedirect(event, '/login');
    }

    const payload = consumeOauthLoginContinuation(continuationId);
    clearOauthContinuationCookie(event);

    if (!payload) {
        return sendRedirect(event, '/login');
    }

    const target = new URL('/oauth/authorize', 'http://localhost');
    target.searchParams.set(
        'response_type',
        payload.authorizeRequest.responseType
    );
    target.searchParams.set('client_id', payload.authorizeRequest.clientId);
    target.searchParams.set(
        'redirect_uri',
        payload.authorizeRequest.redirectUri
    );
    target.searchParams.set('scope', payload.authorizeRequest.scope.join(' '));
    target.searchParams.set('state', payload.authorizeRequest.state);
    target.searchParams.set(
        'code_challenge',
        payload.authorizeRequest.codeChallenge
    );
    target.searchParams.set(
        'code_challenge_method',
        payload.authorizeRequest.codeChallengeMethod
    );
    if (payload.authorizeRequest.nonce) {
        target.searchParams.set('nonce', payload.authorizeRequest.nonce);
    }

    return sendRedirect(event, target.pathname + target.search);
});
