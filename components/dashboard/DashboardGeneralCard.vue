<template>
    <div class="space-y-6">
        <UiCard variant="accent">
            <div class="space-y-6">
                <div class="space-y-2">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.26em] text-crh-blue/80">
                        Account
                    </p>
                    <h2 class="text-2xl font-semibold text-slate-900">账户</h2>
                </div>

                <div class="motion-divider" />

                <div
                    class="rounded-[1rem] border border-white/70 bg-white/85 px-4 py-4 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
                    <dl class="grid gap-3 text-sm text-slate-600">
                        <div class="space-y-1.5">
                            <dt
                                class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                                用户名
                            </dt>
                            <dd class="text-xl font-semibold text-slate-900">
                                {{ session?.userId ?? '--' }}
                            </dd>
                        </div>
                    </dl>
                </div>
            </div>
        </UiCard>

        <UiCard
            :show-accent-bar="false"
            class="border-rose-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,247,247,0.96)_100%)]">
            <div class="space-y-5">
                <div class="space-y-2">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.26em] text-rose-600/80">
                        Danger Zone
                    </p>
                    <h3 class="text-xl font-semibold text-slate-900">
                        危险操作
                    </h3>
                </div>

                <div class="motion-divider opacity-70" />

                <UiButton
                    type="button"
                    variant="secondary"
                    :loading="isLoggingOut"
                    class="w-full justify-center border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800"
                    @click="emit('logout')">
                    退出登录
                </UiButton>

                <p
                    v-if="logoutErrorMessage"
                    class="flex items-center gap-1.5 pl-1 text-xs leading-5 text-[#E53E3E]">
                    <span
                        aria-hidden="true"
                        class="font-semibold">
                        [!]
                    </span>
                    {{ logoutErrorMessage }}
                </p>
            </div>
        </UiCard>
    </div>
</template>

<script setup lang="ts">
import type { AuthSession } from '~/types/auth';

defineProps<{
    session: AuthSession | null;
    isLoggingOut: boolean;
    logoutErrorMessage: string;
}>();

const emit = defineEmits<{
    logout: [];
}>();
</script>
