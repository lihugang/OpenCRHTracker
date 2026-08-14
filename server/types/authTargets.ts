import type { EmuId } from '~/server/libs/database/emu';
import type { TrainCodeParts } from '~/server/utils/12306/trainCode';

export type AuthFavoriteTarget =
    | { kind: 'train'; trainCode: TrainCodeParts }
    | { kind: 'emu'; emuId: EmuId }
    | { kind: 'station'; stationName: string };

export type AuthEventTarget =
    | { kind: 'train'; trainCode: TrainCodeParts }
    | { kind: 'emu'; emuId: EmuId }
    | { kind: 'feedback'; topicId: number };

export interface AuthFavoriteItem {
    target: AuthFavoriteTarget;
    tags: string[];
    starredAt: number;
}

export interface AuthEventSubscriptionItem {
    target: AuthEventTarget;
    label: string;
    path: string;
    createdAt: number;
    updatedAt: number;
}

export interface AuthFavoritesResult {
    userId: string;
    maxEntries: number;
    items: AuthFavoriteItem[];
}

export interface AuthEventSubscriptionListResult {
    userId: string;
    maxEntries: number;
    items: AuthEventSubscriptionItem[];
}
