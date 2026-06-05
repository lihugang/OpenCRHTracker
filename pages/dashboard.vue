<template>
    <main
        class="flex min-h-screen flex-col bg-[linear-gradient(180deg,#f8fafc_0%,#f3f8ff_100%)] text-crh-grey-dark">
        <div
            class="pointer-events-none absolute inset-x-0 top-0 h-[24rem] bg-[radial-gradient(circle_at_top,_rgba(0,82,155,0.14),_transparent_58%)]" />
        <div
            class="pointer-events-none absolute inset-x-0 top-20 h-40 bg-[linear-gradient(90deg,_rgba(90,132,162,0.12),_rgba(90,132,162,0))] blur-3xl" />

        <div
            class="relative mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
            <div
                class="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
                <aside class="hidden lg:col-start-1 lg:row-start-2 lg:block">
                    <UiCard
                        :show-accent-bar="false"
                        class="dashboard-glass-card sticky top-24">
                        <div class="space-y-5">
                            <div
                                class="flex items-center justify-between gap-3">
                                <UiButton
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    @click="goHome">
                                    <svg
                                        aria-hidden="true"
                                        viewBox="0 0 20 20"
                                        fill="none"
                                        class="h-4 w-4">
                                        <path
                                            d="M11.5 5.5L7 10L11.5 14.5"
                                            stroke="currentColor"
                                            stroke-width="1.8"
                                            stroke-linecap="round"
                                            stroke-linejoin="round" />
                                    </svg>
                                    {{ dashboardPageCopy.backHomeLabel }}
                                </UiButton>
                            </div>

                            <div class="space-y-2">
                                <p
                                    class="text-xs font-medium uppercase tracking-[0.26em] text-crh-blue/80">
                                    {{ dashboardPageCopy.eyebrow }}
                                </p>
                                <h1
                                    class="text-2xl font-semibold text-slate-900">
                                    {{ dashboardPageCopy.navTitle }}
                                </h1>
                            </div>

                            <div class="motion-divider" />

                            <nav class="space-y-1.5">
                                <button
                                    v-for="panel in dashboardPanels"
                                    :key="panel.id"
                                    type="button"
                                    :class="getPanelButtonClass(panel.id)"
                                    @click="setPanel(panel.id)">
                                    <span
                                        class="flex min-w-0 flex-1 items-center gap-3 text-left">
                                        <span
                                            aria-hidden="true"
                                            class="h-5 w-1 rounded-full transition"
                                            :class="
                                                panel.id === currentPanelId
                                                    ? 'bg-crh-blue shadow-[0_0_10px_rgba(0,82,155,0.35)]'
                                                    : 'bg-slate-300/80 group-hover:bg-slate-400/90'
                                            " />
                                        <span
                                            class="text-left text-sm font-semibold">
                                            {{ panel.label }}
                                        </span>
                                    </span>
                                </button>
                            </nav>
                        </div>
                    </UiCard>
                </aside>

                <div class="hidden px-1 lg:col-start-2 lg:row-start-1 lg:block">
                    <h2
                        class="text-3xl font-semibold tracking-tight text-slate-900">
                        {{ currentPanelDefinition.headerTitle }}
                    </h2>
                </div>

                <div class="space-y-6 lg:col-start-2 lg:row-start-2">
                    <UiCard
                        :show-accent-bar="false"
                        class="dashboard-glass-card lg:hidden">
                        <div class="space-y-4">
                            <div
                                class="flex items-center justify-between gap-3">
                                <UiButton
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    @click="goHome">
                                    <svg
                                        aria-hidden="true"
                                        viewBox="0 0 20 20"
                                        fill="none"
                                        class="h-4 w-4">
                                        <path
                                            d="M11.5 5.5L7 10L11.5 14.5"
                                            stroke="currentColor"
                                            stroke-width="1.8"
                                            stroke-linecap="round"
                                            stroke-linejoin="round" />
                                    </svg>
                                    {{ dashboardPageCopy.backHomeLabel }}
                                </UiButton>
                            </div>

                            <div class="space-y-2">
                                <p
                                    class="text-xs font-medium uppercase tracking-[0.26em] text-crh-blue/80">
                                    {{ dashboardPageCopy.eyebrow }}
                                </p>
                                <h1
                                    class="text-2xl font-semibold text-slate-900">
                                    {{ dashboardPageCopy.navTitle }}
                                </h1>
                            </div>

                            <button
                                type="button"
                                class="harmony-input flex w-full items-center justify-between gap-4 px-4 py-3 text-left focus-visible:outline-none"
                                :aria-label="
                                    dashboardPageCopy.currentPanelLabel
                                "
                                aria-haspopup="dialog"
                                :aria-expanded="
                                    isPanelSheetOpen ? 'true' : 'false'
                                "
                                @click="openPanelSheet">
                                <span
                                    class="block min-w-0 text-sm font-semibold text-slate-900">
                                    {{ currentPanelDefinition.label }}
                                </span>
                                <span
                                    class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white/90 text-crh-blue transition"
                                    :class="
                                        isPanelSheetOpen
                                            ? 'border-crh-blue/25 bg-blue-50/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-sm'
                                            : ''
                                    ">
                                    <svg
                                        aria-hidden="true"
                                        viewBox="0 0 20 20"
                                        fill="none"
                                        class="h-4 w-4 transition-transform duration-200 ease-out"
                                        :class="
                                            isPanelSheetOpen ? 'rotate-180' : ''
                                        ">
                                        <path
                                            d="M5 7.5L10 12.5L15 7.5"
                                            stroke="currentColor"
                                            stroke-width="1.8"
                                            stroke-linecap="round"
                                            stroke-linejoin="round" />
                                    </svg>
                                </span>
                            </button>
                        </div>
                    </UiCard>

                    <Transition
                        mode="out-in"
                        enter-active-class="transition duration-200 ease-out"
                        enter-from-class="translate-y-2 opacity-0"
                        leave-active-class="transition duration-180 ease-out"
                        leave-to-class="-translate-y-1 opacity-0">
                        <div
                            v-if="currentPanelId === 'general'"
                            key="general"
                            class="max-w-3xl">
                            <DashboardGeneralCard
                                :session="session"
                                :can-change-password="canChangePassword"
                                :can-read-settings="canReadSettings"
                                :can-write-settings="canWriteSettings"
                                v-model:current-password="
                                    changePasswordForm.currentPassword
                                "
                                v-model:new-password="
                                    changePasswordForm.newPassword
                                "
                                v-model:confirm-new-password="
                                    changePasswordForm.confirmNewPassword
                                "
                                :save-search-history="
                                    userPreference.saveSearchHistory
                                "
                                :is-updating-user-preference="
                                    isUpdatingUserPreference
                                "
                                :user-preference-message="
                                    resolvedUserPreferenceMessage
                                "
                                :user-preference-tone="
                                    resolvedUserPreferenceTone
                                "
                                :is-changing-password="isChangingPassword"
                                :change-password-message="changePasswordMessage"
                                :change-password-tone="changePasswordTone"
                                :is-logging-out="isLoggingOut"
                                :logout-error-message="logoutErrorMessage"
                                @toggle-save-search-history="
                                    toggleSaveSearchHistory
                                "
                                @change-password="changePassword"
                                @logout="logout" />
                        </div>

                        <div
                            v-else-if="currentPanelId === 'favorites'"
                            key="favorites"
                            class="max-w-3xl">
                            <DashboardFavoriteListPanel
                                :items="favoriteItems"
                                :is-loading="isFavoritesLoading"
                                :error-message="favoritesErrorMessage"
                                :max-entries="favoriteMaxEntries"
                                :format-timestamp="formatTimestamp"
                                :is-favorite-pending="isFavoritePending"
                                @toggle-favorite="toggleFavorite" />
                        </div>

                        <div
                            v-else-if="currentPanelId === 'subscriptions'"
                            key="subscriptions"
                            class="max-w-4xl space-y-6">
                            <DashboardEventSubscriptionPanel
                                :items="eventSubscriptionItems"
                                :is-loading="isEventSubscriptionsLoading"
                                :error-message="eventSubscriptionsErrorMessage"
                                :max-entries="eventSubscriptionMaxEntries"
                                :device-count="subscriptionItems.length"
                                :format-timestamp="formatTimestamp"
                                :is-pending="isEventSubscriptionPending"
                                @delete-subscription="
                                    removeEventSubscription
                                " />

                            <DashboardSubscriptionPanel
                                :items="subscriptionItems"
                                :state="subscriptionsState"
                                :error-message="subscriptionsErrorMessage"
                                :max-devices="subscriptionMaxDevices"
                                :vapid-public-key="vapidPublicKey"
                                :supports-push="supportsPush"
                                :notification-permission="
                                    notificationPermission
                                "
                                :current-item="currentSubscriptionItem"
                                :current-device-status="currentDeviceStatus"
                                :can-write-subscriptions="canWriteSubscriptions"
                                :is-refreshing-current-device="
                                    isRefreshingCurrentDevice
                                "
                                :format-timestamp="formatTimestamp"
                                :refresh="refreshSubscriptions"
                                :sync-current-device="
                                    syncCurrentDeviceSubscription
                                "
                                :rename-subscription="renameSubscription"
                                :delete-subscription="deleteSubscription"
                                :is-pending="isSubscriptionPending" />
                        </div>

                        <div
                            v-else-if="currentPanelId === 'authorizations'"
                            key="authorizations"
                            class="max-w-4xl">
                            <DashboardAuthorizationListPanel
                                :items="authorizationItems"
                                :is-loading="isAuthorizationsLoading"
                                :error-message="authorizationsErrorMessage"
                                :can-read-authorizations="canReadAuthorizations"
                                :can-revoke-authorizations="
                                    canRevokeAuthorizations
                                "
                                :format-timestamp="formatTimestamp"
                                :is-pending="isAuthorizationPending"
                                @refresh="refreshAuthorizations()"
                                @revoke="openAuthorizationRevokeModal" />
                        </div>

                        <div
                            v-else
                            key="developer"
                            class="space-y-6">
                            <DashboardDeveloperOverview
                                v-model:mode="developerMode"
                                :session="session"
                                :quota="liveQuotaSummary"
                                :current-key-name="currentKeyName"
                                :current-masked-key-id="currentMaskedKeyId"
                                :format-timestamp="formatTimestamp"
                                :format-token-count="formatTokenCount"
                                :quota-status-label="quotaStatusLabel"
                                :get-issuer-label="getIssuerLabel"
                                :get-issuer-badge-class="getIssuerBadgeClass" />

                            <DashboardIssueApiKeyPanel
                                v-if="developerMode === 'keys'"
                                :name="issueForm.name"
                                :active-from="issueForm.activeFrom"
                                :expires-at="issueForm.expiresAt"
                                :scopes="issueForm.scopes"
                                :issue-name-error="issueNameError"
                                :issue-error-message="issueErrorMessage"
                                :issued-key-result="issuedKeyResult"
                                :is-issuing="isIssuing"
                                :can-issue-api-keys="canIssueApiKeys"
                                :can-submit-issue-form="canSubmitIssueForm"
                                :max-lifetime-seconds="maxLifetimeSeconds"
                                :creatable-scope-count="creatableScopes.length"
                                :creatable-scopes="creatableScopes"
                                :api-key-name-length="apiKeyNameLength"
                                :issue-active-from-timestamp="
                                    issueActiveFromTimestamp
                                "
                                :issue-max-expires-at-timestamp="
                                    issueMaxExpiresAtTimestamp
                                "
                                :issue-expires-at-max="issueExpiresAtMax"
                                :copy-state="copyState"
                                :copy-message="copyMessage"
                                :scope-label-map="scopeLabelMap"
                                :format-duration="formatDuration"
                                :format-timestamp="formatTimestamp"
                                :get-issuer-label="getIssuerLabel"
                                @update:name="issueForm.name = $event"
                                @update:active-from="
                                    issueForm.activeFrom = $event
                                "
                                @update:expires-at="
                                    issueForm.expiresAt = $event
                                "
                                @update:scopes="issueForm.scopes = $event"
                                @submit="issueApiKey"
                                @reset-form="resetIssueForm"
                                @open-list="openApiKeyListModal"
                                @copy-issued-key="copyIssuedKey"
                                @dismiss-issued-result="
                                    dismissIssuedKeyResult
                                " />

                            <DashboardOauthCreatePanel
                                v-else
                                :name="oauthForm.name"
                                :description="oauthForm.description"
                                :homepage-url="oauthForm.homepageUrl"
                                :redirect-uris-text="oauthForm.redirectUrisText"
                                :requested-scopes="oauthForm.requestedScopes"
                                :allowed-scopes="allowedOauthScopes"
                                :scope-label-map="scopeLabelMap"
                                :mutation-message="oauthMutationMessage"
                                :mutation-tone="oauthMutationTone"
                                :is-submitting="isSubmittingOauthClient"
                                @update:name="oauthForm.name = $event"
                                @update:description="
                                    oauthForm.description = $event
                                "
                                @update:homepage-url="
                                    oauthForm.homepageUrl = $event
                                "
                                @update:redirect-uris-text="
                                    oauthForm.redirectUrisText = $event
                                "
                                @update:requested-scopes="
                                    oauthForm.requestedScopes = $event
                                "
                                @submit="createOauthClient"
                                @reset="resetOauthForm"
                                @open-list="openOauthClientListModal" />
                        </div>
                    </Transition>
                </div>
            </div>
        </div>

        <UiBottomSheet
            :model-value="isPanelSheetOpen"
            :eyebrow="dashboardPageCopy.panelSheetEyebrow"
            :title="dashboardPageCopy.panelSheetTitle"
            @update:model-value="handlePanelSheetVisibilityChange">
            <div class="space-y-3">
                <button
                    v-for="panel in dashboardPanels"
                    :key="`sheet:${panel.id}`"
                    type="button"
                    :class="getPanelSheetOptionClass(panel.id)"
                    :aria-pressed="
                        panel.id === currentPanelId ? 'true' : 'false'
                    "
                    @click="selectPanel(panel.id)">
                    <span class="text-left text-sm font-semibold">
                        {{ panel.label }}
                    </span>
                    <span
                        class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium transition"
                        :class="
                            panel.id === currentPanelId
                                ? 'border-crh-blue/25 bg-blue-50 text-crh-blue'
                                : 'border-slate-200 bg-white text-transparent'
                        ">
                        <svg
                            v-if="panel.id === currentPanelId"
                            aria-hidden="true"
                            viewBox="0 0 20 20"
                            fill="none"
                            class="h-4 w-4">
                            <path
                                d="M5 10.5L8.5 14L15 7.5"
                                stroke="currentColor"
                                stroke-width="1.8"
                                stroke-linecap="round"
                                stroke-linejoin="round" />
                        </svg>
                        <span v-else>·</span>
                    </span>
                </button>
            </div>
        </UiBottomSheet>

        <UiModal
            :model-value="revokeTarget !== null"
            title="吊销 API 密钥"
            :close-on-backdrop="!isRevoking"
            @update:model-value="handleRevokeModalVisibilityChange">
            <div
                v-if="revokeTarget"
                class="space-y-4">
                <div
                    class="dashboard-soft-surface rounded-[1rem] border px-4 py-4">
                    <div
                        class="flex flex-wrap items-center justify-between gap-3">
                        <span :class="getIssuerBadgeClass(revokeTarget.issuer)">
                            {{ getIssuerLabel(revokeTarget.issuer) }}
                        </span>
                        <span
                            v-if="session?.revokeId === revokeTarget.revokeId"
                            class="inline-flex shrink-0 whitespace-nowrap items-center rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-white">
                            当前会话
                        </span>
                    </div>
                    <p
                        class="mt-3 font-mono text-sm font-semibold text-crh-blue">
                        {{ revokeTarget.maskedKeyId }}
                    </p>
                    <p
                        v-if="session?.revokeId === revokeTarget.revokeId"
                        class="mt-2 text-sm leading-6 text-slate-600">
                        将吊销当前会话密钥，确认后会退出登录。
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
                <div
                    class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <UiButton
                        type="button"
                        variant="secondary"
                        :disabled="isRevoking"
                        @click="closeRevokeModal">
                        取消
                    </UiButton>
                    <UiButton
                        type="button"
                        :loading="isRevoking"
                        @click="confirmRevoke">
                        确认吊销
                    </UiButton>
                </div>
            </template>
        </UiModal>

        <UiModal
            :model-value="authorizationRevokeTarget !== null"
            title="取消应用授权"
            :close-on-backdrop="!isRevokingAuthorization"
            @update:model-value="
                handleAuthorizationRevokeModalVisibilityChange
            ">
            <div
                v-if="authorizationRevokeTarget"
                class="space-y-4">
                <div
                    class="dashboard-soft-surface rounded-[1rem] border px-4 py-4">
                    <div class="space-y-3">
                        <div class="flex flex-wrap items-center gap-2">
                            <p class="text-base font-semibold text-slate-900">
                                {{ authorizationRevokeTarget.name }}
                            </p>
                            <span
                                v-if="authorizationRevokeTarget.isTrusted"
                                class="inline-flex shrink-0 whitespace-nowrap items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-emerald-700">
                                Trusted
                            </span>
                        </div>
                        <p
                            class="break-all font-mono text-sm font-semibold text-crh-blue">
                            {{ authorizationRevokeTarget.clientId }}
                        </p>
                        <p class="text-sm leading-6 text-slate-600">
                            取消授权后，该应用的授权记录会被删除，现有 OAuth
                            访问令牌会立即失效。之后如需继续使用该应用，需要重新授权。
                        </p>
                    </div>
                </div>

                <p
                    v-if="authorizationRevokeErrorMessage"
                    class="flex items-center gap-1.5 pl-1 text-xs leading-5 text-[#E53E3E]">
                    <span
                        aria-hidden="true"
                        class="font-semibold">
                        [!]
                    </span>
                    {{ authorizationRevokeErrorMessage }}
                </p>
            </div>

            <template #footer>
                <div
                    class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <UiButton
                        type="button"
                        variant="secondary"
                        :disabled="isRevokingAuthorization"
                        @click="closeAuthorizationRevokeModal">
                        取消
                    </UiButton>
                    <UiButton
                        type="button"
                        :loading="isRevokingAuthorization"
                        @click="confirmAuthorizationRevoke">
                        确认取消授权
                    </UiButton>
                </div>
            </template>
        </UiModal>

        <UiModal
            :model-value="isApiKeyListModalOpen"
            eyebrow="LIST"
            title="API 密钥列表"
            size="screen"
            height="tall"
            @update:model-value="isApiKeyListModalOpen = $event">
            <DashboardKeyListPanel
                :groups="issuerGroups"
                :is-loading="isApiKeysLoading"
                :error-message="apiKeysErrorMessage"
                :can-revoke="canRevokeApiKeys"
                :format-timestamp="formatTimestamp"
                :format-token-count="formatTokenCount"
                :get-issuer-label="getIssuerLabel"
                :get-issuer-section-title="getIssuerSectionTitle"
                :get-issuer-badge-class="getIssuerBadgeClass"
                :get-status-label="getStatusLabel"
                :get-status-badge-class="getStatusBadgeClass"
                @refresh="refreshApiKeys()"
                @revoke="openRevokeModal" />
        </UiModal>

        <UiModal
            :model-value="isOauthClientListModalOpen"
            eyebrow="LIST"
            title="OAuth 客户端列表"
            size="screen"
            height="tall"
            @update:model-value="isOauthClientListModalOpen = $event">
            <DashboardOauthClientListPanel
                :items="oauthClientItems"
                :is-loading="isOauthClientsLoading"
                :error-message="oauthClientsErrorMessage"
                :format-timestamp="formatTimestamp"
                @refresh="refreshOauthClients()" />
        </UiModal>

        <AppFooter />
    </main>
