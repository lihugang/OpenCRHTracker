import { getHeader, type H3Event } from 'h3';
import useConfig from '~/server/config';
import {
    ensureTaskDatabaseSchema,
    useTaskDatabase
} from '~/server/libs/database/task';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import getLogger from '~/server/libs/log4js';
import {
    getUserByUsername,
    updateUserBanState
} from '~/server/services/authStore';
import {
    enqueueTask,
    listPendingTasksByExecutor
} from '~/server/services/taskQueue';
import getClientIp from '~/server/utils/api/quota/getClientIp';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import type {
    AdminAddQqBanListResponse,
    AdminClearUserRiskResponse,
    AdminQqBanListItem,
    AdminRemoveQqBanListResponse,
    AdminUpdateUserBanStateResponse,
    AdminUserBanAction,
    AdminUserBanActionItem,
    AdminUserBanActionSource,
    AdminUserBanActionStatus,
    AdminUserRiskCaseItem,
    AdminUserRiskCaseStatus,
    AdminUserSecurityResponse
} from '~/types/admin';

export const USER_BAN_TASK_EXECUTOR = 'ban_user_account';
export const USER_RISK_TASK_EXECUTOR = 'process_user_risk_case';

const logger = getLogger('user-ban-security');
const MAX_IP_ADDRESS_LENGTH = 128;
const MAX_USER_AGENT_LENGTH = 1024;
const RISK_QQ_BAN_ACTOR = 'system:risk-control';

type UserBanSecuritySqlKey =
    | 'activateQqBanEntry'
    | 'activateUserRiskCase'
    | 'claimUserRiskCaseQq'
    | 'cleanupExpiredUserBanFingerprints'
    | 'clearUserRiskCase'
    | 'completeUserRiskCaseEscalation'
    | 'deactivateQqBanEntry'
    | 'failUserRiskCase'
    | 'insertUserBanAction'
    | 'insertUserRiskCase'
    | 'resetFailedUserBanAction'
    | 'retryUserRiskCase'
    | 'selectActiveQqBanEntries'
    | 'selectActiveUserBanFingerprintExemptions'
    | 'selectActiveUserBanFingerprints'
    | 'selectActiveUserBanFingerprintsByUser'
    | 'selectActiveUserRiskFingerprintExemptions'
    | 'selectAllUserBanActions'
    | 'selectAllUserRiskCases'
    | 'selectOpenUserRiskCaseByUser'
    | 'selectPendingUserBanActionByUser'
    | 'selectPendingUserBanActions'
    | 'selectPendingUserRiskCases'
    | 'selectRecentSkippedUserBanAction'
    | 'selectUserBanActionById'
    | 'selectUserBanFingerprintByIdentity'
    | 'selectUserRiskCaseById'
    | 'setUserRiskCaseBanAction'
    | 'updateUserBanActionCompleted'
    | 'updateUserBanActionFailed'
    | 'updateUserBanActionSkipped'
    | 'upsertUserBanFingerprint'
    | 'upsertUserBanFingerprintExemption'
    | 'upsertUserRiskFingerprintExemption';

interface QqBanListRow {
    qq_number: string;
    added_at: number;
    added_by: string;
}

interface UserBanActionRow {
    id: number;
    user_id: string;
    action: AdminUserBanAction;
    status: AdminUserBanActionStatus;
    source: AdminUserBanActionSource;
    reason: string;
    actor_user_id: string | null;
    qq_number: string | null;
    ip_address: string | null;
    user_agent: string | null;
    matched_action_id: number | null;
    changed: 0 | 1 | null;
    requested_at: number;
    completed_at: number | null;
    error_message: string | null;
}

interface UserBanFingerprintRow {
    id: number;
    ip_address: string;
    user_agent: string;
    first_action_id: number;
    latest_action_id: number;
    last_banned_at: number;
    expires_at: number;
}

interface UserBanFingerprintExemptionRow {
    user_id: string;
    fingerprint_id: number;
    expires_at: number;
}

