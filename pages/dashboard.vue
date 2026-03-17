<template>
    <main class="flex min-h-screen flex-col bg-crh-slate text-crh-grey-dark">
        <div
            class="pointer-events-none absolute inset-x-0 top-0 h-[24rem] bg-[radial-gradient(circle_at_top,_rgba(0,82,155,0.14),_transparent_58%)]" />
        <div
            class="pointer-events-none absolute inset-x-0 top-20 h-40 bg-[linear-gradient(90deg,_rgba(90,132,162,0.12),_rgba(90,132,162,0))] blur-3xl" />

        <div
            class="relative mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
            <div
                class="grid gap-6 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
                <DashboardAccountCard
                    :session="session"
                    :is-logging-out="isLoggingOut"
                    :logout-error-message="logoutErrorMessage"
                    :max-lifetime-seconds="maxLifetimeSeconds"
                    :creatable-scope-count="creatableScopes.length"
                    :can-issue-api-keys="canIssueApiKeys"
                    :format-timestamp="formatTimestamp"
                    :format-duration="formatDuration"
                    :get-issuer-label="getIssuerLabel"
                    :get-issuer-badge-class="getIssuerBadgeClass"
                    @logout="logout"
                    @open-issue="openIssueModal" />

                <DashboardKeyListPanel
                    :groups="issuerGroups"
                    :is-loading="isApiKeysLoading"
                    :error-message="apiKeysErrorMessage"
                    :can-revoke="canRevokeApiKeys"
                    :current-key-id="session?.keyId ?? null"
                    :format-timestamp="formatTimestamp"
                    :get-issuer-label="getIssuerLabel"
                    :get-issuer-section-title="getIssuerSectionTitle"
                    :get-issuer-badge-class="getIssuerBadgeClass"
                    :get-status-label="getStatusLabel"
                    :get-status-badge-class="getStatusBadgeClass"
                    @refresh="refreshApiKeys()"
                    @revoke="openRevokeModal" />
            </div>
        </div>

        <UiModal
            :model-value="revokeTarget !== null"
            title="Revoke API Key"
            description="This action invalidates the selected key immediately."
            :close-on-backdrop="!isRevoking"
            @update:model-value="handleRevokeModalVisibilityChange">
            <div
                v-if="revokeTarget"
                class="space-y-4">
                <div
                    class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
                    <div
                        class="flex flex-wrap items-center justify-between gap-3">
                        <span :class="getIssuerBadgeClass(revokeTarget.issuer)">
                            {{ getIssuerLabel(revokeTarget.issuer) }}
                        </span>
                        <span
                            v-if="session?.keyId === revokeTarget.keyId"
                            class="inline-flex items-center rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                            Current session
                        </span>
                    </div>
                    <p
                        class="mt-3 font-mono text-sm font-semibold text-crh-blue">
                        {{ revokeTarget.maskedKeyId }}
                    </p>
                    <p class="mt-2 text-sm leading-6 text-slate-600">
                        {{
                            session?.keyId === revokeTarget.keyId
                                ? 'You are revoking the key used by the current session. You will be signed out immediately after confirmation.'
                                : 'Confirm revocation for this key.'
                        }}
                    </p>
                </div>

                <p
                    v-if="revokeErrorMessage"
                    class="flex items-center gap-1.5 pl-1 text-xs leading-5 text-[#E53E3E]">
                    <span
                        aria-hidden="true"
                        class="font-semibold">
                        [!]
                    </span>
                    {{ revokeErrorMessage }}
                </p>
            </div>

            <template #footer>
                <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <UiButton
                        type="button"
                        variant="secondary"
                        :disabled="isRevoking"
                        @click="closeRevokeModal">
                        Cancel
                    </UiButton>
                    <UiButton
                        type="button"
                        :loading="isRevoking"
                        @click="confirmRevoke">
                        Confirm revoke
                    </UiButton>
                </div>
            </template>
        </UiModal>

        <UiModal
            :model-value="isIssueModalOpen"
            title="Issue API Key"
            :description="
                issuedKeyResult
                    ? 'Copy the secret now. It will only be shown once.'
                    : 'Choose the active window and leaf scopes for the new API key.'
            "
            size="lg"
            :close-on-backdrop="!isIssuing"
            @update:model-value="handleIssueModalVisibilityChange">
            <div
                v-if="issuedKeyResult"
                class="space-y-5">
                <div
                    class="rounded-[1rem] border border-emerald-200/80 bg-emerald-50/80 px-4 py-4">
                    <p
                        class="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
                        One-Time Secret
                    </p>
                    <p
                        class="mt-3 break-all font-mono text-sm font-semibold text-emerald-800">
                        {{ issuedKeyResult.apiKey }}
                    </p>
                    <p class="mt-2 text-sm leading-6 text-emerald-700/90">
                        After this dialog closes, only the masked key ID will
                        remain visible in the list.
                    </p>
                </div>

                <div
                    class="grid gap-4 rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4 sm:grid-cols-2">
                    <div class="space-y-1">
                        <p class="text-xs uppercase tracking-[0.18em] text-slate-400">
                            Type
                        </p>
                        <p class="font-medium text-slate-900">
                            {{ getIssuerLabel(issuedKeyResult.issuer) }}
                        </p>
                    </div>
                    <div class="space-y-1">
                        <p class="text-xs uppercase tracking-[0.18em] text-slate-400">
                            Active from
                        </p>
                        <p class="font-medium text-slate-900">
                            {{ formatTimestamp(issuedKeyResult.activeFrom) }}
                        </p>
                    </div>
                    <div class="space-y-1">
                        <p class="text-xs uppercase tracking-[0.18em] text-slate-400">
                            Expires at
                        </p>
                        <p class="font-medium text-slate-900">
                            {{ formatTimestamp(issuedKeyResult.expiresAt) }}
                        </p>
                    </div>
                    <div class="space-y-1">
                        <p class="text-xs uppercase tracking-[0.18em] text-slate-400">
                            Scope count
                        </p>
                        <p class="font-medium text-slate-900">
                            {{ issuedKeyResult.scopes.length }}
                        </p>
                    </div>
                </div>

                <div class="space-y-2">
                    <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                        Scopes
                    </p>
                    <div class="flex flex-wrap gap-2">
                        <span
                            v-for="scope in issuedKeyResult.scopes"
                            :key="`issued:${scope}`"
                            class="inline-flex items-center rounded-full bg-blue-600/8 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                            {{ scope }}
                        </span>
                    </div>
                </div>

                <p
                    v-if="copyMessage"
                    :class="
                        copyState === 'error'
                            ? 'text-sm text-[#E53E3E]'
                            : 'text-sm text-emerald-700'
                    ">
                    {{ copyMessage }}
                </p>
            </div>

            <div
                v-else
                class="space-y-6">
                <div class="grid gap-4 md:grid-cols-2">
                    <div class="space-y-2">
                        <label
                            for="issue-active-from"
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            Active from
                        </label>
                        <input
                            id="issue-active-from"
                            v-model="issueForm.activeFrom"
                            type="datetime-local"
                            class="harmony-input w-full px-4 py-3 text-sm text-crh-grey-dark" />
                    </div>

                    <div class="space-y-2">
                        <label
                            for="issue-expires-at"
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            Expires at
                        </label>
                        <input
                            id="issue-expires-at"
                            v-model="issueForm.expiresAt"
                            type="datetime-local"
                            :max="issueExpiresAtMax"
                            class="harmony-input w-full px-4 py-3 text-sm text-crh-grey-dark" />
                    </div>
                </div>

                <div
                    class="rounded-[1rem] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-600">
                    Maximum allowed lifetime:
                    <span class="font-semibold text-slate-900">
                        {{ formatDuration(maxLifetimeSeconds) }}
                    </span>
                    <template v-if="issueActiveFromTimestamp !== null">
                        <br>
                        Latest allowed expiry for this start time:
                        <span class="font-semibold text-slate-900">
                            {{ formatTimestamp(issueMaxExpiresAtTimestamp) }}
                        </span>
                    </template>
                </div>

                <div class="space-y-3">
                    <div class="space-y-1">
                        <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            Scope tree
                        </p>
                        <p class="text-sm leading-6 text-slate-600">
                            Parent nodes toggle all child scopes. Only leaf
                            scopes are submitted.
                        </p>
                    </div>

                    <div class="rounded-[1.1rem] border border-slate-200 bg-slate-50/70 px-4 py-4">
                        <DashboardScopeTree
                            v-model="issueForm.scopes"
                            :scopes="creatableScopes"
                            :label-map="scopeLabelMap" />
                    </div>
                </div>

                <p
                    v-if="issueErrorMessage"
                    class="flex items-center gap-1.5 pl-1 text-xs leading-5 text-[#E53E3E]">
                    <span
                        aria-hidden="true"
                        class="font-semibold">
                        [!]
                    </span>
                    {{ issueErrorMessage }}
                </p>
            </div>

            <template #footer>
                <div
                    v-if="issuedKeyResult"
                    class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <UiButton
                        type="button"
                        variant="secondary"
                        @click="closeIssueModal">
                        Close
                    </UiButton>
                    <UiButton
                        type="button"
                        @click="copyIssuedKey">
                        Copy API Key
                    </UiButton>
                </div>

                <div
                    v-else
                    class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <UiButton
                        type="button"
                        variant="secondary"
                        :disabled="isIssuing"
                        @click="closeIssueModal">
                        Cancel
                    </UiButton>
                    <UiButton
                        type="button"
                        :loading="isIssuing"
                        @click="issueApiKey">
                        Issue key
                    </UiButton>
                </div>
            </template>
        </UiModal>

        <AppFooter />
    </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import type {
    AuthApiKeyIssuer,
    AuthApiKeyListItem,
    AuthApiKeyListResponse,
    AuthIssueApiKeyResponse
} from '~/types/auth';
import type { TrackerApiResponse } from '~/types/homepage';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

