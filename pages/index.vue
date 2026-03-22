<template>
    <main class="landing-shell flex min-h-screen flex-col text-crh-grey-dark">
        <div
            class="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_top,_rgba(74,124,159,0.08),_transparent_60%)]" />
        <div
            class="pointer-events-none absolute inset-x-0 top-20 h-40 bg-[linear-gradient(90deg,_rgba(90,132,162,0.08),_rgba(90,132,162,0))] blur-3xl" />

        <div
            class="relative mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
            <div
                :class="[
                    'grid min-h-[calc(100vh-8rem)] gap-6',
                    splitPreviewVisible
                        ? 'min-[960px]:landscape:grid-cols-[minmax(18rem,20%)_minmax(0,1fr)] min-[960px]:landscape:items-start'
                        : 'justify-items-center content-center'
                ]">
                <div
                    :class="[
                        'w-full transition-[width,transform,opacity] duration-[320ms] ease-out',
                        splitPreviewVisible
                            ? 'min-[960px]:landscape:min-w-[18rem]'
                            : 'max-w-[58rem]'
                    ]">
                    <LookupSearchCard
                        class="landing-hero-card"
                        v-model="draftCode"
                        eyebrow="OpenCRHTracker"
                        title="动车组运用情况查询"
                        description="输入车次号或车组号可查询列车担当情况"
                        placeholder="D2212 或 CR400AF-C-2214"
                        :detected-type="detectedTarget?.type ?? null"
                        :loading="isNavigating"
                        :error-message="inputError"
                        :submit-label="'查询'"
                        @submit="submitLookup" />
                </div>

                <Transition
                    enter-active-class="transition duration-200 ease-out"
                    enter-from-class="translate-x-6 opacity-0"
                    leave-active-class="transition duration-200 ease-in"
                    leave-to-class="translate-x-6 opacity-0">
                    <div
                        v-if="splitPreviewVisible && transitionTarget"
                        class="landing-preview">
                        <LookupHistoryList
                            :type="transitionTarget.type"
                            :code="transitionTarget.code"
                            state="loading"
                            :items="[]"
                            summary="正在加载历史记录，并准备跳转到对应详情页…"
                            :is-loading-more="false"
                            :can-load-more="false"
                            error-message="" />
                    </div>
                </Transition>
            </div>
        </div>

        <AppFooter />
    </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { LookupTarget } from '~/types/lookup';
import {
    buildLookupPath,
    resolveLookupTarget
} from '~/utils/lookup/lookupTarget';

definePageMeta({
    middleware: 'lookup-page-transition'
});

const LANDSCAPE_QUERY = '(orientation: landscape) and (min-width: 960px)';
const ANIMATION_DURATION_MS = 320;

const draftCode = ref('');
const inputError = ref('');
const isNavigating = ref(false);
const isLandscapeWide = ref(false);
const splitPreviewVisible = ref(false);
const transitionTarget = ref<LookupTarget | null>(null);

let mediaQueryList: MediaQueryList | null = null;
let mediaQueryHandler: ((event: MediaQueryListEvent) => void) | null = null;

const detectedTarget = computed(() => resolveLookupTarget(draftCode.value));

useSiteSeo({
    title: '主页 | Open CRH Tracker',
    description: '查询中国动车组担当及交路信息',
    path: '/',
    jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Open CRH Tracker',
        url: '/'
    }
});

onMounted(() => {
    mediaQueryList = window.matchMedia(LANDSCAPE_QUERY);
    isLandscapeWide.value = mediaQueryList.matches;
    mediaQueryHandler = (event: MediaQueryListEvent) => {
        isLandscapeWide.value = event.matches;
    };
    mediaQueryList.addEventListener('change', mediaQueryHandler);
});

onBeforeUnmount(() => {
    if (mediaQueryList && mediaQueryHandler) {
        mediaQueryList.removeEventListener('change', mediaQueryHandler);
    }
});

async function submitLookup() {
    const resolvedTarget = resolveLookupTarget(draftCode.value);
    if (!resolvedTarget) {
        inputError.value = '请输入车次号或车组号。';
        return;
    }

    inputError.value = '';
    isNavigating.value = true;

    if (isLandscapeWide.value) {
        transitionTarget.value = resolvedTarget;
        splitPreviewVisible.value = true;
        await new Promise((resolve) => {
            window.setTimeout(resolve, ANIMATION_DURATION_MS);
        });
    }

    await navigateTo(buildLookupPath(resolvedTarget));
}
</script>

<style scoped>
.landing-shell {
    background:
        radial-gradient(
            circle at top,
            rgba(181, 205, 220, 0.18),
            transparent 34%
        ),
        linear-gradient(180deg, #f4f8fb 0%, #edf3f7 100%);
}

.landing-hero-card :deep(.ticket-card) {
    border-color: rgba(191, 204, 216, 0.78);
    box-shadow:
        0 16px 36px -28px rgba(15, 23, 42, 0.26),
        0 4px 12px rgba(148, 163, 184, 0.16);
}

.landing-hero-card :deep(.ticket-card--accent) {
    background:
        linear-gradient(135deg, rgba(102, 145, 175, 0.06), transparent 42%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, #f7fafc 100%);
}

.landing-hero-card :deep(.harmony-input) {
    border-color: rgba(203, 213, 225, 0.92);
    background: rgba(255, 255, 255, 0.97);
}

.landing-hero-card :deep(button[type='submit']) {
    padding-inline: 1.75rem;
    font-weight: 600;
    box-shadow:
        0 12px 24px -18px rgba(0, 82, 155, 0.55),
        0 2px 6px rgba(15, 23, 42, 0.08);
}

@media (min-width: 768px) {
    .landing-hero-card :deep(.ticket-card--accent) {
        padding: 2.25rem 2.5rem;
    }
}
</style>
