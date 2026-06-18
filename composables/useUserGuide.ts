import { nextTick } from 'vue';
import type { RouteLocationNormalizedLoaded } from 'vue-router';

type Driver = import('driver.js').Driver;
type DriveStep = import('driver.js').DriveStep;

type UserGuideStage =
    | 'idle'
    | 'home'
    | 'train-detail'
    | 'current-timetable'
    | 'future-prediction'
    | 'emu-search'
    | 'emu-allocation'
    | 'done';

type WaitForElementOptions = {
    timeoutMs?: number;
    visible?: boolean;
};
type GuideTarget = string | HTMLElement;

const GUIDE_SEEN_STORAGE_KEY = 'opencrhtracker:user-guide:site:v1';
const GUIDE_PENDING_STORAGE_KEY = 'opencrhtracker:user-guide:pending:v1';
const GUIDE_STAGE_CHANGE_EVENT = 'opencrhtracker:user-guide-stage-change';
const GUIDE_SAMPLE_TRAIN_CODE = 'G1';
const GUIDE_SAMPLE_EMU_CODE = 'CRH380AL-2541';
const DEFAULT_WAIT_TIMEOUT_MS = 12000;
const GUIDE_REFRESH_DELAY_MS = 180;

let guideDriver: Driver | null = null;
let markedSeenInSession = false;
let activeStage: UserGuideStage = 'idle';
let refreshTimer: number | null = null;
let hasGuideRefreshListeners = false;
let fallbackGuideElement: HTMLElement | null = null;

function getClientWindow() {
    if (!import.meta.client) {
        return null;
    }

    return window;
}

function readStorage(key: string) {
    const clientWindow = getClientWindow();
    if (!clientWindow) {
        return null;
    }

    try {
        return clientWindow.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeStorage(key: string, value: string) {
    const clientWindow = getClientWindow();
    if (!clientWindow) {
        return;
    }

    try {
        clientWindow.localStorage.setItem(key, value);
    } catch {
        // Keep the in-memory guide flow moving if storage is unavailable.
    }
}

function removeStorage(key: string) {
    const clientWindow = getClientWindow();
    if (!clientWindow) {
        return;
    }

    try {
        clientWindow.localStorage.removeItem(key);
    } catch {
        // Ignore storage cleanup failures.
    }
}

function getElement(selector: string, visible = true) {
    if (!visible) {
        return document.querySelector<HTMLElement>(selector);
    }

    return findVisibleElement(selector);
}

function findVisibleElement(selector: string) {
    const elements = Array.from(
        document.querySelectorAll<HTMLElement>(selector)
    );

    return elements.find((element) => isElementVisible(element)) ?? null;
}

function isElementVisible(element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
        return false;
    }

    let current: HTMLElement | null = element;
    while (current && current !== document.body) {
        const style = window.getComputedStyle(current);
        if (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            style.contentVisibility === 'hidden' ||
            Number.parseFloat(style.opacity || '1') === 0
        ) {
            return false;
        }

        current = current.parentElement;
    }

    return true;
}

function scrollGuideTargetIntoView(element: HTMLElement) {
    element.scrollIntoView({
        block: 'center',
        inline: 'nearest',
        behavior: 'instant'
    });
}

function prepareGuideElement(element: HTMLElement) {
    scrollGuideTargetIntoView(element);
}

function resolveGuideTarget(target: GuideTarget) {
    const element =
        typeof target === 'string' ? getElement(target) : target;
    if (!element) {
        return getFallbackGuideElement();
    }

    prepareGuideElement(element);
    return element;
}

function getFallbackGuideElement() {
    if (fallbackGuideElement) {
        return fallbackGuideElement;
    }

    fallbackGuideElement = document.createElement('span');
    fallbackGuideElement.setAttribute('aria-hidden', 'true');
    fallbackGuideElement.style.position = 'fixed';
    fallbackGuideElement.style.left = '50%';
    fallbackGuideElement.style.top = '50%';
    fallbackGuideElement.style.width = '1px';
    fallbackGuideElement.style.height = '1px';
    fallbackGuideElement.style.pointerEvents = 'none';
    fallbackGuideElement.style.opacity = '0';
    document.body.appendChild(fallbackGuideElement);
    return fallbackGuideElement;
}

function removeFallbackGuideElement() {
    fallbackGuideElement?.remove();
    fallbackGuideElement = null;
}

function createGuideStep(
    target: GuideTarget,
    step: Omit<DriveStep, 'element'>
): DriveStep {
    return {
        ...step,
        element: () => resolveGuideTarget(target)
    };
}

function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function waitForAnimationFrame() {
    return new Promise((resolve) => window.requestAnimationFrame(resolve));
}

async function waitForElement(
    selector: string,
    options: WaitForElementOptions = {}
) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
    const visible = options.visible ?? true;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        const element = getElement(selector, visible);
        if (element) {
            if (visible) {
                prepareGuideElement(element);
                await nextTick();
                await waitForAnimationFrame();
            }

            return element;
        }

        await wait(160);
    }

    return null;
}