definePageMeta({
    middleware: 'auth-required'
});

const ISSUE_SCOPE = 'api.auth.api-keys.create';
const REVOKE_SCOPE = 'api.auth.api-keys.revoke';
const DEFAULT_ISSUE_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

const scopeLabelMap: Record<string, string> = {
    api: 'API',
    auth: 'Auth',
    me: 'Session',
    logout: 'Logout',
    search: 'Search',
    read: 'Read',
    records: 'Records',
    daily: 'Daily',
    history: 'History',
    train: 'Train',
    emu: 'EMU',
    exports: 'Exports',
    'api.auth': 'Auth',
    'api.auth.me': 'Current session',
    'api.auth.api-keys': 'API keys',
    'api.auth.api-keys.read': 'Read keys',
    'api.auth.api-keys.create': 'Issue keys',
    'api.auth.api-keys.revoke': 'Revoke keys',
    'api.auth.logout': 'Logout',
    'api.search': 'Search',
    'api.search.read': 'Read search',
    'api.records': 'Records',
    'api.records.daily': 'Daily records',
    'api.records.daily.read': 'Read daily records',
    'api.history': 'History',
    'api.history.train': 'Train history',
    'api.history.train.read': 'Read train history',
    'api.history.emu': 'EMU history',
    'api.history.emu.read': 'Read EMU history',
    'api.exports': 'Exports',
    'api.exports.daily': 'Daily exports',
    'api.exports.daily.read': 'Read daily exports'
};

