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

interface UserProfileDataRaw extends Record<string, unknown> {
    version?: unknown;
    favorites?: unknown;
}

export interface UserProfileData {
    version: 1;
    favorites: FavoriteLookupItem[];
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
        favorites: []
    };
}

function toFavoriteLookupItem(
    value: UserProfileFavoriteValue
): FavoriteLookupItem | null {
    if (
        !isLookupTargetType(value.type) ||
        typeof value.code !== 'string'
    ) {
        return null;
    }

    return normalizeFavoriteLookupItem({
        type: value.type,
        code: value.code,
        tags: value.tags,
        starredAt: value.starredAt
    } as FavoriteLookupItem);
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

                  return toFavoriteLookupItem(
                      item as UserProfileFavoriteValue
                  );
              })
              .filter((item): item is FavoriteLookupItem => item !== null)
              .sort((left, right) => right.starredAt - left.starredAt)
        : [];

    return {
        version: 1,
        favorites
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
            favorites: nextFavorites
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
            favorites: nextFavorites
        };

        writeUserProfileData(userId, nextProfile, now);
        return nextProfile.favorites;
    });

    return transaction();
}