function isRouteTrainSample(route: RouteLocationNormalizedLoaded) {
    return (
        route.path.toLowerCase() ===
        `/train/${GUIDE_SAMPLE_TRAIN_CODE.toLowerCase()}`
    );
}

function isRouteEmuSample(route: RouteLocationNormalizedLoaded) {
    return (
        route.path.toLowerCase() ===
        `/emu/${GUIDE_SAMPLE_EMU_CODE.toLowerCase()}`
    );
}

function configureSteps(driver: Driver, steps: DriveStep[]) {
    driver.setSteps(steps);
    driver.drive(0);
}

function scheduleGuideRefresh() {
    const clientWindow = getClientWindow();
    if (!clientWindow || !guideDriver?.isActive()) {
        return;
    }

    if (refreshTimer !== null) {
        clientWindow.clearTimeout(refreshTimer);
    }

    refreshTimer = clientWindow.setTimeout(() => {
        refreshTimer = null;

        const activeIndex = guideDriver?.getActiveIndex();
        if (typeof activeIndex === 'number') {
            guideDriver?.drive(activeIndex);
            return;
        }

        guideDriver?.refresh();
    }, GUIDE_REFRESH_DELAY_MS);
}

function addGuideRefreshListeners() {
    const clientWindow = getClientWindow();
    if (!clientWindow || hasGuideRefreshListeners) {
        return;
    }

    clientWindow.addEventListener('resize', scheduleGuideRefresh, {
        passive: true
    });
    clientWindow.addEventListener('orientationchange', scheduleGuideRefresh);
    hasGuideRefreshListeners = true;
}

function removeGuideRefreshListeners() {
    const clientWindow = getClientWindow();
    if (!clientWindow || !hasGuideRefreshListeners) {
        return;
    }

    clientWindow.removeEventListener('resize', scheduleGuideRefresh);
    clientWindow.removeEventListener('orientationchange', scheduleGuideRefresh);

    if (refreshTimer !== null) {
        clientWindow.clearTimeout(refreshTimer);
        refreshTimer = null;
    }

    hasGuideRefreshListeners = false;
    removeFallbackGuideElement();
}

async function createGuideDriver() {
    if (guideDriver) {
        guideDriver.destroy();
        guideDriver = null;
    }

    const [{ driver }] = await Promise.all([
        import('driver.js'),
        import('driver.js/dist/driver.css')
    ]);

    guideDriver = driver({
        animate: true,
        allowClose: true,
        overlayColor: '#0f172a',
        overlayClickBehavior: () => {},
        overlayOpacity: 0.44,
        popoverOffset: 12,
        stagePadding: 8,
        stageRadius: 12,
        showButtons: ['next', 'previous', 'close'],
        showProgress: true,
        nextBtnText: '下一步',
        prevBtnText: '上一步',
        doneBtnText: '完成',
        popoverClass: 'opencrh-user-guide-popover',
        onCloseClick: () => {
            finishGuide();
        },
        onDestroyed: () => {
            removeGuideRefreshListeners();
            guideDriver = null;
        }
    });
    addGuideRefreshListeners();

    return guideDriver;
}

