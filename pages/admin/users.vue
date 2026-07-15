<template>
    <AdminShell
        v-model:date-input="selectedDateInput"
        :today-date-input-value="todayDateInputValue"
        :session="session"
        :show-date-input="false"
        title="用户"
        description="查看注册用户、登录情况、封禁状态与当前运行时 API 剩余额度。">
        <template #toolbar>
            <UiButton
                type="button"
                variant="secondary"
                :loading="isRefreshingAll"
                @click="refreshAllData">
                刷新
            </UiButton>
        </template>

        <div class="space-y-6">
            <UiCard :show-accent-bar="false">
                <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div
                        class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-5 py-4">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            Users
                        </p>
                        <p class="mt-2 text-3xl font-semibold text-slate-900">
                            {{ formatNumber(usersData?.totalUsers ?? 0) }}
                        </p>
                        <p class="mt-2 text-sm leading-6 text-slate-500">
                            注册用户数量
                        </p>
                    </div>

                    <div
                        class="rounded-[1rem] border border-rose-200 bg-rose-50/70 px-5 py-4">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-rose-500">
                            Banned
                        </p>
                        <p class="mt-2 text-3xl font-semibold text-rose-800">
                            {{ formatNumber(usersData?.bannedUsers ?? 0) }}
                        </p>
                        <p class="mt-2 text-sm leading-6 text-rose-700/80">
                            当前封禁用户数量
                        </p>
                    </div>

                    <div
                        class="rounded-[1rem] border border-amber-200 bg-amber-50/70 px-5 py-4">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-amber-600">
                            Risk Control
                        </p>
                        <p class="mt-2 text-3xl font-semibold text-amber-900">
                            {{ formatNumber(openRiskCaseItems.length) }}
                        </p>
                        <p class="mt-2 text-sm leading-6 text-amber-800/80">
                            当前未解除风控数量
                        </p>
                    </div>

                    <div
                        class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-5 py-4">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            As Of
                        </p>
                        <p class="mt-2 text-2xl font-semibold text-slate-900">
                            {{ formatTimestamp(usersData?.asOf ?? 0) }}
                        </p>
                        <p class="mt-2 text-sm leading-6 text-slate-500">
                            当前数据时间
                        </p>
                    </div>
                </div>
            </UiCard>

            <UiCard :show-accent-bar="false">
                <div class="space-y-6">
                    <div
                        class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div class="space-y-2">
                            <p
                                class="text-xs font-semibold uppercase tracking-[0.22em] text-amber-600">
                                Risk Cases
                            </p>
                            <h2 class="text-2xl font-semibold text-slate-900">
                                IP 与 UA 风控记录
                            </h2>
                            <p class="text-sm leading-6 text-slate-600">
                                命中近期封禁指纹后仅标记风控；首次尝试绑定 QQ
                                时，后台将号码加入封禁清单并封禁账户。
                            </p>
                        </div>
                        <div class="flex flex-wrap gap-2">
                            <UiStatusBadge
                                :label="`${formatNumber(openRiskCaseItems.length)} 个未解除`"
                                tone="warning" />
                            <UiStatusBadge
                                :label="`${formatNumber(riskCaseItems.length)} 条记录`"
                                tone="neutral" />
                        </div>
                    </div>

                    <div
                        v-if="securityStatus === 'pending' && !securityData"
                        class="space-y-3">
                        <div
                            v-for="index in 3"
                            :key="`admin-risk-cases-skeleton:${index}`"
                            class="h-20 animate-pulse rounded-[1rem] bg-slate-100/90" />
                    </div>

                    <UiEmptyState
                        v-else-if="securityErrorMessage"
                        eyebrow="加载失败"
                        title="风控记录加载失败"
                        :description="securityErrorMessage"
                        tone="danger">
                        <UiButton
                            type="button"
                            variant="secondary"
                            @click="refreshSecurity()">
                            重试
                        </UiButton>
                    </UiEmptyState>

                    <UiEmptyState
                        v-else-if="riskCaseItems.length === 0"
                        eyebrow="No Risk Cases"
                        title="暂无风控记录"
                        description="新的 IP 与 UA 关联命中会在后台生成风控记录。" />

                    <div
                        v-else
                        class="overflow-x-auto rounded-[1rem] border border-slate-200 bg-white/90">
                        <table class="min-w-[92rem] divide-y divide-slate-200">
                            <thead class="bg-slate-50/80">
                                <tr>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        命中时间
                                    </th>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        账户
                                    </th>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        风控状态
                                    </th>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        关联记录
                                    </th>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        首个 QQ
                                    </th>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        IP
                                    </th>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        User-Agent
                                    </th>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        处置结果
                                    </th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                <tr
                                    v-for="item in riskCaseItems"
                                    :key="item.id"
                                    class="align-top transition hover:bg-amber-50/30">
                                    <td
                                        class="whitespace-nowrap px-4 py-4 text-sm text-slate-700">
                                        <p>
                                            {{
                                                formatTimestamp(item.detectedAt)
                                            }}
                                        </p>
                                        <p class="mt-1 text-xs text-slate-400">
                                            更新于
                                            {{
                                                formatTimestamp(item.updatedAt)
                                            }}
                                        </p>
                                    </td>
                                    <td
                                        class="px-4 py-4 text-sm font-semibold text-slate-900">
                                        {{ item.userId }}
                                    </td>
                                    <td class="px-4 py-4">
                                        <UiStatusBadge
                                            :label="
                                                getRiskCaseStatusLabel(
                                                    item.status
                                                )
                                            "
                                            :tone="
                                                getRiskCaseStatusTone(
                                                    item.status
                                                )
                                            " />
                                        <p
                                            v-if="item.errorMessage"
                                            class="mt-2 max-w-[18rem] break-all text-xs leading-5 text-rose-700">
                                            {{ item.errorMessage }}
                                        </p>
                                    </td>
                                    <td
                                        class="whitespace-nowrap px-4 py-4 font-mono text-xs text-slate-700">
                                        <p>封禁 #{{ item.matchedActionId }}</p>
                                        <p class="mt-1 text-slate-400">
                                            指纹 #{{
                                                item.fingerprintId ?? '--'
                                            }}
                                        </p>
                                    </td>
                                    <td
                                        class="whitespace-nowrap px-4 py-4 font-mono text-xs text-slate-700">
                                        {{ item.qqNumber ?? '--' }}
                                    </td>
                                    <td
                                        class="max-w-[14rem] break-all px-4 py-4 font-mono text-xs leading-5 text-slate-700">
                                        {{ item.ipAddress }}
                                    </td>
                                    <td
                                        class="max-w-[24rem] break-all px-4 py-4 font-mono text-xs leading-5 text-slate-600"
                                        :title="item.userAgent">
                                        {{ item.userAgent }}
                                    </td>
                                    <td
                                        class="max-w-[18rem] px-4 py-4 text-sm leading-6 text-slate-700">
                                        <template v-if="item.clearedAt">
                                            <p
                                                class="font-semibold text-slate-800">
                                                已由
                                                {{
                                                    item.clearedBy ?? 'unknown'
                                                }}
                                                解除
                                            </p>
                                            <p
                                                class="mt-1 text-xs text-slate-500">
                                                {{
                                                    formatTimestamp(
                                                        item.clearedAt
                                                    )
                                                }}
                                            </p>
                                        </template>
                                        <template v-else-if="item.banActionId">
                                            <p
                                                class="font-semibold text-rose-700">
                                                封禁操作 #{{ item.banActionId }}
                                            </p>
                                            <p
                                                class="mt-1 text-xs text-slate-500">
                                                {{
                                                    item.escalatedAt
                                                        ? formatTimestamp(
                                                              item.escalatedAt
                                                          )
                                                        : '后台处理中'
                                                }}
                                            </p>
                                        </template>
                                        <span
                                            v-else
                                            class="text-slate-500">
                                            等待 QQ 绑定尝试
                                        </span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </UiCard>

            <UiCard :show-accent-bar="false">
                <div class="space-y-6">
                    <div class="space-y-2">
                        <p
                            class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                            User List
                        </p>
                        <h2 class="text-2xl font-semibold text-slate-900">
                            注册用户
                        </h2>
                        <p class="text-sm leading-6 text-slate-600">
                            默认按最近登录时间排序，未登录用户排在后面。
                        </p>
                    </div>

                    <div
                        v-if="usersStatus === 'pending' && !usersData"
                        class="space-y-3">
                        <div
                            v-for="index in 5"
                            :key="`admin-users-skeleton:${index}`"
                            class="h-16 animate-pulse rounded-[1rem] bg-slate-100/90" />
                    </div>

                    <UiEmptyState
                        v-else-if="usersErrorMessage"
                        eyebrow="加载失败"
                        title="用户列表加载失败"
                        :description="usersErrorMessage"
                        tone="danger">
                        <UiButton
                            type="button"
                            variant="secondary"
                            @click="refreshUsers()">
                            重试
                        </UiButton>
                    </UiEmptyState>

                    <UiEmptyState
                        v-else-if="userItems.length === 0"
                        eyebrow="No Users"
                        title="暂无注册用户"
                        description="当前 users 数据库中还没有可展示的注册用户。" />

                    <div
                        v-else
                        class="overflow-x-auto rounded-[1rem] border border-slate-200 bg-white/90">
                        <table class="min-w-[108rem] divide-y divide-slate-200">
                            <thead class="bg-slate-50/80">
                                <tr>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        用户名
                                    </th>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        状态
                                    </th>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        赞助权益
                                    </th>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        创建时间
                                    </th>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        最近登录时间
                                    </th>
                                    <th
                                        class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        API 剩余 cost
                                    </th>
                                    <th
                                        class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        自定义 token 上限
                                    </th>
                                    <th
                                        class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        自定义恢复速度
                                    </th>
                                    <th
                                        class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        操作
                                    </th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                <tr
                                    v-for="item in userItems"
                                    :key="item.userId"
                                    class="transition hover:bg-slate-50/70"
                                    :class="
                                        item.isBanned
                                            ? 'bg-rose-50/35'
                                            : getOpenRiskCase(item.userId)
                                              ? 'bg-amber-50/35'
                                              : ''
                                    ">
                                    <td
                                        class="px-4 py-3 text-sm text-slate-900">
                                        <span class="font-semibold">
                                            {{ item.userId }}
                                        </span>
                                    </td>
                                    <td class="px-4 py-3 text-sm">
                                        <div class="flex flex-wrap gap-2">
                                            <UiStatusBadge
                                                :label="
                                                    getUserStatusLabel(item)
                                                "
                                                :tone="
                                                    getUserStatusTone(item)
                                                " />
                                            <UiStatusBadge
                                                v-if="
                                                    getOpenRiskCase(item.userId)
                                                "
                                                :label="
                                                    getUserRiskStatusLabel(
                                                        item.userId
                                                    )
                                                "
                                                :tone="
                                                    getUserRiskStatusTone(
                                                        item.userId
                                                    )
                                                " />
                                        </div>
                                    </td>
                                    <td class="px-4 py-3 text-sm">
                                        <div class="max-w-[20rem] space-y-2">
                                            <div
                                                v-if="
                                                    item.sponsorshipGroups
                                                        .length > 0
                                                "
                                                class="flex flex-wrap gap-1.5">
                                                <UiStatusBadge
                                                    v-for="group in item.sponsorshipGroups"
                                                    :key="group.groupId"
                                                    :label="group.name"
                                                    tone="success" />
                                            </div>
                                            <span
                                                v-else
                                                class="text-slate-400">
                                                无赞助组
                                            </span>
                                            <p
                                                class="whitespace-nowrap text-xs text-slate-500">
                                                上限
                                                {{
                                                    formatNumber(
                                                        item.effectiveQuota
                                                            .tokenLimit
                                                    )
                                                }}
                                                / 恢复
                                                {{
                                                    formatNumber(
                                                        item.effectiveQuota
                                                            .refillAmount
                                                    )
                                                }}
                                            </p>
                                        </div>
                                    </td>
                                    <td
                                        class="px-4 py-3 text-sm text-slate-700">
                                        {{ formatTimestamp(item.createdAt) }}
                                    </td>
                                    <td
                                        class="px-4 py-3 text-sm text-slate-700">
                                        {{ formatTimestamp(item.lastLoginAt) }}
                                    </td>
                                    <td
                                        class="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                                        {{ formatNumber(item.apiRemainCost) }}
                                    </td>
                                    <td
                                        class="px-4 py-3 text-right text-sm text-slate-700">
                                        {{
                                            formatOptionalNumber(
                                                item.customTokenLimit
                                            )
                                        }}
                                    </td>
                                    <td
                                        class="px-4 py-3 text-right text-sm text-slate-700">
                                        {{
                                            formatOptionalNumber(
                                                item.customRefillAmount
                                            )
                                        }}
                                    </td>
                                    <td class="px-4 py-3 text-right">
                                        <div
                                            class="flex min-w-[26rem] flex-wrap justify-end gap-2">
                                            <UiButton
                                                type="button"
                                                variant="secondary"
                                                size="sm"
                                                :disabled="
                                                    usersStatus === 'pending'
                                                "
                                                @click="
                                                    openSponsorshipDialog(item)
                                                ">
                                                管理赞助权益
                                            </UiButton>

                                            <UiButton
                                                type="button"
                                                variant="secondary"
                                                size="sm"
                                                :loading="
                                                    resettingQuotaUserId ===
                                                    item.userId
                                                "
                                                :disabled="
                                                    usersStatus === 'pending' ||
                                                    resettingQuotaUserId.length >
                                                        0 ||
                                                    updatingBanUserId.length > 0
                                                "
                                                @click="
                                                    resetUserQuota(item.userId)
                                                ">
                                                重置限额
                                            </UiButton>

                                            <UiButton
                                                v-if="
                                                    !item.isAdmin &&
                                                    !item.isBanned &&
                                                    getOpenRiskCase(item.userId)
                                                "
                                                type="button"
                                                variant="secondary"
                                                size="sm"
                                                class="border-amber-200 text-amber-800 hover:border-amber-300 hover:bg-amber-50"
                                                :loading="
                                                    clearingRiskUserId ===
                                                    item.userId
                                                "
                                                :disabled="
                                                    resettingQuotaUserId.length >
                                                        0 ||
                                                    updatingBanUserId.length > 0
                                                "
                                                @click="
                                                    openClearRiskDialog(item)
                                                ">
                                                解除风控
                                            </UiButton>

                                            <UiButton
                                                v-if="!item.isAdmin"
                                                type="button"
                                                variant="secondary"
                                                size="sm"
                                                :disabled="
                                                    usersStatus === 'pending' ||
                                                    resettingQuotaUserId.length >
                                                        0 ||
                                                    updatingBanUserId.length >
                                                        0 ||
                                                    clearingRiskUserId.length >
                                                        0
                                                "
                                                :class="
                                                    item.isBanned
                                                        ? 'border-emerald-200 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50'
                                                        : 'border-rose-200 text-rose-700 hover:border-rose-300 hover:bg-rose-50'
                                                "
                                                @click="openBanDialog(item)">
                                                {{
                                                    item.isBanned
                                                        ? '解封'
                                                        : '封禁'
                                                }}
                                            </UiButton>

                                            <span
                                                v-else
                                                class="inline-flex items-center"
                                                title="配置中的管理员账户不可封禁或解封">
                                                <UiStatusBadge
                                                    label="受保护"
                                                    tone="neutral" />
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div
                        v-if="quotaResetErrorMessage"
                        class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                        {{ quotaResetErrorMessage }}
                    </div>

                    <div
                        v-else-if="quotaResetSuccessMessage"
                        class="rounded-[1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm leading-6 text-emerald-800">
                        {{ quotaResetSuccessMessage }}
                    </div>

                    <div
                        v-if="banStatusErrorMessage"
                        class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                        {{ banStatusErrorMessage }}
                    </div>

                    <div
                        v-else-if="banStatusSuccessMessage"
                        class="rounded-[1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm leading-6 text-emerald-800">
                        {{ banStatusSuccessMessage }}
                    </div>

                    <div
                        v-if="riskClearSuccessMessage"
                        class="rounded-[1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm leading-6 text-emerald-800">
                        {{ riskClearSuccessMessage }}
                    </div>

                    <div
                        class="rounded-[1rem] border border-slate-200 bg-slate-50/80 px-5 py-5">
                        <div class="space-y-6">
                            <div class="space-y-2">
                                <p
                                    class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                    Quota Override
                                </p>
                                <h3
                                    class="text-xl font-semibold text-slate-900">
                                    用户配额设置
                                </h3>
                                <p class="text-sm leading-6 text-slate-600">
                                    留空后保存表示清除该用户的自定义设置，恢复为全局默认值。恢复速度单位为每个恢复周期补充的
                                    token
                                    数量，恢复周期秒数继续沿用服务端全局配置。
                                </p>
                            </div>

                            <div class="grid gap-4 md:grid-cols-3">
                                <UiField
                                    label="用户名"
                                    help="填写需要设置配额的用户 ID。">
                                    <input
                                        v-model="quotaForm.userId"
                                        type="text"
                                        inputmode="text"
                                        autocomplete="off"
                                        class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                                        placeholder="例如 admin" />
                                </UiField>

                                <UiField
                                    label="自定义 token 上限"
                                    help="留空表示恢复全局默认上限。">
                                    <input
                                        v-model="quotaForm.tokenLimit"
                                        type="number"
                                        inputmode="numeric"
                                        min="1"
                                        step="1"
                                        class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                                        placeholder="例如 200" />
                                </UiField>

                                <UiField
                                    label="自定义恢复速度"
                                    help="留空表示恢复全局默认恢复量。">
                                    <input
                                        v-model="quotaForm.refillAmount"
                                        type="number"
                                        inputmode="numeric"
                                        min="1"
                                        step="1"
                                        class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                                        placeholder="例如 5" />
                                </UiField>
                            </div>

                            <div
                                v-if="quotaSaveErrorMessage"
                                class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                                {{ quotaSaveErrorMessage }}
                            </div>

                            <div
                                v-else-if="quotaSaveSuccessMessage"
                                class="rounded-[1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm leading-6 text-emerald-800">
                                {{ quotaSaveSuccessMessage }}
                            </div>

                            <div class="flex justify-end">
                                <UiButton
                                    type="button"
                                    :loading="isSavingQuota"
                                    :disabled="usersStatus === 'pending'"
                                    @click="saveQuotaOverride">
                                    保存
                                </UiButton>
                            </div>
                        </div>
                    </div>
                </div>
            </UiCard>

            <UiCard :show-accent-bar="false">
                <div class="space-y-6">
                    <div
                        class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div class="space-y-2">
                            <p
                                class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                                Ban Audit
                            </p>
                            <h2 class="text-2xl font-semibold text-slate-900">
                                封禁与解封记录
                            </h2>
                            <p class="text-sm leading-6 text-slate-600">
                                记录功能上线后的手动与自动账户操作，包括触发来源、执行结果和关联客户端信息。
                            </p>
                        </div>
                        <UiStatusBadge
                            :label="`${formatNumber(banActionItems.length)} 条记录`"
                            tone="neutral" />
                    </div>

                    <div
                        v-if="securityStatus === 'pending' && !securityData"
                        class="space-y-3">
                        <div
                            v-for="index in 4"
                            :key="`admin-ban-actions-skeleton:${index}`"
                            class="h-20 animate-pulse rounded-[1rem] bg-slate-100/90" />
                    </div>

                    <UiEmptyState
                        v-else-if="securityErrorMessage"
                        eyebrow="加载失败"
                        title="封禁记录加载失败"
                        :description="securityErrorMessage"
                        tone="danger">
                        <UiButton
                            type="button"
                            variant="secondary"
                            @click="refreshSecurity()">
                            重试
                        </UiButton>
                    </UiEmptyState>

                    <UiEmptyState
                        v-else-if="banActionItems.length === 0"
                        eyebrow="No Audit Events"
                        title="暂无封禁或解封记录"
                        description="审计从本功能上线后开始，不会为既有封禁状态补造历史。" />

                    <div
                        v-else
                        class="overflow-x-auto rounded-[1rem] border border-slate-200 bg-white/90">
                        <table class="min-w-[92rem] divide-y divide-slate-200">
                            <thead class="bg-slate-50/80">
                                <tr>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        时间
                                    </th>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        账户
                                    </th>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        操作 / 状态
                                    </th>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        来源与原因
                                    </th>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        QQ
                                    </th>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        IP
                                    </th>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        User-Agent
                                    </th>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        管理员
                                    </th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                <tr
                                    v-for="item in banActionItems"
                                    :key="item.id"
                                    class="align-top transition hover:bg-slate-50/70">
                                    <td
                                        class="whitespace-nowrap px-4 py-4 text-sm text-slate-700">
                                        <p>
                                            {{
                                                formatTimestamp(
                                                    item.requestedAt
                                                )
                                            }}
                                        </p>
                                        <p
                                            v-if="item.completedAt"
                                            class="mt-1 text-xs text-slate-400">
                                            完成于
                                            {{
                                                formatTimestamp(
                                                    item.completedAt
                                                )
                                            }}
                                        </p>
                                    </td>
                                    <td
                                        class="px-4 py-4 text-sm font-semibold text-slate-900">
                                        {{ item.userId }}
                                    </td>
                                    <td class="px-4 py-4">
                                        <div class="flex flex-wrap gap-2">
                                            <UiStatusBadge
                                                :label="
                                                    getBanActionLabel(
                                                        item.action
                                                    )
                                                "
                                                :tone="
                                                    getBanActionTone(
                                                        item.action
                                                    )
                                                " />
                                            <UiStatusBadge
                                                :label="
                                                    getBanActionStatusLabel(
                                                        item.status
                                                    )
                                                "
                                                :tone="
                                                    getBanActionStatusTone(
                                                        item.status
                                                    )
                                                " />
                                        </div>
                                        <p
                                            v-if="
                                                item.changed === false &&
                                                item.status === 'succeeded'
                                            "
                                            class="mt-2 text-xs text-slate-500">
                                            账户状态未发生变化
                                        </p>
                                    </td>
                                    <td class="max-w-[18rem] px-4 py-4 text-sm">
                                        <p class="font-semibold text-slate-800">
                                            {{
                                                getBanActionSourceLabel(
                                                    item.source
                                                )
                                            }}
                                        </p>
                                        <p
                                            class="mt-1 leading-6 text-slate-600">
                                            {{ item.reason }}
                                        </p>
                                        <p
                                            v-if="item.errorMessage"
                                            class="mt-2 break-all text-xs leading-5 text-rose-700">
                                            {{ item.errorMessage }}
                                        </p>
                                    </td>
                                    <td
                                        class="whitespace-nowrap px-4 py-4 font-mono text-xs text-slate-700">
                                        {{ item.qqNumber ?? '--' }}
                                    </td>
                                    <td
                                        class="max-w-[14rem] break-all px-4 py-4 font-mono text-xs leading-5 text-slate-700">
                                        {{ item.ipAddress ?? '--' }}
                                    </td>
                                    <td
                                        class="max-w-[24rem] break-all px-4 py-4 font-mono text-xs leading-5 text-slate-600"
                                        :title="item.userAgent ?? undefined">
                                        {{ item.userAgent ?? '--' }}
                                    </td>
                                    <td
                                        class="whitespace-nowrap px-4 py-4 text-sm text-slate-700">
                                        {{ item.actorUserId ?? '--' }}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </UiCard>

            <UiCard :show-accent-bar="false">
                <div class="space-y-6">
                    <div
                        class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div class="space-y-2">
                            <p
                                class="text-xs font-semibold uppercase tracking-[0.22em] text-rose-500">
                                QQ Ban List
                            </p>
                            <h2 class="text-2xl font-semibold text-slate-900">
                                QQ 封禁清单
                            </h2>
                            <p class="text-sm leading-6 text-slate-600">
                                命中清单的验证码请求会返回发送成功，但不会实际发信，并异步封禁请求账户。
                            </p>
                        </div>
                        <div class="flex flex-wrap gap-2">
                            <UiStatusBadge
                                :label="`${formatNumber(qqBanListItems.length)} 个 QQ`"
                                tone="danger" />
                            <UiStatusBadge
                                :label="`关联窗口 ${formatWindowDuration(securityData?.banCorrelationWindowSeconds ?? 0)}`"
                                tone="neutral" />
                        </div>
                    </div>

                    <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                        <UiField
                            label="QQ 号"
                            help="输入 5–12 位数字；加入后仅拦截后续验证码发送请求。">
                            <input
                                v-model="qqBanForm.qqNumber"
                                type="text"
                                inputmode="numeric"
                                autocomplete="off"
                                maxlength="12"
                                class="harmony-input w-full px-4 py-3 text-base text-crh-grey-dark"
                                placeholder="例如 123456789"
                                @keyup.enter="addQqBanEntry" />
                        </UiField>
                        <div class="flex items-end">
                            <UiButton
                                type="button"
                                class="w-full md:w-auto"
                                :loading="isAddingQqBanEntry"
                                :disabled="isRemovingQqBanEntry"
                                @click="addQqBanEntry">
                                加入清单
                            </UiButton>
                        </div>
                    </div>

                    <p
                        v-if="qqBanMutationErrorMessage"
                        class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                        {{ qqBanMutationErrorMessage }}
                    </p>
                    <p
                        v-else-if="qqBanMutationSuccessMessage"
                        class="rounded-[1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm leading-6 text-emerald-800">
                        {{ qqBanMutationSuccessMessage }}
                    </p>

                    <div
                        v-if="securityStatus === 'pending' && !securityData"
                        class="space-y-3">
                        <div
                            v-for="index in 3"
                            :key="`admin-qq-ban-list-skeleton:${index}`"
                            class="h-16 animate-pulse rounded-[1rem] bg-slate-100/90" />
                    </div>

                    <UiEmptyState
                        v-else-if="securityErrorMessage"
                        eyebrow="加载失败"
                        title="QQ 封禁清单加载失败"
                        :description="securityErrorMessage"
                        tone="danger">
                        <UiButton
                            type="button"
                            variant="secondary"
                            @click="refreshSecurity()">
                            重试
                        </UiButton>
                    </UiEmptyState>

                    <UiEmptyState
                        v-else-if="qqBanListItems.length === 0"
                        eyebrow="Empty List"
                        title="QQ 封禁清单为空"
                        description="加入 QQ 后，新的验证码发送尝试才会触发异步封禁。" />

                    <div
                        v-else
                        class="overflow-x-auto rounded-[1rem] border border-slate-200 bg-white/90">
                        <table class="min-w-full divide-y divide-slate-200">
                            <thead class="bg-slate-50/80">
                                <tr>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        QQ 号
                                    </th>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        添加时间
                                    </th>
                                    <th
                                        class="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        添加管理员
                                    </th>
                                    <th
                                        class="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        操作
                                    </th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                <tr
                                    v-for="item in qqBanListItems"
                                    :key="item.qqNumber"
                                    class="transition hover:bg-rose-50/30">
                                    <td
                                        class="px-4 py-4 font-mono text-sm font-semibold text-slate-900">
                                        {{ item.qqNumber }}
                                    </td>
                                    <td
                                        class="whitespace-nowrap px-4 py-4 text-sm text-slate-700">
                                        {{ formatTimestamp(item.addedAt) }}
                                    </td>
                                    <td
                                        class="px-4 py-4 text-sm text-slate-700">
                                        {{ item.addedBy }}
                                    </td>
                                    <td class="px-4 py-4 text-right">
                                        <UiButton
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            class="border-rose-200 text-rose-700 hover:border-rose-300 hover:bg-rose-50"
                                            :disabled="
                                                isAddingQqBanEntry ||
                                                isRemovingQqBanEntry
                                            "
                                            @click="
                                                openRemoveQqBanDialog(item)
                                            ">
                                            移除
                                        </UiButton>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </UiCard>
        </div>

        <AdminMembershipModal
            :model-value="isSponsorshipDialogOpen"
            :user="sponsorshipTargetUser"
            @update:model-value="handleSponsorshipDialogVisibilityChange"
            @updated="refreshUsers" />

        <UiModal
            :model-value="isBanDialogOpen"
            :eyebrow="pendingBanState ? '危险操作' : '账户操作'"
            :title="pendingBanState ? '确认封禁用户' : '确认解封用户'"
            :description="banDialogDescription"
            size="md"
            :close-on-backdrop="!isUpdatingBanStatus"
            @update:model-value="handleBanDialogVisibilityChange">
            <div class="space-y-4">
                <div
                    v-if="pendingBanState"
                    class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-900">
                    <p class="font-semibold">封禁后立即生效</p>
                    <p class="mt-2">1. 用户将无法通过用户名和密码登录。</p>
                    <p>2. 该用户全部 webapp 会话会被吊销。</p>
                    <p>3. 现有 API 与 OAuth key 会保留记录，但无法调用接口。</p>
                </div>

                <div
                    v-else
                    class="rounded-[1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm leading-6 text-emerald-900">
                    <p class="font-semibold">解封后的行为</p>
                    <p class="mt-2">用户可以重新登录并创建新的 webapp 会话。</p>
                    <p>此前被吊销的 webapp key 不会恢复。</p>
                </div>

                <p
                    v-if="banStatusErrorMessage"
                    class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                    {{ banStatusErrorMessage }}
                </p>
            </div>

            <template #footer>
                <div
                    class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <UiButton
                        type="button"
                        variant="secondary"
                        :disabled="isUpdatingBanStatus"
                        @click="closeBanDialog">
                        取消
                    </UiButton>
                    <UiButton
                        type="button"
                        :loading="isUpdatingBanStatus"
                        :class="
                            pendingBanState
                                ? 'bg-[linear-gradient(180deg,#c53030_0%,#b91c1c_100%)] text-white hover:bg-[linear-gradient(180deg,#b91c1c_0%,#991b1b_100%)]'
                                : 'bg-[linear-gradient(180deg,#15803d_0%,#166534_100%)] text-white hover:bg-[linear-gradient(180deg,#166534_0%,#14532d_100%)]'
                        "
                        @click="confirmBanStatusChange">
                        {{ pendingBanState ? '确认封禁' : '确认解封' }}
                    </UiButton>
                </div>
            </template>
        </UiModal>

        <UiModal
            :model-value="isClearRiskDialogOpen"
            eyebrow="风控操作"
            title="解除用户风控"
            :description="`解除用户 ${pendingClearRiskCase?.userId ?? '--'} 的当前风控状态。`"
            size="md"
            :close-on-backdrop="clearingRiskUserId.length === 0"
            @update:model-value="handleClearRiskDialogVisibilityChange">
            <div class="space-y-4">
                <div
                    class="rounded-[1rem] border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm leading-6 text-amber-950">
                    <p class="font-semibold">解除后立即生效</p>
                    <p class="mt-2">
                        若原始 IP 与 UA
                        指纹仍在关联窗口内，将为该用户建立临时豁免，避免下一次请求立即重新进入风控。
                    </p>
                    <p>
                        此操作不会解封账户，也不会移除已经加入 QQ
                        封禁清单的号码。
                    </p>
                </div>

                <p
                    v-if="riskClearErrorMessage"
                    class="rounded-[1rem] border border-rose-200 bg-rose-50/80 px-4 py-4 text-sm leading-6 text-rose-700">
                    {{ riskClearErrorMessage }}
                </p>
            </div>

            <template #footer>
                <div
                    class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <UiButton
                        type="button"
                        variant="secondary"
                        :disabled="clearingRiskUserId.length > 0"
                        @click="closeClearRiskDialog">
                        取消
                    </UiButton>
                    <UiButton
                        type="button"
                        :loading="clearingRiskUserId.length > 0"
                        class="bg-[linear-gradient(180deg,#b45309_0%,#92400e_100%)] text-white hover:bg-[linear-gradient(180deg,#92400e_0%,#78350f_100%)]"
                        @click="confirmClearRiskState">
                        确认解除
                    </UiButton>
                </div>
            </template>
        </UiModal>

        <UiModal
            :model-value="isRemoveQqBanDialogOpen"
            eyebrow="清单操作"
            title="移除封禁 QQ"
            :description="`将 QQ ${pendingRemoveQqBanEntry?.qqNumber ?? '--'} 从封禁清单移除。`"
            size="md"
            :close-on-backdrop="!isRemovingQqBanEntry"
            @update:model-value="handleRemoveQqBanDialogVisibilityChange">
            <div
                class="rounded-[1rem] border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm leading-6 text-amber-900">
                移除不会自动解封已经封禁的账户，也不会清除仍在有效期内的 IP 与
                UA 关联指纹。
            </div>

            <template #footer>
                <div
                    class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <UiButton
                        type="button"
                        variant="secondary"
                        :disabled="isRemovingQqBanEntry"
                        @click="closeRemoveQqBanDialog">
                        取消
                    </UiButton>
                    <UiButton
                        type="button"
                        :loading="isRemovingQqBanEntry"
                        class="bg-[linear-gradient(180deg,#c53030_0%,#b91c1c_100%)] text-white hover:bg-[linear-gradient(180deg,#b91c1c_0%,#991b1b_100%)]"
                        @click="confirmRemoveQqBanEntry">
                        确认移除
                    </UiButton>
                </div>
            </template>
        </UiModal>
    </AdminShell>
