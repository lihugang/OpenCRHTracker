import {
    deleteFeedbackTopic,
    getFeedbackTopic,
    getFeedbackTopics,
    patchFeedbackTopic,
    postFeedbackTopicMessage,
    postFeedbackTopics
} from '~/server/domain/feedback';
import { toJson } from '@bufbuild/protobuf';
import { StructSchema } from '@bufbuild/protobuf/wkt';
import {
    FeedbackPrimaryTypeSchema,
    FeedbackSecondaryTypeSchema,
    FeedbackStatusSchema,
    FeedbackVisibilitySchema
} from '#shared/generated/proto/opencrh/v2/feedback_pb';
import { enumJsonName } from '~/server/utils/api/v2/requestValidator';
import {
    isValidFeedbackCategory,
    isValidFeedbackPrimaryType,
    isValidFeedbackSecondaryType,
    isValidFeedbackStatus,
    parseFeedbackTopicCursor
} from '~/server/services/feedbackStore';
import ensure from '~/server/utils/api/executor/ensure';
import parseLimit from '~/server/utils/api/query/parseLimit';
import type { V2OperationContext } from '~/server/utils/api/v2/V2Types';

function toFeedbackString(
    schema: Parameters<typeof enumJsonName>[0],
    value: number | undefined
): string | undefined {
    return value === undefined ? undefined : enumJsonName(schema, value);
}

function toFeedbackSecondaryString(value: number | undefined) {
    const name = toFeedbackString(FeedbackSecondaryTypeSchema, value);
    return name === 'empty' ? '' : name;
}

function toFeedbackTopicResponse<T extends { secondaryType: string }>(
    topic: T
) {
    return {
        ...topic,
        secondaryType:
            topic.secondaryType === '' ? 'empty' : topic.secondaryType
    };
}

export async function getFeedbackTopicsV2Adapter(ctx: V2OperationContext) {
    const rawView =
        typeof ctx.query.view === 'string' ? ctx.query.view : 'public';
    const rawPrimaryType =
        typeof ctx.query.primaryType === 'string'
            ? ctx.query.primaryType.trim()
            : '';
    const rawSecondaryType =
        typeof ctx.query.secondaryType === 'string'
            ? ctx.query.secondaryType.trim()
            : '';
    const rawStatus =
        typeof ctx.query.status === 'string' ? ctx.query.status.trim() : '';
    const rawCursor =
        typeof ctx.query.cursor === 'string' ? ctx.query.cursor.trim() : '';

    ensure(
        rawView === 'public' || rawView === 'mine' || rawView === 'all',
        400,
        'invalid_param',
        'view 只能是 public、mine 或 all'
    );
    ensure(
        rawPrimaryType === '' || isValidFeedbackPrimaryType(rawPrimaryType),
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

    const result = getFeedbackTopics(ctx.identity, {
        view: rawView as 'public' | 'mine' | 'all',
        primaryType: rawPrimaryType as never,
        secondaryType: rawSecondaryType as never,
        status: rawStatus as never,
        cursor,
        limit: parseLimit(ctx.event)
    });

    return {
        ...result,
        primaryType:
            result.primaryType === '' ? 'unspecified' : result.primaryType,
        secondaryType:
            result.secondaryType === '' ? 'unspecified' : result.secondaryType,
        status: result.status === '' ? 'unspecified' : result.status,
        items: result.items.map(toFeedbackTopicResponse)
    };
}

export async function postFeedbackTopicsV2Adapter(ctx: V2OperationContext) {
    const request = ctx.request as {
        primaryType?: number;
        secondaryType?: number;
        visibility?: number;
        body?: string;
    };
    return postFeedbackTopics(ctx.identity, {
        primaryType: enumJsonName(
            FeedbackPrimaryTypeSchema,
            request.primaryType ?? 0
        ) as never,
        secondaryType: toFeedbackSecondaryString(
            request.secondaryType ?? 0
        ) as never,
        visibility: enumJsonName(
            FeedbackVisibilitySchema,
            request.visibility ?? 0
        ) as never,
        body: request.body ?? ''
    });
}

export async function getFeedbackTopicV2Adapter(ctx: V2OperationContext) {
    const detail = getFeedbackTopic(ctx.identity, Number(ctx.params.id ?? ''));
    const { permissions, messages, ...topic } = detail;

    return {
        topic: {
            topic: toFeedbackTopicResponse(topic),
            permissions,
            messages
        }
    };
}

export async function patchFeedbackTopicV2Adapter(ctx: V2OperationContext) {
    const request = ctx.request as Record<string, unknown>;
    const result = await patchFeedbackTopic(
        ctx.identity,
        Number(ctx.params.id ?? ''),
        {
            primaryType: toFeedbackString(
                FeedbackPrimaryTypeSchema,
                request.primaryType as number | undefined
            ),
            secondaryType: toFeedbackSecondaryString(
                request.secondaryType as number | undefined
            ),
            status: toFeedbackString(
                FeedbackStatusSchema,
                request.status as number | undefined
            ),
            title: typeof request.title === 'string' ? request.title : undefined
        }
    );

    return toFeedbackTopicResponse(result);
}

export async function deleteFeedbackTopicV2Adapter(ctx: V2OperationContext) {
    return deleteFeedbackTopic(ctx.identity, Number(ctx.params.id ?? ''));
}

export async function postFeedbackTopicMessageV2Adapter(
    ctx: V2OperationContext
) {
    const request = ctx.request as {
        body?: string;
        meta?: Record<string, unknown>;
    };
    return postFeedbackTopicMessage(
        ctx.identity,
        Number(ctx.params.id ?? ''),
        typeof request.body === 'string' ? request.body : '',
        request.meta === undefined
            ? undefined
            : (toJson(StructSchema, request.meta as never) as Record<
                  string,
                  unknown
              >)
    );
}
