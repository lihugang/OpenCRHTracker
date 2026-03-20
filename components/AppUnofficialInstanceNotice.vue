<template>
    <div
        v-if="shouldShowUnofficialWarning"
        class="rounded-[1.25rem] border border-amber-300/80 bg-[linear-gradient(180deg,rgba(255,251,235,0.98)_0%,rgba(254,243,199,0.92)_100%)] p-4 text-amber-950 shadow-[0_18px_40px_-28px_rgba(146,64,14,0.45)]">
        <div class="space-y-3">
            <div class="flex flex-wrap items-center gap-2">
                <UiStatusBadge
                    label="Unofficial Instance"
                    tone="warning" />
                <p class="text-sm font-semibold tracking-[0.08em] text-amber-900">
                    当前站点不是 OpenCRHTracker 官方部署
                </p>
            </div>

            <p class="text-sm leading-6 text-amber-900/90">
                {{ description }}
            </p>

            <div class="flex flex-wrap gap-3">
                <a
                    :href="officialPageUrl"
                    class="inline-flex items-center rounded-2xl border border-amber-900/15 bg-white/80 px-4 py-2 text-sm font-semibold text-amber-950 transition hover:border-amber-900/35 hover:bg-white"
                    rel="noreferrer"
                    target="_blank">
                    {{ primaryLinkLabel }}
                </a>

                <a
                    :href="githubUrl"
                    class="inline-flex items-center rounded-2xl px-1 py-2 text-sm font-semibold text-amber-900 underline underline-offset-4 transition hover:text-amber-950"
                    rel="noreferrer"
                    target="_blank">
                    官方 GitHub 仓库
                </a>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
    page: 'auth' | 'feedback';
}>();

const githubUrl = 'https://github.com/lihugang/OpenCRHTracker';
const {
    currentHostname,
    officialHostname,
    officialOrigin,
    shouldShowUnofficialWarning
} = useOfficialInstance();

const description = computed(() => {
    const sourceHostname = currentHostname || '当前域名';

    if (props.page === 'feedback') {
        return `${sourceHostname} 并非官方站点。如需向 OpenCRHTracker 官方项目反馈问题，请以前往 ${officialHostname} 或官方 GitHub 仓库为准。`;
    }

    return `${sourceHostname} 并非官方站点。为防止冒充官方，请不要在无法确认来源的站点输入你在官方站点使用的账号密码；官方登录入口仅为 ${officialHostname}。`;
});

const officialPageUrl = computed(() =>
    props.page === 'feedback'
        ? `${officialOrigin}/feedback`
        : `${officialOrigin}/login`
);

const primaryLinkLabel = computed(() =>
    props.page === 'feedback' ? '前往官方反馈页' : '前往官方登录页'
);
</script>
