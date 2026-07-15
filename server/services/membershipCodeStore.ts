import crypto from 'crypto';
import '~/server/libs/database/users';
import { useUsersDatabase } from '~/server/libs/database/users';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import {
    getAuthMembershipsSnapshot,
    getSponsorshipGroupCatalog,
    getUserMembershipRows,
    resolveUserMembershipStatus,
    upsertUserMembership
} from '~/server/services/membershipStore';
import { getQqBindingData } from '~/server/services/userProfileStore';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import type {
    AdminCreateMembershipCodeBatchRequest,
    AdminCreateMembershipCodeBatchResponse,
    AdminMembershipCodeBatchSummary,
    AdminMembershipCodeItem,
    AdminMembershipCodeListResponse,
    AdminMembershipCodeStatus
} from '~/types/admin';
import type { AuthMembershipRedeemResponse } from '~/types/membership';

const CODE_PREFIX = 'CRH';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_RANDOM_LENGTH = 16;
const SECONDS_PER_DAY = 24 * 60 * 60;

interface MembershipCodeRow {
    code: string;
    batch_id: string;
    used_at: number | null;
    used_by: string | null;
    group_id: string;
    duration_days: number;
    quantity: number;
    created_by: string;
    created_at: number;
}

interface MembershipCodeCountRow {
    total: number;
    used_count: number | null;
    unused_count: number | null;
}

interface MembershipCodeCursor {
    createdAt: number;
    code: string;
}

export interface ListMembershipCodesInput {
    groupId: string;
    batchId: string;
    status: AdminMembershipCodeStatus | '';
    cursor: string;
    limit: number;
}

type MembershipCodeSqlKey =
    | 'insertMembershipCodeBatch'
    | 'insertMembershipCode'
    | 'selectMembershipCodeByCode'
    | 'useMembershipCode'
    | 'selectMembershipCodesPaged'
    | 'selectMembershipCodeCounts';

const membershipCodeSql = importSqlBatch('users/queries') as Record<
    MembershipCodeSqlKey,
    string
>;
const membershipCodeStatements = createPreparedSqlStore<MembershipCodeSqlKey>({
    dbName: 'users',
    scope: 'membership-codes',
    sql: membershipCodeSql
});

function createCompactMembershipCode() {
    let randomPart = '';
    for (let index = 0; index < CODE_RANDOM_LENGTH; index += 1) {
        randomPart += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    }
    return CODE_PREFIX + randomPart;
}

export function normalizeMembershipCode(value: string) {
    const compact = value
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '');
    const pattern = new RegExp(
        `^${CODE_PREFIX}[${CODE_ALPHABET}]{${CODE_RANDOM_LENGTH}}$`
    );
    return pattern.test(compact) ? compact : '';
}

export function formatMembershipCode(compactCode: string) {
    const normalized = normalizeMembershipCode(compactCode);
    if (!normalized) {
        return compactCode;
    }

    const randomPart = normalized.slice(CODE_PREFIX.length);
    const groups = randomPart.match(/.{1,4}/g) ?? [];
    return [CODE_PREFIX, ...groups].join('-');
}

function addMembershipDuration(baseTimestamp: number, durationDays: number) {
    const durationSeconds = durationDays * SECONDS_PER_DAY;
    const expiresAt = baseTimestamp + durationSeconds;
    if (
        !Number.isSafeInteger(durationSeconds) ||
        !Number.isSafeInteger(expiresAt) ||
        expiresAt <= baseTimestamp
    ) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            '会员时长超出可支持的时间范围'
        );
    }
    return expiresAt;
}

function getGroup(groupId: string) {
    return getSponsorshipGroupCatalog('all').find(
        (group) => group.id === groupId
    );
}

function toBatchSummary(
    row: Pick<
        MembershipCodeRow,
        | 'batch_id'
        | 'group_id'
        | 'duration_days'
        | 'quantity'
        | 'created_by'
        | 'created_at'
    >
): AdminMembershipCodeBatchSummary {
    return {
        batchId: row.batch_id,
        groupId: row.group_id,
        groupName: getGroup(row.group_id)?.name ?? row.group_id,
        durationDays: row.duration_days,
        quantity: row.quantity,
        createdBy: row.created_by,
        createdAt: row.created_at
    };
}

function toCodeItem(row: MembershipCodeRow): AdminMembershipCodeItem {
    return {
        ...toBatchSummary(row),
        code: formatMembershipCode(row.code),
        status: row.used_at === null ? 'unused' : 'used',
        usedAt: row.used_at,
        usedBy: row.used_by
    };
}

function parseCursor(rawCursor: string): MembershipCodeCursor | null {
    const normalized = rawCursor.trim();
    if (!normalized) {
        return null;
    }

    const separatorIndex = normalized.indexOf(':');
    const createdAt = Number(normalized.slice(0, separatorIndex));
    const code = normalized.slice(separatorIndex + 1);
    if (
        separatorIndex <= 0 ||
        !Number.isSafeInteger(createdAt) ||
        createdAt <= 0 ||
        !normalizeMembershipCode(code)
    ) {
        throw new ApiRequestError(400, 'invalid_param', 'cursor 无效');
    }

    return { createdAt, code };
}

function buildCursor(item: AdminMembershipCodeItem) {
    return `${item.createdAt}:${normalizeMembershipCode(item.code)}`;
}

