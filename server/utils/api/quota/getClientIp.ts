import type { H3Event } from 'h3';

export default function getClientIp(event: H3Event) {
    const forwardedFor = event.node.req.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
        return forwardedFor.split(',')[0].trim();
    }

    const realIp = event.node.req.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp.length > 0) {
        return realIp.trim();
    }

    const fallback = event.node.req.socket.remoteAddress;
    if (!fallback || fallback.length === 0) {
        return 'unknown';
    }
    return fallback;
}
