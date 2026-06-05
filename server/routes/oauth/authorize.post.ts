import {
    createError,
    defineEventHandler,
    readBody
} from 'h3';
import {
    applyAuthorizeDecision,
    parseAuthorizeRequestBody
} from '~/server/utils/oauth/authorizeRequest';
import apiSuccess from '~/server/utils/api/response/apiSuccess';
import type { OAuthAuthorizeDecisionResponse } from '~/types/auth';

export default defineEventHandler(async (event) => {
    const body = await readBody<Record<string, string> | null>(event);
    const result = applyAuthorizeDecision(event, {
        decision: body?.decision ?? '',
        request: parseAuthorizeRequestBody(body)
    });

    if (result.type === 'success') {
        const response: OAuthAuthorizeDecisionResponse = {
            location: result.location
        };
        return apiSuccess(
            event,
            response,
            {
                remain: 0,
                cost: 0
            },
            200
        );
    }

    throw createError({
        statusCode: result.statusCode,
        statusMessage: result.statusMessage
    });
});
