import { defineEventHandler, getQuery } from 'h3';
import { listMembershipCodes } from '~/server/services/membershipCodeStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import parseLimit from '~/server/utils/api/query/parseLimit';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import type { AdminMembershipCodeStatus } from '~/types/admin';

function parseQueryString(value: unknown, field: string) {
    ensure(
        value === undefined || typeof value === 'string',
        400,
        'invalid_param',
        `${field} 必须是字符串`
    );
    return typeof value === 'string' ? value.trim() : '';
}

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.admin]
        },
        async () => {
            const query = getQuery(event);
            const status = parseQueryString(query.status, 'status');
            ensure(
                status === '' || status === 'used' || status === 'unused',
                400,
                'invalid_param',
                'status 必须为 used、unused 或留空'
            );

            return listMembershipCodes({
                groupId: parseQueryString(query.groupId, 'groupId'),
                batchId: parseQueryString(query.batchId, 'batchId'),
                status: status as AdminMembershipCodeStatus | '',
                cursor: parseQueryString(query.cursor, 'cursor'),
                limit: parseLimit(event)
            });
        }
    );
});
