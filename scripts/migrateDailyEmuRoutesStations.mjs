import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

function readSql(relativePath) {
    return fs.readFileSync(path.resolve(relativePath), 'utf8').trim();
}

const configPath = path.resolve('data/config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const dbPath = path.resolve(config.data.databases.EMUTracked);

const createDailyEmuRoutesTableSql = readSql(
    'assets/sql/emu/schema/createDailyEmuRoutesTable.sql'
);
const selectDailyEmuRoutesColumnsSql = readSql(
    'assets/sql/emu/migrations/selectDailyEmuRoutesColumns.sql'
);
const alterDailyEmuRoutesAddStartStationNameSql = readSql(
    'assets/sql/emu/migrations/alterDailyEmuRoutesAddStartStationName.sql'
);
const alterDailyEmuRoutesAddEndStationNameSql = readSql(
    'assets/sql/emu/migrations/alterDailyEmuRoutesAddEndStationName.sql'
);

const db = new Database(dbPath);

try {
    db.exec(createDailyEmuRoutesTableSql);

    const columns = new Set(
        db.prepare(selectDailyEmuRoutesColumnsSql)
            .all()
            .map((row) => row.name)
    );

    if (!columns.has('start_station_name')) {
        db.exec(alterDailyEmuRoutesAddStartStationNameSql);
    }
    if (!columns.has('end_station_name')) {
        db.exec(alterDailyEmuRoutesAddEndStationNameSql);
    }

    const migratedColumns = db.prepare(selectDailyEmuRoutesColumnsSql).all();
    console.log(
        JSON.stringify(
            {
                dbPath,
                columns: migratedColumns.map((row) => row.name)
            },
            null,
            2
        )
    );
} finally {
    db.close();
}