</template>

<script setup lang="ts">
import UiField from '~/components/ui/UiField.vue';
import UiModal from '~/components/ui/UiModal.vue';
import UiStatusBadge from '~/components/ui/UiStatusBadge.vue';
import useTrackedRequestFetch, {
    type TrackedRequestFetch
} from '~/composables/useTrackedRequestFetch';
import { useAdminDateQuery } from '~/composables/useAdminDateQuery';
import type {
    AdminAddQqBanListResponse,
    AdminClearUserRiskResponse,
    AdminQqBanListItem,
    AdminRemoveQqBanListResponse,
    AdminResetUserQuotaResponse,
    AdminUpdateUserBanStateResponse,
    AdminUpdateUserQuotaResponse,
    AdminUserBanAction,
    AdminUserBanActionSource,
    AdminUserBanActionStatus,
    AdminUserListItem,
    AdminUserRiskCaseItem,
    AdminUserRiskCaseStatus,
    AdminUserSecurityResponse,
    AdminUsersResponse
} from '~/types/admin';
import type { TrackerApiResponse } from '~/types/homepage';
import getApiErrorMessage from '~/utils/api/getApiErrorMessage';
import formatTrackerTimestamp from '~/utils/time/formatTrackerTimestamp';

definePageMeta({
    middleware: 'admin-required'
});

