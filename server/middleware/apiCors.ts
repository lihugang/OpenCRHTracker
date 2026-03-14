import { defineEventHandler, sendNoContent } from 'h3';
import { applyApiCorsPreflightHeaders } from '~/server/utils/api/cors/applyApiCorsHeaders';

export default defineEventHandler((event) => {
    if (event.method !== 'OPTIONS') {
        return;
    }

    applyApiCorsPreflightHeaders(event);
    return sendNoContent(event, 204);
});