interface UserRiskCaseRow {
    id: number;
    user_id: string;
    status: AdminUserRiskCaseStatus;
    fingerprint_id: number | null;
    matched_action_id: number;
    ip_address: string;
    user_agent: string;
    qq_number: string | null;
    ban_action_id: number | null;
    detected_at: number;
    updated_at: number;
    escalated_at: number | null;
    cleared_at: number | null;
    cleared_by: string | null;
    error_message: string | null;
}

interface ClientBanIdentity {
    ipAddress: string | null;
    userAgent: string | null;
}

interface CreateUserBanActionInput extends ClientBanIdentity {
    userId: string;
    action: AdminUserBanAction;
    status: AdminUserBanActionStatus;
    source: AdminUserBanActionSource;
    reason: string;
    actorUserId?: string | null;
    qqNumber?: string | null;
    matchedActionId?: number | null;
    changed?: boolean | null;
    requestedAt: number;
    completedAt?: number | null;
    errorMessage?: string | null;
}

interface RequestAutomaticBanInput extends ClientBanIdentity {
    userId: string;
    source: Exclude<AdminUserBanActionSource, 'admin_manual'>;
    reason: string;
    qqNumber?: string | null;
    matchedActionId?: number | null;
}

interface FingerprintMatch {
    identity: Required<ClientBanIdentity>;
    fingerprint: UserBanFingerprintRow;
}

const securitySql = importSqlBatch('tasks/queries') as Record<
    UserBanSecuritySqlKey,
    string
>;
const securityStatements = createPreparedSqlStore<UserBanSecuritySqlKey>({
    dbName: 'task',
    scope: 'user-ban-security',
    sql: securitySql
});

const qqBanListCache = new Map<string, QqBanListRow>();
const fingerprintCache = new Map<string, UserBanFingerprintRow>();
const exemptionCache = new Map<number, Map<string, number>>();
let initialized = false;

function fingerprintKey(ipAddress: string, userAgent: string) {
    return JSON.stringify([ipAddress, userAgent]);
}

function isAdminUser(userId: string) {
    return useConfig().user.adminUserIds.includes(userId);
}

function normalizeClientIdentity(event: H3Event): ClientBanIdentity {
    const rawIpAddress = getClientIp(event).trim();
    const rawUserAgent = (getHeader(event, 'user-agent') ?? '').trim();

    const ipAddress =
        rawIpAddress.length > 0 &&
        rawIpAddress !== 'unknown' &&
        rawIpAddress.length <= MAX_IP_ADDRESS_LENGTH
            ? rawIpAddress
            : null;
    const userAgent =
        rawUserAgent.length > 0
            ? rawUserAgent.slice(0, MAX_USER_AGENT_LENGTH)
            : null;

    return {
        ipAddress,
        userAgent
    };
}

function toAdminQqBanListItem(row: QqBanListRow): AdminQqBanListItem {
    return {
        qqNumber: row.qq_number,
        addedAt: row.added_at,
        addedBy: row.added_by
    };
}

function toAdminUserBanActionItem(
    row: UserBanActionRow
): AdminUserBanActionItem {
    return {
        id: row.id,
        userId: row.user_id,
        action: row.action,
        status: row.status,
        source: row.source,
        reason: row.reason,
        actorUserId: row.actor_user_id,
        qqNumber: row.qq_number,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        matchedActionId: row.matched_action_id,
        changed: row.changed === null ? null : row.changed === 1,
        requestedAt: row.requested_at,
        completedAt: row.completed_at,
        errorMessage: row.error_message
    };
}

function toAdminUserRiskCaseItem(
    row: UserRiskCaseRow
): AdminUserRiskCaseItem {
    return {
        id: row.id,
        userId: row.user_id,
        status: row.status,
        fingerprintId: row.fingerprint_id,
        matchedActionId: row.matched_action_id,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        qqNumber: row.qq_number,
        banActionId: row.ban_action_id,
        detectedAt: row.detected_at,
        updatedAt: row.updated_at,
        escalatedAt: row.escalated_at,
        clearedAt: row.cleared_at,
        clearedBy: row.cleared_by,
        errorMessage: row.error_message
    };
}

