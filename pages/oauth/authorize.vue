<template>
    <main
        class="flex min-h-screen flex-col bg-[linear-gradient(180deg,#f8fafc_0%,#eef5ff_100%)] text-crh-grey-dark">
        <div
            class="pointer-events-none absolute inset-x-0 top-0 h-[24rem] bg-[radial-gradient(circle_at_top,_rgba(0,82,155,0.16),_transparent_58%)]" />
        <div
            class="pointer-events-none absolute inset-x-0 top-24 h-48 bg-[linear-gradient(90deg,_rgba(90,132,162,0.12),_rgba(90,132,162,0))] blur-3xl" />

        <div
            class="relative mx-auto flex w-full max-w-4xl flex-1 items-center px-4 py-10 sm:px-6 lg:px-8">
            <UiCard
                :show-accent-bar="false"
                class="w-full overflow-hidden border-slate-200/80 bg-white/95 shadow-[0_26px_70px_-38px_rgba(15,23,42,0.35)] backdrop-blur">
                <div
                    v-if="consent"
                    class="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <section
                        class="rounded-[1.25rem] bg-[linear-gradient(180deg,#f5f9ff_0%,#eef4ff_100%)] px-6 py-6 lg:px-7 lg:py-7">
                        <div class="space-y-5">
                            <div class="space-y-2">
                                <p
                                    class="text-xs font-semibold uppercase tracking-[0.28em] text-crh-blue/80">
                                    OAuth Authorize
                                </p>
                                <h1
                                    class="text-3xl font-semibold tracking-tight text-slate-900">
                                    授权 {{ consent.client.name }} App
                                </h1>
                                <p class="text-sm leading-6 text-slate-600">
                                    该应用希望访问你的 Open CRH Tracker
                                    账户数据。
                                </p>
                            </div>

                            <div class="space-y-3">
                                <div
                                    class="rounded-[1rem] border border-white/70 bg-white/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                                    <p
                                        class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                                        应用
                                    </p>
                                    <p
                                        class="mt-1 text-base font-semibold text-slate-900">
                                        {{ consent.client.name }}
                                    </p>
                                    <p
                                        v-if="consent.client.description"
                                        class="mt-2 text-sm leading-6 text-slate-600">
                                        {{ consent.client.description }}
                                    </p>
                                </div>

                                <div
                                    class="rounded-[1rem] border border-white/70 bg-white/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                                    <p
                                        class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                                        开发者
                                    </p>
                                    <p
                                        class="mt-1 text-sm font-medium text-slate-700">
                                        {{ consent.client.ownerUserId }}
                                    </p>
                                </div>

                                <div
                                    v-if="consent.client.homepageUrl"
                                    class="rounded-[1rem] border border-white/70 bg-white/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                                    <p
                                        class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                                        应用主页
                                    </p>
                                    <a
                                        :href="consent.client.homepageUrl"
                                        target="_blank"
                                        rel="noreferrer noopener"
                                        class="mt-1 inline-block break-all text-sm font-medium text-crh-blue underline decoration-crh-blue/30 underline-offset-4 transition hover:text-[#0A6DC2] hover:decoration-crh-blue/60">
                                        {{ consent.client.homepageUrl }}
                                    </a>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section class="space-y-6 px-1">
                        <div class="space-y-2">
                            <p
                                class="text-xs font-semibold uppercase tracking-[0.28em] text-crh-blue/80">
                                Requested Scopes
                            </p>
                            <h2 class="text-2xl font-semibold text-slate-900">
                                该应用将获得以下权限
                            </h2>
                        </div>

                        <div
                            v-if="consent.requiresOwnerBypass"
                            class="rounded-[1rem] border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm leading-6 text-amber-800">
                            当前授权包含待审核
                            scope。由于你是该应用开发者，系统允许你绕过审核完成授权。
                        </div>

                        <div class="space-y-2">
                            <div
                                v-for="scope in consent.scopes"
                                :key="scope"
                                class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-3">
                                <p
                                    class="break-all font-mono text-sm font-medium text-slate-700">
                                    {{ scope }}
                                </p>
                            </div>
                        </div>

                        <div
                            v-if="statusMessage"
                            :class="statusClasses">
                            <span
                                aria-hidden="true"
                                class="font-semibold">
                                [!]
                            </span>
                            <span>{{ statusMessage }}</span>
                        </div>

                        <div class="flex flex-wrap gap-3 pt-2">
                            <UiButton
                                type="button"
                                :loading="
                                    isSubmitting &&
                                    pendingDecision === 'approve'
                                "
                                :disabled="isSubmitting"
                                @click="submitDecision('approve')">
                                授权
                            </UiButton>
                            <UiButton
                                type="button"
                                variant="secondary"
                                :loading="
                                    isSubmitting && pendingDecision === 'deny'
                                "
                                :disabled="isSubmitting"
                                @click="submitDecision('deny')">
                                拒绝
                            </UiButton>
                        </div>
                    </section>
                </div>

                <div
                    v-else
                    class="mx-auto flex max-w-2xl flex-col gap-5 px-2 py-4 text-center">
                    <p
                        class="text-xs font-semibold uppercase tracking-[0.28em] text-crh-blue/80">
                        OAuth Authorize
                    </p>
                    <h1
                        class="text-3xl font-semibold tracking-tight text-slate-900">
                        无法处理该授权请求
                    </h1>
                    <p
                        v-if="errorReason"
                        class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                        {{ errorReason }}
                    </p>
                    <p class="text-sm leading-6 text-slate-600">
                        {{ errorMessage }}
                    </p>
                    <div class="pt-2">
                        <UiButton
                            type="button"
                            variant="secondary"
                            @click="navigateTo('/')">
                            返回主页
                        </UiButton>
                    </div>
                </div>
            </UiCard>
        </div>
        <AppFooter />
    </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TrackedRequestFetch } from '~/composables/useTrackedRequestFetch';