interface DashboardMutationOptions {
    method: 'POST' | 'DELETE';
    body?: Record<string, unknown>;
}

const { session, clearSession } = useAuthState();
const requestFetch = import.meta.server ? useRequestFetch() : $fetch;

const logoutErrorMessage = ref('');
const isLoggingOut = ref(false);
const revokeTarget = ref<AuthApiKeyListItem | null>(null);
const revokeErrorMessage = ref('');
const isRevoking = ref(false);
const isIssueModalOpen = ref(false);
const isIssuing = ref(false);
const issueErrorMessage = ref('');
const issuedKeyResult = ref<AuthIssueApiKeyResponse | null>(null);
const copyState = ref<'idle' | 'success' | 'error'>('idle');
const nowSeconds = ref(Math.floor(Date.now() / 1000));

const issueForm = reactive({
    activeFrom: '',
    expiresAt: '',
    scopes: [] as string[]
});

let nowTimer: number | null = null;

async function fetchApiKeys() {
    const response = await requestFetch<TrackerApiResponse<AuthApiKeyListResponse>>(
        '/api/v1/auth/api-keys',
        {
            retry: 0
        }
    );

    if (!response.ok) {
        throw {
            data: response
        };
    }

    return response.data;
}

const {
    data: apiKeysData,
    status: apiKeysStatus,
    error: apiKeysError,
    refresh: refreshApiKeys
} = await useAsyncData('dashboard-api-keys', fetchApiKeys);