</template>

<script setup lang="ts">
import {
    computed,
    onBeforeUnmount,
    onMounted,
    reactive,
    ref,
    watch
} from 'vue';
import useTrackedRequestFetch, {
    type TrackedRequestFetch
} from '~/composables/useTrackedRequestFetch';
import type {
    AuthAuthorizationItem,
    AuthAuthorizationListResponse,
    AuthApiKeyIssuer,
    AuthApiKeyListItem,
    AuthApiKeyListResponse,
    AuthApiKeyNameLength,
    AuthQuotaSummary,
    AuthIssueApiKeyResponse,
    AuthSession,
    OAuthClientListResponse,
    OAuthClientMutationResponse,
    OAuthClientPublicItem
} from '~/types/auth';
import type { TrackerApiResponse } from '~/types/homepage';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import {
    normalizeApiKeyName,
    validateApiKeyName
} from '~/utils/auth/apiKeyName';
import hashPasswordDigest from '~/utils/auth/hashPasswordDigest';
import { validatePassword } from '~/utils/auth/credentials';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

definePageMeta({
    middleware: 'auth-required'
});

const PASSWORD_SCOPE = 'api.auth.password.update';
const AUTHORIZATION_READ_SCOPE = 'api.auth.authorizations.read';
const AUTHORIZATION_REVOKE_SCOPE = 'api.auth.authorizations.revoke';
const ISSUE_SCOPE = 'api.auth.api-keys.create';
const REVOKE_SCOPE = 'api.auth.api-keys.revoke';
const DEFAULT_ISSUE_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

