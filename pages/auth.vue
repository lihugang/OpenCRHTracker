<template>
    <main class="flex min-h-screen flex-col bg-crh-slate text-crh-grey-dark">
        <div
            class="pointer-events-none absolute inset-x-0 top-0 h-[24rem] bg-[radial-gradient(circle_at_top,_rgba(0,82,155,0.12),_transparent_58%)]" />
        <div
            class="pointer-events-none absolute inset-x-0 top-16 h-40 bg-[linear-gradient(90deg,_rgba(90,132,162,0.12),_rgba(90,132,162,0))] blur-3xl" />

        <div
            class="relative mx-auto flex w-full max-w-7xl flex-1 items-center justify-center px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
            <section class="w-full max-w-[32rem]">
                <Transition
                    name="fade"
                    mode="out-in"
                    @after-enter="handlePanelAfterEnter">
                    <UiCard
                        :key="isLogin ? 'login' : 'register'"
                        variant="accent"
                        class="auth-panel"
                        allow-overflow>
                        <div class="space-y-6">
                            <div class="space-y-3">
                                <p
                                    class="text-xs font-semibold uppercase tracking-[0.3em] text-crh-blue/70">
                                    ACCESS
                                </p>
                                <div class="space-y-2">
                                    <h1
                                        class="text-2xl font-semibold tracking-tight text-crh-grey-dark sm:text-[2rem]">
                                        {{ pageTitle }}
                                    </h1>
                                </div>
                            </div>

                            <div class="motion-divider" />

                            <AppUnofficialInstanceNotice />

                            <form
                                class="space-y-5"
                                @submit.prevent="submitAuth">
                                <div class="space-y-2">
                                    <label
                                        for="auth-username"
                                        class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                                        用户名
                                    </label>
                                    <input
                                        id="auth-username"
                                        ref="usernameInputRef"
                                        v-model.trim="username"
                                        type="text"
                                        autocomplete="username"
                                        inputmode="text"
                                        placeholder="3-24 个字符"
                                        :class="inputClasses"
                                        @keydown.enter.prevent="
                                            handleFieldEnter('username')
                                        "
                                        @keydown.backspace="
                                            handleFieldBackspace(
                                                $event,
                                                'username',
                                                username
                                            )
                                        " />
                                </div>

                                <div class="space-y-2">
                                    <label
                                        for="auth-password"
                                        class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                                        密码
                                    </label>
                                    <input
                                        id="auth-password"
                                        ref="passwordInputRef"
                                        v-model="password"
                                        type="password"
                                        :autocomplete="
                                            isLogin
                                                ? 'current-password'
                                                : 'new-password'
                                        "
                                        placeholder="8-72 个字符"
                                        :class="inputClasses"
                                        @keydown.enter.prevent="
                                            handleFieldEnter('password')
                                        "
                                        @keydown.backspace="
                                            handleFieldBackspace(
                                                $event,
                                                'password',
                                                password
                                            )
                                        " />
                                </div>

                                <div
                                    v-if="!isLogin"
                                    class="space-y-2">
                                    <label
                                        for="auth-confirm-password"
                                        class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                                        确认密码
                                    </label>
                                    <input
                                        id="auth-confirm-password"
                                        ref="confirmPasswordInputRef"
                                        v-model="confirmPassword"
                                        type="password"
                                        autocomplete="new-password"
                                        placeholder="再次输入密码"
                                        :class="inputClasses"
                                        @keydown.enter.prevent="
                                            handleFieldEnter('confirmPassword')
                                        "
                                        @keydown.backspace="
                                            handleFieldBackspace(
                                                $event,
                                                'confirmPassword',
                                                confirmPassword
                                            )
                                        " />
                                </div>

                                <p
                                    v-if="statusMessage"
                                    :class="statusClasses">
                                    <span
                                        aria-hidden="true"
                                        class="font-semibold">
                                        {{ statusMarker }}
                                    </span>
                                    {{ statusMessage }}
                                </p>

                                <UiButton
                                    type="submit"
                                    :loading="isSubmitting"
                                    class="w-full justify-center tracking-[0.22em]">
                                    {{ submitLabel }}
                                </UiButton>
                            </form>

                            <div class="space-y-3 pt-1">
                                <p class="text-center text-sm text-slate-500">
                                    {{ switchPrompt }}
                                    <button
                                        type="button"
                                        class="font-semibold text-crh-blue transition hover:text-slate-900"
                                        @click="switchMode(!isLogin)">
                                        {{ switchLabel }}
                                    </button>
                                </p>
                            </div>
                        </div>
                    </UiCard>
                </Transition>
            </section>
        </div>

        <AppFooter />
    </main>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { AuthSession } from '~/types/auth';
