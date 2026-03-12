<template>
    <main class="min-h-screen bg-crh-slate text-crh-grey-dark">
        <div
            class="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,_rgba(0,82,155,0.1),_transparent_58%)]" />

        <div
            class="relative mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
            <div class="lookup-detail-layout">
                <div class="lookup-detail-sidebar">
                    <LookupSearchCard
                        v-model="draftCode"
                        compact
                        :title="searchTitle"
                        :description="searchDescription"
                        eyebrow="Quick Lookup"
                        :detected-type="detectedTarget?.type ?? null"
                        :error-message="inputError"
                        :submit-label="'重新查询'"
                        @submit="submitSearch" />
                </div>

                <div class="lookup-detail-main">
                    <LookupRecentList
                        :type="props.targetType"
                        :code="normalizedCode"
                        :state="state"
                        :groups="groups"
                        :summary="summary"
                        :error-message="errorMessage" />
                </div>
            </div>
        </div>
    </main>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { LookupTargetType } from '~/types/lookup';
import {
    buildLookupPath,
    normalizeLookupCode,
    resolveLookupTarget
} from '~/utils/lookupTarget';

const props = defineProps<{
    targetType: LookupTargetType;
}>();

const route = useRoute();
const draftCode = ref('');
const inputError = ref('');

const normalizedCode = computed(() =>
    normalizeLookupCode(String(route.params.code ?? ''))
);

const target = computed(() => {
    if (!normalizedCode.value) {
        return null;
    }

    return {
        type: props.targetType,
        code: normalizedCode.value
    };
});

const detectedTarget = computed(() => resolveLookupTarget(draftCode.value));
const { state, groups, errorMessage, summary } = useRecentAssignments(target);

const searchTitle = computed(() => {
    return props.targetType === 'train' ? '车次详情查询' : '车组详情查询';
});

const searchDescription = computed(() => {
    return props.targetType === 'train'
        ? '输入新的车次号或车组号后回车，右侧将切换到对应对象的近日担当列表。'
        : '输入新的车组号或车次号后回车，右侧将切换到对应对象的近日担当列表。';
});

watch(
    normalizedCode,
    (value) => {
        draftCode.value = value;
        inputError.value = '';
    },
    {
        immediate: true
    }
);

useHead(() => ({
    title:
        props.targetType === 'train'
            ? `${normalizedCode.value} | 车次近日担当`
            : `${normalizedCode.value} | 车组近日担当`,
    meta: [
        {
            name: 'description',
            content:
                props.targetType === 'train'
                    ? `${normalizedCode.value} 最近 30 天由哪些车组担当。`
                    : `${normalizedCode.value} 最近 30 天担当了哪些车次。`
        }
    ]
}));

async function submitSearch() {
    const resolvedTarget = resolveLookupTarget(draftCode.value);
    if (!resolvedTarget) {
        inputError.value = '请输入车次号或车组号。';
        return;
    }

    inputError.value = '';
    await navigateTo(buildLookupPath(resolvedTarget));
}
</script>

<style scoped>
.lookup-detail-layout {
    display: grid;
    gap: 1.5rem;
}

.lookup-detail-main {
    animation: detail-main-enter 280ms ease;
}

@media (orientation: landscape) and (min-width: 960px) {
    .lookup-detail-layout {
        grid-template-columns: minmax(18rem, 20%) minmax(0, 1fr);
        align-items: start;
    }

    .lookup-detail-sidebar {
        min-width: 18rem;
        position: sticky;
        top: 1.5rem;
        animation: detail-sidebar-enter 280ms ease;
    }
}

@keyframes detail-sidebar-enter {
    from {
        opacity: 0;
        transform: translateX(18px) scale(0.98);
    }

    to {
        opacity: 1;
        transform: translateX(0) scale(1);
    }
}

@keyframes detail-main-enter {
    from {
        opacity: 0;
        transform: translateX(24px);
    }

    to {
        opacity: 1;
        transform: translateX(0);
    }
}
</style>
