<template>
    <UiModal
        :model-value="modelValue"
        eyebrow="赞助权益管理"
        :title="modalTitle"
        description="查看全部赞助组记录，并手工授予、更新或撤销赞助权益。"
        size="lg"
        height="tall"
        :close-on-backdrop="!isMutating"
        @update:model-value="handleVisibilityChange">
        <div class="space-y-6">
            <div
                v-if="state === 'loading' && !details"
                class="space-y-4"
                aria-label="正在加载赞助权益">
                <div
                    v-for="index in 4"
                    :key="index"
                    class="h-20 animate-pulse rounded-[1rem] bg-slate-100/80" />
            </div>

            <UiEmptyState
                v-else-if="state === 'error' && !details"
                eyebrow="加载失败"
                title="赞助权益详情加载失败"
                :description="loadError"
                tone="danger">
                <UiButton
                    type="button"
                    variant="secondary"
                    @click="loadDetails">
                    重试
                </UiButton>
            </UiEmptyState>

            <template v-else-if="details">
                <section class="space-y-4">
                    <div
                        class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div class="space-y-1.5">
                            <h3 class="text-lg font-semibold text-slate-900">
                                合并结果
                            </h3>
                            <p class="text-sm leading-6 text-slate-600">
                                最终结果已包含基础配额、赞助组贡献和手工覆盖。
                            </p>
                        </div>
                        <UiStatusBadge
                            :label="activeCount + ' 个生效中'"
                            tone="success" />
                    </div>
                    <dl
                        class="grid divide-y divide-slate-700 overflow-hidden rounded-[1rem] border border-slate-800 bg-slate-900 text-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                        <div class="min-h-24 px-5 py-4">
                            <dt class="text-xs text-slate-400">
                                最终 token 上限
                            </dt>
                            <dd class="mt-3 text-2xl font-semibold">
                                {{
                                    formatNumber(
                                        details.effectiveQuota.tokenLimit
                                    )
                                }}
                            </dd>
                        </div>
                        <div class="min-h-24 px-5 py-4">
                            <dt class="text-xs text-slate-400">每周期恢复</dt>
                            <dd class="mt-3 text-2xl font-semibold">
                                {{
                                    formatNumber(
                                        details.effectiveQuota.refillAmount
                                    )
                                }}
                            </dd>
                        </div>
                        <div class="min-h-24 px-5 py-4">
                            <dt class="text-xs text-slate-400">当前可用权限</dt>
                            <dd class="mt-3 text-2xl font-semibold">
                                {{ formatNumber(details.accountScopes.length) }}
                            </dd>
                        </div>
                    </dl>
                </section>

                <p
                    v-if="mutationError"
                    class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm leading-6 text-rose-700">
                    {{ mutationError }}
                </p>
                <p
                    v-else-if="mutationSuccess"
                    class="rounded-[1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm leading-6 text-emerald-800">
                    {{ mutationSuccess }}
                </p>

                <section class="space-y-4">
                    <div
                        class="flex flex-wrap items-center justify-between gap-3">
                        <div class="space-y-1.5">
                            <h3 class="text-lg font-semibold text-slate-900">
                                赞助组记录
                            </h3>
                            <p class="text-sm leading-6 text-slate-600">
                                包含生效、排期、到期、撤销和配置异常记录。
                            </p>
                        </div>
                        <UiStatusBadge
                            :label="details.items.length + ' 条记录'"
                            tone="neutral" />
                    </div>

                    <UiEmptyState
                        v-if="details.items.length === 0"
                        eyebrow="暂无记录"
                        title="该用户还没有赞助组记录"
                        description="可使用下方表单手工授予赞助权益。" />

                    <div
                        v-else
                        class="divide-y divide-slate-200 overflow-hidden rounded-[1rem] border border-slate-200 bg-white">
                        <article
                            v-for="item in details.items"
                            :key="item.groupId"
                            class="space-y-4 px-4 py-4 sm:px-5">
                            <div
                                class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div class="min-w-0 space-y-2">
                                    <div
                                        class="flex flex-wrap items-center gap-2">
                                        <h4
                                            class="text-base font-semibold text-slate-900">
                                            {{
                                                item.group?.name ?? item.groupId
                                            }}
                                        </h4>
                                        <UiStatusBadge
                                            :label="getStatusLabel(item.status)"
                                            :tone="
                                                getStatusTone(item.status)
                                            " />
                                    </div>
                                    <p class="text-xs leading-5 text-slate-500">
                                        由 {{ item.grantedBy }} 开通，{{
                                            getSourceLabel(item.source)
                                        }}
                                    </p>
                                </div>
                                <UiButton
                                    v-if="item.revokedAt === null"
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    class="border-rose-200 text-rose-700 hover:border-rose-300 hover:bg-rose-50"
                                    :disabled="isMutating"
                                    @click="requestRevoke(item.groupId)">
                                    撤销
                                </UiButton>
                            </div>

                            <dl
                                class="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                                <div>
                                    <dt class="text-xs text-slate-500">
                                        开始时间
                                    </dt>
                                    <dd
                                        class="mt-1 font-semibold text-slate-800">
                                        {{ formatTimestamp(item.startsAt) }}
                                    </dd>
                                </div>
                                <div>
                                    <dt class="text-xs text-slate-500">
                                        到期时间
                                    </dt>
                                    <dd
                                        class="mt-1 font-semibold text-slate-800">
                                        {{ formatTimestamp(item.expiresAt) }}
                                    </dd>
                                </div>
                                <div>
                                    <dt class="text-xs text-slate-500">
                                        撤销时间
                                    </dt>
                                    <dd
                                        class="mt-1 font-semibold text-slate-800">
                                        {{
                                            item.revokedAt === null
                                                ? '--'
                                                : formatTimestamp(
                                                      item.revokedAt
                                                  )
                                        }}
                                    </dd>
                                </div>
                                <div>
                                    <dt class="text-xs text-slate-500">
                                        最近更新
                                    </dt>
                                    <dd
                                        class="mt-1 font-semibold text-slate-800">
                                        {{ formatTimestamp(item.updatedAt) }}
                                    </dd>
                                </div>
                            </dl>

                            <div
                                v-if="pendingRevokeGroupId === item.groupId"
                                class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4">
                                <p class="text-sm font-semibold text-rose-900">
                                    确认撤销该赞助组？
                                </p>
                                <p class="mt-1 text-sm leading-6 text-rose-800">
                                    撤销后会立即重新计算该用户的配额与权限。
                                </p>
                                <div
                                    class="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                                    <UiButton
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        :disabled="isRevoking"
                                        @click="cancelRevoke">
                                        取消
                                    </UiButton>
                                    <UiButton
                                        type="button"
                                        size="sm"
                                        :loading="isRevoking"
                                        class="bg-rose-700 text-white hover:bg-rose-800"
                                        @click="confirmRevoke">
                                        确认撤销
                                    </UiButton>
                                </div>
                            </div>
                        </article>
                    </div>
                </section>

                <section class="space-y-5 border-t border-slate-200 pt-6">
                    <div class="space-y-1.5">
                        <h3 class="text-lg font-semibold text-slate-900">
                            授予或更新赞助权益
                        </h3>
                        <p class="text-sm leading-6 text-slate-600">
                            选择已有记录会更新其排期；重新授予会清除原撤销状态。
                        </p>
                    </div>

                    <UiEmptyState
                        v-if="groupOptions.length === 0"
                        eyebrow="暂无可授予赞助组"
                        title="配置中没有可手工授予的赞助组"
                        description="请先在运行时配置中启用可授予的赞助组。" />

                    <div
                        v-else
                        class="grid gap-4 md:grid-cols-2">
                        <UiField
                            label="赞助组"
                            help="生效且允许手工授予的赞助组。"
                            required>
                            <UiSelect
                                v-model="form.groupId"
                                :options="groupOptions"
                                :disabled="isMutating"
                                mobile-sheet-title="选择赞助组"
                                mobile-sheet-eyebrow="赞助权益"
                                placeholder="选择赞助组"
                                @update:model-value="handleGroupChange" />
                        </UiField>
                        <UiField
                            label="开始时间（上海时间）"
                            help="可设置为未来时间以创建排期。"
                            required>
                            <input
                                v-model="form.startsAt"
                                type="datetime-local"
                                class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                                :disabled="isMutating" />
                        </UiField>
                        <UiField
                            label="时长（天）"
                            help="必须填写大于 0 的整数天。"
                            required>
                            <input
                                v-model="form.durationDays"
                                type="number"
                                inputmode="numeric"
                                min="1"
                                step="1"
                                class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                                placeholder="例如 30"
                                :disabled="isMutating" />
                        </UiField>
                        <div
                            class="flex min-h-24 items-center rounded-[1rem] border border-slate-200 bg-slate-50/80 px-4 py-3">
                            <div class="space-y-1">
                                <p class="text-xs text-slate-500">当前操作</p>
                                <p class="text-sm font-semibold text-slate-900">
                                    {{ formActionLabel }}
                                </p>
                            </div>
                        </div>
                    </div>
                </section>
            </template>
        </div>

        <template #footer>
            <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <UiButton
                    type="button"
                    variant="secondary"
                    :disabled="isMutating"
                    @click="close">
                    关闭
                </UiButton>
                <UiButton
                    v-if="groupOptions.length > 0"
                    type="button"
                    :loading="isSaving"
                    :disabled="!canSubmit"
                    @click="save">
                    {{ formSubmitLabel }}
                </UiButton>
            </div>
        </template>
    </UiModal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import UiField from '~/components/ui/UiField.vue';
