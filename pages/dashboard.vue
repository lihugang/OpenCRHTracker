<template>
    <main
        class="flex min-h-screen flex-col bg-[linear-gradient(180deg,#f8fafc_0%,#f3f8ff_100%)] text-crh-grey-dark">
        <div
            class="pointer-events-none absolute inset-x-0 top-0 h-[24rem] bg-[radial-gradient(circle_at_top,_rgba(0,82,155,0.14),_transparent_58%)]" />
        <div
            class="pointer-events-none absolute inset-x-0 top-20 h-40 bg-[linear-gradient(90deg,_rgba(90,132,162,0.12),_rgba(90,132,162,0))] blur-3xl" />

        <div
            class="relative mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
            <div class="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
                <aside class="hidden lg:block">
                    <UiCard
                        :show-accent-bar="false"
                        class="sticky top-24">
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
                                    <span class="flex items-center gap-3">
                                        <span
                                            aria-hidden="true"
                                            class="h-5 w-1 rounded-full transition"
                                            :class="
                                                panel.id === currentPanelId
                                                    ? 'bg-crh-blue'
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

                <div class="space-y-6">
                    <UiCard
                        :show-accent-bar="false"
                        class="lg:hidden">
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
                                            ? 'border-crh-blue/25 bg-blue-50/80'
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

                    <div class="hidden px-1 lg:block">
                        <h2
                            class="text-3xl font-semibold tracking-tight text-slate-900">
                            {{ currentPanelDefinition.headerTitle }}
                        </h2>
                    </div>

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
                                :is-logging-out="isLoggingOut"
                                :logout-error-message="logoutErrorMessage"
                                @logout="logout" />
                        </div>

                        <div
                            v-else
                            key="developer"
                            class="grid gap-6 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
                            <DashboardDeveloperOverview
                                :session="session"
                                :quota="liveQuotaSummary"
                                :current-key-name="currentKeyName"
                                :current-masked-key-id="currentMaskedKeyId"
                                :max-lifetime-seconds="maxLifetimeSeconds"
                                :creatable-scope-count="creatableScopes.length"
                                :can-issue-api-keys="canIssueApiKeys"
                                :format-timestamp="formatTimestamp"
                                :format-duration="formatDuration"
                                :format-token-count="formatTokenCount"
                                :quota-status-label="quotaStatusLabel"
                                :get-issuer-label="getIssuerLabel"
                                :get-issuer-badge-class="getIssuerBadgeClass"
                                @open-issue="openIssueModal" />

                            <DashboardKeyListPanel
                                :groups="issuerGroups"
                                :is-loading="isApiKeysLoading"
                                :error-message="apiKeysErrorMessage"
                                :can-revoke="canRevokeApiKeys"
                                :format-timestamp="formatTimestamp"
                                :format-token-count="formatTokenCount"
                                :get-issuer-label="getIssuerLabel"
                                :get-issuer-section-title="
                                    getIssuerSectionTitle
                                "
                                :get-issuer-badge-class="getIssuerBadgeClass"
                                :get-status-label="getStatusLabel"
                                :get-status-badge-class="getStatusBadgeClass"
                                @refresh="refreshApiKeys()"
                                @revoke="openRevokeModal" />
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
                    class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4">
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
            :model-value="isIssueModalOpen"
            eyebrow="OPERATION"
            title="签发 API 密钥"
            size="lg"
            :close-on-backdrop="!isIssuing"
            @update:model-value="handleIssueModalVisibilityChange">
            <div
                v-if="issuedKeyResult"
                class="space-y-5">
                <div
                    class="rounded-[1rem] border border-emerald-200/80 bg-emerald-50/80 px-4 py-4">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.18em] text-emerald-700">
                        一次性明文
                    </p>
                    <p
                        class="mt-3 break-all font-mono text-sm font-semibold text-emerald-800">
                        {{ issuedKeyResult.apiKey }}
                    </p>
                    <p class="mt-2 text-sm leading-6 text-emerald-700/90">
                        此密钥只会显示一次，请及时复制并保存。
                    </p>
                </div>

                <div
                    class="grid gap-4 rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-4 sm:grid-cols-2">
                    <div class="space-y-1 sm:col-span-2">
                        <p
                            class="text-xs uppercase tracking-[0.18em] text-slate-400">
                            名称
                        </p>
                        <p class="font-medium text-slate-900">
                            {{ issuedKeyResult.name }}
                        </p>
                    </div>
                    <div class="space-y-1">
                        <p
                            class="text-xs uppercase tracking-[0.18em] text-slate-400">
                            类型
                        </p>
                        <p class="font-medium text-slate-900">
                            {{ getIssuerLabel(issuedKeyResult.issuer) }}
                        </p>
                    </div>
                    <div class="space-y-1">
                        <p
                            class="text-xs uppercase tracking-[0.18em] text-slate-400">
                            生效时间
                        </p>
                        <p class="font-medium text-slate-900">
                            {{ formatTimestamp(issuedKeyResult.activeFrom) }}
                        </p>
                    </div>
                    <div class="space-y-1">
                        <p
                            class="text-xs uppercase tracking-[0.18em] text-slate-400">
                            失效时间
                        </p>
                        <p class="font-medium text-slate-900">
                            {{ formatTimestamp(issuedKeyResult.expiresAt) }}
                        </p>
                    </div>
                    <div class="space-y-1">
                        <p
                            class="text-xs uppercase tracking-[0.18em] text-slate-400">
                            权限数量
                        </p>
                        <p class="font-medium text-slate-900">
                            {{ issuedKeyResult.scopes.length }}
                        </p>
                    </div>
                </div>

                <div class="space-y-2">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                        权限
                    </p>
                    <div class="flex flex-wrap gap-2">
                        <span
                            v-for="scope in issuedKeyResult.scopes"
                            :key="`issued:${scope}`"
                            class="inline-flex items-center rounded-full bg-blue-600/8 px-2.5 py-1 text-[11px] font-medium text-blue-700">
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
                <div class="space-y-2">
                    <label
                        for="issue-name"
                        class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                        密钥名称
                    </label>
                    <input
                        id="issue-name"
                        ref="issueNameInputRef"
                        v-model.trim="issueForm.name"
                        type="text"
                        class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                        :maxlength="apiKeyNameLength.maxLength"
                        placeholder="例如：本地脚本、CI 部署、临时调试" />
                    <p class="text-xs leading-5 text-slate-500">
                        名称长度 {{ apiKeyNameLength.minLength }} -
                        {{ apiKeyNameLength.maxLength }} 个字符。
                    </p>
                    <p
                        v-if="issueNameError"
                        class="flex items-center gap-1.5 pl-1 text-xs leading-5 text-[#E53E3E]">
                        <span
                            aria-hidden="true"
                            class="font-semibold">
                            [!]
                        </span>
                        {{ issueNameError }}
                    </p>
                </div>

                <div class="grid gap-4 md:grid-cols-2">
                    <div class="space-y-2">
                        <label
                            for="issue-active-from"
                            class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                            生效时间
                        </label>
                        <input
                            id="issue-active-from"
                            v-model="issueForm.activeFrom"
                            type="datetime-local"
                            class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark" />
                    </div>

                    <div class="space-y-2">
                        <label
                            for="issue-expires-at"
                            class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                            失效时间
                        </label>
                        <input
                            id="issue-expires-at"
                            v-model="issueForm.expiresAt"
                            type="datetime-local"
                            :max="issueExpiresAtMax"
                            class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark" />
                    </div>
                </div>

                <div
                    class="rounded-[1rem] border border-dashed border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-600">
                    最长存活时间：
                    <span class="font-semibold text-slate-900">
                        {{ formatDuration(maxLifetimeSeconds) }}
                    </span>
                    <template v-if="issueActiveFromTimestamp !== null">
                        <br />
                        最晚失效时间：
                        <span class="font-semibold text-slate-900">
                            {{ formatTimestamp(issueMaxExpiresAtTimestamp) }}
                        </span>
                    </template>
                </div>

                <div class="space-y-3">
                    <div class="space-y-1">
                        <p
                            class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                            权限树
                        </p>
                    </div>

                    <div
                        class="rounded-[1.1rem] border border-slate-200 bg-slate-50/70 px-4 py-4">
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
                        关闭
                    </UiButton>
                    <UiButton
                        type="button"
                        @click="copyIssuedKey">
                        复制 API 密钥
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
                        取消
                    </UiButton>
                    <UiButton
                        type="button"
                        :loading="isIssuing"
                        :disabled="!canSubmitIssueForm"
                        @click="issueApiKey">
                        签发密钥
                    </UiButton>
                </div>
            </template>
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
import type {
    AuthApiKeyIssuer,
    AuthApiKeyListItem,
    AuthApiKeyListResponse,
    AuthApiKeyNameLength,
    AuthQuotaSummary,
    AuthIssueApiKeyResponse
} from '~/types/auth';
import type { TrackerApiResponse } from '~/types/homepage';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import {
    normalizeApiKeyName,
    validateApiKeyName
} from '~/utils/auth/apiKeyName';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