function createUserBanAction(input: CreateUserBanActionInput) {
    const result = securityStatements.run(
        'insertUserBanAction',
        input.userId,
        input.action,
        input.status,
        input.source,
        input.reason,
        input.actorUserId ?? null,
        input.qqNumber ?? null,
        input.ipAddress,
        input.userAgent,
        input.matchedActionId ?? null,
        input.changed === null || input.changed === undefined
            ? null
            : input.changed
              ? 1
              : 0,
        input.requestedAt,
        input.completedAt ?? null,
        input.errorMessage ?? null
    );

    return Number(result.lastInsertRowid);
}

function formatError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 1024);
}

function refreshSecurityCaches(now: number) {
    securityStatements.run('cleanupExpiredUserBanFingerprints', now);

    qqBanListCache.clear();
    for (const row of securityStatements.all<QqBanListRow>(
        'selectActiveQqBanEntries'
    )) {
        qqBanListCache.set(row.qq_number, row);
    }

    fingerprintCache.clear();
    for (const row of securityStatements.all<UserBanFingerprintRow>(
        'selectActiveUserBanFingerprints',
        now
    )) {
        fingerprintCache.set(
            fingerprintKey(row.ip_address, row.user_agent),
            row
        );
    }

    exemptionCache.clear();
    for (const row of securityStatements.all<UserBanFingerprintExemptionRow>(
        'selectActiveUserBanFingerprintExemptions',
        now
    )) {
        const exemptions =
            exemptionCache.get(row.fingerprint_id) ?? new Map<string, number>();
        exemptions.set(row.user_id, row.expires_at);
        exemptionCache.set(row.fingerprint_id, exemptions);
    }

    for (const row of securityStatements.all<UserBanFingerprintExemptionRow>(
        'selectActiveUserRiskFingerprintExemptions',
        now
    )) {
        const exemptions =
            exemptionCache.get(row.fingerprint_id) ?? new Map<string, number>();
        exemptions.set(
            row.user_id,
            Math.max(exemptions.get(row.user_id) ?? 0, row.expires_at)
        );
        exemptionCache.set(row.fingerprint_id, exemptions);
    }
}

function ensureInitialized() {
    if (initialized) {
        return;
    }

    ensureTaskDatabaseSchema();
    refreshSecurityCaches(getNowSeconds());
    initialized = true;
}

function getOpenUserRiskCase(userId: string) {
    return securityStatements.get<UserRiskCaseRow>(
        'selectOpenUserRiskCaseByUser',
        userId
    );
}

function getUserRiskCaseById(riskCaseId: number) {
    return securityStatements.get<UserRiskCaseRow>(
        'selectUserRiskCaseById',
        riskCaseId
    );
}

function findFingerprintMatch(
    userId: string,
    event: H3Event
): FingerprintMatch | null {
    const now = getNowSeconds();
    const identity = normalizeClientIdentity(event);
    if (identity.ipAddress === null || identity.userAgent === null) {
        return null;
    }

    const key = fingerprintKey(identity.ipAddress, identity.userAgent);
    const fingerprint = fingerprintCache.get(key);
    if (!fingerprint) {
        return null;
    }
    if (fingerprint.expires_at <= now) {
        fingerprintCache.delete(key);
        exemptionCache.delete(fingerprint.id);
        return null;
    }

    const exemptionExpiresAt = exemptionCache.get(fingerprint.id)?.get(userId);
    if (exemptionExpiresAt && exemptionExpiresAt > now) {
        return null;
    }

    return {
        identity: {
            ipAddress: identity.ipAddress,
            userAgent: identity.userAgent
        },
        fingerprint
    };
}

function hasPendingRiskCaseTask(riskCaseId: number) {
    for (const task of listPendingTasksByExecutor(USER_RISK_TASK_EXECUTOR)) {
        try {
            const value = JSON.parse(task.arguments) as {
                riskCaseId?: unknown;
            };
            if (value.riskCaseId === riskCaseId) {
                return true;
            }
        } catch {
            continue;
        }
    }

    return false;
}

