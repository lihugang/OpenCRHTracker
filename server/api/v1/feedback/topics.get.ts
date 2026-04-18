import { defineEventHandler, getQuery } from 'h3';
import {
    isValidFeedbackCategory,
    isValidFeedbackPrimaryType,
    isValidFeedbackSecondaryType,
    isValidFeedbackStatus,
    listAllFeedbackTopics,
    listMyFeedbackTopics,
    listPublicFeedbackTopics,
    parseFeedbackTopicCursor
} from '~/server/services/feedbackStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import parseLimit from '~/server/utils/api/query/parseLimit';
import {
    canManageFeedback,
    canReadFeedback
} from '~/server/utils/feedback/permissions';
import type {
    FeedbackPrimaryType,
    FeedbackSecondaryType,
    FeedbackStatus,
    FeedbackTopicListResponse
} from '~/types/feedback';

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            cors: true
        },
        async ({ identity }) => {
            const query = getQuery(event);
            const rawView =
                typeof query.view === 'string' ? query.view : 'public';
            const rawPrimaryType =
                typeof query.primaryType === 'string'
                    ? query.primaryType.trim()
                    : '';
            const rawSecondaryType =
                typeof query.secondaryType === 'string'
                    ? query.secondaryType.trim()
                    : '';
            const rawStatus =
                typeof query.status === 'string' ? query.status.trim() : '';
            const rawCursor =
                typeof query.cursor === 'string' ? query.cursor.trim() : '';

            ensure(
                rawView === 'public' || rawView === 'mine' || rawView === 'all',
                400,
                'invalid_param',
                'view 只能是 public、mine 或 all'
            );
            ensure(
                rawPrimaryType === '' ||
                    isValidFeedbackPrimaryType(rawPrimaryType),
                400,
                'invalid_param',
                'primaryType 无效'
            );
            ensure(
                rawSecondaryType === '' ||
                    isValidFeedbackSecondaryType(rawSecondaryType),
                400,
                'invalid_param',
                'secondaryType 无效'
            );
            ensure(
                rawStatus === '' || isValidFeedbackStatus(rawStatus),
                400,
                'invalid_param',
                'status 无效'
            );
            ensure(
                rawPrimaryType === '' ||
                    rawSecondaryType === '' ||
                    isValidFeedbackCategory(rawPrimaryType, rawSecondaryType),
                400,
                'invalid_param',
                '反馈分类无效'
            );

            const cursor = parseFeedbackTopicCursor(rawCursor);
            ensure(
                rawCursor === '' || cursor !== null,
                400,
                'invalid_param',
                'cursor 无效'
            );

            const limit = parseLimit(event);
            const filters = {
                primaryType: rawPrimaryType as FeedbackPrimaryType | '',
                secondaryType: rawSecondaryType as FeedbackSecondaryType | '',
                status: rawStatus as FeedbackStatus | ''
            };

            if (rawView === 'all') {
                ensure(
                    canManageFeedback(identity),
                    403,
                    'forbidden_scope',
                    '当前身份无法查看全部反馈'
                );

                const result = listAllFeedbackTopics(filters, cursor, limit);

                return {
                    view: 'all',
                    ...filters,
                    limit,
                    nextCursor: result.nextCursor,
                    items: result.items
                } satisfies FeedbackTopicListResponse;
            }

            ensure(
                canReadFeedback(identity),
                403,
                'forbidden_scope',
                '当前身份无法查看反馈'
            );

            if (rawView === 'mine') {
                ensure(
                    identity.type === 'user',
                    403,
                    'forbidden_scope',
                    '当前身份无法查看我的反馈'
                );

                const result = listMyFeedbackTopics(
                    identity.id,
                    filters,
                    cursor,
                    limit
                );

                return {
                    view: 'mine',
                    ...filters,
                    limit,
                    nextCursor: result.nextCursor,
                    items: result.items
                } satisfies FeedbackTopicListResponse;
            }

            const result = listPublicFeedbackTopics(filters, cursor, limit);

            return {
                view: 'public',
                ...filters,
                limit,
                nextCursor: result.nextCursor,
                items: result.items
            } satisfies FeedbackTopicListResponse;
        }
    );
});
