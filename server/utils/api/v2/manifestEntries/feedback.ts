import { defineV2Operation } from '~/server/utils/api/v2/V2Types';
import {
    DeleteFeedbackTopicRequestSchema,
    DeleteFeedbackTopicDataSchema,
    DeleteFeedbackTopicResponseSchema,
    GetFeedbackTopicRequestSchema,
    GetFeedbackTopicDataSchema,
    GetFeedbackTopicResponseSchema,
    GetFeedbackTopicsRequestSchema,
    GetFeedbackTopicsDataSchema,
    GetFeedbackTopicsResponseSchema,
    PatchFeedbackTopicRequestSchema,
    PatchFeedbackTopicDataSchema,
    PatchFeedbackTopicResponseSchema,
    PostFeedbackTopicMessageRequestSchema,
    PostFeedbackTopicMessageDataSchema,
    PostFeedbackTopicMessageResponseSchema,
    PostFeedbackTopicsRequestSchema,
    PostFeedbackTopicsDataSchema,
    PostFeedbackTopicsResponseSchema
} from '#shared/generated/proto/opencrh/v2/feedback_pb';
import {
    deleteFeedbackTopicV2Adapter,
    getFeedbackTopicV2Adapter,
    getFeedbackTopicsV2Adapter,
    patchFeedbackTopicV2Adapter,
    postFeedbackTopicMessageV2Adapter,
    postFeedbackTopicsV2Adapter
} from '~/server/utils/api/v2/adapters/feedback';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';

export const FEEDBACK_MANIFEST_ENTRIES = {
    GetFeedbackTopics: defineV2Operation({
        operationName: 'GetFeedbackTopics',
        method: 'GET',
        pathTemplate: '/api/v2/feedback/topics',
        requestSchema: GetFeedbackTopicsRequestSchema,
        dataSchema: GetFeedbackTopicsDataSchema,
        responseSchema: GetFeedbackTopicsResponseSchema,
        requiredScopes: [],
        cors: true,
        cost: { kind: 'none' },
        bodyMode: 'none',
        handler: getFeedbackTopicsV2Adapter
    }),
    PostFeedbackTopics: defineV2Operation({
        operationName: 'PostFeedbackTopics',
        method: 'POST',
        pathTemplate: '/api/v2/feedback/topics',
        requestSchema: PostFeedbackTopicsRequestSchema,
        dataSchema: PostFeedbackTopicsDataSchema,
        responseSchema: PostFeedbackTopicsResponseSchema,
        requiredScopes: [API_SCOPES.feedback.create],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'optional',
        handler: postFeedbackTopicsV2Adapter
    }),
    GetFeedbackTopic: defineV2Operation({
        operationName: 'GetFeedbackTopic',
        method: 'GET',
        pathTemplate: '/api/v2/feedback/topics/:id',
        requestSchema: GetFeedbackTopicRequestSchema,
        dataSchema: GetFeedbackTopicDataSchema,
        responseSchema: GetFeedbackTopicResponseSchema,
        requiredScopes: [],
        cors: true,
        cost: { kind: 'none' },
        bodyMode: 'none',
        handler: getFeedbackTopicV2Adapter
    }),
    PatchFeedbackTopic: defineV2Operation({
        operationName: 'PatchFeedbackTopic',
        method: 'PATCH',
        pathTemplate: '/api/v2/feedback/topics/:id',
        requestSchema: PatchFeedbackTopicRequestSchema,
        dataSchema: PatchFeedbackTopicDataSchema,
        responseSchema: PatchFeedbackTopicResponseSchema,
        requiredScopes: [],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'optional',
        handler: patchFeedbackTopicV2Adapter
    }),
    DeleteFeedbackTopic: defineV2Operation({
        operationName: 'DeleteFeedbackTopic',
        method: 'DELETE',
        pathTemplate: '/api/v2/feedback/topics/:id',
        requestSchema: DeleteFeedbackTopicRequestSchema,
        dataSchema: DeleteFeedbackTopicDataSchema,
        responseSchema: DeleteFeedbackTopicResponseSchema,
        requiredScopes: [],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'none',
        handler: deleteFeedbackTopicV2Adapter
    }),
    PostFeedbackTopicMessage: defineV2Operation({
        operationName: 'PostFeedbackTopicMessage',
        method: 'POST',
        pathTemplate: '/api/v2/feedback/topics/:id/messages',
        requestSchema: PostFeedbackTopicMessageRequestSchema,
        dataSchema: PostFeedbackTopicMessageDataSchema,
        responseSchema: PostFeedbackTopicMessageResponseSchema,
        requiredScopes: [],
        cors: false,
        cost: { kind: 'none' },
        bodyMode: 'optional',
        handler: postFeedbackTopicMessageV2Adapter
    })
} as const;
