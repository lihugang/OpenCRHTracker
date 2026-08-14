import { defineEventHandler, getRequestURL } from 'h3';

export default defineEventHandler((event) => {
    if (event.method !== 'HEAD') {
        return;
    }

    const pathname = getRequestURL(event).pathname;
    if (!pathname.startsWith('/api/v2/')) {
        return;
    }

    event.context.v2OriginalMethod = 'HEAD';
    event._method = 'GET';
});
