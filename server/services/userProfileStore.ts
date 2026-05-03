import crypto from 'crypto';
import { LRUCache } from 'lru-cache';
import { useUsersDatabase } from '~/server/libs/database/users';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import useConfig from '~/server/config';
import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import type {
    FavoriteLookupInput,
    FavoriteLookupItem,
    LookupSuggestItem
} from '~/types/lookup';
import {
    buildLookupItemKeyFromItem,
    isLookupTargetType,
    normalizeFavoriteLookupInput,
    normalizeFavoriteLookupItem
} from '~/utils/lookup/lookupFavorite';

interface UserProfileRow {
    user_id: string;
    data_json: string;
    updated_at: number;
}

interface UserProfileFavoriteValue extends Record<string, unknown> {
    type?: unknown;
    code?: unknown;
    subtitle?: unknown;
    tags?: unknown;
    starredAt?: unknown;
}

interface UserProfileSubscriptionKeysValue extends Record<string, unknown> {
    p256dh?: unknown;
    auth?: unknown;
}

interface UserProfileSubscriptionValue extends Record<string, unknown> {
    id?: unknown;
    name?: unknown;
    endpoint?: unknown;
    expirationTime?: unknown;
    keys?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
    userAgent?: unknown;
}

interface UserProfileDataRaw extends Record<string, unknown> {
    version?: unknown;
    favorites?: unknown;
    subscriptions?: unknown;
    userPreference?: unknown;
}

interface UserProfilePreferenceValue extends Record<string, unknown> {
    saveSearchHistory?: unknown;
}

export interface UserProfileSubscriptionItem {
    id: string;
    name: string;
    endpoint: string;
    expirationTime: number | null;
    keys: {
        p256dh: string;
        auth: string;
    };
    createdAt: number;
    updatedAt: number;
    userAgent: string;
}

export interface UpsertUserSubscriptionInput {
    name: string;
    endpoint: string;
    expirationTime: number | null;
    keys: {
        p256dh: string;
        auth: string;
    };
}

export interface UpsertUserSubscriptionResult {
    action: 'created' | 'updated';
    item: UserProfileSubscriptionItem;
    items: UserProfileSubscriptionItem[];
}

export interface UserProfileData {
    version: 1;
    favorites: FavoriteLookupItem[];
    subscriptions: UserProfileSubscriptionItem[];
    userPreference: UserProfilePreference;
}

export interface UserProfilePreference {
    saveSearchHistory: boolean;
}

type UserProfileSqlKey = 'selectUserProfileByUserId' | 'upsertUserProfile';

const userProfileSql = importSqlBatch('users/queries') as Record<
    UserProfileSqlKey,
    string
>;
const userProfileStatements = createPreparedSqlStore<UserProfileSqlKey>({
    dbName: 'users',
    scope: 'users/queries',
    sql: userProfileSql
});

const userProfileCache = new LRUCache<string, UserProfileData>({
    max: useConfig().api.authCache.userProfile.maxEntries,
    ttl: useConfig().api.authCache.userProfile.defaultTtlSeconds * 1000,
    updateAgeOnGet: true
});

function createDefaultUserProfileData(): UserProfileData {
    return {
        version: 1,
        favorites: [],
        subscriptions: [],
        userPreference: {
            saveSearchHistory: true
        }
    };
}

function toUserProfilePreference(value: unknown): UserProfilePreference {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return {
            saveSearchHistory: true
        };
    }

    const raw = value as UserProfilePreferenceValue;

    return {
        saveSearchHistory:
            typeof raw.saveSearchHistory === 'boolean'
                ? raw.saveSearchHistory
                : true
    };
}

function toFavoriteLookupItem(
    value: UserProfileFavoriteValue
): FavoriteLookupItem | null {
    if (!isLookupTargetType(value.type) || typeof value.code !== 'string') {
        return null;
    }

    return normalizeFavoriteLookupItem({
        type: value.type,
        code: value.code,
        tags: value.tags,
        starredAt: value.starredAt
    } as FavoriteLookupItem);
}

