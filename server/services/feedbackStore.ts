import '~/server/libs/database/feedback';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import { useFeedbackDatabase } from '~/server/libs/database/feedback';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import {
    FEEDBACK_CATEGORY_OPTIONS,
    FEEDBACK_PRIMARY_TYPES,
    FEEDBACK_STATUSES,
    FEEDBACK_TITLE_MODES,
    FEEDBACK_VISIBILITIES,
    type FeedbackMessage,
    type FeedbackMessageAuthorType,
    type FeedbackPrimaryType,
    type FeedbackSecondaryType,
    type FeedbackStatus,
    type FeedbackTitleMode,
    type FeedbackTopicAuthorType,
    type FeedbackTopicDetail,
    type FeedbackTopicListItem,
    type FeedbackVisibility
} from '~/types/feedback';

interface FeedbackTopicRow {
    id: number;
    creator_user_id: string | null;
    creator_type: FeedbackTopicAuthorType;
    visibility: FeedbackVisibility;
    primary_type: FeedbackPrimaryType;
    secondary_type: FeedbackSecondaryType;
    status: FeedbackStatus;
    title: string;
    title_mode: FeedbackTitleMode;
    body: string;
    created_at: number;
    updated_at: number;
    last_replied_at: number;
    deleted_at: number | null;
    deleted_by_user_id: string | null;
    reply_count: number;
}

interface FeedbackMessageRow {
    id: number;
    topic_id: number;
    author_user_id: string | null;
    author_type: FeedbackMessageAuthorType;
    body: string;
    meta_json: string;
    created_at: number;
    deleted_at: number | null;
}

type FeedbackSqlKey =
    | 'insertFeedbackMessage'
    | 'insertFeedbackTopic'
    | 'selectFeedbackAllTopicsPaged'
    | 'selectFeedbackMessagesByTopicId'
    | 'selectFeedbackMyTopicsPaged'
    | 'selectFeedbackPublicTopicsPaged'
    | 'selectFeedbackTopicById'
    | 'softDeleteFeedbackTopic'
    | 'updateFeedbackTopicActivity'
    | 'updateFeedbackTopicFields';

const feedbackSql = importSqlBatch('feedback/queries') as Record<
    FeedbackSqlKey,
    string
>;

const feedbackStatements = createPreparedSqlStore<FeedbackSqlKey>({
    dbName: 'feedback',
    scope: 'feedback/queries',
    sql: feedbackSql
});

export interface FeedbackTopicCursor {
    lastRepliedAt: number;
    id: number;
}

export interface FeedbackTopicFilters {
    primaryType: FeedbackPrimaryType | '';
    secondaryType: FeedbackSecondaryType | '';
    status: FeedbackStatus | '';
}

export interface CreateFeedbackTopicInput {
    creatorUserId: string | null;
    creatorType: FeedbackTopicAuthorType;
    visibility: FeedbackVisibility;
    primaryType: FeedbackPrimaryType;
    secondaryType: FeedbackSecondaryType;
    status: FeedbackStatus;
    title: string;
    titleMode: FeedbackTitleMode;
    body: string;
    now: number;
}

export interface CreateFeedbackMessageInput {
    topicId: number;
    authorUserId: string | null;
    authorType: FeedbackMessageAuthorType;
    body: string;
    meta?: Record<string, unknown>;
    now: number;
}

