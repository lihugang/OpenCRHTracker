<template>
    <DocsShell
        eyebrow="OAUTH"
        title="OAuth 文档"
        description="本文档介绍如何通过 OAuth 2.0 协议授权第三方 App 获取本网站上的信息。">
        <UiCard :show-accent-bar="false">
            <div class="space-y-4">
                <div class="space-y-2">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.2em] text-crh-blue/80">
                        INTRO
                    </p>
                    <h2 class="text-2xl font-semibold text-slate-900">
                        什么是 OAuth 2.0
                    </h2>
                </div>

                <p class="text-sm leading-7 text-slate-600">
                    OAuth 2.0
                    可以理解为一种“授权第三方应用访问部分信息”的方式。它的重点不是把你的账号密码交给第三方
                    App，而是让你先在本站完成登录和确认，再决定是否允许对方读取你同意开放的信息。
                </p>

                <p class="text-sm leading-7 text-slate-600">
                    在本网站的实际应用过程中，`第三方 App`
                    指的是接入本网站账号体系的外部应用、网站或程序；`授权页面`
                    则是本站展示给你的确认页面，用来让你决定是否同意授权，以及允许它访问哪些内容。
                </p>

                <p class="text-sm leading-7 text-slate-600">
                    `scope`
                    可以理解为“权限范围”。它的作用是告诉本站，这个第三方 App
                    想读取哪些信息；只有你同意、并且本站允许开放的范围，才会真的授权出去，这样可以避免一旦登录就把所有信息都交给对方。
                </p>

                <p class="text-sm leading-7 text-slate-600">
                    `access_token`
                    可以理解为授权成功后发给第三方 App 的访问凭证。它的作用是让 App
                    在后续请求接口时证明“这位用户已经同意授权了”，因此它不等于你的账号密码，而是一份带有限制条件的授权结果。
                </p>

                <p class="text-sm leading-7 text-slate-600">
                    当你确认授权后，本站会先返回一个一次性的 `authorization code`
                    给第三方 App。这个临时码不能直接长期使用，它还需要配合
                    `PKCE` 这个安全机制一起完成校验，避免授权码在中途被别人拿去冒用。这里的
                    `redirect_uri` 则是授权完成后浏览器要跳回去的回调地址。
                </p>

                <p class="text-sm leading-7 text-slate-600">
                    在后续结果里，你还会看到 `id_token` 和 `nonce` 这类名词。`id_token`
                    主要用于告诉第三方 App 当前授权对应的是哪个登录身份；`nonce`
                    可以理解为这次登录请求附带的另一串随机标记。第三方 App
                    发起请求时先保存它，本站再把它写回 `id_token`，这样第三方 App
                    就能检查拿到的身份结果是不是确实对应当前这一次登录授权流程。
                </p>

                <p class="text-sm leading-6 text-slate-600">
                    补充阅读：
                    <a
                        href="https://www.ruanyifeng.com/blog/2014/05/oauth_2_0.html"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="font-semibold text-crh-blue transition hover:text-slate-900">
                        《理解 OAuth 2.0》
                    </a>
                </p>
            </div>
        </UiCard>

        <UiCard
            v-for="section in oauthDocsSections"
            :key="section.id"
            :show-accent-bar="false">
            <div class="space-y-5">
                <div class="space-y-2">
                    <p
                        class="text-xs font-medium uppercase tracking-[0.2em] text-crh-blue/80">
                        {{ section.id }}
                    </p>
                    <h2 class="text-2xl font-semibold text-slate-900">
                        {{ section.title }}
                    </h2>
                    <p class="text-sm leading-6 text-slate-600">
                        {{ section.summary }}
                    </p>
                </div>

                <div class="space-y-4">
                    <template
                        v-for="(block, index) in section.blocks"
                        :key="section.id + ':' + index">
                        <p
                            v-if="block.type === 'paragraph'"
                            class="text-sm leading-7 text-slate-600">
                            {{ block.text }}
                        </p>

                        <div
                            v-else-if="block.type === 'linked-paragraph'"
                            class="text-sm leading-7 text-slate-600">
                            <span>{{ block.textBefore }}</span>
                            <NuxtLink
                                :to="block.to ?? '/docs/api'"
                                class="font-semibold text-crh-blue underline decoration-crh-blue/40 underline-offset-4 transition hover:text-slate-900">
                                {{ block.linkText }}
                            </NuxtLink>
                            <span>{{ block.textAfter }}</span>
                        </div>

                        <div
                            v-else-if="block.type === 'list'"
                            class="space-y-3">
                            <p
                                v-if="block.title"
                                class="text-sm font-semibold text-slate-900">
                                {{ block.title }}
                            </p>
                            <ul
                                class="space-y-2 text-sm leading-6 text-slate-600">
                                <li
                                    v-for="item in block.items"
                                    :key="item"
                                    class="rounded-[1rem] border border-slate-200 bg-white/80 px-4 py-3">
                                    {{ item }}
                                </li>
                            </ul>
                        </div>

                        <div
                            v-else-if="block.type === 'code'"
                            class="space-y-3">
                            <p
                                v-if="block.title"
                                class="text-sm font-semibold text-slate-900">
                                {{ block.title }}
                            </p>
                            <DocsCodeBlock
                                :code="block.code ?? ''"
                                :text-class="
                                    block.language === 'json'
                                        ? 'text-xs leading-6'
                                        : 'text-sm leading-7'
                                " />
                        </div>

                        <div
                            v-else-if="block.type === 'field-cards'"
                            class="space-y-3">
                            <p
                                v-if="block.title"
                                class="text-sm font-semibold text-slate-900">
                                {{ block.title }}
                            </p>
                            <p
                                v-if="block.text"
                                class="text-sm leading-7 text-slate-600">
                                {{ block.text }}
                            </p>

                            <div class="grid gap-4 xl:grid-cols-2">
                                <div
                                    v-for="card in block.cards ?? []"
                                    :key="card.path"
                                    class="rounded-[1rem] border border-slate-200 bg-white/90 px-4 py-4">
                                    <div
                                        class="flex flex-wrap items-center gap-2">
                                        <code
                                            class="rounded-full bg-slate-100 px-3 py-1 font-mono text-xs text-slate-700">
                                            {{ card.path }}
                                        </code>
                                        <span
                                            class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                                            {{ card.valueType }}
                                        </span>
                                        <span
                                            v-if="card.required"
                                            class="rounded-full border border-crh-blue/20 bg-blue-50 px-3 py-1 text-xs font-semibold text-crh-blue">
                                            必填
                                        </span>
                                    </div>

                                    <p
                                        class="mt-3 text-sm leading-6 text-slate-600">
                                        {{ card.description }}
                                    </p>

                                    <ul
                                        v-if="(card.notes ?? []).length > 0"
                                        class="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                                        <li
                                            v-for="note in card.notes ?? []"
                                            :key="card.path + ':' + note"
                                            class="rounded-[0.9rem] border border-slate-200 bg-slate-50/80 px-3 py-2">
                                            {{ note }}
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </template>
                </div>
            </div>
        </UiCard>
    </DocsShell>
</template>

<script setup lang="ts">
import { oauthDocsSections } from '~/utils/docs/oauthDocs';

definePageMeta({
    pageTransition: {
        name: 'docs-page',
        mode: 'out-in'
    }
});

useSiteSeo({
    title: 'OAuth 文档 | Open CRH Tracker',
    description:
        'Open CRH Tracker OAuth 接入文档，覆盖客户端创建、Authorization Code + PKCE 授权流程、令牌交换与 userinfo 调用。',
    path: '/docs/oauth'
});
</script>