definePageMeta({
    middleware: 'auth-required'
});

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
    pageDescription: '管理会话和 API 密钥。'
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
    emu: '动车组',
    exports: '导出',
    'api.auth': '鉴权',
    'api.auth.me': '当前会话',
    'api.auth.api-keys': 'API 密钥',
    'api.auth.api-keys.read': '读取密钥',
    'api.auth.api-keys.create': '签发密钥',
    'api.auth.api-keys.revoke': '吊销密钥',
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
    method: 'POST' | 'DELETE';
    body?: Record<string, unknown>;
}

const route = useRoute();
const router = useRouter();
const { session, clearSession } = useAuthState();
const requestFetch = import.meta.server ? useRequestFetch() : $fetch;

const logoutErrorMessage = ref('');
const isLoggingOut = ref(false);
const isPanelSheetOpen = ref(false);
const revokeTarget = ref<AuthApiKeyListItem | null>(null);
const revokeErrorMessage = ref('');
const isRevoking = ref(false);
const isIssueModalOpen = ref(false);
const isIssuing = ref(false);
const issueErrorMessage = ref('');
const issuedKeyResult = ref<AuthIssueApiKeyResponse | null>(null);
const copyState = ref<'idle' | 'success' | 'error'>('idle');
const nowSeconds = ref(Math.floor(Date.now() / 1000));
const issueNameInputRef = ref<HTMLInputElement | null>(null);