function finishGuide() {
    markGuideSeen();
    activeStage = 'done';
    setGuideStage('done');
    clearPendingGuide();

    if (guideDriver) {
        const currentDriver = guideDriver;
        guideDriver = null;
        currentDriver.destroy();
    }
    removeGuideRefreshListeners();
}

function destroyCurrentGuideDriver() {
    if (!guideDriver) {
        removeGuideRefreshListeners();
        return;
    }

    const currentDriver = guideDriver;
    guideDriver = null;
    currentDriver.destroy();
    removeGuideRefreshListeners();
}

function setGuideStage(stage: UserGuideStage) {
    const clientWindow = getClientWindow();
    if (!clientWindow) {
        return;
    }

    if (stage === 'idle' || stage === 'done') {
        removeStorage(GUIDE_PENDING_STORAGE_KEY);
        dispatchGuideStageChange(stage);
        return;
    }

    writeStorage(
        GUIDE_PENDING_STORAGE_KEY,
        JSON.stringify({
            stage,
            updatedAt: Date.now()
        })
    );
    dispatchGuideStageChange(stage);
}

function dispatchGuideStageChange(stage: UserGuideStage) {
    const clientWindow = getClientWindow();
    if (!clientWindow) {
        return;
    }

    clientWindow.dispatchEvent(
        new CustomEvent(GUIDE_STAGE_CHANGE_EVENT, {
            detail: {
                stage
            }
        })
    );
}

function readGuideStage(): UserGuideStage {
    const rawValue = readStorage(GUIDE_PENDING_STORAGE_KEY);
    if (!rawValue) {
        return 'idle';
    }

    try {
        const parsed = JSON.parse(rawValue);
        if (
            typeof parsed === 'object' &&
            parsed !== null &&
            typeof parsed.stage === 'string' &&
            [
                'home',
                'train-detail',
                'current-timetable',
                'future-prediction',
                'emu-search',
                'emu-allocation'
            ].includes(parsed.stage)
        ) {
            return parsed.stage as UserGuideStage;
        }
    } catch {
        return 'idle';
    }

    return 'idle';
}

function clearPendingGuide() {
    removeStorage(GUIDE_PENDING_STORAGE_KEY);
}

function markGuideSeen() {
    if (markedSeenInSession && hasSeenGuide()) {
        return;
    }

    markedSeenInSession = true;
    writeStorage(
        GUIDE_SEEN_STORAGE_KEY,
        JSON.stringify({
            version: 1,
            seenAt: Date.now()
        })
    );
}

function hasSeenGuide() {
    return readStorage(GUIDE_SEEN_STORAGE_KEY) !== null;
}

function setInputValue(element: HTMLInputElement, value: string) {
    const descriptor = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
    );
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
}

function clickElement(selector: string) {
    const element = getElement(selector);
    if (!element) {
        return false;
    }

    prepareGuideElement(element);
    element.click();
    return true;
}

function closeLatestModal() {
    const closeButtons = Array.from(
        document.querySelectorAll<HTMLButtonElement>('[aria-label="关闭弹窗"]')
    );
    closeButtons.at(-1)?.click();
}

