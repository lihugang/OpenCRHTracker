<template>
    <div class="space-y-6">
        <UiCard variant="accent">
            <div class="space-y-6">
                <div class="space-y-2">
                    <p
                        class="text-xs font-semibold uppercase tracking-[0.28em] text-crh-blue/80">
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
                        <div class="space-y-1.5">
                            <p
                                class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                密钥标识
                            </p>
                            <p
                                class="font-mono text-sm font-semibold text-crh-blue">
                                {{ currentMaskedKeyId }}
                            </p>
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
            <div class="space-y-4">
                <div class="space-y-2">
                    <p
                        class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
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
import type { AuthSession } from '~/types/auth';

const props = defineProps<{
    session: AuthSession | null;
    currentMaskedKeyId: string;
    maxLifetimeSeconds: number;
    creatableScopeCount: number;
    canIssueApiKeys: boolean;
    formatTimestamp: (timestamp: number) => string;
    formatDuration: (seconds: number) => string;
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
</script>
