<template>
    <main class="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <UiCard variant="accent">
            <div class="space-y-3">
                <p class="text-xs font-semibold uppercase tracking-[0.22em] text-crh-blue/80">
                    OAuth
                </p>
                <h1 class="text-3xl font-semibold text-slate-900">
                    第三方应用
                </h1>
                <p class="text-sm leading-7 text-slate-600">
                    在这里创建和管理你的 OAuth 客户端。第一阶段只支持 Authorization Code + PKCE(S256)。
                </p>
            </div>
        </UiCard>

        <UiCard :show-accent-bar="false">
            <div class="space-y-5">
                <div class="space-y-2">
                    <h2 class="text-xl font-semibold text-slate-900">新建应用</h2>
                    <p class="text-sm leading-6 text-slate-600">
                        Redirect URI 和申请 scope 每行一个，提交后默认进入待审核状态。
                    </p>
                </div>

                <div class="grid gap-4 md:grid-cols-2">
                    <UiField label="应用名称">
                        <input
                            v-model="form.name"
                            type="text"
                            class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark" />
                    </UiField>
                    <UiField label="主页链接">
                        <input
                            v-model="form.homepageUrl"
                            type="url"
                            class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark" />
                    </UiField>
                </div>

                <UiField label="描述">
                    <textarea
                        v-model="form.description"
                        rows="3"
                        class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark" />
                </UiField>

                <div class="grid gap-4 md:grid-cols-2">
                    <UiField label="Redirect URIs">
                        <textarea
                            v-model="form.redirectUrisText"
                            rows="6"
                            class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                            placeholder="每行一个 URI" />
                    </UiField>
                    <UiField label="申请 Scopes">
                        <textarea
                            v-model="form.requestedScopesText"
                            rows="6"
                            class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                            placeholder="每行一个 scope" />
                    </UiField>
                </div>

                <div
                    v-if="mutationMessage"
                    class="rounded-[1rem] border px-4 py-4 text-sm leading-6"
                    :class="mutationTone === 'error' ? 'border-rose-200 bg-rose-50/80 text-rose-700' : 'border-emerald-200 bg-emerald-50/80 text-emerald-800'">
                    {{ mutationMessage }}
                </div>

                <div class="flex justify-end">
                    <UiButton
                        type="button"
                        :loading="isSubmitting"
                        @click="createClient">
                        创建应用
                    </UiButton>
                </div>
            </div>
        </UiCard>

        <UiCard :show-accent-bar="false">
            <div class="space-y-5">
                <div class="flex items-center justify-between gap-4">
                    <div class="space-y-2">
                        <h2 class="text-xl font-semibold text-slate-900">我的客户端</h2>
                        <p class="text-sm leading-6 text-slate-600">
                            当前账号名下全部 OAuth 客户端。
                        </p>
                    </div>

                    <UiButton
                        type="button"
                        variant="secondary"
                        :disabled="status === 'pending'"
                        @click="refresh()">
                        刷新
                    </UiButton>
                </div>

                <UiEmptyState
                    v-if="errorMessage"
                    eyebrow="加载失败"
                    title="客户端列表加载失败"
                    :description="errorMessage"
                    tone="danger" />

                <UiEmptyState
                    v-else-if="items.length === 0 && status !== 'pending'"
                    eyebrow="Empty"
                    title="暂无 OAuth 客户端"
                    description="创建后会显示在这里。" />

                <div
                    v-else
                    class="grid gap-4">
                    <div
                        v-for="item in items"
                        :key="item.clientId"
                        class="rounded-[1rem] border border-slate-200 bg-white/90 px-5 py-5">
                        <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div class="space-y-3">
                                <div class="flex flex-wrap items-center gap-2">
                                    <h3 class="text-lg font-semibold text-slate-900">
                                        {{ item.name }}
                                    </h3>
                                    <span class="inline-flex rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-white">
                                        {{ item.status }}
                                    </span>
                                    <span
                                        v-if="item.isTrusted"
                                        class="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] text-emerald-700">
                                        trusted
                                    </span>
                                </div>
                                <p class="font-mono text-sm text-crh-blue">
                                    {{ item.clientId }}
                                </p>
                                <p class="text-sm leading-6 text-slate-600">
                                    {{ item.description || '无描述' }}
                                </p>
                                <div class="text-sm text-slate-600">
                                    <p>回调地址：</p>
                                    <ul class="mt-1 space-y-1">
                                        <li
                                            v-for="redirect in item.redirectUris"
                                            :key="redirect.value"
                                            class="break-all">
                                            {{ redirect.value }}
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </UiCard>
    </main>
</template>

<script setup lang="ts">
import useTrackedRequestFetch from '~/composables/useTrackedRequestFetch';
import type {
    OAuthClientMutationResponse
} from '~/types/auth';
import type { OAuthClientListResponse } from '~/types/auth';
import type { TrackerApiResponse } from '~/types/homepage';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';

definePageMeta({
    middleware: 'auth-required'
});

const requestFetch = useTrackedRequestFetch();

const form = reactive({
    name: '',
    description: '',
    homepageUrl: '',
    redirectUrisText: '',
    requestedScopesText: ''
});
const mutationMessage = ref('');
const mutationTone = ref<'success' | 'error'>('success');
const isSubmitting = ref(false);

async function fetchClients() {
    return await requestFetch<TrackerApiResponse<OAuthClientListResponse>>(
        '/api/v1/oauth/clients',
        {
            retry: 0
        }
    );
}

const { data, status, error, refresh } = await useAsyncData(
    'oauth-clients',
    fetchClients
);

const items = computed(() => (data.value?.ok ? data.value.data.items : []));
const errorMessage = computed(() =>
    error.value
        ? getApiErrorMessage(error.value, '加载 OAuth 客户端失败。')
        : !data.value || data.value.ok
          ? ''
          : data.value.data
);

function splitLines(value: string) {
    return value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
}

async function createClient() {
    if (isSubmitting.value) {
        return;
    }

    isSubmitting.value = true;
    mutationMessage.value = '';

    try {
        const response = await requestFetch<TrackerApiResponse<OAuthClientMutationResponse>>(
            '/api/v1/oauth/clients',
            {
                method: 'POST',
                body: {
                    name: form.name,
                    description: form.description,
                    homepageUrl: form.homepageUrl,
                    redirectUris: splitLines(form.redirectUrisText),
                    requestedScopes: splitLines(form.requestedScopesText)
                },
                retry: 0
            }
        );

        if (!response.ok) {
            throw {
                data: response
            };
        }

        mutationTone.value = 'success';
        mutationMessage.value = 'OAuth 客户端已创建，scope 默认处于待审核状态。';
        form.name = '';
        form.description = '';
        form.homepageUrl = '';
        form.redirectUrisText = '';
        form.requestedScopesText = '';
        await refresh();
    } catch (error) {
        mutationTone.value = 'error';
        mutationMessage.value = getApiErrorMessage(
            error,
            '创建 OAuth 客户端失败。'
        );
    } finally {
        isSubmitting.value = false;
    }
}
</script>
