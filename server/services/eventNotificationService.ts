import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import {
    filterDailyRoutesByStartAt,
    listDailyRoutesByTargetsAtServiceDate,
    mergeDailyRouteRowStatuses
} from '~/server/services/emuRoutesStore';
import type { ProbeTrackingMutation } from '~/server/services/probeTrackingMutations';
import { isConfirmed } from '~/server/utils/emuRouteStatus';
import {
    listUserIdsSubscribedToTarget,
    upsertUserEventSubscription
} from '~/server/services/userEventSubscriptionStore';
import { sendPushNotificationToUser } from '~/server/services/pushNotificationService';
import { buildEmuStatusUpdatedNotification } from '~/server/utils/notifications/templates/emuStatusUpdated';
import { buildFeedbackReplyNotification } from '~/server/utils/notifications/templates/feedbackReply';
import {
    buildFeedbackHiddenNotification,
    buildFeedbackStatusUpdatedNotification
} from '~/server/utils/notifications/templates/feedbackTopicUpdated';
import { buildTrainStatusUpdatedNotification } from '~/server/utils/notifications/templates/trainStatusUpdated';
import type { TrainCodeParts } from '~/server/utils/12306/trainCode';
import type { EmuId } from '~/server/libs/database/emu';
import type { DailyEmuRouteRow } from '~/server/services/emuRoutesStore';
import {
    formatExternalEmuCode,
    formatExternalTrainCode
} from '~/server/utils/internal/boundaries';
import type { FeedbackStatus, FeedbackVisibility } from '~/types/feedback';
import type { NotificationPayload } from '~/types/notifications';
import type { AuthEventTarget } from '~/server/types/authTargets';
import { unixSecondsToServiceDay } from '~/server/utils/date/serviceDay';

export interface LookupStatusNotificationCandidate {
    targetType: 'train' | 'emu';
    targetId: TrainCodeParts | EmuId;
    startAt: number;
    previousStatus: number;
    nextStatus: number;
    routeRows: DailyEmuRouteRow[];
}

export interface LookupStatusNotificationSnapshot {
    candidates: Array<
        Omit<LookupStatusNotificationCandidate, 'nextStatus' | 'routeRows'>
    >;
    rows: DailyEmuRouteRow[];
}

interface FeedbackAccessTarget {
    creatorUserId: string | null;
    visibility: FeedbackVisibility;
    deletedAt: number | null;
}

interface PreparedLookupStatusNotificationCandidate {
    candidate: LookupStatusNotificationCandidate;
    routeRows: DailyEmuRouteRow[];
}

const logger = getLogger('event-notification');

function buildLookupStatusNotificationPayload(
    candidate: LookupStatusNotificationCandidate,
    routeRows: DailyEmuRouteRow[]
): NotificationPayload {
    if (candidate.targetType === 'train') {
        const targetId = candidate.targetId as TrainCodeParts;
        return buildTrainStatusUpdatedNotification(
            formatExternalTrainCode(targetId),
            candidate.startAt,
            routeRows.map((row) => formatExternalEmuCode(row.emu_id))
        );
    }

    const targetId = candidate.targetId as EmuId;
    return buildEmuStatusUpdatedNotification(
        formatExternalEmuCode(targetId),
        candidate.startAt,
        routeRows.map((row) => formatExternalTrainCode(row.train_code))
    );
}

function shouldNotifyLookupStatusChange(
    previousStatus: number,
    nextStatus: number
) {
    return previousStatus !== nextStatus && isConfirmed(nextStatus);
}

function getLookupCandidateRouteRows(
    rows: DailyEmuRouteRow[],
    candidate: Pick<
        LookupStatusNotificationCandidate,
        'targetType' | 'targetId' | 'startAt'
    >
): DailyEmuRouteRow[] {
    const targetRows = rows.filter((row) =>
        candidate.targetType === 'train'
            ? formatExternalTrainCode(row.train_code) ===
              formatExternalTrainCode(candidate.targetId as TrainCodeParts)
            : Number(row.emu_id) === Number(candidate.targetId as EmuId)
    );
    return filterDailyRoutesByStartAt(targetRows, candidate.startAt);
}

function getLookupCandidateTargetKey(
    candidate: Pick<
        LookupStatusNotificationCandidate,
        'targetType' | 'targetId'
    >
): string {
    return `${candidate.targetType}:${candidate.targetType === 'train' ? formatExternalTrainCode(candidate.targetId as TrainCodeParts) : Number(candidate.targetId as EmuId)}`;
}

