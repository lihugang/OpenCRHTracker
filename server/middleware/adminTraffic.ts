import { defineEventHandler, getHeader, getRequestURL, type H3Event } from 'h3';
import useConfig from '~/server/config';
import { getValidApiKey } from '~/server/services/authStore';
import { recordAdminServerMetricsRequestDuration } from '~/server/services/adminServerMetricsStore';
import {
    recordAdminTrafficApiCall,
    recordAdminTrafficWebsiteRequest
} from '~/server/services/adminTrafficStore';
import murmurHash32 from '~/server/utils/hash/murmurHash32';
import getClientIp from '~/server/utils/api/quota/getClientIp';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import { readAuthCookie } from '~/server/utils/auth/authCookie';

interface WebsiteTrafficIdentity {
    visitorId: string;
    activeUserId: string | null;
}

function isApiRequest(pathname: string) {
    const versionPrefix = useConfig().api.versionPrefix;
    return (
        pathname === versionPrefix || pathname.startsWith(`${versionPrefix}/`)
    );
}

function isDocumentRequest(event: H3Event, pathname: string) {
    if (event.method !== 'GET' || isApiRequest(pathname)) {
        return false;
    }

    const fetchDestination = getHeader(event, 'sec-fetch-dest');
    if (
        typeof fetchDestination === 'string' &&
        fetchDestination.toLowerCase() === 'document'
    ) {
        return true;
    }

    const accept = getHeader(event, 'accept');
    return (
        typeof accept === 'string' && accept.toLowerCase().includes('text/html')
    );
}

function resolveWebsiteTrafficIdentity(event: H3Event): WebsiteTrafficIdentity {
    const authCookie = readAuthCookie(event);
    if (authCookie) {
        const authSession = getValidApiKey(authCookie);
        if (authSession) {
            return {
                visitorId: `user:${authSession.userId}`,
                activeUserId: authSession.userId
            };
        }
    }

    const clientIp = getClientIp(event);
    return {
        visitorId: `anon:${clientIp}`,
        activeUserId: null
    };
}

export default defineEventHandler((event) => {
    const timestamp = getNowSeconds();
    const startedAtMs = Date.now();
    const pathname = getRequestURL(event).pathname;
    const apiRequest = isApiRequest(pathname) && event.method !== 'OPTIONS';
    const documentRequest = isDocumentRequest(event, pathname);
    let requestDurationKind: 'ssr' | 'api' | null = null;

    if (apiRequest) {
        requestDurationKind = 'api';
    } else if (documentRequest) {
        requestDurationKind = 'ssr';
    }

    if (requestDurationKind) {
        let finalized = false;
        const finalizeRequestDuration = () => {
            if (finalized) {
                return;
            }

            finalized = true;
            recordAdminServerMetricsRequestDuration({
                kind: requestDurationKind!,
                pathname,
                durationMs: Math.max(0, Date.now() - startedAtMs)
            });
        };

        event.node.res.once('finish', finalizeRequestDuration);
        event.node.res.once('close', finalizeRequestDuration);
    }

    if (apiRequest) {
        recordAdminTrafficApiCall({
            timestamp
        });
    }

    if (!documentRequest) {
        return;
    }

    const identity = resolveWebsiteTrafficIdentity(event);
    recordAdminTrafficWebsiteRequest({
        timestamp,
        visitorIdHash: murmurHash32(identity.visitorId),
        activeUserIdHash: identity.activeUserId
            ? murmurHash32(`user:${identity.activeUserId}`)
            : null
    });
});