const dashboardPageCopy = {
    eyebrow: 'SETTINGS',
    navTitle: '设置',
    backHomeLabel: '返回主页',
    currentPanelLabel: '当前面板',
    panelSheetEyebrow: 'SWITCH',
    panelSheetTitle: '切换选项卡',
    pageTitle: '设置 | Open CRH Tracker',
    pageDescription: '管理账户安全、收藏、授权应用、订阅设备、会话和 API 密钥。'
} as const;

const dashboardPanels = [
    {
        id: 'general',
        label: '常规',
        headerTitle: '常规',
        title: '账户与基础操作',
        description: '查看账户和登录状态。'
    },
    {
        id: 'favorites',
        label: '收藏',
        headerTitle: '收藏',
        title: '收藏项目',
        description: '查看和管理你的收藏。'
    },
    {
        id: 'subscriptions',
        label: '订阅',
        headerTitle: '订阅',
        title: '订阅设备',
        description: '查看和管理各设备的订阅。'
    },
    {
        id: 'authorizations',
        label: '授权',
        headerTitle: '授权',
        title: '已授权应用',
        description: '查看和取消第三方应用授权。'
    },
    {
        id: 'developer',
        label: '开发',
        headerTitle: '开发',
        title: '会话与 API 密钥',
        description: '查看会话和 API 密钥。'
    }
] as const;

