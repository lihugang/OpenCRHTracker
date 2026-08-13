import { defineEventHandler, getQuery } from 'h3';
import {
    getFeedbackTopics
} from '~/server/domain/feedback';
import {
    isValidFeedbackCategory,
    isValidFeedbackPrimaryType,
    isValidFeedbackSecondaryType,
    isValidFeedbackStatus,
    parseFeedbackTopicCursor
} from '~/server/services/feedbackStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import parseLimit from '~/server/utils/api/query/parseLimit';
import type {
    FeedbackPrimaryType,
    FeedbackSecondaryType,
    FeedbackStatus
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

            return getFeedbackTopics(identity, {
                view: rawView as 'public' | 'mine' | 'all',
                primaryType: rawPrimaryType as FeedbackPrimaryType | '',
                secondaryType: rawSecondaryType as FeedbackSecondaryType | '',
                status: rawStatus as FeedbackStatus | '',
                cursor,
                limit: parseLimit(event)
            });
        }
    );
});
