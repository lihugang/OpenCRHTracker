import useConfig from '~/server/config';
import type { UserProfileSubscriptionItem } from '~/server/services/userProfileStore';
import type {
    AuthSubscriptionItem,
    AuthSubscriptionListResponse
} from '~/types/auth';

const DEFAULT_SUBSCRIPTION_NAME = '当前设备';
const SUBSCRIPTION_NAME_MAX_LENGTH = 64;

export function normalizeSubscriptionName(value: string | null | undefined) {
    const trimmed = (value ?? '').trim();

    if (trimmed.length === 0) {
        return DEFAULT_SUBSCRIPTION_NAME;
    }

    return trimmed.slice(0, SUBSCRIPTION_NAME_MAX_LENGTH);
}

export function getSubscriptionNameMaxLength() {
    return SUBSCRIPTION_NAME_MAX_LENGTH;
}

export function previewSubscriptionEndpoint(endpoint: string) {
    const normalized = endpoint.trim();

    if (normalized.length <= 40) {
        return normalized;
    }

    return `${normalized.slice(0, 24)}...${normalized.slice(-12)}`;
}

export function toPublicSubscriptionItem(
    item: UserProfileSubscriptionItem
): AuthSubscriptionItem {
    return {
        id: item.id,
        name: item.name,
        endpoint: item.endpoint,
        endpointPreview: previewSubscriptionEndpoint(item.endpoint),
        expirationTime: item.expirationTime,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        userAgent: item.userAgent
    };
}

export function createSubscriptionListResponse(
    userId: string,
    items: UserProfileSubscriptionItem[]
): AuthSubscriptionListResponse {
    const config = useConfig();

    return {
        userId,
        maxDevices: config.user.pushSubscriptions.maxDevices,
        vapidPublicKey: config.user.push.vapidPublicKey,
        syncTimeoutSeconds: config.user.pushSubscriptions.syncTimeoutSeconds,
        items: items.map(toPublicSubscriptionItem)
    };
}
