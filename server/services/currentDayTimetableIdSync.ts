import { useEmuDatabase, type EmuId } from '~/server/libs/database/emu';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import { listDailyRoutesByTrainCodeInRange } from '~/server/services/emuRoutesStore';
import { resolveTimetableIdByTrainCodeAndServiceDate } from '~/server/services/historicalTimetableResolver';
import {
    listProbeStatusByTrainCodeInRange,
    ProbeStatusValue,
    type ProbeStatusRow
} from '~/server/services/probeStatusStore';
import {
    serviceDayToShanghaiDayStartUnixSeconds,
    type ServiceDay
} from '~/server/utils/date/serviceDay';
import {
    trainCodeKey,
    type TrainCodeParts
} from '~/server/utils/12306/trainCode';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';

interface DailySyncRow {
    id: number;
    train_code: TrainCodeParts;
    emu_id: EmuId;
    service_date: ServiceDay;
    timetable_id: number | null;
}

interface ProbeSyncRow extends DailySyncRow {
    status: ProbeStatusValue;
}

type MaintenanceSqlKey =
    | 'deleteDailyEmuRouteById'
    | 'deleteProbeStatusById'
    | 'updateDailyEmuRouteAliasById'
    | 'updateProbeStatusAliasById';

interface DailySyncAction {
    keeperId: number;
    emuId: EmuId;
    timetableId: number;
    needsUpdate: boolean;
    deleteIds: number[];
}

interface ProbeSyncAction extends DailySyncAction {
    status: ProbeStatusValue;
}

export interface CurrentDayTimetableIdSyncResult {
    scannedTrainCodes: number;
    changedTrainCodes: number;
    updatedDailyRows: number;
    deletedDailyRows: number;
    updatedProbeRows: number;
    deletedProbeRows: number;
}

const DAY_SECONDS = 24 * 60 * 60;

const maintenanceSql = importSqlBatch('emu/maintenance') as Record<
    MaintenanceSqlKey,
    string
>;

const maintenanceStatements = createPreparedSqlStore<MaintenanceSqlKey>({
    dbName: 'EMUTracked',
    scope: 'emu/maintenance',
    sql: maintenanceSql
});

function chooseKeeperRow<TRow extends DailySyncRow>(
    rows: readonly TRow[],
    targetTimetableId: number
) {
    return [...rows].sort((left, right) => {
        const leftMatchesTarget =
            left.timetable_id === targetTimetableId ? 1 : 0;
        const rightMatchesTarget =
            right.timetable_id === targetTimetableId ? 1 : 0;
        if (leftMatchesTarget !== rightMatchesTarget) {
            return rightMatchesTarget - leftMatchesTarget;
        }

        return left.id - right.id;
    })[0]!;
}

function buildGroupKey<TRow extends DailySyncRow>(row: TRow): string {
    return `${trainCodeKey(row.train_code)}:${Number(row.emu_id)}:${row.service_date}`;
}

function buildDailySyncActions(
    rows: readonly DailySyncRow[],
    targetTimetableId: number
) {
    const actions: DailySyncAction[] = [];
    const groupedRows = new Map<string, DailySyncRow[]>();

    for (const row of rows) {
        const groupKey = buildGroupKey(row);
        const existing = groupedRows.get(groupKey);
        if (existing) {
            existing.push(row);
            continue;
        }

        groupedRows.set(groupKey, [row]);
    }

    for (const groupRows of groupedRows.values()) {
        const keeper = chooseKeeperRow(groupRows, targetTimetableId);
        const deleteIds = groupRows
            .filter((row) => row.id !== keeper.id)
            .map((row) => row.id);
        const needsUpdate = keeper.timetable_id !== targetTimetableId;

        if (!needsUpdate && deleteIds.length === 0) {
            continue;
        }

        actions.push({
            keeperId: keeper.id,
            emuId: keeper.emu_id,
            timetableId: targetTimetableId,
            needsUpdate,
            deleteIds
        });
    }

    return actions;
}

