import { fromJson, toJson } from '@bufbuild/protobuf';
import { StructSchema } from '@bufbuild/protobuf/wkt';
import type {
    DeleteFeedbackTopicData,
    GetFeedbackTopicData,
    GetFeedbackTopicsData,
    PatchFeedbackTopicData,
    PostFeedbackTopicMessageData,
    PostFeedbackTopicsData
} from '#shared/generated/proto/opencrh/v2/feedback_pb';
import {
    DeleteFeedbackTopic,
    GetFeedbackTopic,
    GetFeedbackTopics,
    PatchFeedbackTopic,
    PostFeedbackTopicMessage,
    PostFeedbackTopics
} from '#shared/api/v2/registry/feedback';
import type {
    CreateFeedbackTopicResponse,
    DeleteFeedbackTopicResponse,
    FeedbackMessage,
    FeedbackPrimaryType,
    FeedbackSecondaryType,
    FeedbackStatus,
    FeedbackTitleMode,
    FeedbackTopicAuthorType,
    FeedbackTopicDetail,
    FeedbackTopicListItem,
    FeedbackTopicListResponse,
    FeedbackVisibility,
    ReplyFeedbackMessageResponse,
    UpdateFeedbackTopicResponse
} from '~/types/feedback';
import { protoInt64ToNumber } from '~/utils/api/v2/mappers/numbers';
import { requestV2, type V2RequestInput } from '~/utils/api/v2/transport';
import { requireSuccess } from '~/utils/api/v2/domain/common';

function mapPrimaryType(value: number): FeedbackPrimaryType {
    switch (value) {
        case 1:
            return 'website';
        case 2:
            return 'data';
        case 3:
            return 'api';
        case 4:
            return 'docs';
        default:
            return 'other';
    }
}

function mapSecondaryType(value: number): FeedbackSecondaryType {
    switch (value) {
        case 1:
            return '';
        case 2:
            return 'bug';
        case 3:
            return 'feature';
        case 4:
            return 'security';
        case 6:
            return 'train_missing';
        case 7:
            return 'train_wrong';
        case 8:
            return 'coupling_missing';
        case 9:
            return 'route_wrong';
        case 10:
            return 'allocation_wrong';
        case 11:
            return 'more_quota';
        default:
            return 'other';
    }
}

function mapStatus(value: number): FeedbackStatus {
    switch (value) {
        case 1:
            return 'pending';
        case 2:
            return 'processing';
        case 3:
            return 'submitted_change';
        case 4:
            return 'resolved';
        case 5:
            return 'invalid';
        default:
            return 'pending';
    }
}

function mapVisibility(value: number): FeedbackVisibility {
    return value === 2 ? 'private' : 'public';
}

function mapTitleMode(value: number): FeedbackTitleMode {
    return value === 2 ? 'custom' : 'auto';
}

function mapTopicAuthorType(value: number): FeedbackTopicAuthorType {
    return value === 2 ? 'user' : 'guest';
}

function mapMessageAuthorType(value: number) {
    switch (value) {
        case 1:
            return 'user' as const;
        case 2:
            return 'topicCreator' as const;
        case 3:
            return 'admin' as const;
        case 4:
            return 'system' as const;
        default:
            return 'user' as const;
    }
}

function mapMessage(item: {
    id: number;
    authorType: number;
    authorName: string;
    body: string;
    createdAt: bigint | number;
    meta?: unknown;
}): FeedbackMessage {
    return {
        id: item.id,
        authorType: mapMessageAuthorType(item.authorType),
        authorName: item.authorName,
        body: item.body,
        createdAt: protoInt64ToNumber(item.createdAt) ?? 0,
        meta: item.meta
            ? (toJson(StructSchema, item.meta as never) as Record<
                  string,
                  unknown
              >)
            : {}
    };
}