export function createMembershipCodeBatch(
    request: AdminCreateMembershipCodeBatchRequest,
    actorUserId: string,
    now = getNowSeconds()
): AdminCreateMembershipCodeBatchResponse {
    const group = getGroup(request.groupId);
    if (!group) {
        throw new ApiRequestError(
            404,
            'sponsorship_group_not_found',
            '赞助权益组不存在'
        );
    }
    if (!group.enabled || !group.assignable) {
        throw new ApiRequestError(
            409,
            'sponsorship_group_not_assignable',
            '该赞助权益组当前不可生成兑换码'
        );
    }

    addMembershipDuration(now, request.durationDays);
    const batchId = crypto.randomUUID();
    const createBatch = useUsersDatabase().transaction(() => {
        membershipCodeStatements.run(
            'insertMembershipCodeBatch',
            batchId,
            request.groupId,
            request.durationDays,
            request.quantity,
            actorUserId,
            now
        );

        let inserted = 0;
        while (inserted < request.quantity) {
            const result = membershipCodeStatements.run(
                'insertMembershipCode',
                createCompactMembershipCode(),
                batchId
            );
            inserted += result.changes;
        }
    });
    createBatch();

    return {
        batch: {
            batchId,
            groupId: group.id,
            groupName: group.name,
            durationDays: request.durationDays,
            quantity: request.quantity,
            createdBy: actorUserId,
            createdAt: now
        }
    };
}

export function listMembershipCodes(
    input: ListMembershipCodesInput,
    now = getNowSeconds()
): AdminMembershipCodeListResponse {
    const cursor = parseCursor(input.cursor);
    const rows = membershipCodeStatements.all<MembershipCodeRow>(
        'selectMembershipCodesPaged',
        input.groupId,
        input.groupId,
        input.batchId,
        input.batchId,
        input.status,
        input.status,
        input.status,
        cursor?.createdAt ?? 0,
        cursor?.createdAt ?? 0,
        cursor?.createdAt ?? 0,
        cursor?.code ?? '',
        input.limit + 1
    );
    const pageRows = rows.slice(0, input.limit);
    const items = pageRows.map(toCodeItem);
    const counts = membershipCodeStatements.get<MembershipCodeCountRow>(
        'selectMembershipCodeCounts',
        input.groupId,
        input.groupId,
        input.batchId,
        input.batchId
    );

    return {
        asOf: now,
        total: counts?.total ?? 0,
        usedCount: counts?.used_count ?? 0,
        unusedCount: counts?.unused_count ?? 0,
        limit: input.limit,
        nextCursor:
            rows.length > input.limit && items.length > 0
                ? buildCursor(items[items.length - 1]!)
                : '',
        catalog: getSponsorshipGroupCatalog('all'),
        items
    };
}

export function redeemMembershipCode(
    rawCode: string,
    userId: string,
    now = getNowSeconds()
): AuthMembershipRedeemResponse {
    if (getQqBindingData(userId).qqNumber === null) {
        throw new ApiRequestError(
            409,
            'qq_not_bound',
            '兑换会员权益前必须先绑定 QQ 号'
        );
    }

    const code = normalizeMembershipCode(rawCode);
    if (!code) {
        throw new ApiRequestError(
            400,
            'invalid_membership_code',
            '兑换码格式无效'
        );
    }

    let durationDays = 0;
    let groupId = '';
    const redeem = useUsersDatabase().transaction(() => {
        const row = membershipCodeStatements.get<MembershipCodeRow>(
            'selectMembershipCodeByCode',
            code
        );
        if (!row) {
            throw new ApiRequestError(
                404,
                'membership_code_not_found',
                '兑换码不存在'
            );
        }
        if (row.used_at !== null || row.used_by !== null) {
            throw new ApiRequestError(
                409,
                'membership_code_already_used',
                '兑换码已被使用'
            );
        }

        const group = getGroup(row.group_id);
        if (!group || !group.enabled) {
            throw new ApiRequestError(
                409,
                'sponsorship_group_disabled',
                '兑换码对应的赞助权益组当前不可用'
            );
        }

        const existingMembership = getUserMembershipRows(userId).find(
            (membership) => membership.groupId === row.group_id
        );
        const existingStatus = existingMembership
            ? resolveUserMembershipStatus(existingMembership, now)
            : null;
        const shouldExtend =
            existingMembership !== undefined &&
            (existingStatus === 'active' || existingStatus === 'scheduled');
        const startsAt = shouldExtend ? existingMembership.startsAt : now;
        const baseTimestamp = shouldExtend ? existingMembership.expiresAt : now;
        const expiresAt = addMembershipDuration(
            baseTimestamp,
            row.duration_days
        );

        const used = membershipCodeStatements.run(
            'useMembershipCode',
            now,
            userId,
            code
        );
        if (used.changes !== 1) {
            throw new ApiRequestError(
                409,
                'membership_code_already_used',
                '兑换码已被使用'
            );
        }

        upsertUserMembership(
            {
                userId,
                groupId: row.group_id,
                startsAt,
                expiresAt,
                actorUserId: userId,
                source: 'redemption_code',
                allowUnassignable: true
            },
            now
        );
        durationDays = row.duration_days;
        groupId = row.group_id;
    });
    redeem();

    const memberships = getAuthMembershipsSnapshot(userId, now);
    const membership = memberships.items.find(
        (item) => item.groupId === groupId
    );
    if (!membership) {
        throw new Error('Redeemed membership missing from refreshed snapshot');
    }

    return {
        code: formatMembershipCode(code),
        redeemedAt: now,
        durationDays,
        membership,
        memberships
    };
}