const requestFetch: TrackedRequestFetch = import.meta.server
    ? useTrackedRequestFetch()
    : ($fetch as TrackedRequestFetch);
const { session } = useAuthState();
const { selectedDateInput, todayDateInputValue } = await useAdminDateQuery();

async function fetchUsers() {
    const response = await requestFetch<TrackerApiResponse<AdminUsersResponse>>(
        '/api/v1/admin/users',
        {
            retry: 0
        }
    );

    if (!response.ok) {
        throw {
            data: response
        };
    }

    return response.data;
}

const {
    data: usersData,
    status: usersStatus,
    error: usersError,
    refresh: refreshUsers
} = await useAsyncData('admin-users', fetchUsers);

async function fetchUserSecurity() {
    const response = await requestFetch<
        TrackerApiResponse<AdminUserSecurityResponse>
    >('/api/v1/admin/users/security', {
        retry: 0
    });

    if (!response.ok) {
        throw {
            data: response
        };
    }

    return response.data;
}

const {
    data: securityData,
    status: securityStatus,
    error: securityError,
    refresh: refreshSecurity
} = await useAsyncData('admin-user-security', fetchUserSecurity);

const usersErrorMessage = computed(() =>
    usersError.value
        ? getApiErrorMessage(usersError.value, '加载用户列表失败。')
        : ''
);
const userItems = computed(() => usersData.value?.items ?? []);
const securityErrorMessage = computed(() =>
    securityError.value
        ? getApiErrorMessage(securityError.value, '加载用户封禁安全数据失败。')
        : ''
);
const banActionItems = computed(() => securityData.value?.banActions ?? []);
const qqBanListItems = computed(() => securityData.value?.qqBanList ?? []);
const riskCaseItems = computed(() => securityData.value?.riskCases ?? []);
const openRiskCaseItems = computed(() =>
    riskCaseItems.value.filter((item) => item.status !== 'cleared')
);
const openRiskCaseByUser = computed(() => {
    const items = new Map<string, AdminUserRiskCaseItem>();
    for (const item of openRiskCaseItems.value) {
        if (!items.has(item.userId)) {
            items.set(item.userId, item);
        }
    }
    return items;
});
const isRefreshingAll = computed(
    () => usersStatus.value === 'pending' || securityStatus.value === 'pending'
);
const quotaForm = reactive({
    userId: '',
    tokenLimit: '',
    refillAmount: ''
});
const isSavingQuota = ref(false);
const quotaSaveErrorMessage = ref('');
const quotaSaveSuccessMessage = ref('');
const resettingQuotaUserId = ref('');
const quotaResetErrorMessage = ref('');
const quotaResetSuccessMessage = ref('');
const isBanDialogOpen = ref(false);
const pendingBanUser = ref<AdminUserListItem | null>(null);
const isUpdatingBanStatus = ref(false);
const updatingBanUserId = ref('');
const banStatusErrorMessage = ref('');
const banStatusSuccessMessage = ref('');
const isClearRiskDialogOpen = ref(false);
const pendingClearRiskCase = ref<AdminUserRiskCaseItem | null>(null);
const clearingRiskUserId = ref('');
const riskClearErrorMessage = ref('');
const riskClearSuccessMessage = ref('');
const qqBanForm = reactive({
    qqNumber: ''
});
const isAddingQqBanEntry = ref(false);
const isRemovingQqBanEntry = ref(false);
const qqBanMutationErrorMessage = ref('');
const qqBanMutationSuccessMessage = ref('');
const isRemoveQqBanDialogOpen = ref(false);
const pendingRemoveQqBanEntry = ref<AdminQqBanListItem | null>(null);
const isSponsorshipDialogOpen = ref(false);
const sponsorshipTargetUser = ref<AdminUserListItem | null>(null);