function mapTopicListItem(item: {
    id: number;
    authorType: number;
    authorName: string;
    visibility: number;
    primaryType: number;
    secondaryType: number;
    status: number;
    title: string;
    titleMode: number;
    body: string;
    replyCount: number;
    createdAt: bigint | number;
    updatedAt: bigint | number;
    lastRepliedAt: bigint | number;
}): FeedbackTopicListItem {
    return {
        id: item.id,
        authorType: mapTopicAuthorType(item.authorType),
        authorName: item.authorName,
        visibility: mapVisibility(item.visibility),
        primaryType: mapPrimaryType(item.primaryType),
        secondaryType: mapSecondaryType(item.secondaryType),
        status: mapStatus(item.status),
        title: item.title,
        titleMode: mapTitleMode(item.titleMode),
        body: item.body,
        replyCount: item.replyCount,
        createdAt: protoInt64ToNumber(item.createdAt) ?? 0,
        updatedAt: protoInt64ToNumber(item.updatedAt) ?? 0,
        lastRepliedAt: protoInt64ToNumber(item.lastRepliedAt) ?? 0
    };
}

function mapTopicList(data: GetFeedbackTopicsData): FeedbackTopicListResponse {
    return {
        view: data.view === 2 ? 'mine' : data.view === 3 ? 'all' : 'public',
        primaryType:
            data.primaryType === 0 ? '' : mapPrimaryType(data.primaryType),
        secondaryType:
            data.secondaryType === 0
                ? ''
                : mapSecondaryType(data.secondaryType),
        status: data.status === 0 ? '' : mapStatus(data.status),
        limit: data.limit,
        nextCursor: data.nextCursor,
        items: data.items.map(mapTopicListItem)
    };
}

function mapTopicDetail(data: GetFeedbackTopicData): FeedbackTopicDetail {
    const topic = data.topic!;
    return {
        ...mapTopicListItem(topic.topic!),
        permissions: {
            canReply: topic.permissions!.canReply,
            canManage: topic.permissions!.canManage,
            isOwner: topic.permissions!.isOwner
        },
        messages: topic.messages.map(mapMessage)
    };
}

function mapCreateTopic(
    data: PostFeedbackTopicsData
): CreateFeedbackTopicResponse {
    return {
        id: data.id,
        title: data.title
    };
}

function mapReplyMessage(
    data: PostFeedbackTopicMessageData
): ReplyFeedbackMessageResponse {
    return {
        topicId: data.topicId,
        messageId: data.messageId
    };
}

function mapUpdateTopic(
    data: PatchFeedbackTopicData
): UpdateFeedbackTopicResponse {
    return {
        id: data.id,
        primaryType: mapPrimaryType(data.primaryType),
        secondaryType: mapSecondaryType(data.secondaryType),
        status: mapStatus(data.status),
        title: data.title,
        titleMode: mapTitleMode(data.titleMode),
        updatedAt: protoInt64ToNumber(data.updatedAt) ?? 0
    };
}

function mapDeleteTopic(
    data: DeleteFeedbackTopicData
): DeleteFeedbackTopicResponse {
    return {
        id: data.id,
        visibility: mapVisibility(data.visibility),
        updatedAt: protoInt64ToNumber(data.updatedAt) ?? 0
    };
}

function toEnumPrimary(value: FeedbackPrimaryType): number {
    switch (value) {
        case 'website':
            return 1;
        case 'data':
            return 2;
        case 'api':
            return 3;
        case 'docs':
            return 4;
        default:
            return 5;
    }
}

function toEnumSecondary(value: FeedbackSecondaryType): number {
    switch (value) {
        case '':
            return 1;
        case 'bug':
            return 2;
        case 'feature':
            return 3;
        case 'security':
            return 4;
        case 'train_missing':
            return 6;
        case 'train_wrong':
            return 7;
        case 'coupling_missing':
            return 8;
        case 'route_wrong':
            return 9;
        case 'allocation_wrong':
            return 10;
        case 'more_quota':
            return 11;
        default:
            return 5;
    }
}