function ensureRiskCaseTaskQueued(riskCaseId: number) {
    if (hasPendingRiskCaseTask(riskCaseId)) {
        return false;
    }

    enqueueTask(
        USER_RISK_TASK_EXECUTOR,
        { riskCaseId },
        getNowSeconds()
    );
    return true;
}

function createOrGetUserRiskCase(
    userId: string,
    match: FingerprintMatch
) {
    const existing = getOpenUserRiskCase(userId);
    if (existing) {
        if (existing.status === 'failed' && existing.qq_number === null) {
            securityStatements.run(
                'retryUserRiskCase',
                getNowSeconds(),
                existing.id
            );
            return getUserRiskCaseById(existing.id) ?? existing;
        }
        return existing;
    }

    const now = getNowSeconds();
    try {
        const result = securityStatements.run(
            'insertUserRiskCase',
            userId,
            match.fingerprint.id,
            match.fingerprint.latest_action_id,
            match.identity.ipAddress,
            match.identity.userAgent,
            now,
            now
        );
        const created = getUserRiskCaseById(Number(result.lastInsertRowid));
        if (!created) {
            throw new Error('Created user risk case was not found');
        }
        return created;
    } catch (error) {
        const concurrent = getOpenUserRiskCase(userId);
        if (concurrent) {
            return concurrent;
        }
        throw error;
    }
}

function findPendingAutomaticBan(userId: string) {
    return securityStatements.get<UserBanActionRow>(
        'selectPendingUserBanActionByUser',
        userId
    );
}

function enqueueBanAction(actionId: number) {
    return enqueueTask(USER_BAN_TASK_EXECUTOR, { actionId }, getNowSeconds());
}

function recordSkippedAutomaticBan(input: RequestAutomaticBanInput) {
    const now = getNowSeconds();
    const cutoff = now - useConfig().user.qqBinding.banCorrelationWindowSeconds;
    const existing = securityStatements.get<{ id: number }>(
        'selectRecentSkippedUserBanAction',
        input.userId,
        input.source,
        input.qqNumber ?? null,
        input.ipAddress,
        input.userAgent,
        cutoff
    );
    if (existing) {
        return existing.id;
    }

    return createUserBanAction({
        ...input,
        action: 'ban',
        status: 'skipped',
        reason: '管理员账户自动封禁豁免',
        changed: false,
        requestedAt: now,
        completedAt: now
    });
}

function requestAutomaticBan(input: RequestAutomaticBanInput) {
    ensureInitialized();

    if (isAdminUser(input.userId)) {
        return {
            actionId: recordSkippedAutomaticBan(input),
            queued: false,
            skipped: true
        };
    }

    const existing = findPendingAutomaticBan(input.userId);
    if (existing) {
        return {
            actionId: existing.id,
            queued: false,
            skipped: false
        };
    }

    const requestedAt = getNowSeconds();
    let actionId: number;
    try {
        actionId = createUserBanAction({
            ...input,
            action: 'ban',
            status: 'pending',
            requestedAt
        });
    } catch (error) {
        const pending = findPendingAutomaticBan(input.userId);
        if (pending) {
            return {
                actionId: pending.id,
                queued: false,
                skipped: false
            };
        }
        throw error;
    }

    try {
        enqueueBanAction(actionId);
    } catch (error) {
        securityStatements.run(
            'updateUserBanActionFailed',
            getNowSeconds(),
            formatError(error),
            actionId
        );
        throw error;
    }

    return {
        actionId,
        queued: true,
        skipped: false
    };
}

function updateFingerprintCache(row: UserBanFingerprintRow | undefined) {
    if (!row) {
        return;
    }
    fingerprintCache.set(fingerprintKey(row.ip_address, row.user_agent), row);
}

function updateExemptionCache(
    userId: string,
    fingerprintId: number,
    expiresAt: number
) {
    const exemptions =
        exemptionCache.get(fingerprintId) ?? new Map<string, number>();
    exemptions.set(userId, expiresAt);
    exemptionCache.set(fingerprintId, exemptions);
}