import type { TrackerApiResponse } from '~/types/homepage';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import hashPasswordDigest from '~/utils/auth/hashPasswordDigest';
import { validatePassword, validateUsername } from '~/utils/auth/credentials';

definePageMeta({
    alias: ['/login', '/register']
});

type AuthFieldKey = 'username' | 'password' | 'confirmPassword';

const route = useRoute();
const authPaths = new Set(['/auth', '/login', '/register']);

function resolveIsLogin(path: string) {
    return path !== '/register';
}

const isLogin = ref(resolveIsLogin(route.path));
const username = ref('');
const password = ref('');
const confirmPassword = ref('');
const isSubmitting = ref(false);
const statusMessage = ref('');
const statusTone = ref<'success' | 'error'>('success');
const usernameInputRef = ref<HTMLInputElement | null>(null);
const passwordInputRef = ref<HTMLInputElement | null>(null);
const confirmPasswordInputRef = ref<HTMLInputElement | null>(null);

const { setSession } = useAuthState();

const pageTitle = '登录 / 注册';
const submitLabel = computed(() => (isLogin.value ? '登录' : '注册'));
const switchPrompt = computed(() =>
    isLogin.value ? '还没有账号？' : '已有账号？'
);
const switchLabel = computed(() => (isLogin.value ? '在此注册' : '返回登录'));
const inputClasses =
    'harmony-input w-full px-5 py-3 text-sm text-crh-grey-dark placeholder:text-slate-400';

const statusClasses = computed(() =>
    statusTone.value === 'error'
        ? 'flex items-center gap-1.5 pl-1 text-xs leading-5 text-[#E53E3E]'
        : 'flex items-center gap-1.5 pl-1 text-xs leading-5 text-emerald-600'
);

const statusMarker = computed(() =>
    statusTone.value === 'error' ? '[!]' : '[+]'
);

useSiteSeo({
    title: '登录 / 注册 | Open CRH Tracker',
    description:
        '登录或注册您的 Open CRH Tracker 账户以获得更高的配额和 API 使用权限',
    path: '/auth',
    noindex: true
});

watch(
    () => route.path,
    (path) => {
        isLogin.value = resolveIsLogin(path);
    }
);

watch(isLogin, (nextValue) => {
    const targetPath = nextValue ? '/login' : '/register';
    if (authPaths.has(route.path) && route.path !== targetPath) {
        void navigateTo(targetPath, { replace: true });
    }

    clearStatus();
    password.value = '';
    confirmPassword.value = '';
    void focusUsernameField();
});

void focusUsernameField();

function getFieldOrder(): AuthFieldKey[] {
    return isLogin.value
        ? ['username', 'password']
        : ['username', 'password', 'confirmPassword'];
}

function getFieldRef(field: AuthFieldKey) {
    switch (field) {
        case 'username':
            return usernameInputRef;
        case 'password':
            return passwordInputRef;
        case 'confirmPassword':
            return confirmPasswordInputRef;
    }
}