import UiModal from '~/components/ui/UiModal.vue';
import UiSelect from '~/components/ui/UiSelect.vue';
import UiStatusBadge from '~/components/ui/UiStatusBadge.vue';
import type { AdminUserListItem } from '~/types/admin';
import type { TrackerApiResponse } from '~/types/homepage';
import type {
    AdminUserMembershipsResponse,
    UserMembershipStatus
} from '~/types/membership';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

const props = defineProps<{
    modelValue: boolean;
    user: AdminUserListItem | null;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    updated: [];
}>();

const details = ref<AdminUserMembershipsResponse | null>(null);
const state = ref<'idle' | 'loading' | 'success' | 'error'>('idle');
const loadError = ref('');
const mutationError = ref('');
const mutationSuccess = ref('');
const isSaving = ref(false);
const isRevoking = ref(false);
const pendingRevokeGroupId = ref('');
const form = reactive({
    groupId: '',
    startsAt: '',
    durationDays: '30'
});

const modalTitle = computed(
    () => '管理 ' + (props.user?.userId ?? '--') + ' 的赞助权益'
);
const isMutating = computed(() => isSaving.value || isRevoking.value);
const groupOptions = computed(() =>
    details.value
        ? getSelectableGroups(details.value).map((group) => ({
              value: group.id,
              label: group.name
          }))
        : []
);
const selectedRecord = computed(() =>
    details.value?.items.find(
        (item) =>
            item.groupId === form.groupId &&
            (item.status === 'active' || item.status === 'scheduled')
    )
);
const formActionLabel = computed(() =>
    selectedRecord.value ? '更新现有赞助组排期' : '授予新的赞助组'
);
const formSubmitLabel = computed(() =>
    selectedRecord.value ? '确认更新' : '确认授予'
);
const canSubmit = computed(
    () =>
        details.value !== null &&
        form.groupId.length > 0 &&
        form.startsAt.length > 0 &&
        form.durationDays.trim().length > 0 &&
        !isMutating.value
);
const activeCount = computed(
    () =>
        details.value?.items.filter((item) => item.status === 'active')
            .length ?? 0
);