function buildProbeSyncActions(
    rows: readonly ProbeSyncRow[],
    targetTimetableId: number
) {
    const actions: ProbeSyncAction[] = [];
    const groupedRows = new Map<string, ProbeSyncRow[]>();

    for (const row of rows) {
        const groupKey = buildGroupKey(row);
        const existing = groupedRows.get(groupKey);
        if (existing) {
            existing.push(row);
            continue;
        }

        groupedRows.set(groupKey, [row]);
    }

    for (const groupRows of groupedRows.values()) {
        const keeper = chooseKeeperRow(groupRows, targetTimetableId);
        const deleteIds = groupRows
            .filter((row) => row.id !== keeper.id)
            .map((row) => row.id);
        const nextStatus = groupRows.reduce<ProbeStatusValue>(
            (currentMax, row) =>
                row.status > currentMax ? row.status : currentMax,
            ProbeStatusValue.PendingCouplingDetection
        );
        const needsUpdate =
            keeper.timetable_id !== targetTimetableId ||
            keeper.status !== nextStatus;

        if (!needsUpdate && deleteIds.length === 0) {
            continue;
        }

        actions.push({
            keeperId: keeper.id,
            emuId: keeper.emu_id,
            timetableId: targetTimetableId,
            needsUpdate,
            deleteIds,
            status: nextStatus
        });
    }

    return actions;
}

export function syncCurrentDayTimetableIdsForTrainCodes(
    serviceDate: ServiceDay,
    trainCodes: readonly TrainCodeParts[]
): CurrentDayTimetableIdSyncResult {
    const seenTrainCodes = new Set<string>();
    const normalizedTrainCodes: TrainCodeParts[] = [];
    for (const trainCode of trainCodes) {
        const key = trainCodeKey(trainCode);
        if (seenTrainCodes.has(key)) {
            continue;
        }
        seenTrainCodes.add(key);
        normalizedTrainCodes.push(trainCode);
    }
    const result: CurrentDayTimetableIdSyncResult = {
        scannedTrainCodes: normalizedTrainCodes.length,
        changedTrainCodes: 0,
        updatedDailyRows: 0,
        deletedDailyRows: 0,
        updatedProbeRows: 0,
        deletedProbeRows: 0
    };

    if (normalizedTrainCodes.length === 0) {
        return result;
    }

    const dayStartAt = serviceDayToShanghaiDayStartUnixSeconds(serviceDate);
    const dayEndAtExclusive = dayStartAt + DAY_SECONDS;
    const syncTransaction = useEmuDatabase().transaction(() => {
        for (const trainCode of normalizedTrainCodes) {
            const targetTimetableId =
                resolveTimetableIdByTrainCodeAndServiceDate(
                    trainCode,
                    serviceDate
                );
            if (targetTimetableId === null) {
                continue;
            }

            const dailyRows = listDailyRoutesByTrainCodeInRange(
                trainCode,
                dayStartAt,
                dayEndAtExclusive
            ).map<DailySyncRow>((row) => ({
                id: row.id,
                train_code: row.train_code,
                emu_id: row.emu_id,
                service_date: row.service_date,
                timetable_id: row.timetable_id
            }));
            const probeRows = listProbeStatusByTrainCodeInRange(
                trainCode,
                dayStartAt,
                dayEndAtExclusive
            ).map<ProbeSyncRow>((row: ProbeStatusRow) => ({
                id: row.id,
                train_code: row.train_code,
                emu_id: row.emu_id,
                service_date: row.service_date,
                timetable_id: row.timetable_id,
                status: row.status
            }));

            const dailyActions = buildDailySyncActions(
                dailyRows,
                targetTimetableId
            );
            const probeActions = buildProbeSyncActions(
                probeRows,
                targetTimetableId
            );

            if (dailyActions.length === 0 && probeActions.length === 0) {
                continue;
            }

            result.changedTrainCodes += 1;

            for (const action of dailyActions) {
                for (const deleteId of action.deleteIds) {
                    maintenanceStatements.run(
                        'deleteDailyEmuRouteById',
                        deleteId
                    );
                    result.deletedDailyRows += 1;
                }

                if (action.needsUpdate) {
                    maintenanceStatements.run(
                        'updateDailyEmuRouteAliasById',
                        action.emuId,
                        action.timetableId,
                        action.keeperId
                    );
                    result.updatedDailyRows += 1;
                }
            }

            for (const action of probeActions) {
                for (const deleteId of action.deleteIds) {
                    maintenanceStatements.run(
                        'deleteProbeStatusById',
                        deleteId
                    );
                    result.deletedProbeRows += 1;
                }

                if (action.needsUpdate) {
                    maintenanceStatements.run(
                        'updateProbeStatusAliasById',
                        action.emuId,
                        action.timetableId,
                        action.status,
                        action.keeperId
                    );
                    result.updatedProbeRows += 1;
                }
            }
        }
    });

    syncTransaction();
    return result;
}