const pendingBanState = computed(() => !pendingBanUser.value?.isBanned);
const banDialogDescription = computed(() => {
    const userId = pendingBanUser.value?.userId ?? '--';
    return pendingBanState.value
        ? `将封禁用户 ${userId}，并立即终止其网页端登录状态。`
        : `将解除用户 ${userId} 的封禁状态，旧网页会话不会恢复。`;
});

useSiteSeo({
    title: '用户 | Open CRH Tracker',
    description: '查看管理员用户列表、注册数量与当前运行时 API 剩余额度。',
    path: '/admin/users',
    noindex: true
});

function formatTimestamp(timestamp: number | null | undefined) {
    if (!Number.isFinite(timestamp) || !timestamp || timestamp <= 0) {
        return '--';
    }

    return formatTrackerTimestamp(timestamp);
}

function formatNumber(value: number) {
    return value.toLocaleString('zh-CN');
}

function formatOptionalNumber(value: number | null) {
    return typeof value === 'number' ? formatNumber(value) : '--';
}

function formatWindowDuration(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return '--';
    }

    if (seconds % 3600 === 0) {
        return `${formatNumber(seconds / 3600)} 小时`;
    }

    return `${formatNumber(seconds)} 秒`;
}

function getBanActionLabel(action: AdminUserBanAction) {
    return action === 'ban' ? '封禁' : '解封';
}