watch(
    () => [props.modelValue, props.user?.userId] as const,
    ([isOpen]) => {
        if (!isOpen || !props.user) {
            if (!isMutating.value) {
                resetState();
            }
            return;
        }
        resetState();
        void loadDetails();
    },
    { immediate: true }
);

function resetState() {
    details.value = null;
    state.value = 'idle';
    loadError.value = '';
    mutationError.value = '';
    mutationSuccess.value = '';
    pendingRevokeGroupId.value = '';
    form.groupId = '';
    form.startsAt = '';
    form.durationDays = '30';
}

function close() {
    if (!isMutating.value) {
        emit('update:modelValue', false);
    }
}

function handleVisibilityChange(value: boolean) {
    value ? emit('update:modelValue', true) : close();
}

async function loadDetails() {
    const userId = props.user?.userId;
    if (!userId || state.value === 'loading') {
        return;
    }
    state.value = 'loading';
    loadError.value = '';
    try {
        const response = await $fetch<
            TrackerApiResponse<AdminUserMembershipsResponse>
        >(
            '/api/v1/admin/users/' +
                encodeURIComponent(userId) +
                '/memberships',
            { retry: 0 }
        );
        if (!response.ok) {
            throw { data: response };
        }
        if (!props.modelValue || props.user?.userId !== userId) {
            return;
        }
        details.value = response.data;
        state.value = 'success';
        initializeForm(response.data);
    } catch (error) {
        if (!props.modelValue || props.user?.userId !== userId) {
            return;
        }
        state.value = 'error';
        loadError.value = getApiErrorMessage(error, '加载赞助权益详情失败。');
    }
}

