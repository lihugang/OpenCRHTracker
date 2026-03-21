export const FEEDBACK_PRIMARY_TYPES = [
    'website',
    'data',
    'api',
    'docs',
    'other'
] as const;

export type FeedbackPrimaryType = (typeof FEEDBACK_PRIMARY_TYPES)[number];

export const FEEDBACK_SECONDARY_TYPES_BY_PRIMARY = {
    website: ['bug', 'feature', 'security', 'other'],
    data: ['train_missing', 'train_wrong', 'coupling_missing', 'other'],
    api: ['bug', 'feature', 'more_quota'],
    docs: ['bug', 'feature', 'other'],
    other: ['']
} as const;

export type FeedbackSecondaryType =
    | ''
    | (typeof FEEDBACK_SECONDARY_TYPES_BY_PRIMARY.website)[number]
    | (typeof FEEDBACK_SECONDARY_TYPES_BY_PRIMARY.data)[number]
    | (typeof FEEDBACK_SECONDARY_TYPES_BY_PRIMARY.api)[number]
    | (typeof FEEDBACK_SECONDARY_TYPES_BY_PRIMARY.docs)[number];

export const FEEDBACK_STATUSES = [
    'pending',
    'processing',
    'submitted_change',
    'resolved',
    'invalid'
] as const;

export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_VISIBILITIES = ['public', 'private'] as const;

export type FeedbackVisibility = (typeof FEEDBACK_VISIBILITIES)[number];

export const FEEDBACK_TITLE_MODES = ['auto', 'custom'] as const;

export type FeedbackTitleMode = (typeof FEEDBACK_TITLE_MODES)[number];

export interface FeedbackCategoryOption {
    key: string;
    primaryType: FeedbackPrimaryType;
    secondaryType: FeedbackSecondaryType;
    label: string;
    shortLabel: string;
}

export const FEEDBACK_CATEGORY_OPTIONS = [
    {
        key: 'website.bug',
        primaryType: 'website',
        secondaryType: 'bug',
        label: '网站 / Bug 反馈',
        shortLabel: '网站 Bug'
    },
    {
        key: 'website.feature',
        primaryType: 'website',
        secondaryType: 'feature',
        label: '网站 / 功能建议',
        shortLabel: '网站建议'
    },
    {
        key: 'website.security',
        primaryType: 'website',
        secondaryType: 'security',
        label: '网站 / 安全性问题',
        shortLabel: '安全问题'
    },
    {
        key: 'website.other',
        primaryType: 'website',
        secondaryType: 'other',
        label: '网站 / 其他',
        shortLabel: '网站其他'
    },
    {
        key: 'data.train_missing',
        primaryType: 'data',
        secondaryType: 'train_missing',
        label: '数据 / 车次数据缺失',
        shortLabel: '车次数据缺失'
    },
    {
        key: 'data.train_wrong',
        primaryType: 'data',
        secondaryType: 'train_wrong',
        label: '数据 / 车次数据错误',
        shortLabel: '车次数据错误'
    },
    {
        key: 'data.coupling_missing',
        primaryType: 'data',
        secondaryType: 'coupling_missing',
        label: '数据 / 未检出重联车',
        shortLabel: '未检出重联车'
    },
    {
        key: 'data.other',
        primaryType: 'data',
        secondaryType: 'other',
        label: '数据 / 其他',
        shortLabel: '数据其他'
    },
    {
        key: 'api.bug',
        primaryType: 'api',
        secondaryType: 'bug',
        label: 'API / 异常反馈',
        shortLabel: 'API 异常'
    },
    {
        key: 'api.feature',
        primaryType: 'api',
        secondaryType: 'feature',
        label: 'API / 功能建议',
        shortLabel: 'API 建议'
    },
    {
        key: 'api.more_quota',
        primaryType: 'api',
        secondaryType: 'more_quota',
        label: 'API / 申请更多配额',
        shortLabel: '申请更多配额'
    },
    {
        key: 'docs.bug',
        primaryType: 'docs',
        secondaryType: 'bug',
        label: '文档 / 错误反馈',
        shortLabel: '文档错误'
    },
    {
        key: 'docs.feature',
        primaryType: 'docs',
        secondaryType: 'feature',
        label: '文档 / 编写建议',
        shortLabel: '文档建议'
    },
    {
        key: 'docs.other',
        primaryType: 'docs',
        secondaryType: 'other',
        label: '文档 / 其他',
        shortLabel: '文档其他'
    },
    {
        key: 'other',
        primaryType: 'other',
        secondaryType: '',
        label: '其他',
        shortLabel: '其他'
    }
] as const satisfies ReadonlyArray<FeedbackCategoryOption>;

export type FeedbackCategoryKey =
    (typeof FEEDBACK_CATEGORY_OPTIONS)[number]['key'];

export type FeedbackTopicAuthorType = 'guest' | 'user';

export type FeedbackMessageAuthorType =
    | 'user'
    | 'topicCreator'
    | 'admin'
    | 'system';

export interface FeedbackPermissions {
    canReply: boolean;
    canManage: boolean;
    isOwner: boolean;
}

export interface FeedbackTopicListItem {
    id: number;
    authorType: FeedbackTopicAuthorType;
    authorName: string;
    visibility: FeedbackVisibility;
    primaryType: FeedbackPrimaryType;
    secondaryType: FeedbackSecondaryType;
    status: FeedbackStatus;
    title: string;
    titleMode: FeedbackTitleMode;
    body: string;
    replyCount: number;
    createdAt: number;
    updatedAt: number;
    lastRepliedAt: number;
}

export interface FeedbackMessage {
    id: number;
    authorType: FeedbackMessageAuthorType;
    authorName: string;
    body: string;
    createdAt: number;
    meta: Record<string, unknown>;
}

export interface FeedbackTopicDetail extends FeedbackTopicListItem {
    permissions: FeedbackPermissions;
    messages: FeedbackMessage[];
}

export interface FeedbackTopicListResponse {
    view: 'public' | 'mine' | 'all';
    primaryType: FeedbackPrimaryType | '';
    secondaryType: FeedbackSecondaryType | '';
    status: FeedbackStatus | '';
    limit: number;
    nextCursor: string;
    items: FeedbackTopicListItem[];
}

export interface CreateFeedbackTopicResponse {
    id: number;
    title: string;
}

export interface ReplyFeedbackMessageResponse {
    topicId: number;
    messageId: number;
}

export interface UpdateFeedbackTopicResponse {
    id: number;
    primaryType: FeedbackPrimaryType;
    secondaryType: FeedbackSecondaryType;
    status: FeedbackStatus;
    title: string;
    titleMode: FeedbackTitleMode;
    updatedAt: number;
}

export interface DeleteFeedbackTopicResponse {
    id: number;
    visibility: FeedbackVisibility;
    updatedAt: number;
}
