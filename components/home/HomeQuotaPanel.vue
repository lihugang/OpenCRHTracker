<template>
    <UiCard>
        <div class="space-y-6">
            <div
                class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div class="space-y-2">
                    <p
                        class="text-xs font-semibold uppercase tracking-[0.3em] text-crh-blue/70">
                        配额与接口说明
                    </p>
                    <h2 class="text-2xl font-semibold text-crh-grey-dark">
                        匿名模式下也能快速验证查询
                    </h2>
                    <p class="max-w-2xl text-sm leading-6 text-slate-500">
                        首页默认不接入登录与 API Key
                        管理，只保留匿名模式。你可以在真正需要的时候手动拉取当前配额，避免首屏无意义消耗。
                    </p>
                </div>

                <UiButton
                    variant="secondary"
                    :loading="isLoading"
                    @click="fetchQuota">
                    查看当前匿名配额
                </UiButton>
            </div>

            <div class="motion-divider" />

            <div class="grid gap-4 lg:grid-cols-3">
                <UiCard variant="subtle">
                    <p class="text-sm text-slate-500">匿名额度上限</p>
                    <p class="mt-3 text-3xl font-semibold text-crh-blue">20</p>
                    <p class="mt-2 text-sm leading-6 text-slate-600">
                        适合首轮排查、临时查询和页面体验验证。
                    </p>
                </UiCard>
                <UiCard variant="subtle">
                    <p class="text-sm text-slate-500">接口成本规则</p>
                    <p class="mt-3 text-lg font-semibold text-crh-grey-dark">
                        历史 / 当日记录按返回条数计费
                    </p>
                    <p class="mt-2 text-sm leading-6 text-slate-600">
                        首页统一使用分页继续加载，尽量减少一次性消耗。
                    </p>
                </UiCard>
                <UiCard variant="subtle">
                    <p class="text-sm text-slate-500">轻量辅助接口</p>
                    <p class="mt-3 text-lg font-semibold text-crh-grey-dark">
                        配额查询独立触发
                    </p>
                    <p class="mt-2 text-sm leading-6 text-slate-600">
                        不把首屏渲染和接口成本绑在一起，更适合移动端访问。
                    </p>
                </UiCard>
            </div>

            <div
                v-if="state === 'success' && quota"
                class="grid gap-4 md:grid-cols-3">
                <UiCard variant="subtle">
                    <p class="text-sm text-slate-500">当前身份</p>
                    <div class="mt-3 flex items-center gap-2">
                        <p class="text-lg font-semibold text-crh-grey-dark">
                            {{ quota.identity.type }}
                        </p>
                        <UiStatusBadge
                            label="已同步"
                            tone="success" />
                    </div>
                    <p class="mt-2 font-mono text-sm text-slate-600">
                        {{ quota.identity.id || 'anonymous' }}
                    </p>
                </UiCard>
                <UiCard variant="subtle">
                    <p class="text-sm text-slate-500">剩余额度</p>
                    <p class="mt-3 text-3xl font-semibold text-crh-blue">
                        {{ quota.quota.remain }}
                    </p>
                    <p class="mt-2 text-sm text-slate-600">
                        上限 {{ quota.quota.tokenLimit }}
                    </p>
                </UiCard>
                <UiCard variant="subtle">
                    <p class="text-sm text-slate-500">补充节奏</p>
                    <p class="mt-3 text-lg font-semibold text-crh-grey-dark">
                        每 {{ refillIntervalHours }} 小时补充
                        {{ quota.quota.refillAmount }}
                    </p>
                    <p class="mt-2 text-sm text-slate-600">
                        实际可用额度仍受身份上限约束。
                    </p>
                </UiCard>
            </div>

            <div
                v-else-if="state === 'error'"
                class="rounded-[1rem] border border-status-delayed/15 bg-status-delayed/5 px-4 py-3 text-sm text-status-delayed">
                {{ errorMessage }}
            </div>
        </div>
    </UiCard>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TrackerApiResponse } from '~/types/homepage';
import getApiErrorMessage from '~/utils/getApiErrorMessage';

interface QuotaData {
    identity: {
        type: string;
        id: string;
    };
    quota: {
        tokenLimit: number;
        remain: number;
        refillAmount: number;
        refillIntervalSeconds: number;
    };
}

const state = ref<'idle' | 'loading' | 'success' | 'error'>('idle');
const quota = ref<QuotaData | null>(null);
const errorMessage = ref('');

const isLoading = computed(() => state.value === 'loading');
const refillIntervalHours = computed(() => {
    if (!quota.value) {
        return 0;
    }

    return Math.max(1, quota.value.quota.refillIntervalSeconds / 3600);
});

async function fetchQuota() {
    state.value = 'loading';
    errorMessage.value = '';

    try {
        const response =
            await $fetch<TrackerApiResponse<QuotaData>>('/api/v1/quota/me');

        if (!response.ok) {
            throw {
                data: response
            };
        }

        quota.value = response.data;
        state.value = 'success';
    } catch (error) {
        state.value = 'error';
        errorMessage.value = getApiErrorMessage(
            error,
            '暂时无法获取当前配额，请稍后重试。'
        );
    }
}
</script>
