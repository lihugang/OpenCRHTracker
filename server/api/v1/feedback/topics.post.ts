import { defineEventHandler, readBody } from 'h3';
import { postFeedbackTopics } from '~/server/domain/feedback';
import {
    isValidFeedbackCategory,
    isValidFeedbackVisibility
} from '~/server/services/feedbackStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import type {
    FeedbackPrimaryType,
    FeedbackSecondaryType,
    FeedbackVisibility
} from '~/types/feedback';

interface CreateFeedbackTopicBody {
    primaryType?: unknown;
    secondaryType?: unknown;
    visibility?: unknown;
    body?: unknown;
}

export default defineEventHandler(async (event) => {
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

            return postFeedbackTopics(identity, {
                primaryType: body.primaryType as FeedbackPrimaryType,
                secondaryType: body.secondaryType as FeedbackSecondaryType,
                visibility: body.visibility as FeedbackVisibility,
                body: typeof body.body === 'string' ? body.body : ''
            });
        }
    );
});