const issueForm = reactive({
    name: '',
    activeFrom: '',
    expiresAt: '',
    scopes: [] as string[]
});

let nowTimer: number | null = null;

function readPanelQuery(value: unknown) {
    if (Array.isArray(value)) {
        return typeof value[0] === 'string' ? value[0] : '';
    }

    return typeof value === 'string' ? value : '';
}

function normalizePanelId(value: string): DashboardPanelId {
    return value === 'developer' ? 'developer' : 'general';
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

const apiKeyItems = computed(() => apiKeysData.value?.items ?? []);
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
    () => !isIssuing.value && !issueNameError.value && issueForm.scopes.length > 0
);
const isApiKeysLoading = computed(() => apiKeysStatus.value === 'pending');
const apiKeysErrorMessage = computed(() =>
    apiKeysError.value
        ? getApiErrorMessage(apiKeysError.value, '加载 API 密钥列表失败。')
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
        ? 'group w-full rounded-[0.95rem] border border-crh-blue/15 bg-blue-50/70 px-3.5 py-3 text-crh-blue transition'
        : 'group w-full rounded-[0.95rem] border border-transparent bg-transparent px-3.5 py-3 text-slate-600 transition hover:border-slate-200/80 hover:bg-white/70 hover:text-slate-900';
}

function getPanelSheetOptionClass(panelId: DashboardPanelId) {
    return panelId === currentPanelId.value
        ? 'flex w-full items-center justify-between gap-4 rounded-[1rem] border border-crh-blue/20 bg-blue-50/80 px-4 py-4 text-crh-blue transition'
        : 'flex w-full items-center justify-between gap-4 rounded-[1rem] border border-slate-200 bg-white/90 px-4 py-4 text-slate-700 transition hover:border-slate-300 hover:bg-slate-50/80';
}

function getIssuerLabel(issuer: AuthApiKeyIssuer) {
    return issuer === 'webapp' ? '网页端' : 'API';
}

function getIssuerSectionTitle(issuer: AuthApiKeyIssuer) {
    return issuer === 'webapp' ? '网页端会话' : 'API 密钥';
}

function getIssuerBadgeClass(issuer: AuthApiKeyIssuer) {
    return issuer === 'webapp'
        ? 'inline-flex shrink-0 whitespace-nowrap items-center rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-white'
        : 'inline-flex shrink-0 whitespace-nowrap items-center rounded-full bg-crh-blue/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-crh-blue';
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