function focusField(field: AuthFieldKey) {
    const input = getFieldRef(field).value;
    if (!input) {
        return;
    }

    input.focus({ preventScroll: true });

    const valueLength = input.value.length;
    input.setSelectionRange(valueLength, valueLength);
}

async function focusUsernameField() {
    await nextTick();
    focusField('username');
}

function handlePanelAfterEnter() {
    void focusUsernameField();
}

function clearStatus() {
    statusMessage.value = '';
    statusTone.value = 'success';
}

function setStatus(message: string, tone: 'success' | 'error') {
    statusMessage.value = message;
    statusTone.value = tone;
}

function switchMode(nextValue: boolean) {
    if (isLogin.value === nextValue) {
        return;
    }

    isLogin.value = nextValue;
}

function handleFieldEnter(field: AuthFieldKey) {
    const fieldOrder = getFieldOrder();
    const currentIndex = fieldOrder.indexOf(field);
    if (currentIndex < 0) {
        return;
    }

    const nextField = fieldOrder[currentIndex + 1];
    if (nextField) {
        focusField(nextField);
        return;
    }

    void submitAuth();
}

function handleFieldBackspace(
    event: KeyboardEvent,
    field: AuthFieldKey,
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

function validateForm() {
    if (!username.value || !password.value) {
        return '用户名和密码不能为空。';
    }

    const usernameError = validateUsername(username.value);
    if (usernameError) {
        return usernameError;
    }

    const passwordError = validatePassword(password.value);
    if (passwordError) {
        return passwordError;
    }

    if (!isLogin.value) {
        if (!confirmPassword.value) {
            return '请再次输入密码。';
        }

        if (password.value !== confirmPassword.value) {
            return '两次输入的密码不一致。';
        }
    }

    return '';
}

async function submitAuth() {
    if (isSubmitting.value) {
        return;
    }

    username.value = username.value.trim();
    const validationError = validateForm();
    if (validationError) {
        setStatus(validationError, 'error');
        return;
    }

    isSubmitting.value = true;
    clearStatus();

    try {
        const passwordDigest = await hashPasswordDigest(password.value);
        const endpoint = isLogin.value
            ? '/api/v1/auth/login'
            : '/api/v1/auth/register';
        const { data, error } = await useCsrfFetch<
            TrackerApiResponse<AuthSession>
        >(endpoint, {
            method: 'POST',
            body: {
                username: username.value,
                passwordDigest
            },
            key: `auth:${isLogin.value ? 'login' : 'register'}:${Date.now()}`,
            watch: false,
            server: false
        });

        if (error.value) {
            throw error.value;
        }

        const response = data.value;
        if (!response) {
            throw new Error('Missing auth response');
        }

        if (!response.ok) {
            throw {
                data: response
            };
        }

        setSession(response.data);
        password.value = '';
        confirmPassword.value = '';
        setStatus(
            isLogin.value
                ? '登录成功，认证凭证已写入浏览器 Cookie。'
                : '注册成功，系统已自动登录并写入浏览器 Cookie。',
            'success'
        );
        await navigateTo('/');
    } catch (error) {
        setStatus(
            getApiErrorMessage(error, '认证请求失败，请稍后重试。'),
            'error'
        );
    } finally {
        isSubmitting.value = false;
    }
}
</script>

<style scoped>
.auth-panel.auth-panel {
    border-color: rgba(191, 204, 216, 0.82);
    box-shadow:
        0 18px 40px -30px rgba(15, 23, 42, 0.28),
        0 8px 20px rgba(148, 163, 184, 0.14);
}

.fade-enter-active,
.fade-leave-active {
    transition:
        opacity 0.22s ease,
        transform 0.22s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
    transform: translateY(8px);
}

@media (prefers-reduced-motion: reduce) {
    .fade-enter-active,
    .fade-leave-active {
        transition: opacity 0.01s linear;
    }

    .fade-enter-from,
    .fade-leave-to {
        transform: none;
    }
}
</style>
