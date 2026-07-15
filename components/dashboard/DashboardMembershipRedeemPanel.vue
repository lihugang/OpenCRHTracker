<template>
    <section
        class="relative overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white/95 shadow-[0_18px_44px_-34px_rgba(15,23,42,0.35)]">
        <div
            aria-hidden="true"
            class="absolute inset-y-0 left-0 w-1.5 bg-crh-blue" />

        <form
            class="grid gap-5 p-6 pl-7 sm:p-7 sm:pl-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end"
            @submit.prevent="redeem">
            <div class="space-y-4">
                <div class="space-y-2">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.26em] text-crh-blue/80">
                        Redeem
                    </p>
                    <h2 class="text-2xl font-semibold text-slate-900">
                        兑换赞助权益
                    </h2>
                </div>

                <UiField
                    label="兑换码"
                    required>
                    <input
                        v-model="code"
                        type="text"
                        autocomplete="off"
                        spellcheck="false"
                        maxlength="64"
                        class="harmony-input w-full px-4 py-3 font-mono text-base uppercase text-crh-grey-dark"
                        placeholder="CRH-XXXX-XXXX-XXXX-XXXX"
                        :disabled="isSubmitting" />
                </UiField>

                <p
                    v-if="errorMessage"
                    class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm leading-6 text-rose-700"
                    role="alert">
                    {{ errorMessage }}
                </p>

                <div
                    v-else-if="successResult"
                    class="grid gap-3 rounded-[1rem] border border-emerald-200 bg-emerald-50/75 px-4 py-4 sm:grid-cols-2"
                    role="status">
                    <div>
                        <p class="text-xs text-emerald-700">已开通</p>
                        <p class="mt-1 font-semibold text-emerald-950">
                            {{ successResult.membership.group.name }}
                        </p>
                    </div>
                    <div>
                        <p class="text-xs text-emerald-700">到期时间</p>
                        <p class="mt-1 font-semibold text-emerald-950">
                            {{
                                formatTimestamp(
                                    successResult.membership.expiresAt
                                )
                            }}
                        </p>
                    </div>
                </div>
            </div>

            <UiButton
                type="submit"
                class="w-full lg:w-auto"
                :loading="isSubmitting"
                :disabled="code.trim().length === 0">
                立即兑换
            </UiButton>
        </form>
    </section>
</template>

<script setup lang="ts">
import type { TrackerApiResponse } from '~/types/homepage';
import type { AuthMembershipRedeemResponse } from '~/types/membership';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

const emit = defineEmits<{
    redeemed: [response: AuthMembershipRedeemResponse];
}>();

const code = ref('');
const isSubmitting = ref(false);
const errorMessage = ref('');
const successResult = ref<AuthMembershipRedeemResponse | null>(null);

async function redeem() {
    const normalizedCode = code.value.trim();
    if (!normalizedCode || isSubmitting.value) {
        return;
    }

    isSubmitting.value = true;
    errorMessage.value = '';
    successResult.value = null;

    try {
        const { data, error } = await useCsrfFetch<
            TrackerApiResponse<AuthMembershipRedeemResponse>
        >('/api/v1/auth/memberships/redeem', {
            method: 'POST',
            retry: 0,
            body: {
                code: normalizedCode
            },
            key: `membership:redeem:${Date.now()}`,
            watch: false,
            server: false
        });

        if (error.value) {
            throw error.value;
        }
        const response = data.value;
        if (!response) {
            throw new Error('Missing membership redemption response');
        }
        if (!response.ok) {
            throw { data: response };
        }

        successResult.value = response.data;
        code.value = '';
        emit('redeemed', response.data);
    } catch (error) {
        errorMessage.value = getApiErrorMessage(
            error,
            '兑换失败，请稍后重试。'
        );
    } finally {
        isSubmitting.value = false;
    }
}

function formatTimestamp(timestamp: number) {
    return formatTrackerTimestamp(timestamp) || '--';
}
</script>