import type {
    OAuthAuthorizeContextResponse,
    OAuthAuthorizeDecisionResponse
} from '~/types/auth';
import type { TrackerApiResponse } from '~/types/homepage';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';

definePageMeta({
    alias: ['/oauth/authorize']
});

const route = useRoute();

async function resolveAuthorizeContext() {
    if (import.meta.server) {
        const event = useRequestEvent();
        if (!event) {
            throw createError({
                statusCode: 500,
                statusMessage: 'OAuth authorize request event missing'
            });
        }

        const [
            { getAuthorizeContext, parseAuthorizeRequest },
            ensureAuthRateLimit
        ] = await Promise.all([
            import('~/server/utils/oauth/authorizeRequest'),
            import('~/server/utils/api/authRateLimit/ensureAuthRateLimit').then(
                (module) => module.default
            )
        ]);

        ensureAuthRateLimit(event, 'oauthAuthorize');
        return getAuthorizeContext(event, parseAuthorizeRequest(event));
    }

    const requestFetch: TrackedRequestFetch = $fetch as TrackedRequestFetch;
    return await requestFetch<OAuthAuthorizeContextResponse>(
        '/api/v1/oauth/authorize/context',
        {
            query: route.query
        }
    );
}

const context = await resolveAuthorizeContext();

if (context.mode === 'redirect') {
    await navigateTo(context.location, {
        external:
            context.location.startsWith('http://') ||
            context.location.startsWith('https://')
    });
}

const isErrorMode = context.mode === 'error';
const errorMessage = isErrorMode ? context.message : '';
const errorReason = isErrorMode ? context.reason : '';
const consent = context.mode === 'consent' ? context : null;

if (!isErrorMode && !consent) {
    throw createError({
        statusCode: 500,
        statusMessage: 'OAuth authorize context missing'
    });
}

const isSubmitting = ref(false);
const pendingDecision = ref<'approve' | 'deny' | null>(null);
const statusMessage = ref('');

const statusClasses = computed(
    () => 'flex items-center gap-1.5 text-sm leading-6 text-[#E53E3E]'
);

useSiteSeo({
    title: consent
        ? `授权 ${consent.client.name} App | Open CRH Tracker`
        : 'OAuth 授权 | Open CRH Tracker',
    description: consent
        ? `确认 ${consent.client.name} 请求的账户访问权限。`
        : '处理 OAuth 授权请求。',
    path: '/oauth/authorize',
    noindex: true
});

async function submitDecision(decision: 'approve' | 'deny') {
    if (!consent || isSubmitting.value) {
        return;
    }

    isSubmitting.value = true;
    pendingDecision.value = decision;
    statusMessage.value = '';

    try {
        const response = await useNuxtApp().$csrfFetch<
            TrackerApiResponse<OAuthAuthorizeDecisionResponse>
        >('/oauth/authorize', {
            method: 'POST',
            body: {
                decision,
                response_type: consent.request.responseType,
                client_id: consent.request.clientId,
                redirect_uri: consent.request.redirectUri,
                scope: consent.request.scope.join(' '),
                state: consent.request.state,
                code_challenge: consent.request.codeChallenge,
                code_challenge_method: consent.request.codeChallengeMethod,
                nonce: consent.request.nonce
            }
        });

        if (!response.ok) {
            throw {
                data: response
            };
        }

        await navigateTo(response.data.location, {
            external:
                response.data.location.startsWith('http://') ||
                response.data.location.startsWith('https://')
        });
    } catch (error) {
        statusMessage.value = getApiErrorMessage(
            error,
            '授权请求失败，请稍后重试。'
        );
    } finally {
        isSubmitting.value = false;
        pendingDecision.value = null;
    }
}
</script>
