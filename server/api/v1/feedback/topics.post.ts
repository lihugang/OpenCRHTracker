import { defineEventHandler, readBody } from 'h3';
import {
    createFeedbackTopic,
    isValidFeedbackCategory,
    isValidFeedbackVisibility
} from '~/server/services/feedbackStore';
import { autoSubscribeFeedbackTopic } from '~/server/services/eventNotificationService';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import useConfig from '~/server/config';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import { ensureFeedbackString } from '~/server/utils/feedback/request';
import type {
    CreateFeedbackTopicResponse,
    FeedbackPrimaryType,
    FeedbackSecondaryType,
    FeedbackStatus,
    FeedbackVisibility
} from '~/types/feedback';
import { buildFeedbackAutoTitle } from '~/utils/feedback/topic';

interface CreateFeedbackTopicBody {
    primaryType?: unknown;
    secondaryType?: unknown;
    visibility?: unknown;
    body?: unknown;
}

export default defineEventHandler(async (event) => {
    const config = useConfig();
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.feedback.create]
        },
        async ({ identity }) => {
            const body =
                (await readBody<CreateFeedbackTopicBody | null>(event)) ?? {};

            ensure(
                typeof body === 'object' &&
                    body !== null &&
                    !Array.isArray(body),
                400,
                'invalid_param',
                '请求体必须是 JSON 对象'
            );

            ensure(
                typeof body.primaryType === 'string' &&
                    typeof body.secondaryType === 'string' &&
                    isValidFeedbackCategory(
                        body.primaryType,
                        body.secondaryType
                    ),
                400,
                'invalid_param',
                '反馈分类无效'
            );
            ensure(
                typeof body.visibility === 'string' &&
                    isValidFeedbackVisibility(body.visibility),
                400,
                'invalid_param',
                '反馈可见性无效'
            );

            const primaryType = body.primaryType as FeedbackPrimaryType;
            const secondaryType = body.secondaryType as FeedbackSecondaryType;
            const content = ensureFeedbackString(
                body.body,
                'body',
                config.api.feedback.validation.createBody.minLength,
                config.api.feedback.validation.createBody.maxLength
            );
            const isSecurityIssue =
                primaryType === 'website' && secondaryType === 'security';
            const requestedVisibility = isSecurityIssue
                ? 'private'
                : (body.visibility as FeedbackVisibility);

            ensure(
                identity.type === 'user' || requestedVisibility === 'public',
                403,
                'forbidden_scope',
                isSecurityIssue
                    ? '安全问题反馈需要登录后提交'
                    : '游客仅可提交公开反馈'
            );

            const title = buildFeedbackAutoTitle(primaryType, secondaryType);
            const now = getNowSeconds();
            const topicId = createFeedbackTopic({
                creatorUserId: identity.type === 'user' ? identity.id : null,
                creatorType: identity.type === 'user' ? 'user' : 'guest',
                visibility: requestedVisibility,
                primaryType,
                secondaryType,
                status: 'pending' satisfies FeedbackStatus,
                title,
                titleMode: 'auto',
                body: content,
                now
            });

            if (identity.type === 'user') {
                autoSubscribeFeedbackTopic(identity.id, topicId);
            }

            return {
                id: topicId,
                title
            } satisfies CreateFeedbackTopicResponse;
        }
    );
});