async function startHomeGuide() {
    if (!import.meta.client) {
        return;
    }

    activeStage = 'home';
    setGuideStage('home');
    const driver = await createGuideDriver();
    const inputElement = await waitForElement('[data-guide="home-lookup-input"]');
    const submitElement = await waitForElement(
        '[data-guide="home-lookup-submit"]'
    );

    if (!(inputElement instanceof HTMLInputElement) || !submitElement) {
        finishGuide();
        return;
    }

    setInputValue(inputElement, GUIDE_SAMPLE_TRAIN_CODE);
    await nextTick();

    configureSteps(driver, [
        createGuideStep('[data-guide="home-lookup-input"]', {
            popover: {
                title: '输入车次号',
                description:
                    '我们先用 G1 次列车作为示例。此处输入框也可以输入车组号和车站名称。',
                side: 'bottom',
                align: 'center'
            }
        }),
        createGuideStep('[data-guide="home-lookup-submit"]', {
            popover: {
                title: '开始查询',
                description:
                    '点击查询按钮',
                side: 'top',
                align: 'center',
                onNextClick: () => {
                    activeStage = 'idle';
                    setGuideStage('train-detail');
                    clickElement('[data-guide="home-lookup-submit"]');
                }
            }
        })
    ]);
}

function abortGuideWithSeen() {
    finishGuide();
}

async function startTrainDetailGuide(options: {
    route: RouteLocationNormalizedLoaded;
    state: string;
    itemCount: number;
    openTimetable: () => void;
    openFuturePrediction: () => void;
}) {
    if (!import.meta.client || hasSeenGuide()) {
        return;
    }

    const stage = readGuideStage();
    if (stage !== 'train-detail' || !isRouteTrainSample(options.route)) {
        return;
    }

    if (activeStage === 'train-detail') {
        return;
    }

    if (options.state === 'loading') {
        return;
    }

    activeStage = 'train-detail';

    if (options.state === 'error' || options.itemCount <= 0) {
        const driver = await createGuideDriver();
        configureSteps(driver, [
            {
                popover: {
                    title: '无数据',
                    description:
                        '当前 G1 次列车没有加载出可用于演示的运行记录。'
                }
            }
        ]);
        window.setTimeout(finishGuide, 2800);
        return;
    }

    await nextTick();

    const dateElement = await waitForElement(
        '[data-guide="history-date-export"]'
    );
    const codeElement = await waitForElement('[data-guide="history-code-link"]');
    const stationElement = await waitForElement(
        '[data-guide="history-station-link"]'
    );
    const timeElement = await waitForElement('[data-guide="history-time-button"]');

    if (!dateElement || !codeElement || !stationElement || !timeElement) {
        abortGuideWithSeen();
        return;
    }

    const driver = await createGuideDriver();
    configureSteps(driver, [
        createGuideStep('[data-guide="history-date-export"]', {
            popover: {
                title: '导出当日数据',
                description:
                    '点击日期可进入数据导出页面，可下载某一天记录到的所有列车运行数据。',
                side: 'bottom',
                align: 'start'
            }
        }),
        createGuideStep('[data-guide="history-code-link"]', {
            popover: {
                title: '查看车组担当历史',
                description:
                    '点击车组号可以查看该车组的最近担当记录。',
                side: 'bottom',
                align: 'start'
            }
        }),
        createGuideStep('[data-guide="history-station-link"]', {
            popover: {
                title: '查看车站停靠列车',
                description:
                    '点击车站名称可查看该车站的停靠车次和时刻表。',
                side: 'bottom',
                align: 'start'
            }
        }),
        createGuideStep('[data-guide="history-time-button"]', {
            popover: {
                title: '打开时刻与交路',
                description:
                    '点击时刻，可以查看担当路局、交路表和时刻表。',
                side: 'top',
                align: 'center',
                onNextClick: () => {
                    activeStage = 'idle';
                    setGuideStage('current-timetable');
                    options.openTimetable();
                }
            }
        })
    ]);
}

