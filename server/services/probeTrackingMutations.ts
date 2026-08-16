import { useEmuDatabase } from '~/server/libs/database/emu';
import {
    invalidateCachedDailyRoutesByEmuCodes,
    listDailyRoutesLightByTrainCodesAtServiceDate,
    patchCachedDailyRouteRows,
    upsertDailyEmuRouteWithResolvedIdentityAndFullStatus,
    type DailyEmuRouteLightRow,
    type DailyEmuRouteRow
} from '~/server/services/emuRoutesStore';
import {
    trainCodeKey,
    type TrainCodeParts
} from '~/server/utils/12306/trainCode';
import {
    unixSecondsToServiceDay,
    type ServiceDay
} from '~/server/utils/date/serviceDay';
import type { EmuId } from '~/server/libs/database/emu';
import {
    resolveTimetableIdentityLink,
    type TimetableIdentityLink
} from '~/server/services/historicalTimetableResolver';

export type ProbeTrackingMutationTable = 'daily_emu_routes';

export type ProbeTrackingMutationAction =
    | 'created'
    | 'updated'
    | 'deleted'
    | 'unchanged'
    | 'cleared'
    | 'downgraded';

export interface ProbeTrackingMutation {
    table: ProbeTrackingMutationTable;
    action: ProbeTrackingMutationAction;
    id: number | null;
    trainCode: TrainCodeParts;
    emuId: EmuId;
    serviceDate: ServiceDay;
    timetableId: number | null;
    startAt: number | null;
    previousStatus: number | null;
    nextStatus: number | null;
    rowCount: number;
}

export interface PersistTrackingRowsInput {
    trainCodes: TrainCodeParts[];
    emuIds: EmuId[];
    startStation: string;
    endStation: string;
    startAt: number;
    endAt: number;
    statusByEmu: Map<EmuId, number>;
    beforePersist?: () => void;
    afterPersist?: () => void;
}

function getServiceDate(startAt: number): ServiceDay {
    return unixSecondsToServiceDay(startAt);
}

function buildRouteIdentityKey(
    trainCode: TrainCodeParts,
    emuId: EmuId,
    serviceDate: ServiceDay,
    timetableId: number | null
): string {
    return `${trainCodeKey(trainCode)}:${Number(emuId)}:${serviceDate}:${timetableId ?? 'null'}`;
}

function indexRowsByIdentity(
    rows: readonly DailyEmuRouteLightRow[]
): Map<string, DailyEmuRouteLightRow> {
    return new Map(
        rows.map((row) => [
            buildRouteIdentityKey(
                row.train_code,
                row.emu_id,
                row.service_date,
                row.timetable_id
            ),
            row
        ])
    );
}

function findIndexedRouteByIdentity(
    rowsByIdentity: ReadonlyMap<string, DailyEmuRouteLightRow>,
    trainCode: TrainCodeParts,
    emuId: EmuId,
    identityLink: TimetableIdentityLink
): DailyEmuRouteLightRow | null {
    const exact = rowsByIdentity.get(
        buildRouteIdentityKey(
            trainCode,
            emuId,
            identityLink.serviceDate,
            identityLink.timetableId
        )
    );
    if (exact || identityLink.timetableId === null) {
        return exact ?? null;
    }

    return (
        rowsByIdentity.get(
            buildRouteIdentityKey(
                trainCode,
                emuId,
                identityLink.serviceDate,
                null
            )
        ) ?? null
    );
}

function replaceIndexedRoute(
    rowsByIdentity: Map<string, DailyEmuRouteLightRow>,
    trainCode: TrainCodeParts,
    emuId: EmuId,
    identityLink: TimetableIdentityLink,
    existing: DailyEmuRouteLightRow | null,
    id: number,
    status: number
): void {
    if (existing) {
        rowsByIdentity.delete(
            buildRouteIdentityKey(
                existing.train_code,
                existing.emu_id,
                existing.service_date,
                existing.timetable_id
            )
        );
    }

    const nextRow: DailyEmuRouteLightRow = {
        id,
        train_code: trainCode,
        emu_id: emuId,
        service_date: identityLink.serviceDate,
        timetable_id: identityLink.timetableId,
        status
    };
    rowsByIdentity.set(
        buildRouteIdentityKey(
            trainCode,
            emuId,
            identityLink.serviceDate,
            identityLink.timetableId
        ),
        nextRow
    );
}