type DashboardPanelId = (typeof dashboardPanels)[number]['id'];

const scopeLabelMap: Record<string, string> = {
    api: 'API',
    auth: '鉴权',
    me: '当前会话',
    logout: '退出登录',
    search: '搜索',
    read: '读取',
    records: '记录',
    daily: '日报',
    history: '历史记录',
    train: '车次',
    station: '车站',
    emu: '动车组',
    exports: '导出',
    timetable: '时刻表',
    'api.auth': '鉴权',
    'api.auth.me': '当前会话',
    'api.auth.me.read': '读取当前会话',
    'api.auth.password': '密码',
    'api.auth.password.update': '修改密码',
    'api.auth.settings': '设置',
    'api.auth.settings.read': '读取设置',
    'api.auth.settings.write': '修改设置',
    'api.auth.authorizations': '应用授权',
    'api.auth.authorizations.read': '读取授权记录',
    'api.auth.authorizations.revoke': '取消应用授权',
    'api.auth.api-keys': 'API 密钥',
    'api.auth.api-keys.read': '读取密钥',
    'api.auth.api-keys.create': '签发密钥',
    'api.auth.api-keys.revoke': '吊销密钥',
    'api.auth.favorites': '收藏',
    'api.auth.favorites.read': '读取收藏',
    'api.auth.favorites.write': '修改收藏',
    'api.auth.subscriptions': '订阅',
    'api.auth.subscriptions.read': '读取订阅',
    'api.auth.subscriptions.write': '修改订阅',
    'api.auth.logout': '退出登录',
    'api.search': '搜索',
    'api.search.read': '读取搜索',
    'api.records': '记录',
    'api.records.daily': '今日记录',
    'api.records.daily.read': '读取今日记录',
    'api.history': '历史记录',
    'api.history.train': '车次历史记录',
    'api.history.train.read': '读取车次历史记录',
    'api.history.emu': '动车组历史记录',
    'api.history.emu.read': '读取动车组历史记录',
    'api.timetable': '时刻表',
    'api.timetable.train': '车次时刻表',
    'api.timetable.train.circulation': '列车交路运行图',
    'api.timetable.train.circulation.image': '列车交路运行图图片',
    'api.timetable.train.circulation.image.read': '列车交路运行图图片生成',
    'api.timetable.train.current': '当前车次时刻表',
    'api.timetable.train.current.read': '读取当前车次时刻表',
    'api.timetable.train.history': '历史车次时刻表',
    'api.timetable.train.history.read': '读取历史车次时刻表',
    'api.timetable.station': '车站时刻表',
    'api.timetable.station.read': '读取车站时刻表',
    'api.exports': '导出',
    'api.exports.daily': '按日导出',
    'api.exports.daily.read': '导出某日所有数据',
    'api.feedback': '反馈',
    'api.feedback.read': '读取反馈',
    'api.feedback.create': '提交反馈',
    'api.feedback.reply': '回复反馈',
    'api.feedback.manage': '管理反馈'
};

