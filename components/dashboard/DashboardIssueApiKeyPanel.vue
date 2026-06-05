<template>
    <UiCard :show-accent-bar="false">
        <div class="space-y-6">
            <div
                class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div class="space-y-2">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                        ISSUE API KEYS
                    </p>
                    <h3 class="text-xl font-semibold text-slate-900">
                        新 API 密钥
                    </h3>
                </div>

                <div class="flex shrink-0 gap-3">
                    <UiButton
                        type="button"
                        variant="secondary"
                        @click="emit('openList')">
                        查看 API 密钥列表
                    </UiButton>
                </div>
            </div>

            <div class="motion-divider opacity-70" />

            <div class="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
                <div
                    class="rounded-[1rem] border border-slate-200 bg-white/80 px-4 py-3">
                    最长存活时间：{{ formatDuration(maxLifetimeSeconds) }}
                </div>
                <div
                    class="rounded-[1rem] border border-slate-200 bg-white/80 px-4 py-3">
                    可签发权限叶子数：{{ creatableScopeCount }}
                </div>
            </div>

            <NuxtLink
                to="/docs/api"
                class="inline-flex items-center text-sm font-medium text-crh-blue transition hover:text-slate-900 hover:underline hover:underline-offset-4">
                查看 API 文档
            </NuxtLink>

            <div
                v-if="issuedKeyResult"
                class="space-y-5 rounded-[1.25rem] border border-emerald-200/80 bg-emerald-50/70 px-5 py-5">
                <div>
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
                    class="dashboard-soft-surface grid gap-4 rounded-[1rem] border px-4 py-4 sm:grid-cols-2">
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

                <div
                    class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <UiButton
                        type="button"
                        variant="secondary"
                        @click="emit('dismissIssuedResult')">
                        关闭结果
                    </UiButton>
                    <UiButton
                        type="button"
                        @click="emit('copyIssuedKey')">
                        复制 API 密钥
                    </UiButton>
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
                        :value="name"
                        type="text"
                        class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                        :maxlength="apiKeyNameLength.maxLength"
                        placeholder="例如：本地脚本、CI 部署、临时调试"
                        @input="updateField('name', $event)" />
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
                            :value="activeFrom"
                            type="datetime-local"
                            class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                            @input="updateField('activeFrom', $event)" />
                    </div>

                    <div class="space-y-2">
                        <label
                            for="issue-expires-at"
                            class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                            失效时间
                        </label>
                        <input
                            id="issue-expires-at"
                            :value="expiresAt"
                            type="datetime-local"
                            :max="issueExpiresAtMax"
                            class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                            @input="updateField('expiresAt', $event)" />
                    </div>
                </div>

                <div
                    class="dashboard-soft-surface rounded-[1rem] border border-dashed px-4 py-4 text-sm leading-6 text-slate-600">
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
                        class="dashboard-soft-surface rounded-[1.1rem] border px-4 py-4">
                        <DashboardScopeTree
                            :model-value="scopes"
                            :scopes="creatableScopes"
                            :label-map="scopeLabelMap"
                            @update:model-value="
                                emit('update:scopes', $event)
                            " />
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

                <p
                    v-if="!canIssueApiKeys"
                    class="text-xs leading-5 text-slate-500">
                    当前会话不包含 `api.auth.api-keys.create` 权限。
                </p>

                <div
                    class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <UiButton
                        type="button"
                        variant="secondary"
                        :disabled="isIssuing"
                        @click="emit('resetForm')">
                        重置
                    </UiButton>
                    <UiButton
                        type="button"
                        :loading="isIssuing"
                        :disabled="!canSubmitIssueForm || !canIssueApiKeys"
                        @click="emit('submit')">
                        签发密钥
                    </UiButton>
                </div>
            </div>
        </div>
    </UiCard>
</template>

<script setup lang="ts">
import type {
    AuthApiKeyIssuer,
    AuthApiKeyNameLength,
    AuthIssueApiKeyResponse
} from '~/types/auth';

const props = defineProps<{
    name: string;
    activeFrom: string;
    expiresAt: string;
    scopes: string[];
    issueNameError: string;
    issueErrorMessage: string;
    issuedKeyResult: AuthIssueApiKeyResponse | null;
    isIssuing: boolean;
    canIssueApiKeys: boolean;
    canSubmitIssueForm: boolean;
    maxLifetimeSeconds: number;
    creatableScopeCount: number;
    creatableScopes: string[];
    apiKeyNameLength: AuthApiKeyNameLength;
    issueActiveFromTimestamp: number | null;
    issueMaxExpiresAtTimestamp: number;
    issueExpiresAtMax: string;
    copyState: 'idle' | 'success' | 'error';
    copyMessage: string;
    scopeLabelMap: Record<string, string>;
    formatDuration: (seconds: number) => string;
    formatTimestamp: (timestamp: number) => string;
    getIssuerLabel: (issuer: AuthApiKeyIssuer) => string;
}>();

const emit = defineEmits<{
    'update:name': [value: string];
    'update:activeFrom': [value: string];
    'update:expiresAt': [value: string];
    'update:scopes': [value: string[]];
    submit: [];
    resetForm: [];
    openList: [];
    copyIssuedKey: [];
    dismissIssuedResult: [];
}>();

const issueNameInputRef = ref<HTMLInputElement | null>(null);

function updateField(field: 'name' | 'activeFrom' | 'expiresAt', event: Event) {
    const target = event.target as HTMLInputElement;

    if (field === 'name') {
        emit('update:name', target.value);
        return;
    }

    if (field === 'activeFrom') {
        emit('update:activeFrom', target.value);
        return;
    }

    emit('update:expiresAt', target.value);
}

defineExpose({
    focusNameInput() {
        issueNameInputRef.value?.focus();
    }
});
</script>
