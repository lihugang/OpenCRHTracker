import type {
    UserProfilePreference
} from '~/server/services/userProfileStore';
import type { AuthSettingsResponse } from '~/types/auth';

export function createAuthSettingsResponse(
    userId: string,
    userPreference: UserProfilePreference
): AuthSettingsResponse {
    return {
        userId,
        userPreference: {
            saveSearchHistory: userPreference.saveSearchHistory
        }
    };
}