interface DashboardMutationOptions {
    method: 'POST' | 'PATCH' | 'DELETE';
    body?: Record<string, unknown>;
}

type DeveloperMode = 'keys' | 'oauth';

const route = useRoute();
const router = useRouter();
const { session, clearSession, setSession } = useAuthState();
const requestFetch: TrackedRequestFetch = import.meta.server
    ? useTrackedRequestFetch()
    : ($fetch as TrackedRequestFetch);
const {
    userPreference,
    state: userSettingsState,
    errorMessage: userSettingsErrorMessage,
    canReadSettings,
    canWriteSettings,
    updateUserPreference
} = useUserSettings();
const { clearRecentSearches } = useRecentLookupSearches();
const {
    items: favoriteItems,
    maxEntries: favoriteMaxEntries,
    state: favoritesState,
    errorMessage: favoritesErrorMessage,
    isFavoritePending,
    toggleFavorite
} = useFavoriteLookups();
const {
    items: eventSubscriptionItems,
    maxEntries: eventSubscriptionMaxEntries,
    state: eventSubscriptionsState,
    errorMessage: eventSubscriptionsErrorMessage,
    isPending: isEventSubscriptionPending,
    removeEventSubscription
} = useEventSubscriptions();
const {
    items: subscriptionItems,
    state: subscriptionsState,
    errorMessage: subscriptionsErrorMessage,
    maxDevices: subscriptionMaxDevices,
    vapidPublicKey,
    supportsPush,
    notificationPermission,
    currentItem: currentSubscriptionItem,
    currentDeviceStatus,
    isRefreshingCurrentDevice,
    canWriteSubscriptions,
    syncCurrentDeviceSubscription,
    renameSubscription,
    deleteSubscription,
    isPending: isSubscriptionPending,
    refresh: refreshSubscriptions
} = useSubscriptionDevices();

const logoutErrorMessage = ref('');
const isLoggingOut = ref(false);
const changePasswordMessage = ref('');
const changePasswordTone = ref<'success' | 'error'>('success');
const userPreferenceMessage = ref('');
const userPreferenceTone = ref<'success' | 'error'>('success');
const isChangingPassword = ref(false);
const isPanelSheetOpen = ref(false);
const revokeTarget = ref<AuthApiKeyListItem | null>(null);
const revokeErrorMessage = ref('');
const isRevoking = ref(false);
const authorizationRevokeTarget = ref<AuthAuthorizationItem | null>(null);
const authorizationRevokeErrorMessage = ref('');
const revokingAuthorizationClientIds = ref<string[]>([]);
const isRevokingAuthorization = ref(false);
const developerMode = ref<DeveloperMode>('keys');
const isApiKeyListModalOpen = ref(false);
const isOauthClientListModalOpen = ref(false);
const isIssuing = ref(false);
const isSubmittingOauthClient = ref(false);
const issueErrorMessage = ref('');
const issuedKeyResult = ref<AuthIssueApiKeyResponse | null>(null);
const copyState = ref<'idle' | 'success' | 'error'>('idle');
const nowSeconds = ref(Math.floor(Date.now() / 1000));
const oauthMutationMessage = ref('');
const oauthMutationTone = ref<'success' | 'error'>('success');

const issueForm = reactive({
    name: '',
    activeFrom: '',
    expiresAt: '',
    scopes: [] as string[]
});
const oauthForm = reactive({
    name: '',
    description: '',
    homepageUrl: '',
    redirectUrisText: '',
    requestedScopes: [] as string[]
});
const changePasswordForm = reactive({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: ''
});

let nowTimer: number | null = null;

function readPanelQuery(value: unknown) {
    if (Array.isArray(value)) {
        return typeof value[0] === 'string' ? value[0] : '';
    }

    return typeof value === 'string' ? value : '';
}

function normalizePanelId(value: string): DashboardPanelId {
    if (value === 'developer') {
        return 'developer';
    }

    if (value === 'authorizations') {
        return 'authorizations';
    }

    if (value === 'subscriptions') {
        return 'subscriptions';
    }

    if (value === 'favorites') {
        return 'favorites';
    }

    return 'general';
}

const currentPanelId = computed<DashboardPanelId>(() =>
    normalizePanelId(readPanelQuery(route.query.panel))
);

const currentPanelDefinition = computed(() => {
    return (
        dashboardPanels.find((panel) => panel.id === currentPanelId.value) ??
        dashboardPanels[0]
    );
});

async function syncPanelQuery(panelId: DashboardPanelId) {
    await router.replace({
        query: {
            ...route.query,
            panel: panelId
        }
    });
}

function setPanel(panelId: DashboardPanelId) {
    if (panelId === currentPanelId.value) {
        return;
    }

    void syncPanelQuery(panelId);
}

async function goHome() {
    await navigateTo('/');
}

function openPanelSheet() {
    isPanelSheetOpen.value = true;
}

function closePanelSheet() {
    isPanelSheetOpen.value = false;
}

function handlePanelSheetVisibilityChange(nextValue: boolean) {
    isPanelSheetOpen.value = nextValue;
}

async function selectPanel(panelId: DashboardPanelId) {
    closePanelSheet();

    if (panelId === currentPanelId.value) {
        return;
    }

    await syncPanelQuery(panelId);
}

if (import.meta.client) {
    watch(
        () => route.query.panel,
        (value) => {
            const rawPanel = readPanelQuery(value);
            const normalizedPanel = normalizePanelId(rawPanel);

            if (rawPanel !== normalizedPanel) {
                void syncPanelQuery(normalizedPanel);
            }
        },
        {
            immediate: true
        }
    );
}