const apiKeyItems = computed(() => apiKeysData.value?.items ?? []);
const creatableScopes = computed(() => apiKeysData.value?.creatableScopes ?? []);
const defaultScopes = computed(() => apiKeysData.value?.defaultScopes ?? []);
const maxLifetimeSeconds = computed(
    () => apiKeysData.value?.maxLifetimeSeconds ?? 157680000
);
const isApiKeysLoading = computed(() => apiKeysStatus.value === 'pending');
const apiKeysErrorMessage = computed(() =>
    apiKeysError.value
        ? getApiErrorMessage(apiKeysError.value, 'Failed to load API key list.')
        : ''
);

const issuerGroups = computed(() => {
    const groups: Array<{
        issuer: AuthApiKeyIssuer;
        items: AuthApiKeyListItem[];
    }> = [
        {
            issuer: 'webapp',
            items: apiKeyItems.value.filter((item) => item.issuer === 'webapp')
        },
        {
            issuer: 'api',
            items: apiKeyItems.value.filter((item) => item.issuer === 'api')
        }
    ];

    return groups.filter((group) => group.items.length > 0);
});

const canIssueApiKeys = computed(() =>
    hasClientScope(session.value?.scopes ?? [], ISSUE_SCOPE)
);
const canRevokeApiKeys = computed(() =>
    hasClientScope(session.value?.scopes ?? [], REVOKE_SCOPE)
);
const issueActiveFromTimestamp = computed(() =>
    parseDateTimeLocalValue(issueForm.activeFrom)
);
const issueExpiresAtTimestamp = computed(() =>
    parseDateTimeLocalValue(issueForm.expiresAt)
);
const issueMaxExpiresAtTimestamp = computed(() => {
    if (issueActiveFromTimestamp.value === null) {
        return 0;
    }

    return issueActiveFromTimestamp.value + maxLifetimeSeconds.value;
});
const issueExpiresAtMax = computed(() =>
    issueActiveFromTimestamp.value === null
        ? ''
        : toDateTimeLocalValue(issueMaxExpiresAtTimestamp.value)
);

const copyMessage = computed(() => {
    switch (copyState.value) {
        case 'success':
            return 'API key copied to clipboard.';
        case 'error':
            return 'Copy failed. Please copy it manually.';
        default:
            return '';
    }
});

useHead({
    title: 'Dashboard | OpenCRHTracker',
    meta: [
        {
            name: 'description',
            content:
                'Manage the current account session and issue or revoke API keys.'
        }
    ]
});

watch(issueActiveFromTimestamp, (nextActiveFrom) => {
    if (nextActiveFrom === null) {
        return;
    }

    const currentExpiresAt = parseDateTimeLocalValue(issueForm.expiresAt);
    const defaultExpiresAt = Math.min(
        nextActiveFrom + DEFAULT_ISSUE_LIFETIME_SECONDS,
        nextActiveFrom + maxLifetimeSeconds.value
    );

    if (
        currentExpiresAt === null ||
        currentExpiresAt <= nextActiveFrom ||
        currentExpiresAt > nextActiveFrom + maxLifetimeSeconds.value
    ) {
        issueForm.expiresAt = toDateTimeLocalValue(defaultExpiresAt);
    }
});

onMounted(() => {
    nowTimer = window.setInterval(() => {
        nowSeconds.value = Math.floor(Date.now() / 1000);
    }, 60 * 1000);
});

onBeforeUnmount(() => {
    if (nowTimer !== null) {
        window.clearInterval(nowTimer);
    }
});

function hasClientScope(grantedScopes: string[], requiredScope: string) {
    const normalizedRequiredScope = requiredScope.trim().toLowerCase();

    return grantedScopes.some((scope) => {
        const normalizedGrantedScope = scope.trim().toLowerCase();

        return (
            normalizedGrantedScope === normalizedRequiredScope ||
            normalizedRequiredScope.startsWith(
                `${normalizedGrantedScope}.`
            )
        );
    });
}

