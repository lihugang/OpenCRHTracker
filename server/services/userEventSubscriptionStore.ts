import '~/server/libs/database/users';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import { useUsersDatabase } from '~/server/libs/database/users';
import useConfig from '~/server/config';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import type {
    NotificationTarget,
    NotificationTargetType
} from '~/types/notifications';
import { normalizeNotificationTarget } from '~/utils/notifications/target';

interface UserEventSubscriptionRow {
    user_id: string;
    target_type: NotificationTargetType;
    target_id: string;
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

export interface UserEventSubscriptionItem extends NotificationTarget {
    userId: string;
    createdAt: number;
    updatedAt: number;
}

function mapUserEventSubscriptionRow(
    row: UserEventSubscriptionRow
): UserEventSubscriptionItem {
    return {
        userId: row.user_id,
        targetType: row.target_type,
        targetId: row.target_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function getUserEventSubscriptionsByUserId(userId: string) {
    return userEventSubscriptionStatements
        .all<UserEventSubscriptionRow>(
            'selectUserEventSubscriptionsByUserId',
            userId
        )
        .map(mapUserEventSubscriptionRow);
}

export function listUserEventSubscriptions(userId: string) {
    return getUserEventSubscriptionsByUserId(userId);
}

export function listUserIdsSubscribedToTarget(target: NotificationTarget) {
    const normalizedTarget = normalizeNotificationTarget(target);
    if (!normalizedTarget) {
        return [];
    }

    return userEventSubscriptionStatements
        .all<UserEventSubscriptionRow>(
            'selectUserEventSubscriptionsByTarget',
            normalizedTarget.targetType,
            normalizedTarget.targetId
        )
        .map((row) => row.user_id);
}

export function upsertUserEventSubscription(
    userId: string,
    target: NotificationTarget
) {
    const normalizedTarget = normalizeNotificationTarget(target);
    if (!normalizedTarget) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            '订阅目标无效'
        );
    }

    const maxEntries = useConfig().user.pushSubscriptions.maxEventSubscriptions;
    const now = getNowSeconds();
    const transaction = useUsersDatabase().transaction(() => {
        const currentItems = getUserEventSubscriptionsByUserId(userId);
        const exists = currentItems.some(
            (item) =>
                item.targetType === normalizedTarget.targetType &&
                item.targetId === normalizedTarget.targetId
        );

        if (!exists && currentItems.length >= maxEntries) {
            throw new ApiRequestError(
                409,
                'event_subscriptions_limit_exceeded',
                '订阅对象数量已达上限，请先取消部分订阅'
            );
        }

        userEventSubscriptionStatements.run(
            'upsertUserEventSubscription',
            userId,
            normalizedTarget.targetType,
            normalizedTarget.targetId,
            now,
            now
        );

        return getUserEventSubscriptionsByUserId(userId);
    });

    return transaction();
}

export function removeUserEventSubscription(
    userId: string,
    target: NotificationTarget
) {
    const normalizedTarget = normalizeNotificationTarget(target);
    if (!normalizedTarget) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            '订阅目标无效'
        );
    }

    const transaction = useUsersDatabase().transaction(() => {
        const result = userEventSubscriptionStatements.run(
            'deleteUserEventSubscription',
            userId,
            normalizedTarget.targetType,
            normalizedTarget.targetId
        );

        if (result.changes === 0) {
            throw new ApiRequestError(404, 'not_found', '未找到对应的订阅对象');
        }

        return getUserEventSubscriptionsByUserId(userId);
    });

    return transaction();
}