async function startCurrentTimetableGuide() {
    if (!import.meta.client || hasSeenGuide()) {
        return;
    }

    if (readGuideStage() !== 'current-timetable') {
        return;
    }

    if (activeStage === 'current-timetable') {
        return;
    }

    activeStage = 'current-timetable';

    const timetableElement = await waitForElement(
        '[data-guide="current-timetable-section"]'
    );
    if (!timetableElement) {
        abortGuideWithSeen();
        return;
    }

    const responsibilityElement =
        (await waitForElement('[data-guide="current-responsibility-summary"]', {
            timeoutMs: 1200
        })) ?? timetableElement;
    const circulationElement = await waitForElement(
        '[data-guide="current-circulation-section"]',
        {
            timeoutMs: 1200
        }
    );

    const steps: DriveStep[] = [
        createGuideStep(
            responsibilityElement === timetableElement
                ? '[data-guide="current-timetable-section"]'
                : '[data-guide="current-responsibility-summary"]',
            {
                popover: {
                    title: '担当信息',
                    description:
                        '这里会汇总当前车次、始发终到车站，以及担当路局信息。',
                    side: 'bottom',
                    align: 'center'
                }
            }
        )
    ];

    if (circulationElement) {
        steps.push(
            createGuideStep('[data-guide="current-circulation-section"]', {
                popover: {
                    title: '交路表',
                    description:
                        '交路表可以展示同一组车底前后衔接的运行链路。',
                    side: 'top',
                    align: 'center'
                }
            })
        );
    }

    steps.push(
        createGuideStep('[data-guide="current-timetable-section"]', {
            popover: {
                title: '时刻表',
                description:
                    '可以查看停站、到发时刻、检票口、里程等信息。',
                side: 'top',
                align: 'center',
                onNextClick: () => {
                    activeStage = 'idle';
                    setGuideStage('future-prediction');
                    closeLatestModal();
                }
            }
        })
    );

    const driver = await createGuideDriver();
    configureSteps(driver, steps);
}

async function startFutureAndActionsGuide(options: {
    openFuturePrediction: () => void;
}) {
    if (!import.meta.client || hasSeenGuide()) {
        return;
    }

    if (readGuideStage() !== 'future-prediction') {
        return;
    }

    if (activeStage === 'future-prediction') {
        return;
    }

    activeStage = 'future-prediction';

    const futureElement = await waitForElement(
        '[data-guide="future-prediction-button"]'
    );
    const favoriteElement = await waitForElement('[data-guide="favorite-button"]');
    const subscriptionElement = await waitForElement(
        '[data-guide="subscription-button"]'
    );

    if (!futureElement || !favoriteElement || !subscriptionElement) {
        abortGuideWithSeen();
        return;
    }

    const driver = await createGuideDriver();
    configureSteps(driver, [
        createGuideStep('[data-guide="future-prediction-button"]', {
            popover: {
                title: '未来担当预测',
                description:
                    '这个功能会根据交路表和已有担当记录推测后续可能担当的车组，推测结果仅供参考。',
                side: 'bottom',
                align: 'center',
                onNextClick: () => {
                    options.openFuturePrediction();
                    guideDriver?.moveNext();
                }
            }
        }),
        {
            popover: {
                title: '未来担当预测',
                description: '这个功能会根据交路表和已有担当记录推测后续可能担当的车组，推测结果仅供参考。',
                onNextClick: () => {
                    closeLatestModal();
                    window.setTimeout(() => {
                        guideDriver?.moveNext();
                    }, 220);
                }
            }
        },
        createGuideStep('[data-guide="favorite-button"]', {
            popover: {
                title: '收藏',
                description:
                    '收藏车次、车组和车站，方便快速查询。',
                side: 'bottom',
                align: 'center'
            }
        }),
        createGuideStep('[data-guide="subscription-button"]', {
            popover: {
                title: '订阅',
                description:
                    '当订阅车次有新运行记录时，您将会收到通知。',
                side: 'bottom',
                align: 'center',
                onNextClick: () => {
                    activeStage = 'idle';
                    setGuideStage('emu-search');
                }
            }
        })
    ]);
}

