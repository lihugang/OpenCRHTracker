<template>
    <Teleport to="body">
        <Transition
            enter-active-class="transition duration-200 ease-out"
            enter-from-class="opacity-0"
            enter-to-class="opacity-100"
            leave-active-class="transition duration-180 ease-out"
            leave-from-class="opacity-100"
            leave-to-class="opacity-0">
            <div
                v-if="isOpen"
                class="fixed inset-0 z-[100] backdrop-blur-md"
                @click="emit('close')" />
        </Transition>

        <Transition
            enter-active-class="transition duration-220 ease-out"
            enter-from-class="translate-y-2 opacity-0 motion-reduce:translate-y-0"
            enter-to-class="translate-y-0 opacity-100"
            leave-active-class="transition duration-180 ease-out"
            leave-from-class="translate-y-0 opacity-100"
            leave-to-class="translate-y-1 opacity-0 motion-reduce:translate-y-0">
            <div
                v-if="isOpen"
                class="fixed inset-0 z-[101]">
                <button
                    type="button"
                    class="absolute right-4 top-4 z-[2] inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl text-white backdrop-blur-sm transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35 sm:right-6 sm:top-6"
                    aria-label="关闭运行图预览"
                    @click="emit('close')">
                    ×
                </button>

                <div
                    class="relative h-full w-full p-4 sm:p-6"
                    @click.self="emit('close')">
                    <div
                        :ref="setFullscreenCanvasContainer"
                        class="relative flex h-full w-full items-center justify-center overflow-hidden touch-none">
                        <div
                            :ref="setFullscreenViewport"
                            class="relative overflow-hidden bg-white shadow-[0_30px_80px_-48px_rgba(15,23,42,0.75)]"
                            :style="viewportStyle"
                            @wheel.prevent="handleWheel"
                            @mousedown="handleMouseDown"
                            @touchstart="handleTouchStart"
                            @touchmove="handleTouchMove"
                            @touchend="handleTouchEnd"
                            @touchcancel="handleTouchEnd">
                            <div
                                v-if="
                                    previewState === 'loading' ||
                                    fullscreenState === 'loading'
                                "
                                class="absolute inset-0 z-[1] animate-pulse bg-slate-100/80" />

                            <canvas
                                :ref="setFullscreenCanvas"
                                class="absolute inset-0 block" />
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import type { ComponentPublicInstance, StyleValue } from 'vue';
import type { CirculationPdfState } from '~/types/lookupCurrentTimetable';

defineProps<{
    isOpen: boolean;
    previewState: CirculationPdfState;
    fullscreenState: CirculationPdfState;
    viewportStyle: StyleValue;
    setFullscreenCanvasContainer: (
        element: Element | ComponentPublicInstance | null
    ) => void;
    setFullscreenViewport: (
        element: Element | ComponentPublicInstance | null
    ) => void;
    setFullscreenCanvas: (
        element: Element | ComponentPublicInstance | null
    ) => void;
    handleWheel: (event: WheelEvent) => void;
    handleMouseDown: (event: MouseEvent) => void;
    handleTouchStart: (event: TouchEvent) => void;
    handleTouchMove: (event: TouchEvent) => void;
    handleTouchEnd: (event: TouchEvent) => void;
}>();

const emit = defineEmits<{
    close: [];
}>();
</script>