function toUserProfileSubscriptionItem(
    value: UserProfileSubscriptionValue
): UserProfileSubscriptionItem | null {
    if (
        typeof value.id !== 'string' ||
        value.id.trim().length === 0 ||
        typeof value.name !== 'string' ||
        value.name.trim().length === 0 ||
        typeof value.endpoint !== 'string' ||
        value.endpoint.trim().length === 0 ||
        typeof value.createdAt !== 'number' ||
        !Number.isInteger(value.createdAt) ||
        value.createdAt <= 0 ||
        typeof value.updatedAt !== 'number' ||
        !Number.isInteger(value.updatedAt) ||
        value.updatedAt <= 0 ||
        typeof value.userAgent !== 'string'
    ) {
        return null;
    }

    const keys =
        typeof value.keys === 'object' &&
        value.keys !== null &&
        !Array.isArray(value.keys)
            ? (value.keys as UserProfileSubscriptionKeysValue)
            : null;

    if (
        !keys ||
        typeof keys.p256dh !== 'string' ||
        keys.p256dh.trim().length === 0 ||
        typeof keys.auth !== 'string' ||
        keys.auth.trim().length === 0
    ) {
        return null;
    }

    if (
        value.expirationTime !== null &&
        value.expirationTime !== undefined &&
        (typeof value.expirationTime !== 'number' ||
            !Number.isInteger(value.expirationTime) ||
            value.expirationTime <= 0)
    ) {
        return null;
    }

    return {
        id: value.id.trim(),
        name: value.name.trim(),
        endpoint: value.endpoint.trim(),
        expirationTime:
            typeof value.expirationTime === 'number'
                ? value.expirationTime
                : null,
        keys: {
            p256dh: keys.p256dh.trim(),
            auth: keys.auth.trim()
        },
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
        userAgent: value.userAgent.trim()
    };
}

function normalizeUserProfileData(value: unknown): UserProfileData {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return createDefaultUserProfileData();
    }

    const raw = value as UserProfileDataRaw;
    const favorites = Array.isArray(raw.favorites)
        ? raw.favorites
              .map((item) => {
                  if (
                      typeof item !== 'object' ||
                      item === null ||
                      Array.isArray(item)
                  ) {
                      return null;
                  }

                  return toFavoriteLookupItem(item as UserProfileFavoriteValue);
              })
              .filter((item): item is FavoriteLookupItem => item !== null)
              .sort((left, right) => right.starredAt - left.starredAt)
        : [];
    const subscriptions = Array.isArray(raw.subscriptions)
        ? raw.subscriptions
              .map((item) => {
                  if (
                      typeof item !== 'object' ||
                      item === null ||
                      Array.isArray(item)
                  ) {
                      return null;
                  }

                  return toUserProfileSubscriptionItem(
                      item as UserProfileSubscriptionValue
                  );
              })
              .filter(
                  (item): item is UserProfileSubscriptionItem => item !== null
              )
              .sort((left, right) => right.updatedAt - left.updatedAt)
        : [];
    const userPreference = toUserProfilePreference(raw.userPreference);

    return {
        version: 1,
        favorites,
        subscriptions,
        userPreference
    };
}

function parseUserProfileData(rawValue: string) {
    try {
        return normalizeUserProfileData(JSON.parse(rawValue));
    } catch {
        return createDefaultUserProfileData();
    }
}

function setCachedUserProfile(userId: string, profile: UserProfileData) {
    userProfileCache.set(userId, profile);
}

function getStoredUserProfileRow(userId: string) {
    return userProfileStatements.get<UserProfileRow>(
        'selectUserProfileByUserId',
        userId
    );
}

function getCurrentUserProfileData(userId: string) {
    const cached = userProfileCache.get(userId);
    if (cached) {
        return cached;
    }

    const row = getStoredUserProfileRow(userId);
    const profile = row
        ? parseUserProfileData(row.data_json)
        : createDefaultUserProfileData();

    setCachedUserProfile(userId, profile);
    return profile;
}

function writeUserProfileData(
    userId: string,
    profile: UserProfileData,
    updatedAt: number
) {
    userProfileStatements.run(
        'upsertUserProfile',
        userId,
        JSON.stringify(profile),
        updatedAt
    );
    setCachedUserProfile(userId, profile);
}

export function listUserFavoriteLookups(userId: string) {
    return getCurrentUserProfileData(userId).favorites;
}

export function listUserSubscriptions(userId: string) {
    return getCurrentUserProfileData(userId).subscriptions;
}

export function getUserPreference(userId: string) {
    return getCurrentUserProfileData(userId).userPreference;
}