async function fetchApiKeys() {
    const response = await requestFetch<
        TrackerApiResponse<AuthApiKeyListResponse>
    >('/api/v1/auth/api-keys', {
        retry: 0
    });

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

async function fetchOauthClients() {
    const response = await requestFetch<
        TrackerApiResponse<OAuthClientListResponse>
    >('/api/v1/oauth/clients', {
        retry: 0
    });

    if (!response.ok) {
        throw {
            data: response
        };
    }

    return response.data;
}

async function fetchAuthorizations() {
    const response = await requestFetch<
        TrackerApiResponse<AuthAuthorizationListResponse>
    >('/api/v1/auth/authorizations', {
        retry: 0
    });

    if (!response.ok) {
        throw {
            data: response
        };
    }

    return response.data;
}

const {
    data: oauthClientsData,
    status: oauthClientsStatus,
    error: oauthClientsError,
    refresh: refreshOauthClients
} = await useAsyncData('dashboard-oauth-clients', fetchOauthClients);

const {
    data: authorizationsData,
    status: authorizationsStatus,
    error: authorizationsError,
    refresh: refreshAuthorizations
} = await useAsyncData('dashboard-authorizations', fetchAuthorizations);

const apiKeyItems = computed(() => apiKeysData.value?.items ?? []);
const authorizationItems = computed<AuthAuthorizationItem[]>(
    () => authorizationsData.value?.items ?? []
);
const oauthClientItems = computed<OAuthClientPublicItem[]>(
    () => oauthClientsData.value?.items ?? []
);
const allowedOauthScopes = computed(
    () => oauthClientsData.value?.allowedScopes ?? []
);
const creatableScopes = computed(
    () => apiKeysData.value?.creatableScopes ?? []
);
const defaultScopes = computed(() => apiKeysData.value?.defaultScopes ?? []);
const quotaSummary = computed<AuthQuotaSummary | null>(
    () => apiKeysData.value?.quota ?? null
);
const liveQuotaSummary = computed<AuthQuotaSummary | null>(() => {
    const quota = quotaSummary.value;
    if (!quota) {
        return null;
    }

    let remain = quota.remain;
    let nextRefillAt = quota.nextRefillAt;

    while (
        nextRefillAt !== null &&
        nextRefillAt <= nowSeconds.value &&
        remain < quota.tokenLimit
    ) {
        remain = Math.min(quota.tokenLimit, remain + quota.refillAmount);
        nextRefillAt =
            remain >= quota.tokenLimit
                ? null
                : nextRefillAt + quota.refillIntervalSeconds;
    }

    return {
        ...quota,
        remain,
        nextRefillAt
    };
});
const maxLifetimeSeconds = computed(
    () => apiKeysData.value?.maxLifetimeSeconds ?? 157680000
);
const apiKeyNameLength = computed<AuthApiKeyNameLength>(
    () =>
        apiKeysData.value?.apiKeyNameLength ?? {
            minLength: 1,
            maxLength: 64
        }
);
const issueNameError = computed(() =>
    validateApiKeyName(
        normalizeApiKeyName(issueForm.name),
        apiKeyNameLength.value
    )
);
const canSubmitIssueForm = computed(
    () =>
        !isIssuing.value && !issueNameError.value && issueForm.scopes.length > 0
);
const isApiKeysLoading = computed(() => apiKeysStatus.value === 'pending');
const isOauthClientsLoading = computed(
    () => oauthClientsStatus.value === 'pending'
);
const isAuthorizationsLoading = computed(
    () => authorizationsStatus.value === 'pending'
);
const isFavoritesLoading = computed(() => favoritesState.value === 'loading');
const isUpdatingUserPreference = computed(
    () => userSettingsState.value === 'loading'
);
const isEventSubscriptionsLoading = computed(
    () => eventSubscriptionsState.value === 'loading'
);
const apiKeysErrorMessage = computed(() =>
    apiKeysError.value
        ? getApiErrorMessage(apiKeysError.value, '加载 API 密钥列表失败。')
        : ''
);
const oauthClientsErrorMessage = computed(() =>
    oauthClientsError.value
        ? getApiErrorMessage(
              oauthClientsError.value,
              '加载 OAuth 客户端列表失败。'
          )
        : ''
);
const authorizationsErrorMessage = computed(() =>
    authorizationsError.value
        ? getApiErrorMessage(authorizationsError.value, '加载授权列表失败。')
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

const currentMaskedKeyId = computed(() => {
    const currentItem = apiKeyItems.value.find((item) => item.isCurrent);
    return currentItem?.maskedKeyId ?? '--';
});
const currentKeyName = computed(() => {
    const currentItem = apiKeyItems.value.find((item) => item.isCurrent);
    return currentItem?.name ?? '--';
});

const canChangePassword = computed(() =>
    hasClientScope(session.value?.scopes ?? [], PASSWORD_SCOPE)
);
const canReadAuthorizations = computed(() =>
    hasClientScope(session.value?.scopes ?? [], AUTHORIZATION_READ_SCOPE)
);
const canRevokeAuthorizations = computed(() =>
    hasClientScope(session.value?.scopes ?? [], AUTHORIZATION_REVOKE_SCOPE)
);
const canIssueApiKeys = computed(() =>
    hasClientScope(session.value?.scopes ?? [], ISSUE_SCOPE)
);
const canRevokeApiKeys = computed(() =>
    hasClientScope(session.value?.scopes ?? [], REVOKE_SCOPE)
);
const resolvedUserPreferenceMessage = computed(() => {
    if (userPreferenceMessage.value) {
        return userPreferenceMessage.value;
    }

    return userSettingsState.value === 'error'
        ? userSettingsErrorMessage.value
        : '';
});
const resolvedUserPreferenceTone = computed<'success' | 'error'>(() =>
    userPreferenceMessage.value
        ? userPreferenceTone.value
        : userSettingsState.value === 'error'
          ? 'error'
          : 'success'
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
            return 'API 密钥已复制到剪贴板。';
        case 'error':
            return '复制失败，请手动复制。';
        default:
            return '';
    }
});

const tokenCountFormatter = new Intl.NumberFormat('zh-CN');

useSiteSeo({
    title: () => dashboardPageCopy.pageTitle,
    description: () => dashboardPageCopy.pageDescription,
    path: '/dashboard',
    noindex: true
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
    }, 1000);
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
            normalizedRequiredScope.startsWith(`${normalizedGrantedScope}.`)
        );
    });
}

function getPanelButtonClass(panelId: DashboardPanelId) {
    return panelId === currentPanelId.value
        ? 'dashboard-nav-active group flex w-full items-center rounded-[0.95rem] border px-3.5 py-3 text-left transition'
        : 'group flex w-full items-center rounded-[0.95rem] border border-transparent bg-transparent px-3.5 py-3 text-left text-slate-600 transition hover:border-white/70 hover:bg-white/60 hover:text-slate-900 hover:backdrop-blur-sm hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]';
}

