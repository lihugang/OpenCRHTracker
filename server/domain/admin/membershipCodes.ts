import {
    createMembershipCodeBatch,
    listMembershipCodes
} from '~/server/services/membershipCodeStore';
import type { AdminCreateMembershipCodeBatchRequest } from '~/types/admin';
import type { AdminMembershipCodeStatus } from '~/types/admin';

export function getAdminMembershipCodes(input: {
    groupId: string;
    batchId: string;
    status: AdminMembershipCodeStatus | '';
    cursor: string;
    limit: number;
}) {
    return listMembershipCodes(input);
}

export function postAdminMembershipCodes(
    input: AdminCreateMembershipCodeBatchRequest,
    actorUserId: string
) {
    return createMembershipCodeBatch(input, actorUserId);
}
