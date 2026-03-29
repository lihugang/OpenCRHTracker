<template>
    <AdminShell
        v-model:date-input="selectedDateInput"
        :today-date-input-value="todayDateInputValue"
        :session="session"
        title="WebApp Token"
        description="集中执行网页端会话令牌的高风险操作。当前页可一键吊销全部 webapp token，所有网页端登录会话会立即失效并要求重新登录。"
        :show-date-input="false">
        <UiCard :show-accent-bar="false">
            <div class="space-y-6">
                <div class="space-y-2">
                    <p
                        class="text-xs font-semibold uppercase tracking-[0.22em] text-rose-700">
                        Danger Zone
                    </p>
                    <h2 class="text-2xl font-semibold text-slate-900">
                        吊销全部 webapp token
                    </h2>
                    <p class="text-sm leading-6 text-slate-600">
                        该操作会把数据库中全部未吊销的
                        <code>webapp</code>
                        令牌标记为失效，包含当前管理员会话；操作完成后当前页面会退出登录并跳转到登录页。
                    </p>
                </div>

                <div
                    class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-900">
                    <p class="font-semibold">影响范围</p>
                    <p class="mt-2">1. 所有网页端登录态立即失效。</p>
                    <p>2. 用户需要重新登录才能继续访问受保护页面。</p>
                    <p>
                        3. <code>issuer = 'api'</code> 的 API 密钥不会受到影响。
                    </p>
                </div>

                <div
                    v-if="revokeErrorMessage"
                    class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                    {{ revokeErrorMessage }}
                </div>

                <div class="flex justify-end">
                    <UiButton
                        type="button"
                        class="bg-[linear-gradient(180deg,#c53030_0%,#b91c1c_100%)] text-white hover:bg-[linear-gradient(180deg,#b91c1c_0%,#991b1b_100%)]"
                        @click="openConfirmDialog">
                        一键吊销全部 webapp token
                    </UiButton>
                </div>
            </div>
        </UiCard>

        <UiModal
            :model-value="isConfirmDialogOpen"
            eyebrow="危险操作"
            title="确认吊销全部 webapp token"
            description="该操作不可撤销。确认后所有网页端会话都会失效，包含当前管理员会话。"
            size="lg"
            :close-on-backdrop="!isRevoking"
            @update:model-value="handleConfirmDialogVisibilityChange">
            <div class="space-y-4">
                <div
                    class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-900">
                    <p class="font-semibold">即将执行的操作</p>
                    <p class="mt-2">
                        吊销全部未失效的 <code>webapp</code> token。
                    </p>
                    <p>
                        当前管理员会话也会被吊销，确认后将自动退出登录。
                    </p>
                </div>

                <p
                    v-if="revokeErrorMessage"
                    class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                    {{ revokeErrorMessage }}
                </p>
            </div>

            <template #footer>
                <div
                    class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <UiButton
                        type="button"
                        variant="secondary"
                        :disabled="isRevoking"
                        @click="closeConfirmDialog">
                        取消
                    </UiButton>
                    <UiButton
                        type="button"
                        :loading="isRevoking"
                        class="bg-[linear-gradient(180deg,#c53030_0%,#b91c1c_100%)] text-white hover:bg-[linear-gradient(180deg,#b91c1c_0%,#991b1b_100%)]"
                        @click="confirmRevokeAllWebappTokens">
                        确认吊销
                    </UiButton>
                </div>
            </template>
        </UiModal>
    </AdminShell>
</template>

<script setup lang="ts">
import UiModal from '~/components/ui/UiModal.vue';
import { useAdminDateQuery } from '~/composables/useAdminDateQuery';
import type { AdminRevokeAllWebappTokensResponse } from '~/types/admin';
import type { TrackerApiResponse } from '~/types/homepage';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';

definePageMeta({
    middleware: 'admin-required'
});

const { session, clearSession } = useAuthState();
const { selectedDateInput, todayDateInputValue } = await useAdminDateQuery();

const isConfirmDialogOpen = ref(false);
const isRevoking = ref(false);
const revokeErrorMessage = ref('');

useSiteSeo({
    title: 'WebApp Token | Open CRH Tracker',
    description: '管理员危险操作页，用于一键吊销全部网页端 webapp token。',
    path: '/admin/webapp-tokens',
    noindex: true
});

function openConfirmDialog() {
    revokeErrorMessage.value = '';
    isConfirmDialogOpen.value = true;
}

function closeConfirmDialog() {
    if (isRevoking.value) {
        return;
    }

    isConfirmDialogOpen.value = false;
    revokeErrorMessage.value = '';
}

function handleConfirmDialogVisibilityChange(nextValue: boolean) {
    if (nextValue) {
        isConfirmDialogOpen.value = true;
        return;
    }

    closeConfirmDialog();
}

async function confirmRevokeAllWebappTokens() {
    if (isRevoking.value) {
        return;
    }

    isRevoking.value = true;
    revokeErrorMessage.value = '';

    try {
        const { data, error } = await useCsrfFetch<
            TrackerApiResponse<AdminRevokeAllWebappTokensResponse>
        >('/api/v1/admin/webapp-tokens/revoke-all', {
            method: 'POST',
            key: `admin:webapp-tokens:revoke-all:${Date.now()}`,
            watch: false,
            server: false
        });

        if (error.value) {
            throw error.value;
        }

        const response = data.value;
        if (!response) {
            throw new Error('Missing revoke-all-webapp-tokens response');
        }

        if (!response.ok) {
            throw {
                data: response
            };
        }

        isConfirmDialogOpen.value = false;

        if (response.data.revokedCurrentSession) {
            clearSession();
            await navigateTo('/login');
            return;
        }
    } catch (error) {
        revokeErrorMessage.value = getApiErrorMessage(
            error,
            '吊销全部 webapp token 失败，请稍后重试。'
        );
    } finally {
        isRevoking.value = false;
    }
}
</script>