function initializeForm(
    response: AdminUserMembershipsResponse,
    preferredGroupId = ''
) {
    const groups = getSelectableGroups(response);
    const groupId = groups.some((group) => group.id === preferredGroupId)
        ? preferredGroupId
        : (groups[0]?.id ?? '');
    if (!groupId) {
        form.groupId = '';
        form.startsAt = toShanghaiDateTimeLocalValue(
            Math.floor(Date.now() / 1000)
        );
        form.durationDays = '30';
        return;
    }
    resetFormForGroup(response, groupId);
}

function getSelectableGroups(response: AdminUserMembershipsResponse) {
    const editableGroupIds = new Set(
        response.items
            .filter(
                (item) =>
                    item.status === 'active' || item.status === 'scheduled'
            )
            .map((item) => item.groupId)
    );

    return response.catalog.filter(
        (group) =>
            group.enabled &&
            (group.assignable || editableGroupIds.has(group.id))
    );
}

function resetFormForGroup(
    response: AdminUserMembershipsResponse,
    groupId: string
) {
    const record = response.items.find(
        (item) =>
            item.groupId === groupId &&
            (item.status === 'active' || item.status === 'scheduled')
    );
    form.groupId = groupId;
    form.startsAt = toShanghaiDateTimeLocalValue(
        record?.startsAt ?? Math.floor(Date.now() / 1000)
    );
    form.durationDays = !record
        ? '30'
        : String(
              Math.max(
                  1,
                  Math.round((record.expiresAt - record.startsAt) / 86400)
              )
          );
}

function handleGroupChange(groupId: string) {
    if (details.value) {
        resetFormForGroup(details.value, groupId);
        mutationError.value = '';
        mutationSuccess.value = '';
    }
}

async function save() {
    const userId = props.user?.userId;
    const groupId = form.groupId;
    if (!userId || !groupId || isMutating.value) {
        return;
    }
    mutationError.value = '';
    mutationSuccess.value = '';
    const startsAt = parseShanghaiDateTimeLocalValue(form.startsAt);
    if (startsAt === null) {
        mutationError.value = '请输入有效的上海时间作为开始时间。';
        return;
    }
    let durationDays: number;
    try {
        durationDays = parseDurationDays(form.durationDays);
    } catch (error) {
        mutationError.value =
            error instanceof Error ? error.message : '赞助时长无效。';
        return;
    }
    if (startsAt + durationDays * 86400 <= Math.floor(Date.now() / 1000)) {
        mutationError.value =
            '按当前开始时间与时长计算的到期时间必须晚于当前时间。';
        return;
    }

    isSaving.value = true;
    try {
        const response = await mutate(userId, groupId, 'PUT', {
            startsAt,
            durationDays
        });
        details.value = response;
        state.value = 'success';
        mutationSuccess.value = '已保存用户 ' + userId + ' 的赞助权益。';
        pendingRevokeGroupId.value = '';
        initializeForm(response, groupId);
        emit('updated');
    } catch (error) {
        mutationError.value = getApiErrorMessage(error, '保存赞助权益失败。');
    } finally {
        isSaving.value = false;
    }
}