function toEnumStatus(value: FeedbackStatus): number {
    switch (value) {
        case 'pending':
            return 1;
        case 'processing':
            return 2;
        case 'submitted_change':
            return 3;
        case 'resolved':
            return 4;
        case 'invalid':
            return 5;
    }
}

function toEnumVisibility(value: FeedbackVisibility): number {
    return value === 'private' ? 2 : 1;
}

export async function fetchFeedbackTopics(
    input: V2RequestInput,
    signal?: AbortSignal
) {
    const result = await requestV2<
        GetFeedbackTopicsData,
        FeedbackTopicListResponse
    >(GetFeedbackTopics, input, mapTopicList, {
        signal,
        retry: 0
    });
    return requireSuccess(GetFeedbackTopics, result);
}

export async function fetchFeedbackTopic(
    topicId: number,
    signal?: AbortSignal
) {
    const result = await requestV2<GetFeedbackTopicData, FeedbackTopicDetail>(
        GetFeedbackTopic,
        { params: { id: String(topicId) } },
        mapTopicDetail,
        { signal, retry: 0 }
    );
    return requireSuccess(GetFeedbackTopic, result);
}

export async function createFeedbackTopic(input: {
    primaryType: FeedbackPrimaryType;
    secondaryType: FeedbackSecondaryType;
    visibility: FeedbackVisibility;
    body: string;
}) {
    const result = await requestV2<
        PostFeedbackTopicsData,
        CreateFeedbackTopicResponse
    >(
        PostFeedbackTopics,
        {
            body: {
                primaryType: toEnumPrimary(input.primaryType),
                secondaryType: toEnumSecondary(input.secondaryType),
                visibility: toEnumVisibility(input.visibility),
                body: input.body
            }
        },
        mapCreateTopic
    );
    return requireSuccess(PostFeedbackTopics, result);
}

export async function replyFeedbackTopic(
    topicId: number,
    body: string,
    meta: Record<string, unknown>
) {
    const result = await requestV2<
        PostFeedbackTopicMessageData,
        ReplyFeedbackMessageResponse
    >(
        PostFeedbackTopicMessage,
        {
            body: {
                topicId,
                body,
                meta: fromJson(StructSchema, meta as never)
            }
        },
        mapReplyMessage
    );
    return requireSuccess(PostFeedbackTopicMessage, result);
}

export async function updateFeedbackTopic(
    topicId: number,
    patch: {
        primaryType?: FeedbackPrimaryType;
        secondaryType?: FeedbackSecondaryType;
        status?: FeedbackStatus;
        title?: string;
        visibility?: FeedbackVisibility;
    }
) {
    const result = await requestV2<
        PatchFeedbackTopicData,
        UpdateFeedbackTopicResponse
    >(
        PatchFeedbackTopic,
        {
            body: {
                topicId,
                ...(patch.primaryType === undefined
                    ? {}
                    : { primaryType: toEnumPrimary(patch.primaryType) }),
                ...(patch.secondaryType === undefined
                    ? {}
                    : {
                          secondaryType: toEnumSecondary(patch.secondaryType)
                      }),
                ...(patch.status === undefined
                    ? {}
                    : { status: toEnumStatus(patch.status) }),
                ...(patch.title === undefined ? {} : { title: patch.title }),
                ...(patch.visibility === undefined
                    ? {}
                    : { visibility: toEnumVisibility(patch.visibility) })
            }
        },
        mapUpdateTopic
    );
    return requireSuccess(PatchFeedbackTopic, result);
}

export async function deleteFeedbackTopic(topicId: number) {
    const result = await requestV2<
        DeleteFeedbackTopicData,
        DeleteFeedbackTopicResponse
    >(DeleteFeedbackTopic, { body: { topicId } }, mapDeleteTopic);
    return requireSuccess(DeleteFeedbackTopic, result);
}