export function captureLookupStatusNotificationSnapshot(
    trainCodes: TrainCodeParts[],
    emuIds: EmuId[],
    startAt: number
): LookupStatusNotificationSnapshot {
    const rows = listDailyRoutesByTargetsAtServiceDate(
        trainCodes,
        emuIds,
        unixSecondsToServiceDay(startAt)
    );
    const candidates: LookupStatusNotificationSnapshot['candidates'] = [];
    const seenTrainCodes = new Set<string>();
    for (const trainCode of trainCodes) {
        const key = formatExternalTrainCode(trainCode);
        if (seenTrainCodes.has(key)) {
            continue;
        }
        seenTrainCodes.add(key);
        const targetRows = getLookupCandidateRouteRows(rows, {
            targetType: 'train',
            targetId: trainCode,
            startAt
        });
        candidates.push({
            targetType: 'train',
            targetId: trainCode,
            startAt,
            previousStatus: mergeDailyRouteRowStatuses(
                targetRows,
                `train:${formatExternalTrainCode(trainCode)}`,
                startAt
            )
        });
    }

    const seenEmuIds = new Set<number>();
    for (const emuId of emuIds) {
        const key = Number(emuId);
        if (seenEmuIds.has(key)) {
            continue;
        }
        seenEmuIds.add(key);
        const targetRows = getLookupCandidateRouteRows(rows, {
            targetType: 'emu',
            targetId: emuId,
            startAt
        });
        candidates.push({
            targetType: 'emu',
            targetId: emuId,
            startAt,
            previousStatus: mergeDailyRouteRowStatuses(
                targetRows,
                `emu:${key}`,
                startAt
            )
        });
    }

    return { candidates, rows };
}

export function resolveLookupStatusNotificationCandidates(
    snapshot: LookupStatusNotificationSnapshot,
    mutations: ProbeTrackingMutation[]
): LookupStatusNotificationCandidate[] {
    const rowsById = new Map(snapshot.rows.map((row) => [row.id, row]));
    for (const mutation of mutations) {
        if (mutation.id === null) {
            continue;
        }
        if (mutation.nextStatus === null) {
            rowsById.delete(mutation.id);
            continue;
        }

        const existing = rowsById.get(mutation.id);
        rowsById.set(mutation.id, {
            id: mutation.id,
            train_code: mutation.trainCode,
            emu_id: mutation.emuId,
            service_date: mutation.serviceDate,
            timetable_id: mutation.timetableId,
            status: mutation.nextStatus,
            start_station_name: existing?.start_station_name ?? '',
            end_station_name: existing?.end_station_name ?? '',
            start_at:
                mutation.timetableId === null
                    ? 0
                    : (mutation.startAt ?? existing?.start_at ?? 0),
            end_at: existing?.end_at ?? 0
        });
    }

    const rows = Array.from(rowsById.values());
    return snapshot.candidates.map((candidate) => {
        const routeRows = getLookupCandidateRouteRows(rows, candidate);
        return {
            ...candidate,
            nextStatus: mergeDailyRouteRowStatuses(
                routeRows,
                getLookupCandidateTargetKey(candidate),
                candidate.startAt
            ),
            routeRows
        };
    });
}

function buildLookupServiceInstanceKey(
    candidate: LookupStatusNotificationCandidate,
    routeRows: DailyEmuRouteRow[]
): string {
    if (candidate.targetType === 'emu') {
        return `emu:${Number(candidate.targetId)}:${candidate.startAt}:${candidate.nextStatus}`;
    }

    const targetId = candidate.targetId as TrainCodeParts;
    if (routeRows.length === 0) {
        return `train:${formatExternalTrainCode(targetId)}:${candidate.startAt}:${candidate.nextStatus}`;
    }

    const routeIdentity = routeRows
        .map(
            (row) =>
                `${Number(row.service_date)}:${row.timetable_id ?? 'unresolved'}:${Number(row.emu_id)}`
        )
        .sort()
        .join(',');
    return `train-service:${candidate.startAt}:${routeIdentity}:${candidate.nextStatus}`;
}

async function sendLookupNotificationGroup(
    candidates: PreparedLookupStatusNotificationCandidate[]
) {
    const candidateByUserId = new Map<
        string,
        PreparedLookupStatusNotificationCandidate
    >();
    const payloadByCandidate = new Map<
        PreparedLookupStatusNotificationCandidate,
        NotificationPayload
    >();
    for (const preparedCandidate of candidates) {
        const candidate = preparedCandidate.candidate;
        const target: AuthEventTarget =
            candidate.targetType === 'train'
                ? {
                      kind: 'train',
                      trainCode: candidate.targetId as TrainCodeParts
                  }
                : { kind: 'emu', emuId: candidate.targetId as EmuId };
        for (const userId of listUserIdsSubscribedToTarget(target)) {
            if (!candidateByUserId.has(userId)) {
                candidateByUserId.set(userId, preparedCandidate);
            }
        }
    }

    await Promise.all(
        Array.from(candidateByUserId, async ([userId, preparedCandidate]) => {
            const candidate = preparedCandidate.candidate;
            try {
                let payload = payloadByCandidate.get(preparedCandidate);
                if (!payload) {
                    payload = buildLookupStatusNotificationPayload(
                        candidate,
                        preparedCandidate.routeRows
                    );
                    payloadByCandidate.set(preparedCandidate, payload);
                }
                await sendPushNotificationToUser(userId, payload);
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                logger.error(
                    `event_notification_send_failed userId=${userId} targetKind=${candidate.targetType} targetKey=${candidate.targetType === 'train' ? formatExternalTrainCode(candidate.targetId as TrainCodeParts) : formatExternalEmuCode(candidate.targetId as EmuId)} message=${message}`
                );
            }
        })
    );
}