function getIssuerLabel(issuer: AuthApiKeyIssuer) {
    return issuer === 'webapp' ? 'WebApp' : 'API';
}

function getIssuerSectionTitle(issuer: AuthApiKeyIssuer) {
    return issuer === 'webapp' ? 'WebApp sessions' : 'API keys';
}

function getIssuerBadgeClass(issuer: AuthApiKeyIssuer) {
    return issuer === 'webapp'
        ? 'inline-flex items-center rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white'
        : 'inline-flex items-center rounded-full bg-crh-blue/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-crh-blue';
}

function formatTimestamp(timestamp: number) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return '--';
    }

    return formatTrackerTimestamp(timestamp);
}

function formatDuration(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return '--';
    }

    const years = seconds / (365 * 24 * 60 * 60);
    if (Number.isInteger(years) && years >= 1) {
        return `${years} year${years === 1 ? '' : 's'}`;
    }

    const days = seconds / (24 * 60 * 60);
    if (Number.isInteger(days) && days >= 1) {
        return `${days} day${days === 1 ? '' : 's'}`;
    }

    const hours = seconds / (60 * 60);
    if (Number.isInteger(hours) && hours >= 1) {
        return `${hours} hour${hours === 1 ? '' : 's'}`;
    }

    return `${seconds} second${seconds === 1 ? '' : 's'}`;
}

function getStatusKey(item: AuthApiKeyListItem) {
    if (item.revokedAt !== null) {
        return 'revoked';
    }

    if (nowSeconds.value < item.activeFrom) {
        return 'pending';
    }

    if (nowSeconds.value >= item.expiresAt) {
        return 'expired';
    }

    return 'active';
}

function getStatusLabel(item: AuthApiKeyListItem) {
    switch (getStatusKey(item)) {
        case 'pending':
            return 'Pending';
        case 'expired':
            return 'Expired';
        case 'revoked':
            return 'Revoked';
        default:
            return 'Active';
    }
}

function getStatusBadgeClass(item: AuthApiKeyListItem) {
    switch (getStatusKey(item)) {
        case 'pending':
            return 'inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700';
        case 'expired':
            return 'inline-flex items-center rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600';
        case 'revoked':
            return 'inline-flex items-center rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-700';
        default:
            return 'inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700';
    }
}

function toDateTimeLocalValue(timestampSeconds: number) {
    const date = new Date(timestampSeconds * 1000);
    const dateParts = [
        date.getFullYear(),
        `${date.getMonth() + 1}`.padStart(2, '0'),
        `${date.getDate()}`.padStart(2, '0')
    ];
    const timeParts = [
        `${date.getHours()}`.padStart(2, '0'),
        `${date.getMinutes()}`.padStart(2, '0')
    ];

    return `${dateParts.join('-')}T${timeParts.join(':')}`;
}

function parseDateTimeLocalValue(value: string) {
    if (!value) {
        return null;
    }

    const timestampMs = Date.parse(value);
    if (!Number.isFinite(timestampMs)) {
        return null;
    }

    return Math.floor(timestampMs / 1000);
}

function resetIssueForm() {
    const nextActiveFrom = Math.floor(Date.now() / 1000);
    const nextExpiresAt = Math.min(
        nextActiveFrom + DEFAULT_ISSUE_LIFETIME_SECONDS,
        nextActiveFrom + maxLifetimeSeconds.value
    );

    issueForm.activeFrom = toDateTimeLocalValue(nextActiveFrom);
    issueForm.expiresAt = toDateTimeLocalValue(nextExpiresAt);
    issueForm.scopes = [...defaultScopes.value];
    issueErrorMessage.value = '';
    issuedKeyResult.value = null;
    copyState.value = 'idle';
}

function openIssueModal() {
    if (!canIssueApiKeys.value) {
        return;
    }

    resetIssueForm();
    isIssueModalOpen.value = true;
}

function closeIssueModal() {
    if (isIssuing.value) {
        return;
    }

    isIssueModalOpen.value = false;
    issueErrorMessage.value = '';
    copyState.value = 'idle';
}

function handleIssueModalVisibilityChange(nextValue: boolean) {
    if (nextValue) {
        isIssueModalOpen.value = true;
        return;
    }

    closeIssueModal();
}

