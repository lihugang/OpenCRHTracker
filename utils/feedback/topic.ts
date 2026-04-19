import type {
    FeedbackPrimaryType,
    FeedbackSecondaryType
} from '~/types/feedback';
import { getFeedbackCategoryLabel } from '~/utils/feedback/catalog';

export interface FeedbackComposerFields {
    trainCode: string;
    emuCodesRaw: string;
    missingEmuCode: string;
    wrongRoute: string;
    correctRoute: string;
    travelCode: string;
    hasTravelCodeImage: boolean;
    customText: string;
}

export function createEmptyFeedbackComposerFields(): FeedbackComposerFields {
    return {
        trainCode: '',
        emuCodesRaw: '',
        missingEmuCode: '',
        wrongRoute: '',
        correctRoute: '',
        travelCode: '',
        hasTravelCodeImage: false,
        customText: ''
    };
}

export function buildFeedbackAutoTitle(
    primaryType: FeedbackPrimaryType,
    secondaryType: FeedbackSecondaryType
) {
    if (primaryType === 'website') {
        switch (secondaryType) {
            case 'bug':
                return '网站问题反馈';
            case 'feature':
                return '网站功能建议';
            case 'security':
                return '网站安全性问题';
            default:
                return '网站其他反馈';
        }
    }

    if (primaryType === 'data') {
        switch (secondaryType) {
            case 'train_missing':
                return '数据异常：车次数据缺失';
            case 'train_wrong':
                return '数据异常：车次数据错误';
            case 'route_wrong':
                return '数据异常：交路数据错误';
            case 'coupling_missing':
                return '数据异常：未检出重联车';
            default:
                return '数据异常：其他';
        }
    }

    if (primaryType === 'api') {
        switch (secondaryType) {
            case 'bug':
                return 'API 异常反馈';
            case 'feature':
                return 'API 功能建议';
            default:
                return 'API 配额申请';
        }
    }

    if (primaryType === 'docs') {
        switch (secondaryType) {
            case 'bug':
                return '文档错误反馈';
            case 'feature':
                return '文档编写建议';
            default:
                return '文档其他反馈';
        }
    }

    return '其他反馈';
}

function normalizeLine(value: string) {
    return value.replace(/\r\n/g, '\n').trim();
}

export function buildFeedbackTopicBody(
    primaryType: FeedbackPrimaryType,
    secondaryType: FeedbackSecondaryType,
    fields: FeedbackComposerFields
) {
    const lines: string[] = [
        `反馈分类：${getFeedbackCategoryLabel(primaryType, secondaryType)}`
    ];

    if (fields.trainCode) {
        lines.push(`车次：${fields.trainCode}`);
    }
    if (fields.emuCodesRaw) {
        lines.push(`车组号：${fields.emuCodesRaw}`);
    }
    if (fields.missingEmuCode) {
        lines.push(`未追踪到的车组号：${fields.missingEmuCode}`);
    }
    if (
        primaryType === 'data' &&
        secondaryType === 'route_wrong' &&
        fields.wrongRoute
    ) {
        lines.push(`错误交路：${fields.wrongRoute}`);
    }
    if (
        primaryType === 'data' &&
        secondaryType === 'route_wrong' &&
        fields.correctRoute
    ) {
        lines.push(`正确交路：${fields.correctRoute}`);
    }
    if (fields.travelCode) {
        lines.push(`畅行码识别结果：${fields.travelCode}`);
    } else if (fields.hasTravelCodeImage) {
        lines.push('畅行码照片：已上传至浏览器本地识别，但未能提取有效代码');
    }

    const customText = normalizeLine(fields.customText);
    if (customText) {
        lines.push('');
        lines.push('补充说明：');
        lines.push(customText);
    }

    return lines.join('\n').trim();
}
