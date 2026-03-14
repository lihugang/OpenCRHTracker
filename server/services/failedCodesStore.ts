import '~/server/libs/database/emu';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

type FailedCodesSqlKey = 'insertFailedCode';

const failedCodesSql = importSqlBatch('emu/queries') as Record<
    FailedCodesSqlKey,
    string
>;
const failedCodesStatements = createPreparedSqlStore<FailedCodesSqlKey>({
    dbName: 'EMUTracked',
    scope: 'emu/queries',
    sql: failedCodesSql
});

export interface InsertFailedCodeInput {
    emuCode: string;
    seatCode: string;
    reason: string;
    checkedAt: number;
    expectedTrainCode?: string;
    detectedTrainCode?: string;
    detectedEmuCode?: string;
}

export function insertFailedCode(input: InsertFailedCodeInput): void {
    const normalizedEmuCode = normalizeCode(input.emuCode);
    const seatCode = input.seatCode.trim();
    const reason = input.reason.trim();

    if (normalizedEmuCode.length === 0) {
        throw new Error('emuCode must be non-empty');
    }
    if (seatCode.length === 0) {
        throw new Error('seatCode must be non-empty');
    }
    if (reason.length === 0) {
        throw new Error('reason must be non-empty');
    }
    if (!Number.isInteger(input.checkedAt) || input.checkedAt < 0) {
        throw new Error('checkedAt must be a non-negative integer');
    }

    failedCodesStatements.run(
        'insertFailedCode',
        normalizedEmuCode,
        seatCode,
        reason,
        input.checkedAt,
        getNowSeconds(),
        normalizeCode(input.expectedTrainCode ?? ''),
        normalizeCode(input.detectedTrainCode ?? ''),
        normalizeCode(input.detectedEmuCode ?? '')
    );
}
