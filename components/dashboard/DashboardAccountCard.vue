<template>
    <div class="space-y-6">
        <UiCard variant="accent">
            <div class="space-y-6">
                <div class="space-y-2">
                    <p
                        class="text-xs font-semibold uppercase tracking-[0.28em] text-crh-blue/80">
                        Dashboard
                    </p>
                    <h1
                        class="text-3xl font-semibold tracking-tight text-slate-900">
                        Account & API Keys
                    </h1>
                    <p class="text-sm leading-6 text-slate-600">
                        Review the current session, sign out, and issue new API
                        keys from one place.
                    </p>
                </div>

                <div class="motion-divider" />

                <div class="space-y-4">
                    <div class="space-y-1.5">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            Username
                        </p>
                        <p class="text-xl font-semibold text-slate-900">
                            {{ session?.userId ?? '--' }}
                        </p>
                    </div>

                    <div
                        class="rounded-[1rem] border border-white/70 bg-white/85 px-4 py-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                        <div class="flex items-start justify-between gap-3">
                            <div class="space-y-1.5">
                                <p
                                    class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                    Current session
                                </p>
                                <p
                                    class="font-mono text-sm font-semibold text-crh-blue">
                                    {{ session?.maskedApiKey ?? '--' }}
                                </p>
                            </div>
                            <span :class="issuerBadgeClass">
                                {{ issuerLabel }}
                            </span>
                        </div>

                        <dl class="mt-4 grid gap-3 text-sm text-slate-600">
                            <div class="flex items-center justify-between gap-4">
                                <dt>Active from</dt>
                                <dd class="text-right text-slate-900">
                                    {{ activeFromLabel }}
                                </dd>
                            </div>
                            <div class="flex items-center justify-between gap-4">
                                <dt>Expires at</dt>
                                <dd class="text-right text-slate-900">
                                    {{ expiresAtLabel }}
                                </dd>
                            </div>
                            <div class="flex items-center justify-between gap-4">
                                <dt>Scope count</dt>
                                <dd class="text-right text-slate-900">
                                    {{ session?.scopes.length ?? 0 }}
                                </dd>
                            </div>
                        </dl>
                    </div>
                </div>

                <p
                    v-if="logoutErrorMessage"
                    class="flex items-center gap-1.5 pl-1 text-xs leading-5 text-[#E53E3E]">
                    <span
                        aria-hidden="true"
                        class="font-semibold">
                        [!]
                    </span>
                    {{ logoutErrorMessage }}
                </p>

                <UiButton
                    type="button"
                    :loading="isLoggingOut"
                    class="w-full justify-center"
                    @click="emit('logout')">
                    Sign out
                </UiButton>
            </div>
        </UiCard>

        <UiCard :show-accent-bar="false">
            <div class="space-y-4">
                <div class="space-y-2">
                    <p
                        class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                        Issue Policy
                    </p>
                    <h2 class="text-lg font-semibold text-slate-900">
                        New API key policy
                    </h2>
                </div>

                <div class="grid gap-3 text-sm text-slate-600">
                    <div
                        class="rounded-[1rem] border border-slate-200 bg-white/80 px-4 py-3">
                        Max lifetime: {{ formatDuration(maxLifetimeSeconds) }}
                    </div>
                    <div
                        class="rounded-[1rem] border border-slate-200 bg-white/80 px-4 py-3">
                        Creatable scopes: {{ creatableScopeCount }}
                    </div>
                </div>

                <UiButton
                    type="button"
                    :disabled="!canIssueApiKeys"
                    class="w-full justify-center"
                    @click="emit('openIssue')">
                    Issue API key
                </UiButton>

                <p
                    v-if="!canIssueApiKeys"
                    class="text-xs leading-5 text-slate-500">
                    The current session does not include the
                    `api.auth.api-keys.create` scope.
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
    isLoggingOut: boolean;
    logoutErrorMessage: string;
    maxLifetimeSeconds: number;
    creatableScopeCount: number;
    canIssueApiKeys: boolean;
    formatTimestamp: (timestamp: number) => string;
    formatDuration: (seconds: number) => string;
    getIssuerLabel: (issuer: AuthSession['issuer']) => string;
    getIssuerBadgeClass: (issuer: AuthSession['issuer']) => string;
}>();

const emit = defineEmits<{
    logout: [];
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