function getPanelSheetOptionClass(panelId: DashboardPanelId) {
    return panelId === currentPanelId.value
        ? 'dashboard-nav-sheet-active flex w-full items-center justify-between gap-4 rounded-[1rem] border px-4 py-4 transition'
        : 'flex w-full items-center justify-between gap-4 rounded-[1rem] border border-white/70 bg-white/78 px-4 py-4 text-slate-700 transition hover:border-slate-300/70 hover:bg-white/88 hover:backdrop-blur-sm';
}

function getIssuerLabel(issuer: AuthApiKeyIssuer) {
    if (issuer === 'webapp') {
        return '网页端';
    }

    if (issuer === 'oauth') {
        return 'OAuth';
    }

    return 'API';
}

function getIssuerSectionTitle(issuer: AuthApiKeyIssuer) {
    if (issuer === 'webapp') {
        return '网页端会话';
    }

    if (issuer === 'oauth') {
        return 'OAuth 令牌';
    }

    return 'API 密钥';
}

function getIssuerBadgeClass(issuer: AuthApiKeyIssuer) {
    if (issuer === 'webapp') {
        return 'inline-flex shrink-0 whitespace-nowrap items-center rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-white';
    }

    if (issuer === 'oauth') {
        return 'inline-flex shrink-0 whitespace-nowrap items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-emerald-700';
    }

    return 'inline-flex shrink-0 whitespace-nowrap items-center rounded-full bg-crh-blue/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-crh-blue';
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
        return `${years} 年`;
    }

    const days = seconds / (24 * 60 * 60);
    if (Number.isInteger(days) && days >= 1) {
        return `${days} 天`;
    }

    const hours = seconds / (60 * 60);
    if (Number.isInteger(hours) && hours >= 1) {
        return `${hours} 小时`;
    }

    return `${seconds} 秒`;
}

function formatTokenCount(value: number) {
    if (!Number.isFinite(value) || value < 0) {
        return '--';
    }

    return tokenCountFormatter.format(Math.floor(value));
}

function formatQuotaCountdown(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return '0 分 0 秒';
    }

    const wholeSeconds = Math.floor(seconds);
    const minutes = Math.floor(wholeSeconds / 60);
    const remainSeconds = wholeSeconds % 60;

    return minutes + ' 分 ' + remainSeconds + ' 秒';
}

const quotaStatusLabel = computed(() => {
    const quota = liveQuotaSummary.value;
    if (!quota) {
        return '--';
    }

    if (quota.remain >= quota.tokenLimit) {
        return '额度已满';
    }

    if (quota.nextRefillAt === null) {
        return '等待下一次额度补充';
    }

    return (
        '额度将在 ' +
        formatQuotaCountdown(quota.nextRefillAt - nowSeconds.value) +
        ' 后恢复 ' +
        formatTokenCount(quota.refillAmount) +
        ' 点'
    );
});

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
            return '待生效';
        case 'expired':
            return '已失效';
        case 'revoked':
            return '已吊销';
        default:
            return '生效中';
    }
}

function getStatusBadgeClass(item: AuthApiKeyListItem) {
    switch (getStatusKey(item)) {
        case 'pending':
            return 'inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-amber-800';
        case 'expired':
            return 'inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-slate-700';
        case 'revoked':
            return 'inline-flex items-center rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-rose-800';
        default:
            return 'inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-emerald-800';
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

    issueForm.name = '';
    issueForm.activeFrom = toDateTimeLocalValue(nextActiveFrom);
    issueForm.expiresAt = toDateTimeLocalValue(nextExpiresAt);
    issueForm.scopes = [...defaultScopes.value];
    issueErrorMessage.value = '';
    issuedKeyResult.value = null;
    copyState.value = 'idle';
}

if (!issueForm.activeFrom) {
    resetIssueForm();
}

function dismissIssuedKeyResult() {
    issuedKeyResult.value = null;
    copyState.value = 'idle';
}

function openApiKeyListModal() {
    isApiKeyListModalOpen.value = true;
}

function openOauthClientListModal() {
    isOauthClientListModalOpen.value = true;
}

function openRevokeModal(item: AuthApiKeyListItem) {
    if (!canRevokeApiKeys.value || item.revokedAt !== null) {
        return;
    }

    revokeTarget.value = item;
    revokeErrorMessage.value = '';
}

function isAuthorizationPending(clientId: string) {
    return revokingAuthorizationClientIds.value.includes(clientId);
}

function openAuthorizationRevokeModal(item: AuthAuthorizationItem) {
    if (
        !canRevokeAuthorizations.value ||
        isAuthorizationPending(item.clientId)
    ) {
        return;
    }

    authorizationRevokeTarget.value = item;
    authorizationRevokeErrorMessage.value = '';
}

function closeAuthorizationRevokeModal() {
    if (isRevokingAuthorization.value) {
        return;
    }

    authorizationRevokeTarget.value = null;
    authorizationRevokeErrorMessage.value = '';
}

function handleAuthorizationRevokeModalVisibilityChange(nextValue: boolean) {
    if (!nextValue) {
        closeAuthorizationRevokeModal();
    }
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
    const { data, error } = await useCsrfFetch<TrackerApiResponse<TData>>(
        path,
        {
            ...options,
            key: `dashboard:${path}:${Date.now()}`,
            watch: false,
            server: false
        }
    );

    if (error.value) {
        throw error.value;
    }

    const response = data.value;
    if (!response) {
        throw new Error('API 响应缺失');
    }

    if (!response.ok) {
        throw {
            data: response
        };
    }

    return response.data;
}

function clearChangePasswordState() {
    changePasswordMessage.value = '';
    changePasswordTone.value = 'success';
}

function clearUserPreferenceState() {
    userPreferenceMessage.value = '';
    userPreferenceTone.value = 'success';
}

function setChangePasswordState(message: string, tone: 'success' | 'error') {
    changePasswordMessage.value = message;
    changePasswordTone.value = tone;
}

function resetChangePasswordForm() {
    changePasswordForm.currentPassword = '';
    changePasswordForm.newPassword = '';
    changePasswordForm.confirmNewPassword = '';
}

function validateChangePasswordForm() {
    if (
        !changePasswordForm.currentPassword ||
        !changePasswordForm.newPassword ||
        !changePasswordForm.confirmNewPassword
    ) {
        return '请完整填写当前密码和新密码。';
    }

    const passwordError = validatePassword(changePasswordForm.newPassword);
    if (passwordError) {
        return passwordError;
    }

    if (
        changePasswordForm.newPassword !== changePasswordForm.confirmNewPassword
    ) {
        return '两次输入的新密码不一致。';
    }

    if (changePasswordForm.currentPassword === changePasswordForm.newPassword) {
        return '新密码不能与旧密码相同。';
    }

    return '';
}

async function changePassword() {
    if (isChangingPassword.value || !canChangePassword.value) {
        return;
    }

    const validationError = validateChangePasswordForm();
    if (validationError) {
        setChangePasswordState(validationError, 'error');
        return;
    }

    isChangingPassword.value = true;
    clearChangePasswordState();

    try {
        const [currentPasswordDigest, newPasswordDigest] = await Promise.all([
            hashPasswordDigest(changePasswordForm.currentPassword),
            hashPasswordDigest(changePasswordForm.newPassword)
        ]);
        const nextSession = await executeMutation<AuthSession>(
            '/api/v1/auth/password',
            {
                method: 'PATCH',
                body: {
                    currentPasswordDigest,
                    newPasswordDigest
                }
            }
        );

        setSession(nextSession);
        resetChangePasswordForm();
        setChangePasswordState('密码已更新，其他网页端会话已失效。', 'success');
        void refreshApiKeys();
    } catch (error) {
        setChangePasswordState(
            getApiErrorMessage(error, '修改密码失败，请稍后重试。'),
            'error'
        );
    } finally {
        isChangingPassword.value = false;
    }
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
            '退出登录失败，请稍后重试。'
        );
    } finally {
        isLoggingOut.value = false;
    }
}

