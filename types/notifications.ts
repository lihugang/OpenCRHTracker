export const NOTIFICATION_TARGET_TYPES = ['train', 'emu', 'feedback'] as const;

export type NotificationTargetType = (typeof NOTIFICATION_TARGET_TYPES)[number];

export interface NotificationTarget {
    targetType: NotificationTargetType;
    targetId: string;
}

export interface NotificationPayload {
    title: string;
    body: string;
    url: string;
    tag: string;
}