function canReceiveFeedbackNotification(
    userId: string,
    target: FeedbackAccessTarget
) {
    const isAdmin = useConfig().user.adminUserIds.includes(userId);
    if (target.deletedAt !== null) {
        return isAdmin;
    }

    if (target.visibility === 'public') {
        return true;
    }

    return isAdmin || target.creatorUserId === userId;
}

async function sendNotificationToTargetSubscribers(
    target: AuthEventTarget,
    payload: NotificationPayload,
    options: {
        excludeUserIds?: string[];
        canReceiveUserId?: (userId: string) => boolean;
    } = {}
) {
    const excludedUserIds = new Set(options.excludeUserIds ?? []);
    const userIds = Array.from(
        new Set(listUserIdsSubscribedToTarget(target))
    ).filter((userId) => {
        if (excludedUserIds.has(userId)) {
            return false;
        }

        return options.canReceiveUserId
            ? options.canReceiveUserId(userId)
            : true;
    });

    if (userIds.length === 0) {
        return;
    }

    await Promise.all(
        userIds.map(async (userId) => {
            try {
                await sendPushNotificationToUser(userId, payload);
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                logger.error(
                    `event_notification_send_failed userId=${userId} targetKind=${target.kind} targetKey=${target.kind === 'train' ? formatExternalTrainCode(target.trainCode) : target.kind === 'emu' ? formatExternalEmuCode(target.emuId) : String(target.topicId)} message=${message}`
                );
            }
        })
    );
}

export async function notifyLookupStatusChanges(
    candidates: LookupStatusNotificationCandidate[]
) {
    const groupedCandidates = new Map<
        string,
        PreparedLookupStatusNotificationCandidate[]
    >();

    for (const candidate of candidates) {
        if (
            !shouldNotifyLookupStatusChange(
                candidate.previousStatus,
                candidate.nextStatus
            )
        ) {
            continue;
        }

        const key = buildLookupServiceInstanceKey(
            candidate,
            candidate.routeRows
        );
        const group = groupedCandidates.get(key) ?? [];
        group.push({ candidate, routeRows: candidate.routeRows });
        groupedCandidates.set(key, group);
    }

    await Promise.all(
        Array.from(groupedCandidates.values(), sendLookupNotificationGroup)
    );
}

export function autoSubscribeFeedbackTopic(userId: string, topicId: number) {
    try {
        upsertUserEventSubscription(userId, { kind: 'feedback', topicId });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(
            `feedback_auto_subscribe_failed userId=${userId} topicId=${topicId} message=${message}`
        );
    }
}

export async function notifyFeedbackReply(
    topicId: number,
    topicTitle: string,
    authorName: string,
    authorUserId: string | null,
    messageId: number,
    accessTarget: FeedbackAccessTarget
) {
    await sendNotificationToTargetSubscribers(
        { kind: 'feedback', topicId },
        buildFeedbackReplyNotification(
            topicId,
            topicTitle,
            authorName,
            messageId
        ),
        {
            excludeUserIds: authorUserId ? [authorUserId] : [],
            canReceiveUserId: (userId) =>
                canReceiveFeedbackNotification(userId, accessTarget)
        }
    );
}

export async function notifyFeedbackStatusUpdated(
    topicId: number,
    topicTitle: string,
    status: FeedbackStatus,
    accessTarget: FeedbackAccessTarget
) {
    await sendNotificationToTargetSubscribers(
        { kind: 'feedback', topicId },
        buildFeedbackStatusUpdatedNotification(topicId, topicTitle, status),
        {
            canReceiveUserId: (userId) =>
                canReceiveFeedbackNotification(userId, accessTarget)
        }
    );
}

export async function notifyFeedbackHidden(
    topicId: number,
    topicTitle: string,
    accessTarget: FeedbackAccessTarget
) {
    await sendNotificationToTargetSubscribers(
        { kind: 'feedback', topicId },
        buildFeedbackHiddenNotification(topicId, topicTitle),
        {
            canReceiveUserId: (userId) =>
                canReceiveFeedbackNotification(userId, accessTarget)
        }
    );
}
