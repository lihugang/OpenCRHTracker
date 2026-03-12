<template>
    <main class="min-h-screen bg-crh-slate text-crh-grey-dark">
        <div
            class="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_top,_rgba(0,82,155,0.12),_transparent_58%)]" />
        <div
            class="pointer-events-none absolute inset-x-0 top-20 h-40 bg-[linear-gradient(90deg,_rgba(0,82,155,0.14),_rgba(0,82,155,0))] blur-3xl" />

        <div
            class="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
            <div
                :class="[
                    'landing-layout',
                    splitPreviewVisible
                        ? 'landing-layout--split'
                        : 'landing-layout--centered'
                ]">
                <div
                    :class="[
                        'landing-search',
                        splitPreviewVisible ? 'landing-search--split' : ''
                    ]">
                    <LookupSearchCard
                        v-model="draftCode"
                        eyebrow="OpenCRHTracker"
                        title="一个输入框，直达车次或车组详情"
                        description="输入车次号或车组号后按 Enter。检测到 CR / CRH 前缀时按车组号处理，否则按车次号处理，并自动跳转到对应 SPA 页面。"
                        :detected-type="detectedTarget?.type ?? null"
                        :loading="isNavigating"
                        :error-message="inputError"
                        :submit-label="'开始查询'"
                        @submit="submitLookup" />
                </div>

                <Transition name="landing-panel">
                    <div
                        v-if="splitPreviewVisible && transitionTarget"
                        class="landing-preview">
                        <LookupRecentList
                            :type="transitionTarget.type"
                            :code="transitionTarget.code"
                            state="loading"
                            :groups="[]"
                            summary="正在整理最近 30 天的担当结果，并准备跳转到对应详情页…"
                            error-message="" />
                    </div>
                </Transition>
            </div>
        </div>
    </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { LookupTarget } from '~/types/lookup';
import { buildLookupPath, resolveLookupTarget } from '~/utils/lookupTarget';

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

useHead({
    title: 'OpenCRHTracker | 首页查询',
    meta: [
        {
            name: 'description',
            content:
                '输入车次号或车组号后自动识别类型，并跳转到对应的近日担当详情页面。'
        }
    ]
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
.landing-layout {
    display: grid;
    gap: 1.5rem;
    min-height: calc(100vh - 8rem);
    align-items: center;
}

.landing-layout--centered {
    justify-items: center;
    align-content: center;
}

.landing-layout--centered .landing-search {
    width: min(100%, 58rem);
}

.landing-search {
    transition:
        width 320ms ease,
        transform 320ms ease,
        opacity 220ms ease;
}

@media (orientation: landscape) and (min-width: 960px) {
    .landing-layout--split {
        grid-template-columns: minmax(18rem, 20%) minmax(0, 1fr);
        align-items: start;
    }

    .landing-search--split {
        min-width: 18rem;
    }
}

.landing-panel-enter-active,
.landing-panel-leave-active {
    transition:
        opacity 240ms ease,
        transform 240ms ease;
}

.landing-panel-enter-from,
.landing-panel-leave-to {
    opacity: 0;
    transform: translateX(24px);
}
</style>
