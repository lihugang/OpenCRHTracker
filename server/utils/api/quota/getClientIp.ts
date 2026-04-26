import type { H3Event } from 'h3';
import useConfig from '~/server/config';

function readHeaderValue(
    headers: H3Event['node']['req']['headers'],
    headerName: string
) {
    const rawValue = headers[headerName];
    if (typeof rawValue === 'string') {
        const normalizedValue = rawValue.trim();
        return normalizedValue.length > 0 ? normalizedValue : null;
    }

    if (Array.isArray(rawValue)) {
        for (const value of rawValue) {
            const normalizedValue = value.trim();
            if (normalizedValue.length > 0) {
                return normalizedValue;
            }
        }
    }

    return null;
}

export default function getClientIp(event: H3Event) {
    for (const headerName of useConfig().api.clientIpHeaders) {
        const resolvedValue = readHeaderValue(
            event.node.req.headers,
            headerName
        );
        if (!resolvedValue) {
            continue;
        }

        if (headerName === 'x-forwarded-for') {
            const forwardedIp = resolvedValue.split(',')[0]?.trim();
            if (forwardedIp && forwardedIp.length > 0) {
                return forwardedIp;
            }
            continue;
        }

        return resolvedValue;
    }

    const fallback = event.node.req.socket.remoteAddress;
    if (!fallback || fallback.length === 0) {
        return 'unknown';
    }
    return fallback;
}