async function startEmuSearchGuide() {
    if (!import.meta.client || hasSeenGuide()) {
        return;
    }

    if (readGuideStage() !== 'emu-search') {
        return;
    }

    if (activeStage === 'emu-search') {
        return;
    }

    activeStage = 'emu-search';

    const inputElement = await waitForElement(
        '[data-guide="detail-lookup-input"]'
    );
    const submitElement = await waitForElement(
        '[data-guide="detail-lookup-submit"]'
    );

    if (!(inputElement instanceof HTMLInputElement) || !submitElement) {
        abortGuideWithSeen();
        return;
    }

    setInputValue(inputElement, GUIDE_SAMPLE_EMU_CODE);
    await nextTick();

    const driver = await createGuideDriver();
    configureSteps(driver, [
        createGuideStep('[data-guide="detail-lookup-input"]', {
            popover: {
                title: '查查车组',
                description:
                    '输入 CRH380AL-2541，看看动车组详情。',
                side: 'bottom',
                align: 'center'
            }
        }),
        createGuideStep('[data-guide="detail-lookup-submit"]', {
            popover: {
                title: '进入车组详情',
                description:
                    '点击重新查询按钮即可开始查询。',
                side: 'top',
                align: 'center',
                onNextClick: () => {
                    activeStage = 'idle';
                    setGuideStage('emu-allocation');
                    clickElement('[data-guide="detail-lookup-submit"]');
                }
            }
        })
    ]);
}

async function startEmuAllocationGuide(options: {
    route: RouteLocationNormalizedLoaded;
    isEmuTarget: boolean;
    openAllocation: () => void;
}) {
    if (!import.meta.client || hasSeenGuide()) {
        return;
    }

    if (
        readGuideStage() !== 'emu-allocation' ||
        !options.isEmuTarget ||
        !isRouteEmuSample(options.route)
    ) {
        return;
    }

    if (activeStage === 'emu-allocation') {
        return;
    }

    activeStage = 'emu-allocation';

    const allocationButton = await waitForElement(
        '[data-guide="allocation-button"]'
    );
    if (!allocationButton) {
        abortGuideWithSeen();
        return;
    }

    const driver = await createGuideDriver();
    configureSteps(driver, [
        createGuideStep('[data-guide="allocation-button"]', {
            popover: {
                title: '查看配属信息',
                description:
                    '车组详情页可以查看该车的配属信息。',
                side: 'bottom',
                align: 'center',
                onNextClick: async () => {
                    destroyCurrentGuideDriver();
                    options.openAllocation();
                    const summaryElement = await waitForElement(
                        '[data-guide="allocation-summary"]',
                        {
                            timeoutMs: 5000
                        }
                    );

                    const driver = await createGuideDriver();

                    if (summaryElement) {
                        configureSteps(driver, [
                            createGuideStep(
                                '[data-guide="allocation-summary"]',
                                {
                                    popover: {
                                        title: '配属信息',
                                        description:
                                            '这里汇总所属路局、动车所、车型、子车型和编组布局。基础使用指引就到此结束啦！如有问题，欢迎您向我们反馈。',
                                        side: 'bottom',
                                        align: 'center',
                                        showButtons: [
                                            'previous',
                                            'next',
                                            'close'
                                        ],
                                        doneBtnText: '完成',
                                        onNextClick: finishGuide
                                    }
                                }
                            )
                        ]);
                        return;
                    }

                    configureSteps(driver, [
                        {
                            popover: {
                                title: '配属信息',
                                description:
                                    '配属信息没有加载成功哦~',
                                showButtons: ['previous', 'next', 'close'],
                                doneBtnText: '完成',
                                onNextClick: finishGuide
                            }
                        }
                    ]);
                }
            }
        })
    ]);
}

export function useUserGuide() {
    return {
        sampleTrainCode: GUIDE_SAMPLE_TRAIN_CODE,
        sampleEmuCode: GUIDE_SAMPLE_EMU_CODE,
        hasSeenGuide,
        markGuideSeen,
        clearPendingGuide,
        finishGuide,
        readGuideStage,
        setGuideStage,
        startHomeGuide,
        startTrainDetailGuide,
        startCurrentTimetableGuide,
        startFutureAndActionsGuide,
        startEmuSearchGuide,
        startEmuAllocationGuide
    };
}