function requestRevoke(groupId: string) {
    if (!isMutating.value) {
        pendingRevokeGroupId.value = groupId;
        mutationError.value = '';
        mutationSuccess.value = '';
    }
}

function cancelRevoke() {
    if (!isRevoking.value) {
        pendingRevokeGroupId.value = '';
    }
}

async function confirmRevoke() {
    const userId = props.user?.userId;
    const groupId = pendingRevokeGroupId.value;
    if (!userId || !groupId || isMutating.value) {
        return;
    }
    isRevoking.value = true;
    mutationError.value = '';
    mutationSuccess.value = '';
    try {
        const response = await mutate(userId, groupId, 'DELETE');
        details.value = response;
        state.value = 'success';
        mutationSuccess.value = '已撤销用户 ' + userId + ' 的赞助组。';
        pendingRevokeGroupId.value = '';
        initializeForm(response, form.groupId);
        emit('updated');
    } catch (error) {
        mutationError.value = getApiErrorMessage(error, '撤销赞助组失败。');
    } finally {
        isRevoking.value = false;
    }
}

async function mutate(
    userId: string,
    groupId: string,
    method: 'PUT' | 'DELETE',
    body?: { startsAt: number; durationDays: number }
) {
    const { data, error } = await useCsrfFetch<
        TrackerApiResponse<AdminUserMembershipsResponse>
    >(
        '/api/v1/admin/users/' +
            encodeURIComponent(userId) +
            '/memberships/' +
            encodeURIComponent(groupId),
        {
            method,
            retry: 0,
            body,
            key:
                'admin:users:sponsorship:' +
                method +
                ':' +
                userId +
                ':' +
                groupId +
                ':' +
                Date.now(),
            watch: false,
            server: false
        }
    );
    if (error.value) {
        throw error.value;
    }
    const response = data.value;
    if (!response) {
        throw new Error('Missing sponsorship mutation response');
    }
    if (!response.ok) {
        throw { data: response };
    }
    return response.data;
}

function toShanghaiDateTimeLocalValue(timestamp: number) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return '';
    }
    return new Date((timestamp + 8 * 60 * 60) * 1000)
        .toISOString()
        .slice(0, 16);
}

function parseShanghaiDateTimeLocalValue(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
        return null;
    }
    const timestampMs = Date.parse(value + ':00+08:00');
    if (!Number.isFinite(timestampMs)) {
        return null;
    }
    const timestamp = Math.floor(timestampMs / 1000);
    return toShanghaiDateTimeLocalValue(timestamp) === value ? timestamp : null;
}

function parseDurationDays(value: string) {
    const normalized = value.trim();
    if (!normalized) {
        throw new Error('时长必须是大于 0 的整数。');
    }
    if (!/^[0-9]+$/.test(normalized)) {
        throw new Error('时长必须是大于 0 的整数。');
    }
    const duration = Number.parseInt(normalized, 10);
    if (!Number.isSafeInteger(duration) || duration <= 0) {
        throw new Error('时长必须是大于 0 的整数。');
    }
    return duration;
}

function formatNumber(value: number) {
    return value.toLocaleString('zh-CN');
}

function formatTimestamp(timestamp: number) {
    return formatTrackerTimestamp(timestamp) || '--';
}

function getSourceLabel(source: string) {
    if (source === 'admin_manual') {
        return '管理员手工授予';
    }
    if (source === 'redemption_code') {
        return '兑换码开通';
    }
    return '来源 ' + source;
}

function getStatusLabel(status: UserMembershipStatus) {
    switch (status) {
        case 'active':
            return '生效中';
        case 'scheduled':
            return '已排期';
        case 'expired':
            return '已到期';
        case 'revoked':
            return '已撤销';
        case 'disabled':
            return '赞助组已停用';
        case 'unknown':
            return '配置异常';
    }
}

function getStatusTone(status: UserMembershipStatus) {
    switch (status) {
        case 'active':
            return 'success' as const;
        case 'scheduled':
            return 'warning' as const;
        case 'expired':
        case 'revoked':
            return 'neutral' as const;
        case 'disabled':
        case 'unknown':
            return 'danger' as const;
    }
}
</script>
