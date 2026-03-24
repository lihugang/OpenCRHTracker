import {
    FEEDBACK_CATEGORY_OPTIONS,
    FEEDBACK_PRIMARY_TYPES,
    type FeedbackCategoryKey,
    type FeedbackPrimaryType,
    type FeedbackSecondaryType,
    type FeedbackStatus,
    type FeedbackVisibility
} from '~/types/feedback';

export const feedbackPrimaryTypeSelectOptions: Array<{
    value: FeedbackPrimaryType | '';
    label: string;
}> = [
    {
        value: '',
        label: '全部类型'
    },
    {
        value: 'website',
        label: '网站'
    },
    {
        value: 'data',
        label: '数据'
    },
    {
        value: 'api',
        label: 'API'
    },
    {
        value: 'docs',
        label: '文档'
    },
    {
        value: 'other',
        label: '其他'
    }
];

export const feedbackCategorySelectOptions = FEEDBACK_CATEGORY_OPTIONS.map(
    (option) => ({
        value: option.key,
        label: option.label
    })
);

export const feedbackStatusSelectOptions: Array<{
    value: FeedbackStatus | '';
    label: string;
}> = [
    {
        value: '',
        label: '全部状态'
    },
    {
        value: 'pending',
        label: '待受理'
    },
    {
        value: 'processing',
        label: '受理中'
    },
    {
        value: 'submitted_change',
        label: '已提交更改'
    },
    {
        value: 'resolved',
        label: '受理完毕'
    },
    {
        value: 'invalid',
        label: '无效'
    }
];

export function getFeedbackCategoryKey(
    primaryType: FeedbackPrimaryType,
    secondaryType: FeedbackSecondaryType
) {
    return (FEEDBACK_CATEGORY_OPTIONS.find(
        (option) =>
            option.primaryType === primaryType &&
            option.secondaryType === secondaryType
    )?.key ?? primaryType) as FeedbackCategoryKey;
}

export function getFeedbackPrimaryTypeLabel(primaryType: FeedbackPrimaryType) {
    switch (primaryType) {
        case 'website':
            return '网站';
        case 'data':
            return '数据';
        case 'api':
            return 'API';
        case 'docs':
            return '文档';
        default:
            return '其他';
    }
}

export function getFeedbackSecondaryTypeOptions(
    primaryType: FeedbackPrimaryType
) {
    return FEEDBACK_CATEGORY_OPTIONS.filter(
        (option) => option.primaryType === primaryType && option.secondaryType
    ).map((option) => ({
        value: option.secondaryType,
        label: option.label.replace(/^.+? \/ /, '')
    }));
}

export function getFeedbackCategoryLabel(
    primaryType: FeedbackPrimaryType,
    secondaryType: FeedbackSecondaryType
) {
    return (
        FEEDBACK_CATEGORY_OPTIONS.find(
            (option) =>
                option.primaryType === primaryType &&
                option.secondaryType === secondaryType
        )?.label ??
        `${primaryType}${secondaryType ? ` / ${secondaryType}` : ''}`
    );
}

export function getFeedbackCategoryShortLabel(
    primaryType: FeedbackPrimaryType,
    secondaryType: FeedbackSecondaryType
) {
    return (
        FEEDBACK_CATEGORY_OPTIONS.find(
            (option) =>
                option.primaryType === primaryType &&
                option.secondaryType === secondaryType
        )?.shortLabel ?? getFeedbackCategoryLabel(primaryType, secondaryType)
    );
}

export function getFeedbackCategoryByKey(key: string) {
    return (
        FEEDBACK_CATEGORY_OPTIONS.find((option) => option.key === key) ?? null
    );
}

export function isSecurityFeedbackCategory(
    primaryType: FeedbackPrimaryType,
    secondaryType: FeedbackSecondaryType
) {
    return primaryType === 'website' && secondaryType === 'security';
}

export function getFeedbackStatusLabel(status: FeedbackStatus) {
    switch (status) {
        case 'processing':
            return '受理中';
        case 'submitted_change':
            return '已提交更改';
        case 'resolved':
            return '受理完毕';
        case 'invalid':
            return '无效';
        default:
            return '待受理';
    }
}

export function getFeedbackStatusTone(status: FeedbackStatus) {
    switch (status) {
        case 'processing':
            return 'warning' as const;
        case 'submitted_change':
            return 'info' as const;
        case 'resolved':
            return 'success' as const;
        case 'invalid':
            return 'danger' as const;
        default:
            return 'neutral' as const;
    }
}

export function getFeedbackVisibilityLabel(visibility: FeedbackVisibility) {
    return visibility === 'private' ? '仅作者与管理员可见' : '公开';
}

export function isValidFeedbackPrimaryTypeValue(value: string) {
    return (FEEDBACK_PRIMARY_TYPES as readonly string[]).includes(value);
}