function completeUserBanAction(action: UserBanActionRow) {
    const now = getNowSeconds();
    const shouldBan = action.action === 'ban';
    const result = updateUserBanState(action.user_id, shouldBan);
    if (!result) {
        throw new Error(`User not found: ${action.user_id}`);
    }

    const createsFingerprint =
        shouldBan &&
        action.source !== 'admin_manual' &&
        action.ip_address !== null &&
        action.user_agent !== null;
    const fingerprintsForExemption =
        !shouldBan && action.source === 'admin_manual'
            ? securityStatements.all<UserBanFingerprintRow>(
                  'selectActiveUserBanFingerprintsByUser',
                  action.user_id,
                  now
              )
            : [];
    let updatedFingerprint: UserBanFingerprintRow | undefined;

    const complete = useTaskDatabase().transaction(() => {
        securityStatements.run(
            'updateUserBanActionCompleted',
            result.changed ? 1 : 0,
            now,
            action.id
        );

        if (createsFingerprint) {
            const expiresAt =
                now + useConfig().user.qqBinding.banCorrelationWindowSeconds;
            securityStatements.run(
                'upsertUserBanFingerprint',
                action.ip_address,
                action.user_agent,
                action.id,
                action.id,
                now,
                expiresAt
            );
            updatedFingerprint = securityStatements.get<UserBanFingerprintRow>(
                'selectUserBanFingerprintByIdentity',
                action.ip_address,
                action.user_agent
            );
        }

        for (const fingerprint of fingerprintsForExemption) {
            securityStatements.run(
                'upsertUserBanFingerprintExemption',
                action.user_id,
                fingerprint.id,
                action.id,
                now,
                action.actor_user_id ?? 'unknown',
                fingerprint.expires_at
            );
        }
    });

    complete();
    updateFingerprintCache(updatedFingerprint);
    for (const fingerprint of fingerprintsForExemption) {
        updateExemptionCache(
            action.user_id,
            fingerprint.id,
            fingerprint.expires_at
        );
    }

    return result;
}

function executePendingUserBanActionInternal(actionId: number) {
    ensureInitialized();
    const action = securityStatements.get<UserBanActionRow>(
        'selectUserBanActionById',
        actionId
    );
    if (!action || action.status !== 'pending') {
        return null;
    }

    if (action.action === 'ban' && isAdminUser(action.user_id)) {
        securityStatements.run(
            'updateUserBanActionSkipped',
            '管理员账户自动封禁豁免',
            getNowSeconds(),
            action.id
        );
        return null;
    }

    try {
        return completeUserBanAction(action);
    } catch (error) {
        securityStatements.run(
            'updateUserBanActionFailed',
            getNowSeconds(),
            formatError(error),
            action.id
        );
        throw error;
    }
}

function getOrCreateRiskCaseBanAction(riskCase: UserRiskCaseRow) {
    let actionId = riskCase.ban_action_id;
    if (actionId === null) {
        const now = getNowSeconds();
        actionId = createUserBanAction({
            userId: riskCase.user_id,
            action: 'ban',
            status: 'pending',
            source: 'fingerprint_match',
            reason: '风控账户尝试绑定 QQ',
            actorUserId: null,
            qqNumber: riskCase.qq_number,
            ipAddress: riskCase.ip_address,
            userAgent: riskCase.user_agent,
            matchedActionId: riskCase.matched_action_id,
            requestedAt: now
        });
        securityStatements.run(
            'setUserRiskCaseBanAction',
            actionId,
            now,
            riskCase.id
        );
    }

    let action = securityStatements.get<UserBanActionRow>(
        'selectUserBanActionById',
        actionId
    );
    if (!action) {
        throw new Error(`Risk case ban action not found: ${actionId}`);
    }
    if (action.status === 'failed') {
        securityStatements.run('resetFailedUserBanAction', action.id);
        action = securityStatements.get<UserBanActionRow>(
            'selectUserBanActionById',
            action.id
        );
        if (!action) {
            throw new Error(`Reset risk case ban action not found: ${actionId}`);
        }
    }

    return action;
}