export interface UpdateFeedbackTopicFieldsInput {
    topicId: number;
    primaryType: FeedbackPrimaryType;
    secondaryType: FeedbackSecondaryType;
    status: FeedbackStatus;
    title: string;
    titleMode: FeedbackTitleMode;
    now: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseMessageMeta(raw: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(raw) as unknown;
        return isObject(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function getTopicAuthorName(
    row: Pick<FeedbackTopicRow, 'creator_type' | 'creator_user_id'>
) {
    if (row.creator_type === 'guest') {
        return '游客';
    }

    return row.creator_user_id ?? '用户';
}

function getMessageAuthorName(
    row: Pick<FeedbackMessageRow, 'author_type' | 'author_user_id'>
) {
    switch (row.author_type) {
        case 'system':
            return '系统';
        case 'admin':
            return row.author_user_id ?? '管理员';
        case 'topicCreator':
            return row.author_user_id ?? '反馈提出者';
        default:
            return row.author_user_id ?? '用户';
    }
}

function mapTopicListItem(row: FeedbackTopicRow): FeedbackTopicListItem {
    return {
        id: row.id,
        authorType: row.creator_type,
        authorName: getTopicAuthorName(row),
        visibility: row.visibility,
        primaryType: row.primary_type,
        secondaryType: row.secondary_type,
        status: row.status,
        title: row.title,
        titleMode: row.title_mode,
        body: row.body,
        replyCount: row.reply_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastRepliedAt: row.last_replied_at
    };
}

function mapFeedbackMessage(row: FeedbackMessageRow): FeedbackMessage {
    return {
        id: row.id,
        authorType: row.author_type,
        authorName: getMessageAuthorName(row),
        body: row.body,
        createdAt: row.created_at,
        meta: parseMessageMeta(row.meta_json)
    };
}

export function isValidFeedbackPrimaryType(
    value: string
): value is FeedbackPrimaryType {
    return (FEEDBACK_PRIMARY_TYPES as readonly string[]).includes(value);
}

export function isValidFeedbackSecondaryType(
    value: string
): value is FeedbackSecondaryType {
    return FEEDBACK_CATEGORY_OPTIONS.some(
        (option) => option.secondaryType === value
    );
}

export function isValidFeedbackStatus(value: string): value is FeedbackStatus {
    return (FEEDBACK_STATUSES as readonly string[]).includes(value);
}

export function isValidFeedbackVisibility(
    value: string
): value is FeedbackVisibility {
    return (FEEDBACK_VISIBILITIES as readonly string[]).includes(value);
}

export function isValidFeedbackTitleMode(
    value: string
): value is FeedbackTitleMode {
    return (FEEDBACK_TITLE_MODES as readonly string[]).includes(value);
}

export function isValidFeedbackCategory(
    primaryType: string,
    secondaryType: string
): primaryType is FeedbackPrimaryType {
    return FEEDBACK_CATEGORY_OPTIONS.some(
        (option) =>
            option.primaryType === primaryType &&
            option.secondaryType === secondaryType
    );
}

export function parseFeedbackTopicCursor(
    value: string | undefined
): FeedbackTopicCursor | null {
    if (!value) {
        return null;
    }

    const parts = value.split(':');
    if (parts.length !== 2) {
        return null;
    }

    const lastRepliedAt = Number(parts[0]);
    const id = Number(parts[1]);
    if (
        !Number.isInteger(lastRepliedAt) ||
        lastRepliedAt <= 0 ||
        !Number.isInteger(id) ||
        id <= 0
    ) {
        return null;
    }

    return {
        lastRepliedAt,
        id
    };
}

export function buildFeedbackTopicCursor(
    rows: FeedbackTopicRow[],
    limit: number
) {
    if (rows.length < limit || rows.length === 0) {
        return '';
    }

    const last = rows[rows.length - 1]!;
    return `${last.last_replied_at}:${last.id}`;
}

function normalizeFilters(filters: Partial<FeedbackTopicFilters>): FeedbackTopicFilters {
    return {
        primaryType: filters.primaryType ?? '',
        secondaryType: filters.secondaryType ?? '',
        status: filters.status ?? ''
    };
}

export function listPublicFeedbackTopics(
    filters: Partial<FeedbackTopicFilters>,
    cursor: FeedbackTopicCursor | null,
    limit: number
) {
    const normalizedFilters = normalizeFilters(filters);
    const cursorLastRepliedAt = cursor?.lastRepliedAt ?? 0;
    const cursorId = cursor?.id ?? 0;

    const rows = feedbackStatements.all<FeedbackTopicRow>(
        'selectFeedbackPublicTopicsPaged',
        normalizedFilters.primaryType,
        normalizedFilters.primaryType,
        normalizedFilters.secondaryType,
        normalizedFilters.secondaryType,
        normalizedFilters.status,
        normalizedFilters.status,
        cursorLastRepliedAt,
        cursorLastRepliedAt,
        cursorLastRepliedAt,
        cursorId,
        limit
    );

    return {
        rows,
        items: rows.map(mapTopicListItem),
        nextCursor: buildFeedbackTopicCursor(rows, limit)
    };
}

export function listMyFeedbackTopics(
    creatorUserId: string,
    filters: Partial<FeedbackTopicFilters>,
    cursor: FeedbackTopicCursor | null,
    limit: number
) {
    const normalizedFilters = normalizeFilters(filters);
    const cursorLastRepliedAt = cursor?.lastRepliedAt ?? 0;
    const cursorId = cursor?.id ?? 0;

    const rows = feedbackStatements.all<FeedbackTopicRow>(
        'selectFeedbackMyTopicsPaged',
        creatorUserId,
        normalizedFilters.primaryType,
        normalizedFilters.primaryType,
        normalizedFilters.secondaryType,
        normalizedFilters.secondaryType,
        normalizedFilters.status,
        normalizedFilters.status,
        cursorLastRepliedAt,
        cursorLastRepliedAt,
        cursorLastRepliedAt,
        cursorId,
        limit
    );

    return {
        rows,
        items: rows.map(mapTopicListItem),
        nextCursor: buildFeedbackTopicCursor(rows, limit)
    };
}

export function listAllFeedbackTopics(
    filters: Partial<FeedbackTopicFilters>,
    cursor: FeedbackTopicCursor | null,
    limit: number
) {
    const normalizedFilters = normalizeFilters(filters);
    const cursorLastRepliedAt = cursor?.lastRepliedAt ?? 0;
    const cursorId = cursor?.id ?? 0;

    const rows = feedbackStatements.all<FeedbackTopicRow>(
        'selectFeedbackAllTopicsPaged',
        normalizedFilters.primaryType,
        normalizedFilters.primaryType,
        normalizedFilters.secondaryType,
        normalizedFilters.secondaryType,
        normalizedFilters.status,
        normalizedFilters.status,
        cursorLastRepliedAt,
        cursorLastRepliedAt,
        cursorLastRepliedAt,
        cursorId,
        limit
    );

    return {
        rows,
        items: rows.map(mapTopicListItem),
        nextCursor: buildFeedbackTopicCursor(rows, limit)
    };
}

export function getFeedbackTopicById(topicId: number) {
    const row =
        feedbackStatements.get<FeedbackTopicRow>('selectFeedbackTopicById', topicId) ??
        null;

    if (!row) {
        return null;
    }

    return {
        row,
        item: mapTopicListItem(row)
    };
}

export function listFeedbackMessagesByTopicId(topicId: number) {
    return feedbackStatements
        .all<FeedbackMessageRow>('selectFeedbackMessagesByTopicId', topicId)
        .map(mapFeedbackMessage);
}

export function buildFeedbackTopicDetail(
    topic: ReturnType<typeof getFeedbackTopicById>,
    messages: FeedbackMessage[],
    permissions: FeedbackTopicDetail['permissions']
): FeedbackTopicDetail | null {
    if (!topic) {
        return null;
    }

    return {
        ...topic.item,
        permissions,
        messages
    };
}

export function createFeedbackTopic(input: CreateFeedbackTopicInput) {
    const result = feedbackStatements.run(
        'insertFeedbackTopic',
        input.creatorUserId,
        input.creatorType,
        input.visibility,
        input.primaryType,
        input.secondaryType,
        input.status,
        input.title,
        input.titleMode,
        input.body,
        input.now,
        input.now,
        input.now
    );

    return Number(result.lastInsertRowid);
}

export function createFeedbackMessage(input: CreateFeedbackMessageInput) {
    const db = useFeedbackDatabase();
    const insertMessage = db.transaction(() => {
        const result = feedbackStatements.run(
            'insertFeedbackMessage',
            input.topicId,
            input.authorUserId,
            input.authorType,
            input.body,
            JSON.stringify(input.meta ?? {}),
            input.now
        );

        feedbackStatements.run(
            'updateFeedbackTopicActivity',
            input.now,
            input.now,
            input.topicId
        );

        return Number(result.lastInsertRowid);
    });

    return insertMessage();
}

export function updateFeedbackTopicFields(input: UpdateFeedbackTopicFieldsInput) {
    feedbackStatements.run(
        'updateFeedbackTopicFields',
        input.primaryType,
        input.secondaryType,
        input.status,
        input.title,
        input.titleMode,
        input.now,
        input.now,
        input.topicId
    );
}

export function appendFeedbackSystemMessage(
    topicId: number,
    body: string,
    meta: Record<string, unknown>,
    now: number
) {
    return createFeedbackMessage({
        topicId,
        authorUserId: null,
        authorType: 'system',
        body,
        meta,
        now
    });
}

export function hideFeedbackTopic(topicId: number, now: number) {
    feedbackStatements.run('softDeleteFeedbackTopic', now, topicId);
}
