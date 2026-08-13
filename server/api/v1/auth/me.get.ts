import { defineEventHandler } from 'h3';
import { getAuthMe } from '~/server/domain/auth';
import { queueFingerprintMatchedUserRisk } from '~/server/services/userBanSecurityStore';
import getFixedCost from '~/server/utils/api/cost/getFixedCost';
import executeApi from '~/server/utils/api/executor/executeApi';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            cors: true,
            requiredScopes: [API_SCOPES.auth.me],
            fixedCost: getFixedCost('authMe')
        },
        async ({ identity }) => {
            queueFingerprintMatchedUserRisk(identity.id, event);
            return getAuthMe(identity);
        }
    );
});
