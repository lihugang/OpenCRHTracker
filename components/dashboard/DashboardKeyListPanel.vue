<template>
    <UiCard class="min-h-[32rem]">
        <div class="space-y-6">
            <div
                class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div class="space-y-2">
                    <p
                        class="text-xs font-semibold uppercase tracking-[0.28em] text-crh-blue/80">
                        API Keys
                    </p>
                    <h2 class="text-2xl font-semibold text-slate-900">
                        Issued credentials
                    </h2>
                    <p class="text-sm leading-6 text-slate-600">
                        All `webapp` and `api` keys for the current account are
                        listed here.
                    </p>
                </div>

                <UiButton
                    type="button"
                    variant="secondary"
                    :disabled="isLoading"
                    @click="emit('refresh')">
                    Refresh
                </UiButton>
            </div>

            <div class="motion-divider" />

            <div
                v-if="isLoading"
                class="grid gap-3">
                <div
                    v-for="index in 5"
                    :key="`api-key-skeleton:${index}`"
                    class="animate-pulse rounded-[1.15rem] border border-slate-200 bg-white/80 px-5 py-4">
                    <div class="h-4 w-24 rounded bg-slate-200" />
                    <div class="mt-3 h-4 w-56 rounded bg-slate-100" />
                    <div class="mt-4 grid gap-2 sm:grid-cols-2">
                        <div class="h-3 w-28 rounded bg-slate-100" />
                        <div class="h-3 w-24 rounded bg-slate-100" />
                    </div>
                </div>
            </div>

            <UiEmptyState
                v-else-if="errorMessage"
                eyebrow="Load Failed"
                title="Failed to load API key list"
                :description="errorMessage"
                tone="danger">
                <UiButton
                    type="button"
                    variant="secondary"
                    @click="emit('refresh')">
                    Retry
                </UiButton>
            </UiEmptyState>

            <UiEmptyState
                v-else-if="groups.length === 0"
                eyebrow="Empty"
                title="No API keys found"
                description="WebApp session keys and manually issued API keys will appear here." />

            <div
                v-else
                class="space-y-6">
                <section
                    v-for="group in groups"
                    :key="group.issuer"
                    class="space-y-3">
                    <div class="flex items-center justify-between gap-4">
                        <div class="flex items-center gap-3">
                            <span :class="getIssuerBadgeClass(group.issuer)">
                                {{ getIssuerLabel(group.issuer) }}
                            </span>
                            <h3 class="text-lg font-semibold text-slate-900">
                                {{ getIssuerSectionTitle(group.issuer) }}
                            </h3>
                        </div>
                        <p class="text-sm text-slate-500">
                            {{ group.items.length }} item(s)
                        </p>
                    </div>

                    <div class="grid gap-3">
                        <div
                            v-for="item in group.items"
                            :key="item.keyId"
                            class="rounded-[1.15rem] border border-slate-200 bg-white/85 px-5 py-4 shadow-[0_16px_32px_-26px_rgba(15,23,42,0.28)]">
                            <div
                                class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                <div class="min-w-0 space-y-4">
                                    <div
                                        class="flex flex-wrap items-center gap-2">
                                        <span
                                            :class="getStatusBadgeClass(item)">
                                            {{ getStatusLabel(item) }}
                                        </span>
                                        <span
                                            v-if="currentKeyId === item.keyId"
                                            class="inline-flex items-center rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
                                            Current session
                                        </span>
                                    </div>

                                    <div class="space-y-1.5">
                                        <p
                                            class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                                            Key ID
                                        </p>
                                        <p
                                            class="font-mono text-sm font-semibold text-crh-blue">
                                            {{ item.maskedKeyId }}
                                        </p>
                                    </div>

                                    <dl
                                        class="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                                        <div class="space-y-1">
                                            <dt
                                                class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                                Active from
                                            </dt>
                                            <dd class="font-medium text-slate-900">
                                                {{ formatTimestamp(item.activeFrom) }}
                                            </dd>
                                        </div>
                                        <div class="space-y-1">
                                            <dt
                                                class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                                Expires at
                                            </dt>
                                            <dd class="font-medium text-slate-900">
                                                {{ formatTimestamp(item.expiresAt) }}
                                            </dd>
                                        </div>
                                        <div
                                            v-if="item.revokedAt !== null"
                                            class="space-y-1">
                                            <dt
                                                class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                                Revoked at
                                            </dt>
                                            <dd class="font-medium text-slate-900">
                                                {{ formatTimestamp(item.revokedAt) }}
                                            </dd>
                                        </div>
                                        <div class="space-y-1">
                                            <dt
                                                class="text-xs uppercase tracking-[0.18em] text-slate-400">
                                                Scope count
                                            </dt>
                                            <dd class="font-medium text-slate-900">
                                                {{ item.scopes.length }}
                                            </dd>
                                        </div>
                                    </dl>

                                    <div class="space-y-2">
                                        <p
                                            class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                                            Scopes
                                        </p>
                                        <div class="flex flex-wrap gap-2">
                                            <span
                                                v-for="scope in item.scopes"
                                                :key="`${item.keyId}:${scope}`"
                                                class="inline-flex items-center rounded-full bg-blue-600/8 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                                                {{ scope }}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div class="flex shrink-0">
                                    <UiButton
                                        type="button"
                                        variant="secondary"
                                        :disabled="
                                            !canRevoke ||
                                            item.revokedAt !== null
                                        "
                                        @click="emit('revoke', item)">
                                        Revoke
                                    </UiButton>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    </UiCard>
</template>

<script setup lang="ts">
import type {
    AuthApiKeyIssuer,
    AuthApiKeyListItem
} from '~/types/auth';

defineProps<{
    groups: Array<{
        issuer: AuthApiKeyIssuer;
        items: AuthApiKeyListItem[];
    }>;
    isLoading: boolean;
    errorMessage: string;
    canRevoke: boolean;
    currentKeyId: string | null;
    formatTimestamp: (timestamp: number) => string;
    getIssuerLabel: (issuer: AuthApiKeyIssuer) => string;
    getIssuerSectionTitle: (issuer: AuthApiKeyIssuer) => string;
    getIssuerBadgeClass: (issuer: AuthApiKeyIssuer) => string;
    getStatusLabel: (item: AuthApiKeyListItem) => string;
    getStatusBadgeClass: (item: AuthApiKeyListItem) => string;
}>();

const emit = defineEmits<{
    refresh: [];
    revoke: [item: AuthApiKeyListItem];
}>();
</script>