function openRevokeModal(item: AuthApiKeyListItem) {
    if (!canRevokeApiKeys.value || item.revokedAt !== null) {
        return;
    }

    revokeTarget.value = item;
    revokeErrorMessage.value = '';
}

function closeRevokeModal() {
    if (isRevoking.value) {
        return;
    }

    revokeTarget.value = null;
    revokeErrorMessage.value = '';
}

function handleRevokeModalVisibilityChange(nextValue: boolean) {
    if (!nextValue) {
        closeRevokeModal();
    }
}

async function executeMutation<TData>(
    path: string,
    options: DashboardMutationOptions
) {
    const { data, error } = await useCsrfFetch<TrackerApiResponse<TData>>(path, {
        ...options,
        key: `dashboard:${path}:${Date.now()}`,
        watch: false,
        server: false
    });

    if (error.value) {
        throw error.value;
    }

    const response = data.value;
    if (!response) {
        throw new Error('Missing API response');
    }

    if (!response.ok) {
        throw {
            data: response
        };
    }

    return response.data;
}

async function logout() {
    if (isLoggingOut.value) {
        return;
    }

    isLoggingOut.value = true;
    logoutErrorMessage.value = '';

    try {
        await executeMutation('/api/v1/auth/logout', {
            method: 'POST'
        });
        clearSession();
        await navigateTo('/login');
    } catch (error) {
        logoutErrorMessage.value = getApiErrorMessage(
            error,
            'Sign out failed. Please try again.'
        );
    } finally {
        isLoggingOut.value = false;
    }
}

async function confirmRevoke() {
    if (!revokeTarget.value || isRevoking.value) {
        return;
    }

    isRevoking.value = true;
    revokeErrorMessage.value = '';

    const target = revokeTarget.value;

    try {
        await executeMutation(`/api/v1/auth/api-keys/${target.keyId}`, {
            method: 'DELETE'
        });

        if (session.value?.keyId === target.keyId) {
            clearSession();
            revokeTarget.value = null;
            await navigateTo('/login');
            return;
        }

        revokeTarget.value = null;
        await refreshApiKeys();
    } catch (error) {
        revokeErrorMessage.value = getApiErrorMessage(
            error,
            'Revoking this API key failed. Please try again.'
        );
    } finally {
        isRevoking.value = false;
    }
}

function validateIssueForm() {
    if (issueActiveFromTimestamp.value === null) {
        return 'Please provide a valid active-from timestamp.';
    }

    if (issueExpiresAtTimestamp.value === null) {
        return 'Please provide a valid expiry timestamp.';
    }

    if (issueActiveFromTimestamp.value >= issueExpiresAtTimestamp.value) {
        return 'Expiry must be later than active-from.';
    }

    if (
        issueExpiresAtTimestamp.value - issueActiveFromTimestamp.value >
        maxLifetimeSeconds.value
    ) {
        return 'The requested lifetime exceeds the configured maximum.';
    }

    if (issueForm.scopes.length === 0) {
        return 'Select at least one leaf scope.';
    }

    return '';
}

async function issueApiKey() {
    if (isIssuing.value) {
        return;
    }

    const validationError = validateIssueForm();
    if (validationError) {
        issueErrorMessage.value = validationError;
        return;
    }

    isIssuing.value = true;
    issueErrorMessage.value = '';

    try {
        issuedKeyResult.value = await executeMutation<AuthIssueApiKeyResponse>(
            '/api/v1/auth/api-keys',
            {
                method: 'POST',
                body: {
                    activeFrom: issueActiveFromTimestamp.value!,
                    expiresAt: issueExpiresAtTimestamp.value!,
                    scopes: issueForm.scopes
                }
            }
        );
        copyState.value = 'idle';
        await refreshApiKeys();
    } catch (error) {
        issueErrorMessage.value = getApiErrorMessage(
            error,
            'Issuing the API key failed. Please try again.'
        );
    } finally {
        isIssuing.value = false;
    }
}

async function copyIssuedKey() {
    if (!issuedKeyResult.value || !import.meta.client) {
        return;
    }

    try {
        await navigator.clipboard.writeText(issuedKeyResult.value.apiKey);
        copyState.value = 'success';
    } catch {
        copyState.value = 'error';
    }
}
</script>