function executeUserRiskEscalation(riskCase: UserRiskCaseRow) {
    if (riskCase.qq_number === null) {
        throw new Error(`Risk case ${riskCase.id} has no QQ number`);
    }

    addQqBanListEntry(riskCase.qq_number, RISK_QQ_BAN_ACTOR);
    const action = getOrCreateRiskCaseBanAction(riskCase);
    if (action.status === 'pending') {
        executePendingUserBanActionInternal(action.id);
    } else if (action.status !== 'succeeded' && action.status !== 'skipped') {
        throw new Error(
            `Risk case ban action ${action.id} is not executable: ${action.status}`
        );
    }

    const now = getNowSeconds();
    securityStatements.run(
        'completeUserRiskCaseEscalation',
        now,
        now,
        riskCase.id
    );
}

function executePendingUserRiskCaseInternal(riskCaseId: number) {
    ensureInitialized();
    let riskCase = getUserRiskCaseById(riskCaseId);
    if (!riskCase) {
        return null;
    }

    if (riskCase.status === 'failed') {
        securityStatements.run(
            'retryUserRiskCase',
            getNowSeconds(),
            riskCase.id
        );
        riskCase = getUserRiskCaseById(riskCase.id) ?? riskCase;
    }

    try {
        if (riskCase.status === 'pending') {
            securityStatements.run(
                'activateUserRiskCase',
                getNowSeconds(),
                riskCase.id
            );
            return getUserRiskCaseById(riskCase.id) ?? null;
        }
        if (riskCase.status === 'escalating') {
            executeUserRiskEscalation(riskCase);
            return getUserRiskCaseById(riskCase.id) ?? null;
        }
        return riskCase;
    } catch (error) {
        securityStatements.run(
            'failUserRiskCase',
            getNowSeconds(),
            formatError(error),
            riskCase.id
        );
        throw error;
    }
}

function reconcilePendingUserBanActions() {
    const existingActionIds = new Set<number>();
    for (const task of listPendingTasksByExecutor(USER_BAN_TASK_EXECUTOR)) {
        try {
            const value = JSON.parse(task.arguments) as { actionId?: unknown };
            if (Number.isSafeInteger(value.actionId)) {
                existingActionIds.add(value.actionId as number);
            }
        } catch {
            continue;
        }
    }

    let enqueued = 0;
    for (const action of securityStatements.all<UserBanActionRow>(
        'selectPendingUserBanActions'
    )) {
        if (existingActionIds.has(action.id)) {
            continue;
        }
        enqueueBanAction(action.id);
        enqueued += 1;
    }

    if (enqueued > 0) {
        logger.info(`pending_actions_requeued count=${enqueued}`);
    }
}

function reconcilePendingUserRiskCases() {
    const existingRiskCaseIds = new Set<number>();
    for (const task of listPendingTasksByExecutor(USER_RISK_TASK_EXECUTOR)) {
        try {
            const value = JSON.parse(task.arguments) as {
                riskCaseId?: unknown;
            };
            if (Number.isSafeInteger(value.riskCaseId)) {
                existingRiskCaseIds.add(value.riskCaseId as number);
            }
        } catch {
            continue;
        }
    }

    let enqueued = 0;
    for (const riskCase of securityStatements.all<UserRiskCaseRow>(
        'selectPendingUserRiskCases'
    )) {
        if (existingRiskCaseIds.has(riskCase.id)) {
            continue;
        }
        ensureRiskCaseTaskQueued(riskCase.id);
        enqueued += 1;
    }

    if (enqueued > 0) {
        logger.info(`pending_risk_cases_requeued count=${enqueued}`);
    }
}

export function initializeUserBanSecurityState() {
    ensureInitialized();
    reconcilePendingUserBanActions();
    reconcilePendingUserRiskCases();
}

export function isQqNumberInBanList(qqNumber: string) {
    ensureInitialized();
    return qqBanListCache.has(qqNumber);
}

