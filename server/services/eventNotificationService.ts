import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import {
    listProbeStatusByEmuCode,
    listProbeStatusByTrainCode,
    ProbeStatusValue
} from '~/server/services/probeStatusStore';
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
import {
    formatExternalEmuCode,
    formatExternalTrainCode
} from '~/server/utils/internal/boundaries';
import type { FeedbackStatus, FeedbackVisibility } from '~/types/feedback';
import type { NotificationPayload } from '~/types/notifications';
import type { AuthEventTarget } from '~/server/types/authTargets';

interface LookupStatusNotificationCandidate {
    targetType: 'train' | 'emu';
    targetId: TrainCodeParts | EmuId;
    startAt: number;
    previousStatus: number;
    nextStatus: ProbeStatusValue;
}

interface FeedbackAccessTarget {
    creatorUserId: string | null;
    visibility: FeedbackVisibility;
    deletedAt: number | null;
}

const logger = getLogger('event-notification');

function buildLookupStatusNotificationPayload(
    candidate: LookupStatusNotificationCandidate
): NotificationPayload {
    if (candidate.targetType === 'train') {
        const targetId = candidate.targetId as TrainCodeParts;
        return buildTrainStatusUpdatedNotification(
            formatExternalTrainCode(targetId),
            candidate.startAt,
            listProbeStatusByTrainCode(targetId, candidate.startAt).map((row) =>
                formatExternalEmuCode(row.emu_id)
            )
        );
    }

    const targetId = candidate.targetId as EmuId;
    return buildEmuStatusUpdatedNotification(
        formatExternalEmuCode(targetId),
        candidate.startAt,
        listProbeStatusByEmuCode(targetId, candidate.startAt).map((row) =>
            formatExternalTrainCode(row.train_code)
        )
    );
}

function shouldNotifyLookupStatusChange(
    previousStatus: number,
    nextStatus: ProbeStatusValue
) {
    if (
        nextStatus !== ProbeStatusValue.SingleFormationResolved &&
        nextStatus !== ProbeStatusValue.CoupledFormationResolved
    ) {
        return false;
    }

    if (previousStatus < ProbeStatusValue.SingleFormationResolved) {
        return true;
    }

    return (
        previousStatus === ProbeStatusValue.SingleFormationResolved &&
        nextStatus === ProbeStatusValue.CoupledFormationResolved
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
    const uniqueCandidates = new Map<
        string,
        LookupStatusNotificationCandidate
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

        uniqueCandidates.set(
            `${candidate.targetType}:${
                candidate.targetType === 'train'
                    ? formatExternalTrainCode(
                          candidate.targetId as TrainCodeParts
                      )
                    : formatExternalEmuCode(candidate.targetId as EmuId)
            }:${candidate.startAt}:${candidate.nextStatus}`,
            candidate
        );
    }

    await Promise.all(
        Array.from(uniqueCandidates.values()).map(async (candidate) => {
            const payload = buildLookupStatusNotificationPayload(candidate);

            await sendNotificationToTargetSubscribers(
                candidate.targetType === 'train'
                    ? {
                          kind: 'train',
                          trainCode: candidate.targetId as TrainCodeParts
                      }
                    : {
                          kind: 'emu',
                          emuId: candidate.targetId as EmuId
                      },
                payload
            );
        })
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
