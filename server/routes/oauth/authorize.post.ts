import {
    createError,
    defineEventHandler,
    readBody,
    sendRedirect
} from 'h3';
import {
    applyAuthorizeDecision,
    parseAuthorizeRequestBody
} from '~/server/utils/oauth/authorizeRequest';

export default defineEventHandler(async (event) => {
    const body = await readBody<Record<string, string> | null>(event);
    const result = applyAuthorizeDecision(event, {
        decision: body?.decision ?? '',
        request: parseAuthorizeRequestBody(body)
    });

    if (result.type === 'redirect') {
        return sendRedirect(event, result.location);
    }

    throw createError({
        statusCode: result.statusCode,
        statusMessage: result.statusMessage
    });
});