function getBanActionTone(action: AdminUserBanAction) {
    return action === 'ban' ? ('danger' as const) : ('success' as const);
}

function getBanActionStatusLabel(status: AdminUserBanActionStatus) {
    switch (status) {
        case 'pending':
            return '等待执行';
        case 'succeeded':
            return '已完成';
        case 'failed':
            return '执行失败';
        case 'skipped':
            return '已跳过';
    }
}

function getBanActionStatusTone(status: AdminUserBanActionStatus) {
    switch (status) {
        case 'pending':
            return 'warning' as const;
        case 'succeeded':
            return 'success' as const;
        case 'failed':
            return 'danger' as const;
        case 'skipped':
            return 'neutral' as const;
    }
}

function getBanActionSourceLabel(source: AdminUserBanActionSource) {
    switch (source) {
        case 'admin_manual':
            return '管理员手动操作';
        case 'qq_ban_list':
            return 'QQ 封禁清单';
        case 'fingerprint_match':
            return 'IP 与 UA 关联';
    }
}

function getRiskCaseStatusLabel(status: AdminUserRiskCaseStatus) {
    switch (status) {
        case 'pending':
            return '等待标记';
        case 'active':
            return '风控中';
        case 'escalating':
            return '处置中';
        case 'escalated':
            return '已触发封禁';
        case 'failed':
            return '执行失败';
        case 'cleared':
            return '已解除';
    }
}

