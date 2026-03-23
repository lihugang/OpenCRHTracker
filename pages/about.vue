<template>
    <main class="flex min-h-screen flex-col bg-crh-slate text-crh-grey-dark">
        <div
            class="pointer-events-none absolute inset-x-0 top-0 h-[26rem] bg-[radial-gradient(circle_at_top,_rgba(0,82,155,0.14),_transparent_60%)]" />
        <div
            class="pointer-events-none absolute inset-x-0 top-24 h-40 bg-[linear-gradient(90deg,_rgba(0,82,155,0.12),_rgba(0,82,155,0))] blur-3xl" />

        <div
            class="relative mx-auto flex w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
            <section class="mx-auto flex w-full max-w-4xl items-start">
                <UiCard
                    variant="accent"
                    class="w-full rounded-[1.5rem]">
                    <div class="space-y-6">
                        <div class="space-y-3">
                            <p
                                class="text-xs font-medium uppercase tracking-[0.26em] text-crh-blue/80">
                                About
                            </p>
                            <h1
                                class="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                                关于 Open CRH Tracker
                            </h1>
                        </div>

                        <div class="motion-divider" />

                        <div
                            class="space-y-4 text-base leading-7 text-slate-600">
                            <p>
                                Open CRH Tracker
                                是面向中国动车组担当关系查询的工具站点，主要用途是帮助用户快速查看在最近一段时间内车次和动车组的对应关系及变化情况。
                            </p>
                            <p>
                                站内结果来自 12306
                                微信小程序。由于数据写入、缓存刷新、任务调度和
                                12306
                                信息维护并不总是同步，站内数据可能存在一定延迟。
                            </p>
                            <p>
                                {{ timingDescription }}
                            </p>
                            <p>
                                个别记录也可能因为车辆临时更换、12306
                                数据异常、网络波动等原因出现偏差，或与实际情况不完全一致。
                            </p>
                            <p>
                                这是一个非官方项目，查询结果仅供参考，请以实际运行情况和官方信息为准。
                            </p>
                            <p>
                                如果你发现查询结果异常、缺失，或存在其他问题，可以点击页面底部的反馈入口提交反馈。
                            </p>
                        </div>

                        <div
                            class="rounded-[1.25rem] border border-slate-200 bg-white/80 px-5 py-5">
                            <div class="space-y-3">
                                <p
                                    class="text-xs font-medium uppercase tracking-[0.2em] text-crh-blue/80">
                                    FONTS
                                </p>
                                <p class="text-sm leading-6 text-slate-600">
                                    本站随页面一起分发以下字体。
                                </p>
                                <div class="flex flex-wrap gap-x-4 gap-y-2">
                                    <button
                                        v-for="entry in fontLicenseEntries"
                                        :key="entry.name"
                                        type="button"
                                        class="text-sm font-medium text-crh-blue underline decoration-current underline-offset-4 transition hover:text-slate-900"
                                        @click="openFontLicense(entry.name)">
                                        {{ entry.name }}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div class="flex flex-wrap gap-3">
                            <NuxtLink
                                to="/"
                                class="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-900 hover:text-slate-900">
                                返回首页
                            </NuxtLink>
                            <NuxtLink
                                to="/feedback"
                                class="inline-flex items-center justify-center rounded-2xl bg-crh-blue px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-900">
                                前往反馈
                            </NuxtLink>
                        </div>
                    </div>
                </UiCard>
            </section>
        </div>

        <AboutFontLicenseModal
            v-if="activeFontLicenseName"
            :model-value="isFontLicenseOpen"
            :is-mobile="isMobileLayout"
            :font-name="activeFontLicenseName"
            @update:model-value="handleFontLicenseVisibilityChange" />

        <AppFooter />
    </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import AboutFontLicenseModal from '~/components/about/AboutFontLicenseModal.vue';
import type {
    AboutExposedConfigData,
    AboutFontLicenseName
} from '~/types/about';
import type { TrackerApiResponse } from '~/types/homepage';
import {
    aboutFontLicenseNames,
    aboutFontLicenses
} from '~/utils/about/fontLicenses';

const MOBILE_QUERY = '(max-width: 767px)';

const requestFetch = useRequestFetch();
const activeFontLicenseName = ref<AboutFontLicenseName | null>(null);
const isMobileLayout = ref(false);
let mediaQueryList: MediaQueryList | null = null;

const { data: exposedConfigResponse } = await useAsyncData(
    'about-exposed-config',
    () =>
        requestFetch<TrackerApiResponse<AboutExposedConfigData>>(
            '/api/v1/exposed-config'
        ),
    {
        default: () => null
    }
);

const aboutConfig = computed(() => {
    const response = exposedConfigResponse.value;
    if (!response || !response.ok) {
        return null;
    }

    return response.data.about;
});

const schedulerPollIntervalMinutes = computed(() => {
    return aboutConfig.value?.schedulerPollIntervalMinutes ?? null;
});

const timingDescription = computed(() => {
    const minutes = schedulerPollIntervalMinutes.value;
    if (minutes === null) {
        return '在常规情况下，动车组担当情况会按任务调度周期执行抓取。';
    }

    return `在常规情况下，动车组担当情况会按约 ${minutes} 分钟的任务调度周期执行抓取。`;
});

const fontLicenseEntries = computed(() => {
    return aboutFontLicenseNames.map((name) => aboutFontLicenses[name]);
});

const isFontLicenseOpen = computed(() => {
    return activeFontLicenseName.value !== null;
});

function openFontLicense(fontName: AboutFontLicenseName) {
    activeFontLicenseName.value = fontName;
}

function handleFontLicenseVisibilityChange(value: boolean) {
    if (value) {
        return;
    }

    activeFontLicenseName.value = null;
}

function handleViewportChange(event: MediaQueryListEvent) {
    isMobileLayout.value = event.matches;
}

onMounted(() => {
    mediaQueryList = window.matchMedia(MOBILE_QUERY);
    isMobileLayout.value = mediaQueryList.matches;
    mediaQueryList.addEventListener('change', handleViewportChange);
});

onBeforeUnmount(() => {
    mediaQueryList?.removeEventListener('change', handleViewportChange);
});

useSiteSeo({
    title: '关于 | Open CRH Tracker',
    description:
        '了解 Open CRH Tracker 的定位、数据来源、时效说明、字体许可与反馈方式',
    path: '/about',
    jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'AboutPage',
        name: 'Open CRH Tracker 关于页',
        url: '/about'
    }
});
</script>
