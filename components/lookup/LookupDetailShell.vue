<template>
    <main
        :class="['flex min-h-screen flex-col text-crh-grey-dark', shellClass]">
        <div
            :class="[
                'pointer-events-none absolute inset-x-0 top-0 transition-[height,opacity] duration-200 ease-out',
                backgroundClass,
                isHeaderCollapsed
                    ? collapsedBackgroundHeightClass
                    : expandedBackgroundHeightClass
            ]" />

        <div
            :class="[
                'relative mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 pb-10 sm:px-6 lg:px-8 transition-[padding-top] duration-200 ease-out',
                isHeaderCollapsed
                    ? collapsedTopPaddingClass
                    : expandedTopPaddingClass
            ]">
            <div
                class="grid gap-6 min-[960px]:landscape:grid-cols-[minmax(18rem,20%)_minmax(0,1fr)] min-[960px]:landscape:items-start">
                <div
                    :class="[
                        shouldUseMobileStickyHeader
                            ? 'relative max-[767px]:sticky max-[767px]:top-3 max-[767px]:z-20 max-[767px]:isolate'
                            : '',
                        'min-[960px]:landscape:sticky min-[960px]:landscape:top-6 min-[960px]:landscape:min-w-[18rem]'
                    ]">
                    <div class="relative max-[767px]:z-10">
                        <slot name="search" />
                    </div>

                    <div
                        v-if="$slots['sidebar-favorite']"
                        class="mt-4 hidden min-[960px]:landscape:block">
                        <slot name="sidebar-favorite" />
                    </div>

                    <UiCard
                        v-if="showQuickLinks"
                        :show-accent-bar="false"
                        :class="[
                            'relative z-0 mt-4 transition-[opacity,transform,max-height,margin-top] duration-200 ease-out',
                            collapseQuickLinks && isHeaderCollapsed
                                ? 'max-[767px]:mt-2 max-[767px]:max-h-0 max-[767px]:overflow-hidden max-[767px]:opacity-0 max-[767px]:pointer-events-none max-[767px]:-translate-y-2'
                                : ''
                        ]">
                        <div class="space-y-3">
                            <p
                                class="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                                Quick Links
                            </p>
                            <AppFooterLinks
                                class="justify-center min-[960px]:landscape:justify-start" />
                        </div>
                    </UiCard>
                </div>

                <div>
                    <slot />
                </div>
            </div>
        </div>

        <AppFooter />
    </main>
</template>

<script setup lang="ts">
withDefaults(
    defineProps<{
        shellClass?: string;
        backgroundClass?: string;
        expandedBackgroundHeightClass?: string;
        collapsedBackgroundHeightClass?: string;
        expandedTopPaddingClass?: string;
        collapsedTopPaddingClass?: string;
        isHeaderCollapsed?: boolean;
        shouldUseMobileStickyHeader?: boolean;
        collapseQuickLinks?: boolean;
        showQuickLinks?: boolean;
    }>(),
    {
        shellClass: 'bg-crh-slate',
        backgroundClass:
            'bg-[radial-gradient(circle_at_top,_rgba(0,82,155,0.1),_transparent_58%)]',
        expandedBackgroundHeightClass: 'h-[18rem]',
        collapsedBackgroundHeightClass: 'h-[18rem]',
        expandedTopPaddingClass: 'pt-6',
        collapsedTopPaddingClass: 'pt-6',
        isHeaderCollapsed: false,
        shouldUseMobileStickyHeader: false,
        collapseQuickLinks: true,
        showQuickLinks: true
    }
);
</script>
