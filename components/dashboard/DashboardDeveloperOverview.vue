<template>
    <div class="space-y-6">
        <UiCard variant="accent">
            <div class="space-y-6">
                <div class="space-y-2">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.26em] text-crh-blue/80">
                        SESSION
                    </p>
                    <h2 class="text-2xl font-semibold text-slate-900">
                        当前会话
                    </h2>
                </div>

                <div class="motion-divider" />

                <div
                    class="rounded-[1rem] border border-white/70 bg-white/85 px-4 py-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                    <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0 space-y-3">
                            <div class="space-y-1">
                                <p
                                    class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                                    密钥名称
                                </p>
                                <p class="truncate text-sm font-medium text-slate-900">
                                    {{ currentKeyName }}
                                </p>
                            </div>
                            <div class="space-y-1">
                                <p
                                    class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                                    密钥标识
                                </p>
                                <p
                                    class="font-mono text-sm font-semibold text-crh-blue">
                                    {{ currentMaskedKeyId }}
                                </p>
                            </div>
                        </div>
                        <span :class="issuerBadgeClass">
                            {{ issuerLabel }}
                        </span>
                    </div>

                    <dl class="mt-4 grid gap-3 sm:grid-cols-2">
                        <div class="space-y-1">
                            <dt
                                class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                用户名
                            </dt>
                            <dd class="text-base font-semibold text-slate-900">
                                {{ session?.userId ?? '--' }}
                            </dd>
                        </div>
                        <div class="space-y-1">
                            <dt
                                class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                生效时间
                            </dt>
                            <dd class="text-base font-semibold text-slate-900">
                                {{ activeFromLabel }}
                            </dd>
                        </div>
                        <div class="space-y-1">
                            <dt
                                class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                失效时间
                            </dt>
                            <dd class="text-base font-semibold text-slate-900">
                                {{ expiresAtLabel }}
                            </dd>
                        </div>
                        <div class="space-y-1">
                            <dt
                                class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                权限数量
                            </dt>
                            <dd class="text-base font-semibold text-slate-900">
                                {{ session?.scopes.length ?? 0 }}
                            </dd>
                        </div>
                    </dl>
                </div>
            </div>
        </UiCard>

        <UiCard :show-accent-bar="false">
            <div class="space-y-5">
                <div class="space-y-2">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                        ACCOUNT QUOTA
                    </p>
                    <h3 class="text-lg font-semibold text-slate-900">
                        账户配额
                    </h3>
                </div>

                <div class="motion-divider opacity-70" />

                <div
                    class="rounded-[1rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(239,246,255,0.78)_0%,rgba(255,255,255,0.95)_100%)] px-4 py-4">
                    <div
                        class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div class="space-y-1.5">
                            <p
                                class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                                当前剩余
                            </p>
                            <p class="text-3xl font-semibold text-slate-900">
                                {{ quotaRemainLabel }}
                            </p>
                        </div>
                        <p class="text-sm text-slate-500">
                            总额度 {{ quotaLimitLabel }}
                        </p>
                    </div>

                    <div
                        class="mt-4 h-2 overflow-hidden rounded-full bg-slate-200/80">
                        <div
                            class="h-full rounded-full bg-[linear-gradient(90deg,#00529b_0%,#5f9fd6_100%)] transition-[width] duration-300 ease-out"
                            :style="{ width: quotaBarWidth }" />
                    </div>

                    <p class="mt-4 text-sm font-medium text-slate-600">
                        {{ quotaStatusLabel }}
                    </p>

                </div>
            </div>
        </UiCard>

        <UiCard :show-accent-bar="false">
            <div class="space-y-4">
                <div class="space-y-2">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                        ISSUE API KEYS
                    </p>
                    <h3 class="text-lg font-semibold text-slate-900">
                        新 API 密钥
                    </h3>
                </div>

                <div class="grid gap-3 text-sm text-slate-600">
                    <div
                        class="rounded-[1rem] border border-slate-200 bg-white/80 px-4 py-3">
                        最长存活时间：{{ formatDuration(maxLifetimeSeconds) }}
                    </div>
                    <NuxtLink
                        to="/docs/api"
                        class="inline-flex items-center text-sm font-medium text-crh-blue transition hover:text-slate-900 hover:underline hover:underline-offset-4">
                        查看 API 文档
                    </NuxtLink>
                </div>

                <UiButton
                    type="button"
                    :disabled="!canIssueApiKeys"
                    class="w-full justify-center"
                    @click="emit('openIssue')">
                    签发
                </UiButton>

                <p
                    v-if="!canIssueApiKeys"
                    class="text-xs leading-5 text-slate-500">
                    当前会话不包含 `api.auth.api-keys.create` 权限。
                </p>
            </div>
        </UiCard>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AuthQuotaSummary, AuthSession } from '~/types/auth';

const props = defineProps<{
    session: AuthSession | null;
    quota: AuthQuotaSummary | null;
    currentKeyName: string;
    currentMaskedKeyId: string;
    maxLifetimeSeconds: number;
    creatableScopeCount: number;
    canIssueApiKeys: boolean;
    formatTimestamp: (timestamp: number) => string;
    formatDuration: (seconds: number) => string;
    formatTokenCount: (value: number) => string;
    quotaStatusLabel: string;
    getIssuerLabel: (issuer: AuthSession['issuer']) => string;
    getIssuerBadgeClass: (issuer: AuthSession['issuer']) => string;
}>();

const emit = defineEmits<{
    openIssue: [];
}>();

const issuerLabel = computed(() =>
    props.getIssuerLabel(props.session?.issuer ?? 'webapp')
);

const issuerBadgeClass = computed(() =>
    props.getIssuerBadgeClass(props.session?.issuer ?? 'webapp')
);

const activeFromLabel = computed(() =>
    props.formatTimestamp(props.session?.activeFrom ?? 0)
);

const expiresAtLabel = computed(() =>
    props.formatTimestamp(props.session?.expiresAt ?? 0)
);

const quotaRemainLabel = computed(() =>
    props.quota ? props.formatTokenCount(props.quota.remain) : '--'
);

const quotaLimitLabel = computed(() =>
    props.quota ? props.formatTokenCount(props.quota.tokenLimit) : '--'
);

const quotaBarWidth = computed(() => {
    if (!props.quota || props.quota.tokenLimit <= 0) {
        return '0%';
    }

    const progress = Math.min(
        100,
        Math.max(0, (props.quota.remain / props.quota.tokenLimit) * 100)
    );

    return `${progress}%`;
});
</script>