export function upsertUserFavoriteLookup(
    userId: string,
    item: FavoriteLookupInput
): FavoriteLookupItem[] {
    const normalizedItem = normalizeFavoriteLookupInput(item);
    if (!normalizedItem) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            '\u6536\u85cf\u9879\u65e0\u6548'
        );
    }

    const maxEntries = useConfig().user.favorites.maxEntries;
    const now = getNowSeconds();

    const transaction = useUsersDatabase().transaction(() => {
        const row = getStoredUserProfileRow(userId);
        const profile = row
            ? parseUserProfileData(row.data_json)
            : createDefaultUserProfileData();
        const favoriteKey = buildLookupItemKeyFromItem(normalizedItem);
        const favorites = profile.favorites.filter(
            (favorite) => buildLookupItemKeyFromItem(favorite) !== favoriteKey
        );
        const alreadyExists = favorites.length !== profile.favorites.length;

        if (!alreadyExists && favorites.length >= maxEntries) {
            throw new ApiRequestError(
                409,
                'favorites_limit_exceeded',
                '\u6536\u85cf\u6570\u91cf\u5df2\u8fbe\u4e0a\u9650\uff0c\u8bf7\u5148\u53d6\u6d88\u90e8\u5206\u6536\u85cf'
            );
        }

        const nextFavorites = [
            {
                ...normalizedItem,
                starredAt: now
            },
            ...favorites
        ];

        const nextProfile: UserProfileData = {
            version: 1,
            favorites: nextFavorites,
            subscriptions: profile.subscriptions,
            userPreference: profile.userPreference
        };

        writeUserProfileData(userId, nextProfile, now);
        return nextProfile.favorites;
    });

    return transaction();
}

export function removeUserFavoriteLookup(
    userId: string,
    target: Pick<LookupSuggestItem, 'type' | 'code'>
) {
    const normalizedTarget = normalizeFavoriteLookupInput({
        type: target.type,
        code: target.code,
        tags: []
    });

    if (!normalizedTarget) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            '\u6536\u85cf\u9879\u65e0\u6548'
        );
    }

    const targetKey = buildLookupItemKeyFromItem(normalizedTarget);
    const now = getNowSeconds();

    const transaction = useUsersDatabase().transaction(() => {
        const row = getStoredUserProfileRow(userId);
        const profile = row
            ? parseUserProfileData(row.data_json)
            : createDefaultUserProfileData();
        const nextFavorites = profile.favorites.filter(
            (favorite) => buildLookupItemKeyFromItem(favorite) !== targetKey
        );

        if (nextFavorites.length === profile.favorites.length) {
            throw new ApiRequestError(
                404,
                'not_found',
                '\u672a\u627e\u5230\u5bf9\u5e94\u7684\u6536\u85cf\u9879'
            );
        }

        const nextProfile: UserProfileData = {
            version: 1,
            favorites: nextFavorites,
            subscriptions: profile.subscriptions,
            userPreference: profile.userPreference
        };

        writeUserProfileData(userId, nextProfile, now);
        return nextProfile.favorites;
    });

    return transaction();
}

export function upsertUserSubscription(
    userId: string,
    input: UpsertUserSubscriptionInput,
    userAgent: string
): UpsertUserSubscriptionResult {
    const maxDevices = useConfig().user.pushSubscriptions.maxDevices;
    const now = getNowSeconds();

    const transaction = useUsersDatabase().transaction(() => {
        const row = getStoredUserProfileRow(userId);
        const profile = row
            ? parseUserProfileData(row.data_json)
            : createDefaultUserProfileData();
        const existing = profile.subscriptions.find(
            (item) => item.endpoint === input.endpoint
        );

        if (!existing && profile.subscriptions.length >= maxDevices) {
            throw new ApiRequestError(
                409,
                'subscriptions_limit_exceeded',
                '\u8ba2\u9605\u8bbe\u5907\u6570\u91cf\u5df2\u8fbe\u4e0a\u9650\uff0c\u8bf7\u5148\u5220\u9664\u90e8\u5206\u8bbe\u5907'
            );
        }

        const nextItem: UserProfileSubscriptionItem = {
            id: existing?.id ?? crypto.randomUUID(),
            name: input.name.trim(),
            endpoint: input.endpoint.trim(),
            expirationTime: input.expirationTime,
            keys: {
                p256dh: input.keys.p256dh.trim(),
                auth: input.keys.auth.trim()
            },
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
            userAgent: userAgent.trim()
        };
        const nextSubscriptions = [
            nextItem,
            ...profile.subscriptions.filter(
                (item) => item.endpoint !== input.endpoint.trim()
            )
        ].sort((left, right) => right.updatedAt - left.updatedAt);
        const nextProfile: UserProfileData = {
            version: 1,
            favorites: profile.favorites,
            subscriptions: nextSubscriptions,
            userPreference: profile.userPreference
        };

        writeUserProfileData(userId, nextProfile, now);
        return {
            action: existing ? 'updated' : 'created',
            item: nextItem,
            items: nextProfile.subscriptions
        } satisfies UpsertUserSubscriptionResult;
    });

    return transaction();
}