export function persistProbeTrackingRows(
    input: PersistTrackingRowsInput
): ProbeTrackingMutation[] {
    const mutations: ProbeTrackingMutation[] = [];
    const serviceDate = getServiceDate(input.startAt);

    const transaction = useEmuDatabase().transaction(() => {
        const previousRows = listDailyRoutesLightByTrainCodesAtServiceDate(
            input.trainCodes,
            serviceDate
        );
        const previousRowsById = new Map(
            previousRows.map((row) => [row.id, row] as const)
        );

        input.beforePersist?.();

        const currentRows = input.beforePersist
            ? listDailyRoutesLightByTrainCodesAtServiceDate(
                  input.trainCodes,
                  serviceDate
              )
            : previousRows;
        const currentRowsByIdentity = indexRowsByIdentity(currentRows);
        const identityLinksByTrainCode = new Map<
            string,
            TimetableIdentityLink
        >();
        for (const trainCode of input.trainCodes) {
            const key = trainCodeKey(trainCode);
            if (!identityLinksByTrainCode.has(key)) {
                identityLinksByTrainCode.set(
                    key,
                    resolveTimetableIdentityLink(trainCode, input.startAt)
                );
            }
        }

        for (const trainCode of input.trainCodes) {
            const identityLink = identityLinksByTrainCode.get(
                trainCodeKey(trainCode)
            )!;
            for (const emuId of input.emuIds) {
                const status = input.statusByEmu.get(emuId);
                if (status === undefined) {
                    throw new Error(`missing_status_by_emu emuId=${emuId}`);
                }
                const existing = findIndexedRouteByIdentity(
                    currentRowsByIdentity,
                    trainCode,
                    emuId,
                    identityLink
                );
                const upsertResult =
                    upsertDailyEmuRouteWithResolvedIdentityAndFullStatus(
                        trainCode,
                        emuId,
                        identityLink.serviceDate,
                        identityLink.timetableId,
                        status,
                        existing
                    );
                replaceIndexedRoute(
                    currentRowsByIdentity,
                    trainCode,
                    emuId,
                    identityLink,
                    existing,
                    upsertResult.id,
                    upsertResult.nextStatus
                );
                const previousRouteRow =
                    previousRowsById.get(upsertResult.id) ?? null;
                const previousStatus =
                    previousRouteRow?.status ?? upsertResult.previousStatus;
                const action =
                    previousStatus === null
                        ? 'created'
                        : previousStatus === upsertResult.nextStatus
                          ? 'unchanged'
                          : 'updated';
                mutations.push({
                    table: 'daily_emu_routes',
                    action,
                    id: upsertResult.id,
                    trainCode,
                    emuId,
                    serviceDate,
                    timetableId: upsertResult.timetableId,
                    startAt: input.startAt,
                    previousStatus,
                    nextStatus: upsertResult.nextStatus,
                    rowCount: 1
                });
            }
        }

        input.afterPersist?.();
    });

    try {
        transaction();
    } catch (error) {
        invalidateCachedDailyRoutesByEmuCodes(input.emuIds);
        throw error;
    }

    patchCachedDailyRouteRows(
        mutations.flatMap<DailyEmuRouteRow>((mutation) => {
            if (mutation.id === null || mutation.nextStatus === null) {
                return [];
            }
            return [
                {
                    id: mutation.id,
                    train_code: mutation.trainCode,
                    emu_id: mutation.emuId,
                    service_date: mutation.serviceDate,
                    timetable_id: mutation.timetableId,
                    status: mutation.nextStatus,
                    start_station_name: input.startStation,
                    end_station_name: input.endStation,
                    start_at: input.startAt,
                    end_at: input.endAt
                }
            ];
        })
    );
    return mutations;
}