function getRiskCaseStatusTone(status: AdminUserRiskCaseStatus) {
    switch (status) {
        case 'pending':
        case 'active':
            return 'warning' as const;
        case 'escalating':
        case 'escalated':
        case 'failed':
            return 'danger' as const;
        case 'cleared':
            return 'neutral' as const;
    }
}

function getOpenRiskCase(userId: string) {
    return openRiskCaseByUser.value.get(userId) ?? null;
}

function getUserRiskStatusLabel(userId: string) {
    const riskCase = getOpenRiskCase(userId);
    return riskCase ? getRiskCaseStatusLabel(riskCase.status) : '';
}

function getUserRiskStatusTone(userId: string) {
    const riskCase = getOpenRiskCase(userId);
    return riskCase ? getRiskCaseStatusTone(riskCase.status) : 'neutral';
}

async function refreshAllData() {
    await Promise.all([refreshUsers(), refreshSecurity()]);
}

function getUserStatusLabel(item: AdminUserListItem) {
    if (item.isAdmin) {
        return '管理员';
    }

    return item.isBanned ? '已封禁' : '正常';
}

function getUserStatusTone(item: AdminUserListItem) {
    if (item.isAdmin) {
        return 'info' as const;
    }

    return item.isBanned ? ('danger' as const) : ('success' as const);
}

