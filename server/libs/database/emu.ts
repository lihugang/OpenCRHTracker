import type Database from 'better-sqlite3';
import useDatabase, {
    registerDatabaseInitializer
} from '~/server/libs/database/common';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import normalizeCode from '~/server/utils/12306/normalizeCode';

const emuCodeToId = new Map<string, EmuId>();
const idToEmuCode = new Map<EmuId, string>();
let emuCodeMappingLoaded = false;

export type EmuId = number & { readonly __brand: 'EmuId' };

export function asEmuId(value: number): EmuId {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`invalid_emu_id ${value}`);
    }
    return value as EmuId;
}

function ensureEmuTrackedSchema(db: Database.Database) {
    const schemaSql = importSqlBatch('emu/schema');
    for (const statement of Object.values(schemaSql)) {
        db.exec(statement);
    }
}

function loadEmuCodeMapping(db: Database.Database) {
    if (emuCodeMappingLoaded) {
        return;
    }

    const rows = db
        .prepare('SELECT id, emu_code FROM emu_code_mapping ORDER BY id ASC')
        .all() as Array<{ id?: unknown; emu_code?: unknown }>;
    for (const row of rows) {
        const id = Number(row.id);
        const code = normalizeCode(String(row.emu_code ?? ''));
        if (!Number.isInteger(id) || id <= 0 || code.length === 0) {
            throw new Error('invalid_emu_code_mapping_row');
        }
        if (emuCodeToId.has(code) || idToEmuCode.has(asEmuId(id))) {
            throw new Error(`duplicate_emu_code_mapping id=${id} code=${code}`);
        }
        const emuId = asEmuId(id);
        emuCodeToId.set(code, emuId);
        idToEmuCode.set(emuId, code);
    }
    emuCodeMappingLoaded = true;
}

registerDatabaseInitializer('EMUTracked', ensureEmuTrackedSchema);

let ensured = false;

export function ensureEmuDatabaseSchema() {
    if (ensured) {
        return;
    }
    const db = useDatabase('EMUTracked');
    ensureEmuTrackedSchema(db);
    loadEmuCodeMapping(db);
    ensured = true;
}

export function useEmuDatabase() {
    const db = useDatabase('EMUTracked');
    ensureEmuTrackedSchema(db);
    loadEmuCodeMapping(db);
    return db;
}

export function getEmuId(emuCode: string): EmuId | null {
    ensureEmuDatabaseSchema();
    return emuCodeToId.get(normalizeCode(emuCode)) ?? null;
}

export function getEmuCode(emuId: EmuId): string | null {
    ensureEmuDatabaseSchema();
    return idToEmuCode.get(emuId) ?? null;
}

export function ensureEmuId(emuCode: string): EmuId {
    const normalized = normalizeCode(emuCode);
    if (normalized.length === 0) {
        throw new Error('invalid_emu_code');
    }

    ensureEmuDatabaseSchema();
    const existing = emuCodeToId.get(normalized);
    if (existing !== undefined) {
        return existing;
    }

    const db = useDatabase('EMUTracked');
    const register = db.transaction(() => {
        db.prepare(
            'INSERT INTO emu_code_mapping (emu_code) VALUES (?) ON CONFLICT(emu_code) DO NOTHING'
        ).run(normalized);
        const row = db
            .prepare('SELECT id FROM emu_code_mapping WHERE emu_code = ?')
            .get(normalized) as { id?: unknown } | undefined;
        const id = Number(row?.id);
        if (!Number.isInteger(id) || id <= 0) {
            throw new Error(
                `emu_code_mapping_insert_failed code=${normalized}`
            );
        }
        const emuId = asEmuId(id);
        emuCodeToId.set(normalized, emuId);
        idToEmuCode.set(emuId, normalized);
        return emuId;
    });
    return register();
}

export function ensureEmuIds(emuCodes: readonly string[]): EmuId[] {
    return emuCodes.map(ensureEmuId);
}