export function queueQqBanListUserBan(
    userId: string,
    qqNumber: string,
    event: H3Event
) {
    return requestAutomaticBan({
        userId,
        source: 'qq_ban_list',
        reason: '尝试绑定封禁 QQ 号',
        qqNumber,
        matchedActionId: null,
        ...normalizeClientIdentity(event)
    });
}

export function queueFingerprintMatchedUserRisk(
    userId: string,
    event: H3Event
) {
    ensureInitialized();
    const match = findFingerprintMatch(userId, event);
    if (!match) {
        return null;
    }

    if (isAdminUser(userId)) {
        recordSkippedAutomaticBan({
            userId,
            source: 'fingerprint_match',
            reason: 'IP 和 UA 命中近期封禁记录',
            qqNumber: null,
            matchedActionId: match.fingerprint.latest_action_id,
            ...match.identity
        });
        return null;
    }

    const riskCase = createOrGetUserRiskCase(userId, match);
    if (riskCase.status === 'pending') {
        try {
            ensureRiskCaseTaskQueued(riskCase.id);
        } catch (error) {
            logger.error(
                `queue_user_risk_case_failed riskCaseId=${riskCase.id} userId=${userId} error=${formatError(error)}`
            );
        }
    }

    return toAdminUserRiskCaseItem(riskCase);
}

export function queueRiskQqBindingEscalation(
    userId: string,
    qqNumber: string,
    event: H3Event
) {
    ensureInitialized();
    if (isAdminUser(userId)) {
        return false;
    }

    let riskCase = getOpenUserRiskCase(userId);
    if (!riskCase) {
        const match = findFingerprintMatch(userId, event);
        if (!match) {
            return false;
        }
        riskCase = createOrGetUserRiskCase(userId, match);
    }

    const now = getNowSeconds();
    if (riskCase.qq_number === null) {
        securityStatements.run(
            'claimUserRiskCaseQq',
            qqNumber,
            now,
            riskCase.id
        );
        riskCase = getUserRiskCaseById(riskCase.id) ?? riskCase;
    } else if (riskCase.status === 'failed') {
        securityStatements.run('retryUserRiskCase', now, riskCase.id);
        riskCase = getUserRiskCaseById(riskCase.id) ?? riskCase;
    }

    if (riskCase.qq_number === null) {
        throw new Error(`Risk case ${riskCase.id} did not claim a QQ number`);
    }

    if (riskCase.status === 'pending' || riskCase.status === 'active') {
        securityStatements.run(
            'claimUserRiskCaseQq',
            riskCase.qq_number,
            now,
            riskCase.id
        );
        riskCase = getUserRiskCaseById(riskCase.id) ?? riskCase;
    }

    if (riskCase.status === 'escalating') {
        try {
            ensureRiskCaseTaskQueued(riskCase.id);
        } catch (error) {
            logger.error(
                `queue_user_risk_escalation_failed riskCaseId=${riskCase.id} userId=${userId} error=${formatError(error)}`
            );
        }
    }

    return true;
}

export function executeQueuedUserBanAction(actionId: number) {
    return executePendingUserBanActionInternal(actionId);
}

export function executeQueuedUserRiskCase(riskCaseId: number) {
    return executePendingUserRiskCaseInternal(riskCaseId);
}

function clearUserRiskCaseInternal(
    userId: string,
    actorUserId: string
): AdminClearUserRiskResponse {
    const now = getNowSeconds();
    const riskCase = getOpenUserRiskCase(userId);
    if (!riskCase) {
        return {
            userId,
            riskCaseId: null,
            changed: false,
            exemptionExpiresAt: null,
            clearedAt: now
        };
    }

    const fingerprint = fingerprintCache.get(
        fingerprintKey(riskCase.ip_address, riskCase.user_agent)
    );
    const exemptionExpiresAt =
        fingerprint && fingerprint.expires_at > now
            ? fingerprint.expires_at
            : null;
    let changed = false;

    const clear = useTaskDatabase().transaction(() => {
        if (fingerprint && exemptionExpiresAt !== null) {
            securityStatements.run(
                'upsertUserRiskFingerprintExemption',
                userId,
                fingerprint.id,
                riskCase.id,
                now,
                actorUserId,
                exemptionExpiresAt
            );
        }

        const result = securityStatements.run(
            'clearUserRiskCase',
            now,
            now,
            actorUserId,
            riskCase.id
        );
        changed = result.changes > 0;
    });

    clear();
    if (changed && fingerprint && exemptionExpiresAt !== null) {
        updateExemptionCache(userId, fingerprint.id, exemptionExpiresAt);
    }

    return {
        userId,
        riskCaseId: riskCase.id,
        changed,
        exemptionExpiresAt: changed ? exemptionExpiresAt : null,
        clearedAt: now
    };
}

