import { defineEventHandler, readBody } from 'h3';
import { updateUserPreference } from '~/server/services/userProfileStore';
import executeApi from '~/server/utils/api/executor/executeApi';
import ensure from '~/server/utils/api/executor/ensure';
import { API_SCOPES } from '~/server/utils/api/scopes/apiScopes';
import { createAuthSettingsResponse } from '~/server/utils/auth/settings';

interface PatchAuthSettingsBody {
    userPreference?: {
        saveSearchHistory?: unknown;
    };
}

export default defineEventHandler(async (event) => {
    return executeApi(
        event,
        {
            requiredScopes: [API_SCOPES.auth.settings.write]
        },
        async ({ identity }) => {
            const body =
                (await readBody<PatchAuthSettingsBody | null>(event)) ?? {};

            ensure(
                typeof body === 'object' &&
                    body !== null &&
                    !Array.isArray(body),
                400,
                'invalid_param',
                '请求体必须是 JSON 对象'
            );
            ensure(
                typeof body.userPreference === 'object' &&
                    body.userPreference !== null &&
                    !Array.isArray(body.userPreference),
                400,
                'invalid_param',
                'userPreference 必须是对象'
            );
            ensure(
                typeof body.userPreference.saveSearchHistory === 'boolean',
                400,
                'invalid_param',
                'userPreference.saveSearchHistory 必须是布尔值'
            );

            return createAuthSettingsResponse(
                identity.id,
                updateUserPreference(identity.id, {
                    saveSearchHistory: body.userPreference.saveSearchHistory
                })
            );
        }
    );
});