function openSponsorshipDialog(item: AdminUserListItem) {
    sponsorshipTargetUser.value = item;
    isSponsorshipDialogOpen.value = true;
}

function handleSponsorshipDialogVisibilityChange(nextValue: boolean) {
    isSponsorshipDialogOpen.value = nextValue;
    if (!nextValue) {
        sponsorshipTargetUser.value = null;
    }
}

function openClearRiskDialog(item: AdminUserListItem) {
    const riskCase = getOpenRiskCase(item.userId);
    if (
        item.isAdmin ||
        item.isBanned ||
        !riskCase ||
        clearingRiskUserId.value.length > 0
    ) {
        return;
    }

    pendingClearRiskCase.value = riskCase;
    riskClearErrorMessage.value = '';
    riskClearSuccessMessage.value = '';
    isClearRiskDialogOpen.value = true;
}

function closeClearRiskDialog() {
    if (clearingRiskUserId.value.length > 0) {
        return;
    }

    isClearRiskDialogOpen.value = false;
    pendingClearRiskCase.value = null;
    riskClearErrorMessage.value = '';
}

function handleClearRiskDialogVisibilityChange(nextValue: boolean) {
    if (nextValue) {
        isClearRiskDialogOpen.value = true;
        return;
    }

    closeClearRiskDialog();
}

async function confirmClearRiskState() {
    const riskCase = pendingClearRiskCase.value;
    if (!riskCase || clearingRiskUserId.value.length > 0) {
        return;
    }

    clearingRiskUserId.value = riskCase.userId;
    riskClearErrorMessage.value = '';
    riskClearSuccessMessage.value = '';

    try {
        const { data, error } = await useCsrfFetch<
            TrackerApiResponse<AdminClearUserRiskResponse>
        >('/api/v1/admin/users/risk/clear', {
            method: 'POST',
            retry: 0,
            body: {
                userId: riskCase.userId
            },
            key: `admin:users:risk:clear:${riskCase.userId}:${Date.now()}`,
            watch: false,
            server: false
        });

        if (error.value) {
            throw error.value;
        }

        const response = data.value;
        if (!response) {
            throw new Error('Missing user risk clear response');
        }
        if (!response.ok) {
            throw {
                data: response
            };
        }

        riskClearSuccessMessage.value = response.data.changed
            ? `已解除用户 ${response.data.userId} 的风控状态。`
            : `用户 ${response.data.userId} 当前没有待解除的风控状态。`;
        isClearRiskDialogOpen.value = false;
        pendingClearRiskCase.value = null;
        await refreshSecurity();
    } catch (error) {
        riskClearErrorMessage.value = getApiErrorMessage(
            error,
            '解除用户风控状态失败。'
        );
    } finally {
        clearingRiskUserId.value = '';
    }
}

function openBanDialog(item: AdminUserListItem) {
    if (item.isAdmin || isUpdatingBanStatus.value) {
        return;
    }

    pendingBanUser.value = item;
    banStatusErrorMessage.value = '';
    banStatusSuccessMessage.value = '';
    isBanDialogOpen.value = true;
}

function closeBanDialog() {
    if (isUpdatingBanStatus.value) {
        return;
    }

    isBanDialogOpen.value = false;
    pendingBanUser.value = null;
    banStatusErrorMessage.value = '';
}

function handleBanDialogVisibilityChange(nextValue: boolean) {
    if (nextValue) {
        isBanDialogOpen.value = true;
        return;
    }

    closeBanDialog();
}

async function confirmBanStatusChange() {
    const user = pendingBanUser.value;
    if (!user || isUpdatingBanStatus.value) {
        return;
    }

    const banned = !user.isBanned;
    isUpdatingBanStatus.value = true;
    updatingBanUserId.value = user.userId;
    banStatusErrorMessage.value = '';
    banStatusSuccessMessage.value = '';

    try {
        const { data, error } = await useCsrfFetch<
            TrackerApiResponse<AdminUpdateUserBanStateResponse>
        >('/api/v1/admin/users/status', {
            method: 'POST',
            retry: 0,
            body: {
                userId: user.userId,
                banned
            },
            key: `admin:users:status:${user.userId}:${Date.now()}`,
            watch: false,
            server: false
        });

        if (error.value) {
            throw error.value;
        }

        const response = data.value;
        if (!response) {
            throw new Error('Missing admin user status update response');
        }

        if (!response.ok) {
            throw {
                data: response
            };
        }

        if (response.data.isBanned) {
            banStatusSuccessMessage.value = response.data.changed
                ? `已封禁用户 ${response.data.userId}。吊销 webapp key ${formatNumber(response.data.revokedWebappApiKeyCount)} 个。`
                : `用户 ${response.data.userId} 已处于封禁状态，并清理了 ${formatNumber(response.data.revokedWebappApiKeyCount)} 个残留 webapp key。`;
        } else {
            banStatusSuccessMessage.value = response.data.changed
                ? `已解封用户 ${response.data.userId}，用户可以重新登录。`
                : `用户 ${response.data.userId} 已处于正常状态，无需重复操作。`;
        }
        isBanDialogOpen.value = false;
        pendingBanUser.value = null;
        await Promise.all([refreshUsers(), refreshSecurity()]);
    } catch (error) {
        banStatusErrorMessage.value = getApiErrorMessage(
            error,
            banned ? '封禁用户失败。' : '解封用户失败。'
        );
    } finally {
        isUpdatingBanStatus.value = false;
        updatingBanUserId.value = '';
    }
}

function parseOptionalPositiveInteger(value: unknown) {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === 'number') {
        if (!Number.isSafeInteger(value) || value <= 0) {
            throw new Error('请输入大于 0 的正整数。');
        }

        return value;
    }

    if (typeof value !== 'string') {
        throw new Error('请输入正整数，或留空表示清除自定义设置。');
    }

    const normalizedValue = value.trim();
    if (normalizedValue.length === 0) {
        return null;
    }

    if (!/^[0-9]+$/.test(normalizedValue)) {
        throw new Error('请输入正整数，或留空表示清除自定义设置。');
    }

    const parsedValue = Number.parseInt(normalizedValue, 10);
    if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
        throw new Error('请输入大于 0 的正整数。');
    }

    return parsedValue;
}