export function clearUserRiskCase(
    userId: string,
    actorUserId: string
): AdminClearUserRiskResponse {
    ensureInitialized();
    if (!getUserByUsername(userId)) {
        throw new Error(`User not found: ${userId}`);
    }
    if (isAdminUser(userId)) {
        throw new Error(`Admin user cannot have a risk case: ${userId}`);
    }

    return clearUserRiskCaseInternal(userId, actorUserId);
}

export function updateManualUserBanState(
    userId: string,
    banned: boolean,
    actorUserId: string
): AdminUpdateUserBanStateResponse {
    ensureInitialized();
    if (!getUserByUsername(userId)) {
        throw new Error(`User not found: ${userId}`);
    }

    const requestedAt = getNowSeconds();
    const actionId = createUserBanAction({
        userId,
        action: banned ? 'ban' : 'unban',
        status: 'pending',
        source: 'admin_manual',
        reason: banned ? '手动封禁' : '手动解封',
        actorUserId,
        qqNumber: null,
        ipAddress: null,
        userAgent: null,
        matchedActionId: null,
        requestedAt
    });
    const result = executePendingUserBanActionInternal(actionId);
    if (!result) {
        throw new Error(`Manual user ban action was not executed: ${actionId}`);
    }
    if (!banned) {
        clearUserRiskCaseInternal(userId, actorUserId);
    }
    return result;
}

export function getAdminUserSecuritySnapshot(): AdminUserSecurityResponse {
    ensureInitialized();
    const now = getNowSeconds();

    return {
        asOf: now,
        banCorrelationWindowSeconds:
            useConfig().user.qqBinding.banCorrelationWindowSeconds,
        qqBanList: Array.from(qqBanListCache.values())
            .sort((left, right) => right.added_at - left.added_at)
            .map(toAdminQqBanListItem),
        banActions: securityStatements
            .all<UserBanActionRow>('selectAllUserBanActions')
            .map(toAdminUserBanActionItem),
        riskCases: securityStatements
            .all<UserRiskCaseRow>('selectAllUserRiskCases')
            .map(toAdminUserRiskCaseItem)
    };
}

export function addQqBanListEntry(
    qqNumber: string,
    actorUserId: string
): AdminAddQqBanListResponse {
    ensureInitialized();
    const existing = qqBanListCache.get(qqNumber);
    if (existing) {
        return {
            created: false,
            item: toAdminQqBanListItem(existing)
        };
    }

    const now = getNowSeconds();
    securityStatements.run('activateQqBanEntry', qqNumber, now, actorUserId);
    const row: QqBanListRow = {
        qq_number: qqNumber,
        added_at: now,
        added_by: actorUserId
    };
    qqBanListCache.set(qqNumber, row);

    return {
        created: true,
        item: toAdminQqBanListItem(row)
    };
}

export function removeQqBanListEntry(
    qqNumber: string,
    actorUserId: string
): AdminRemoveQqBanListResponse {
    ensureInitialized();
    if (!qqBanListCache.has(qqNumber)) {
        return {
            qqNumber,
            removed: false
        };
    }

    const result = securityStatements.run(
        'deactivateQqBanEntry',
        getNowSeconds(),
        actorUserId,
        qqNumber
    );
    if (result.changes > 0) {
        qqBanListCache.delete(qqNumber);
    }

    return {
        qqNumber,
        removed: result.changes > 0
    };
}
