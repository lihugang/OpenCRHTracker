import '~/server/libs/database/users';
import { asEmuId } from '~/server/libs/database/emu';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import { useUsersDatabase } from '~/server/libs/database/users';
import useConfig from '~/server/config';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import type { AuthEventTarget } from '~/server/types/authTargets';
import {
    authEventTargetKey,
    normalizeAuthEventTarget
} from '~/server/utils/auth/eventTargets';

interface UserEventSubscriptionV2Row {
    user_id: string;
    kind: 'train' | 'emu' | 'feedback';
    emu_id: number | null;
    topic_id: number | null;
    train_prefix: string | null;
    train_number: number | null;
    target_key: string;
    created_at: number;
    updated_at: number;
}

type UserEventSubscriptionSqlKey =
    | 'deleteUserEventSubscription'
    | 'selectUserEventSubscriptionsByTarget'
    | 'selectUserEventSubscriptionsByUserId'
    | 'upsertUserEventSubscription';

const userEventSubscriptionSql = importSqlBatch('users/queries') as Record<
    UserEventSubscriptionSqlKey,
    string
>;

const userEventSubscriptionStatements =
    createPreparedSqlStore<UserEventSubscriptionSqlKey>({
        dbName: 'users',
        scope: 'users/queries',
        sql: userEventSubscriptionSql
    });

export type UserEventSubscriptionItem = AuthEventTarget & {
    userId: string;
    createdAt: number;
    updatedAt: number;
};

function mapUserEventSubscriptionRow(
    row: UserEventSubscriptionV2Row
): UserEventSubscriptionItem {
    const base = {
        userId: row.user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };

    if (row.kind === 'train') {
        return {
            kind: 'train',
            trainCode: {
                prefix: row.train_prefix ?? '',
                number: row.train_number ?? 0
            },
            ...base
        };
    }

    if (row.kind === 'emu') {
        return {
            kind: 'emu',
            emuId: asEmuId(row.emu_id ?? 0),
            ...base
        };
    }

    return {
        kind: 'feedback',
        topicId: row.topic_id ?? 0,
        ...base
    };
}

function toSubscriptionRow(
    target: AuthEventTarget,
    now: number
): {
    kind: 'train' | 'emu' | 'feedback';
    emuId: number | null;
    topicId: number | null;
    trainPrefix: string | null;
    trainNumber: number | null;
    targetKey: string;
    createdAt: number;
    updatedAt: number;
} {
    if (target.kind === 'train') {
        return {
            kind: 'train',
            emuId: null,
            topicId: null,
            trainPrefix: target.trainCode.prefix,
            trainNumber: target.trainCode.number,
            targetKey: authEventTargetKey(target),
            createdAt: now,
            updatedAt: now
        };
    }

    if (target.kind === 'emu') {
        return {
            kind: 'emu',
            emuId: target.emuId,
            topicId: null,
            trainPrefix: null,
            trainNumber: null,
            targetKey: authEventTargetKey(target),
            createdAt: now,
            updatedAt: now
        };
    }

    return {
        kind: 'feedback',
        emuId: null,
        topicId: target.topicId,
        trainPrefix: null,
        trainNumber: null,
        targetKey: authEventTargetKey(target),
        createdAt: now,
        updatedAt: now
    };
}

function getUserEventSubscriptionsByUserId(userId: string) {
    return userEventSubscriptionStatements
        .all<UserEventSubscriptionV2Row>(
            'selectUserEventSubscriptionsByUserId',
            userId
        )
        .map(mapUserEventSubscriptionRow);
}

export function listUserEventSubscriptions(userId: string) {
    return getUserEventSubscriptionsByUserId(userId);
}

export function listUserIdsSubscribedToTarget(target: AuthEventTarget) {
    const normalizedTarget = normalizeAuthEventTarget(target);
    if (!normalizedTarget) {
        return [];
    }

    return userEventSubscriptionStatements
        .all<{
            user_id: string;
        }>(
            'selectUserEventSubscriptionsByTarget',
            normalizedTarget.kind,
            authEventTargetKey(normalizedTarget)
        )
        .map((row) => row.user_id);
}

export function upsertUserEventSubscription(
    userId: string,
    target: AuthEventTarget
) {
    const normalizedTarget = normalizeAuthEventTarget(target);
    if (!normalizedTarget) {
        throw new ApiRequestError(400, 'invalid_param', '订阅目标无效');
    }

    const maxEntries = useConfig().user.pushSubscriptions.maxEventSubscriptions;
    const now = getNowSeconds();
    const transaction = useUsersDatabase().transaction(() => {
        const currentItems = getUserEventSubscriptionsByUserId(userId);
        const targetKey = authEventTargetKey(normalizedTarget);
        const exists = currentItems.some(
            (item) =>
                item.kind === normalizedTarget.kind &&
                authEventTargetKey(item) === targetKey
        );

        if (!exists && currentItems.length >= maxEntries) {
            throw new ApiRequestError(
                409,
                'event_subscriptions_limit_exceeded',
                '订阅对象数量已达上限，请先取消部分订阅'
            );
        }

        const row = toSubscriptionRow(normalizedTarget, now);
        userEventSubscriptionStatements.run(
            'upsertUserEventSubscription',
            userId,
            row.kind,
            row.emuId,
            row.topicId,
            row.trainPrefix,
            row.trainNumber,
            row.targetKey,
            now,
            now
        );

        return getUserEventSubscriptionsByUserId(userId);
    });

    return transaction();
}

export function removeUserEventSubscription(
    userId: string,
    target: AuthEventTarget
) {
    const normalizedTarget = normalizeAuthEventTarget(target);
    if (!normalizedTarget) {
        throw new ApiRequestError(400, 'invalid_param', '订阅目标无效');
    }

    const transaction = useUsersDatabase().transaction(() => {
        const result = userEventSubscriptionStatements.run(
            'deleteUserEventSubscription',
            userId,
            normalizedTarget.kind,
            authEventTargetKey(normalizedTarget)
        );

        if (result.changes === 0) {
            throw new ApiRequestError(404, 'not_found', '未找到对应的订阅对象');
        }

        return getUserEventSubscriptionsByUserId(userId);
    });

    return transaction();
}