async function saveQuotaOverride() {
    if (isSavingQuota.value) {
        return;
    }

    quotaSaveErrorMessage.value = '';
    quotaSaveSuccessMessage.value = '';

    const userId = quotaForm.userId.trim();
    if (userId.length === 0) {
        quotaSaveErrorMessage.value = '用户名不能为空。';
        return;
    }

    let tokenLimit: number | null;
    let refillAmount: number | null;

    try {
        tokenLimit = parseOptionalPositiveInteger(quotaForm.tokenLimit);
        refillAmount = parseOptionalPositiveInteger(quotaForm.refillAmount);
    } catch (error) {
        quotaSaveErrorMessage.value =
            error instanceof Error ? error.message : '配额输入无效。';
        return;
    }

    isSavingQuota.value = true;

    try {
        const { data, error } = await useCsrfFetch<
            TrackerApiResponse<AdminUpdateUserQuotaResponse>
        >('/api/v1/admin/users/quota', {
            method: 'POST',
            retry: 0,
            body: {
                userId,
                tokenLimit,
                refillAmount
            },
            key: `admin:users:quota:${userId}:${Date.now()}`,
            watch: false,
            server: false
        });

        if (error.value) {
            throw error.value;
        }

        const response = data.value;
        if (!response) {
            throw new Error('Missing admin user quota update response');
        }

        if (!response.ok) {
            throw {
                data: response
            };
        }

        quotaForm.userId = response.data.userId;
        quotaForm.tokenLimit =
            response.data.quotaOverride.tokenLimit === null
                ? ''
                : String(response.data.quotaOverride.tokenLimit);
        quotaForm.refillAmount =
            response.data.quotaOverride.refillAmount === null
                ? ''
                : String(response.data.quotaOverride.refillAmount);

        quotaSaveSuccessMessage.value =
            response.data.quotaOverride.tokenLimit === null &&
            response.data.quotaOverride.refillAmount === null
                ? `已清除用户 ${response.data.userId} 的自定义配额设置。`
                : `已保存用户 ${response.data.userId} 的自定义配额设置。`;

        await refreshUsers();
    } catch (error) {
        quotaSaveErrorMessage.value = getApiErrorMessage(
            error,
            '保存用户自定义配额失败。'
        );
    } finally {
        isSavingQuota.value = false;
    }
}

async function resetUserQuota(userId: string) {
    if (resettingQuotaUserId.value.length > 0) {
        return;
    }

    quotaResetErrorMessage.value = '';
    quotaResetSuccessMessage.value = '';
    resettingQuotaUserId.value = userId;

    try {
        const { data, error } = await useCsrfFetch<
            TrackerApiResponse<AdminResetUserQuotaResponse>
        >('/api/v1/admin/users/quota/reset', {
            method: 'POST',
            retry: 0,
            body: {
                userId
            },
            key: `admin:users:quota:reset:${userId}:${Date.now()}`,
            watch: false,
            server: false
        });

        if (error.value) {
            throw error.value;
        }

        const response = data.value;
        if (!response) {
            throw new Error('Missing admin user quota reset response');
        }

        if (!response.ok) {
            throw {
                data: response
            };
        }

        quotaResetSuccessMessage.value = `已重置用户 ${response.data.userId} 的当前 API 剩余额度。`;

        await refreshUsers();
    } catch (error) {
        quotaResetErrorMessage.value = getApiErrorMessage(
            error,
            '重置用户当前 API 剩余额度失败。'
        );
    } finally {
        resettingQuotaUserId.value = '';
    }
}

function clearQqBanMutationMessages() {
    qqBanMutationErrorMessage.value = '';
    qqBanMutationSuccessMessage.value = '';
}

async function addQqBanEntry() {
    if (isAddingQqBanEntry.value || isRemovingQqBanEntry.value) {
        return;
    }

    clearQqBanMutationMessages();
    const qqNumber = qqBanForm.qqNumber.trim();
    if (!/^\d{5,12}$/.test(qqNumber)) {
        qqBanMutationErrorMessage.value = 'QQ 号必须是 5–12 位纯数字。';
        return;
    }

    isAddingQqBanEntry.value = true;
    try {
        const { data, error } = await useCsrfFetch<
            TrackerApiResponse<AdminAddQqBanListResponse>
        >('/api/v1/admin/users/qq-ban-list', {
            method: 'POST',
            retry: 0,
            body: {
                qqNumber
            },
            key: `admin:users:qq-ban-list:add:${qqNumber}:${Date.now()}`,
            watch: false,
            server: false
        });

        if (error.value) {
            throw error.value;
        }

        const response = data.value;
        if (!response) {
            throw new Error('Missing QQ ban list add response');
        }
        if (!response.ok) {
            throw {
                data: response
            };
        }

        qqBanForm.qqNumber = '';
        qqBanMutationSuccessMessage.value = response.data.created
            ? `已将 QQ ${response.data.item.qqNumber} 加入封禁清单。`
            : `QQ ${response.data.item.qqNumber} 已在封禁清单中。`;
        await refreshSecurity();
    } catch (error) {
        qqBanMutationErrorMessage.value = getApiErrorMessage(
            error,
            '加入 QQ 封禁清单失败。'
        );
    } finally {
        isAddingQqBanEntry.value = false;
    }
}

function openRemoveQqBanDialog(item: AdminQqBanListItem) {
    if (isAddingQqBanEntry.value || isRemovingQqBanEntry.value) {
        return;
    }

    clearQqBanMutationMessages();
    pendingRemoveQqBanEntry.value = item;
    isRemoveQqBanDialogOpen.value = true;
}

function closeRemoveQqBanDialog() {
    if (isRemovingQqBanEntry.value) {
        return;
    }

    isRemoveQqBanDialogOpen.value = false;
    pendingRemoveQqBanEntry.value = null;
}

function handleRemoveQqBanDialogVisibilityChange(nextValue: boolean) {
    if (nextValue) {
        isRemoveQqBanDialogOpen.value = true;
        return;
    }

    closeRemoveQqBanDialog();
}

async function confirmRemoveQqBanEntry() {
    const item = pendingRemoveQqBanEntry.value;
    if (!item || isRemovingQqBanEntry.value) {
        return;
    }

    isRemovingQqBanEntry.value = true;
    clearQqBanMutationMessages();
    try {
        const { data, error } = await useCsrfFetch<
            TrackerApiResponse<AdminRemoveQqBanListResponse>
        >(
            `/api/v1/admin/users/qq-ban-list/${encodeURIComponent(item.qqNumber)}`,
            {
                method: 'DELETE',
                retry: 0,
                key: `admin:users:qq-ban-list:remove:${item.qqNumber}:${Date.now()}`,
                watch: false,
                server: false
            }
        );

        if (error.value) {
            throw error.value;
        }

        const response = data.value;
        if (!response) {
            throw new Error('Missing QQ ban list remove response');
        }
        if (!response.ok) {
            throw {
                data: response
            };
        }

        qqBanMutationSuccessMessage.value = response.data.removed
            ? `已将 QQ ${response.data.qqNumber} 从封禁清单移除。`
            : `QQ ${response.data.qqNumber} 已不在封禁清单中。`;
        isRemoveQqBanDialogOpen.value = false;
        pendingRemoveQqBanEntry.value = null;
        await refreshSecurity();
    } catch (error) {
        qqBanMutationErrorMessage.value = getApiErrorMessage(
            error,
            '移除 QQ 封禁清单条目失败。'
        );
    } finally {
        isRemovingQqBanEntry.value = false;
    }
}
</script>
