import type { UserProfilePreference } from '~/server/services/userProfileStore';
import type { AuthQqBindingStatus, AuthSettingsResponse } from '~/types/auth';

export function createAuthSettingsResponse(
    userId: string,
    userPreference: UserProfilePreference,
    qqBinding: AuthQqBindingStatus
): AuthSettingsResponse {
    return {
        userId,
        userPreference: {
            saveSearchHistory: userPreference.saveSearchHistory
        },
        qqBinding
    };
}
