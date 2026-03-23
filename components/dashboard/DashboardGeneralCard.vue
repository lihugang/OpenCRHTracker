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

        <UiCard :show-accent-bar="false">
            <div class="space-y-5">
                <div class="space-y-2">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.26em] text-crh-blue/80">
                        Security
                    </p>
                    <h3 class="text-xl font-semibold text-slate-900">
                        修改密码
                    </h3>
                </div>

                <div class="motion-divider opacity-70" />

                <form
                    class="space-y-4"
                    @submit.prevent="emit('changePassword')">
                    <div class="space-y-2">
                        <label
                            for="dashboard-current-password"
                            class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                            当前密码
                        </label>
                        <input
                            id="dashboard-current-password"
                            ref="currentPasswordInputRef"
                            v-model="currentPasswordModel"
                            type="password"
                            autocomplete="current-password"
                            :disabled="!canChangePassword || isChangingPassword"
                            :class="inputClasses"
                            @keydown.enter.prevent="
                                handleFieldEnter('currentPassword')
                            " />
                    </div>

                    <div class="space-y-2">
                        <label
                            for="dashboard-new-password"
                            class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                            新密码
                        </label>
                        <input
                            id="dashboard-new-password"
                            ref="newPasswordInputRef"
                            v-model="newPasswordModel"
                            type="password"
                            autocomplete="new-password"
                            :disabled="!canChangePassword || isChangingPassword"
                            :class="inputClasses"
                            @keydown.enter.prevent="
                                handleFieldEnter('newPassword')
                            "
                            @keydown.backspace="
                                handleFieldBackspace(
                                    $event,
                                    'newPassword',
                                    newPasswordModel
                                )
                            " />
                    </div>

                    <div class="space-y-2">
                        <label
                            for="dashboard-confirm-new-password"
                            class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                            确认新密码
                        </label>
                        <input
                            id="dashboard-confirm-new-password"
                            ref="confirmNewPasswordInputRef"
                            v-model="confirmNewPasswordModel"
                            type="password"
                            autocomplete="new-password"
                            :disabled="!canChangePassword || isChangingPassword"
                            :class="inputClasses"
                            @keydown.backspace="
                                handleFieldBackspace(
                                    $event,
                                    'confirmNewPassword',
                                    confirmNewPasswordModel
                                )
                            " />
                    </div>

                    <p
                        v-if="!canChangePassword"
                        class="rounded-[1rem] border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm leading-6 text-amber-800">
                        当前会话不包含
                        <code>api.auth.password.update</code>
                        权限，请重新登录后重试。
                    </p>

                    <p
                        v-if="changePasswordMessage"
                        :class="changePasswordMessageClass">
                        <span
                            aria-hidden="true"
                            class="font-semibold">
                            {{ changePasswordTone === 'error' ? '[!]' : '[+]' }}
                        </span>
                        {{ changePasswordMessage }}
                    </p>

                    <UiButton
                        type="submit"
                        :loading="isChangingPassword"
                        :disabled="!canChangePassword"
                        class="w-full justify-center">
                        更新密码
                    </UiButton>
                </form>
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
import { computed, ref } from 'vue';
import type { AuthSession } from '~/types/auth';
import safeFocus from '~/utils/safeFocus';

const props = defineProps<{
    session: AuthSession | null;
    canChangePassword: boolean;
    currentPassword: string;
    newPassword: string;
    confirmNewPassword: string;
    isChangingPassword: boolean;
    changePasswordMessage: string;
    changePasswordTone: 'success' | 'error';
    isLoggingOut: boolean;
    logoutErrorMessage: string;
}>();

const emit = defineEmits<{
    'update:currentPassword': [value: string];
    'update:newPassword': [value: string];
    'update:confirmNewPassword': [value: string];
    changePassword: [];
    logout: [];
}>();

const inputClasses =
    'harmony-input w-full px-4 py-3 text-base text-crh-grey-dark placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60';

type PasswordFieldKey =
    | 'currentPassword'
    | 'newPassword'
    | 'confirmNewPassword';

const currentPasswordInputRef = ref<HTMLInputElement | null>(null);
const newPasswordInputRef = ref<HTMLInputElement | null>(null);
const confirmNewPasswordInputRef = ref<HTMLInputElement | null>(null);

const changePasswordMessageClass = computed(() =>
    props.changePasswordTone === 'error'
        ? 'flex items-center gap-1.5 pl-1 text-xs leading-5 text-[#E53E3E]'
        : 'flex items-center gap-1.5 pl-1 text-xs leading-5 text-emerald-600'
);

const currentPasswordModel = computed({
    get: () => props.currentPassword,
    set: (value: string) => emit('update:currentPassword', value)
});

const newPasswordModel = computed({
    get: () => props.newPassword,
    set: (value: string) => emit('update:newPassword', value)
});

const confirmNewPasswordModel = computed({
    get: () => props.confirmNewPassword,
    set: (value: string) => emit('update:confirmNewPassword', value)
});

function getFieldOrder(): PasswordFieldKey[] {
    return ['currentPassword', 'newPassword', 'confirmNewPassword'];
}

function getFieldRef(field: PasswordFieldKey) {
    switch (field) {
        case 'currentPassword':
            return currentPasswordInputRef;
        case 'newPassword':
            return newPasswordInputRef;
        case 'confirmNewPassword':
            return confirmNewPasswordInputRef;
    }
}

function focusField(field: PasswordFieldKey) {
    safeFocus(getFieldRef(field).value, {
        preventScroll: true,
        source: 'keyboard-nav',
        selection: 'end'
    });
}

function handleFieldEnter(field: PasswordFieldKey) {
    const fieldOrder = getFieldOrder();
    const currentIndex = fieldOrder.indexOf(field);
    if (currentIndex < 0) {
        return;
    }

    const nextField = fieldOrder[currentIndex + 1];
    if (nextField) {
        focusField(nextField);
    }
}

function handleFieldBackspace(
    event: KeyboardEvent,
    field: PasswordFieldKey,
    value: string
) {
    if (value.length > 0) {
        return;
    }

    const fieldOrder = getFieldOrder();
    const currentIndex = fieldOrder.indexOf(field);
    const previousField =
        currentIndex > 0 ? fieldOrder[currentIndex - 1] : null;

    if (!previousField) {
        return;
    }

    event.preventDefault();
    focusField(previousField);
}
</script>
