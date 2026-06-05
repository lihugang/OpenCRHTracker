<template>
    <UiCard :show-accent-bar="false">
        <div class="space-y-6">
            <div
                class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div class="space-y-2">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                        OAUTH CLIENTS
                    </p>
                    <h3 class="text-xl font-semibold text-slate-900">
                        新建 OAuth 客户端
                    </h3>
                </div>

                <UiButton
                    type="button"
                    variant="secondary"
                    @click="emit('openList')">
                    查看 OAuth 客户端列表
                </UiButton>
            </div>

            <div class="motion-divider opacity-70" />

            <div class="grid gap-4 md:grid-cols-2">
                <UiField label="应用名称">
                    <input
                        :value="name"
                        type="text"
                        class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                        @input="emitInput('name', $event)" />
                </UiField>
                <UiField label="主页链接">
                    <input
                        :value="homepageUrl"
                        type="url"
                        class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                        @input="emitInput('homepageUrl', $event)" />
                </UiField>
            </div>

            <UiField label="描述">
                <textarea
                    :value="description"
                    rows="3"
                    class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                    @input="emitTextarea('description', $event)" />
            </UiField>

            <UiField label="回调地址">
                <textarea
                    :value="redirectUrisText"
                    rows="6"
                    class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                    placeholder="每行一个 URI"
                    @input="emitTextarea('redirectUrisText', $event)" />
            </UiField>

            <UiField label="申请权限">
                <div
                    v-if="allowedScopes.length > 0"
                    class="dashboard-soft-surface rounded-[1.1rem] border px-4 py-4">
                    <DashboardScopeTree
                        :model-value="requestedScopes"
                        :scopes="allowedScopes"
                        :label-map="scopeLabelMap"
                        @update:model-value="
                            emit('update:requestedScopes', $event)
                        " />
                </div>
                <div
                    v-else
                    class="dashboard-soft-surface rounded-[1rem] border border-dashed px-4 py-4 text-sm leading-6 text-slate-500">
                    当前没有可申请的权限。
                </div>
            </UiField>

            <div
                v-if="mutationMessage"
                class="rounded-[1rem] border px-4 py-4 text-sm leading-6"
                :class="
                    mutationTone === 'error'
                        ? 'border-rose-200 bg-rose-50/80 text-rose-700'
                        : 'border-emerald-200 bg-emerald-50/80 text-emerald-800'
                ">
                {{ mutationMessage }}
            </div>

            <div
                class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <UiButton
                    type="button"
                    variant="secondary"
                    :disabled="isSubmitting"
                    @click="emit('reset')">
                    重置
                </UiButton>
                <UiButton
                    type="button"
                    :loading="isSubmitting"
                    @click="emit('submit')">
                    创建应用
                </UiButton>
            </div>
        </div>
    </UiCard>
</template>

<script setup lang="ts">
defineProps<{
    name: string;
    description: string;
    homepageUrl: string;
    redirectUrisText: string;
    requestedScopes: string[];
    allowedScopes: string[];
    scopeLabelMap: Record<string, string>;
    mutationMessage: string;
    mutationTone: 'success' | 'error';
    isSubmitting: boolean;
}>();

const emit = defineEmits<{
    'update:name': [value: string];
    'update:description': [value: string];
    'update:homepageUrl': [value: string];
    'update:redirectUrisText': [value: string];
    'update:requestedScopes': [value: string[]];
    submit: [];
    reset: [];
    openList: [];
}>();

function emitInput(field: 'name' | 'homepageUrl', event: Event) {
    const target = event.target as HTMLInputElement;

    if (field === 'name') {
        emit('update:name', target.value);
        return;
    }

    emit('update:homepageUrl', target.value);
}

function emitTextarea(
    field: 'description' | 'redirectUrisText',
    event: Event
) {
    const target = event.target as HTMLTextAreaElement;

    if (field === 'description') {
        emit('update:description', target.value);
        return;
    }

    if (field === 'redirectUrisText') {
        emit('update:redirectUrisText', target.value);
    }
}
</script>