async function toggleSaveSearchHistory() {
    if (
        isUpdatingUserPreference.value ||
        !canReadSettings.value ||
        !canWriteSettings.value
    ) {
        return;
    }

    const nextSaveSearchHistory = !userPreference.value.saveSearchHistory;

    clearUserPreferenceState();

    const ok = await updateUserPreference({
        saveSearchHistory: nextSaveSearchHistory
    });

    if (!ok) {
        userPreferenceTone.value = 'error';
        userPreferenceMessage.value =
            userSettingsErrorMessage.value || '保存设置失败，请稍后重试。';
        return;
    }

    if (!nextSaveSearchHistory) {
        clearRecentSearches();
    }

    userPreferenceTone.value = 'success';
    userPreferenceMessage.value = nextSaveSearchHistory
        ? '已开启保存搜索记录。'
        : '已关闭保存搜索记录，并清空当前设备上的最近搜索。';
}

async function confirmRevoke() {
    if (!revokeTarget.value || isRevoking.value) {
        return;
    }

    isRevoking.value = true;
    revokeErrorMessage.value = '';

    const target = revokeTarget.value;

    try {
        await executeMutation(`/api/v1/auth/api-keys/${target.revokeId}`, {
            method: 'DELETE'
        });

        if (session.value?.revokeId === target.revokeId) {
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
            '吊销 API 密钥失败，请稍后重试。'
        );
    } finally {
        isRevoking.value = false;
    }
}

async function confirmAuthorizationRevoke() {
    if (!authorizationRevokeTarget.value || isRevokingAuthorization.value) {
        return;
    }

    const target = authorizationRevokeTarget.value;
    isRevokingAuthorization.value = true;
    authorizationRevokeErrorMessage.value = '';
    revokingAuthorizationClientIds.value = [target.clientId];

    try {
        await executeMutation(
            `/api/v1/auth/authorizations/${target.clientId}`,
            {
                method: 'DELETE'
            }
        );

        authorizationRevokeTarget.value = null;
        await refreshAuthorizations();
    } catch (error) {
        authorizationRevokeErrorMessage.value = getApiErrorMessage(
            error,
            '取消授权失败，请稍后重试。'
        );
    } finally {
        isRevokingAuthorization.value = false;
        revokingAuthorizationClientIds.value = [];
    }
}

function validateIssueForm() {
    const normalizedName = normalizeApiKeyName(issueForm.name);
    const nameError = validateApiKeyName(
        normalizedName,
        apiKeyNameLength.value
    );
    if (nameError) {
        return nameError;
    }

    if (issueActiveFromTimestamp.value === null) {
        return '请提供有效的生效时间。';
    }

    if (issueExpiresAtTimestamp.value === null) {
        return '请提供有效的失效时间。';
    }

    if (issueActiveFromTimestamp.value >= issueExpiresAtTimestamp.value) {
        return '失效时间必须晚于生效时间。';
    }

    if (
        issueExpiresAtTimestamp.value - issueActiveFromTimestamp.value >
        maxLifetimeSeconds.value
    ) {
        return '请求的存活时间超过了配置上限。';
    }

    if (issueForm.scopes.length === 0) {
        return '请至少选择一个叶子权限。';
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
                    name: normalizeApiKeyName(issueForm.name),
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
            '签发 API 密钥失败，请稍后重试。'
        );
    } finally {
        isIssuing.value = false;
    }
}

function splitLines(value: string) {
    return value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
}

function clearOauthFormFields() {
    oauthForm.name = '';
    oauthForm.description = '';
    oauthForm.homepageUrl = '';
    oauthForm.redirectUrisText = '';
    oauthForm.requestedScopes = [];
}

function resetOauthForm() {
    clearOauthFormFields();
    oauthMutationMessage.value = '';
    oauthMutationTone.value = 'success';
}

async function createOauthClient() {
    if (isSubmittingOauthClient.value) {
        return;
    }

    isSubmittingOauthClient.value = true;
    oauthMutationMessage.value = '';

    try {
        await executeMutation<OAuthClientMutationResponse>(
            '/api/v1/oauth/clients',
            {
                method: 'POST',
                body: {
                    name: oauthForm.name,
                    description: oauthForm.description,
                    homepageUrl: oauthForm.homepageUrl,
                    redirectUris: splitLines(oauthForm.redirectUrisText),
                    requestedScopes: oauthForm.requestedScopes
                }
            }
        );

        oauthMutationTone.value = 'success';
        oauthMutationMessage.value = '已创建 OAuth 客户端，请等待管理员审核。';
        clearOauthFormFields();
        await refreshOauthClients();
    } catch (error) {
        oauthMutationTone.value = 'error';
        oauthMutationMessage.value = getApiErrorMessage(
            error,
            '创建 OAuth 客户端失败。'
        );
    } finally {
        isSubmittingOauthClient.value = false;
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