export function renameUserSubscription(
    userId: string,
    subscriptionId: string,
    name: string
) {
    const now = getNowSeconds();

    const transaction = useUsersDatabase().transaction(() => {
        const row = getStoredUserProfileRow(userId);
        const profile = row
            ? parseUserProfileData(row.data_json)
            : createDefaultUserProfileData();
        const matched = profile.subscriptions.find(
            (item) => item.id === subscriptionId
        );

        if (!matched) {
            throw new ApiRequestError(
                404,
                'not_found',
                '\u672a\u627e\u5230\u5bf9\u5e94\u7684\u8ba2\u9605\u8bbe\u5907'
            );
        }

        const nextSubscriptions = profile.subscriptions
            .map((item) =>
                item.id === subscriptionId
                    ? {
                          ...item,
                          name: name.trim(),
                          updatedAt: now
                      }
                    : item
            )
            .sort((left, right) => right.updatedAt - left.updatedAt);
        const nextProfile: UserProfileData = {
            version: 1,
            favorites: profile.favorites,
            subscriptions: nextSubscriptions,
            userPreference: profile.userPreference
        };

        writeUserProfileData(userId, nextProfile, now);
        return nextProfile.subscriptions;
    });

    return transaction();
}

export function removeUserSubscription(userId: string, subscriptionId: string) {
    const now = getNowSeconds();

    const transaction = useUsersDatabase().transaction(() => {
        const row = getStoredUserProfileRow(userId);
        const profile = row
            ? parseUserProfileData(row.data_json)
            : createDefaultUserProfileData();
        const nextSubscriptions = profile.subscriptions.filter(
            (item) => item.id !== subscriptionId
        );

        if (nextSubscriptions.length === profile.subscriptions.length) {
            throw new ApiRequestError(
                404,
                'not_found',
                '\u672a\u627e\u5230\u5bf9\u5e94\u7684\u8ba2\u9605\u8bbe\u5907'
            );
        }

        const nextProfile: UserProfileData = {
            version: 1,
            favorites: profile.favorites,
            subscriptions: nextSubscriptions,
            userPreference: profile.userPreference
        };

        writeUserProfileData(userId, nextProfile, now);
        return nextProfile.subscriptions;
    });

    return transaction();
}

export function removeUserSubscriptionsByEndpoints(
    userId: string,
    endpoints: readonly string[]
) {
    const normalizedEndpoints = Array.from(
        new Set(
            endpoints
                .map((endpoint) => endpoint.trim())
                .filter((endpoint) => endpoint.length > 0)
        )
    );
    if (normalizedEndpoints.length === 0) {
        return listUserSubscriptions(userId);
    }

    const now = getNowSeconds();

    const transaction = useUsersDatabase().transaction(() => {
        const row = getStoredUserProfileRow(userId);
        const profile = row
            ? parseUserProfileData(row.data_json)
            : createDefaultUserProfileData();
        const endpointSet = new Set(normalizedEndpoints);
        const nextSubscriptions = profile.subscriptions.filter(
            (item) => !endpointSet.has(item.endpoint)
        );

        if (nextSubscriptions.length === profile.subscriptions.length) {
            return profile.subscriptions;
        }

        const nextProfile: UserProfileData = {
            version: 1,
            favorites: profile.favorites,
            subscriptions: nextSubscriptions,
            userPreference: profile.userPreference
        };

        writeUserProfileData(userId, nextProfile, now);
        return nextProfile.subscriptions;
    });

    return transaction();
}

export function updateUserPreference(
    userId: string,
    nextPreference: Partial<UserProfilePreference>
) {
    const now = getNowSeconds();

    const transaction = useUsersDatabase().transaction(() => {
        const row = getStoredUserProfileRow(userId);
        const profile = row
            ? parseUserProfileData(row.data_json)
            : createDefaultUserProfileData();
        const userPreference: UserProfilePreference = {
            ...profile.userPreference,
            ...nextPreference
        };
        const nextProfile: UserProfileData = {
            version: 1,
            favorites: profile.favorites,
            subscriptions: profile.subscriptions,
            userPreference
        };

        writeUserProfileData(userId, nextProfile, now);
        return nextProfile.userPreference;
    });

    return transaction();
}
