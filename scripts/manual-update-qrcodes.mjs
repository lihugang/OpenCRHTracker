import Database from 'better-sqlite3';
import {
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    unlinkSync,
    writeFileSync
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const CONFIG_CANDIDATES = [
    resolve(repoRoot, 'data/config.dev.json'),
    resolve(repoRoot, 'data/config.json')
];
const QRCODE_PATH = resolve(repoRoot, 'data/qrcode.jsonl');
const DECODE_URL =
    'https://mobile.12306.cn/wxxcx/wechat/main/travelServiceDecodeQrcode';

function log(level, message, context = {}) {
    const time = new Date().toISOString();
    const detail = Object.entries(context)
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(' ');
    const suffix = detail ? ` ${detail}` : '';
    console.log(`[${time}] [${level}] ${message}${suffix}`);
}

function normalizeCode(code) {
    return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

function normalizeInput(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function loadConfig() {
    for (const filePath of CONFIG_CANDIDATES) {
        try {
            return {
                filePath,
                value: JSON.parse(readFileSync(filePath, 'utf8'))
            };
        } catch (error) {
            if (error && typeof error === 'object' && error.code === 'ENOENT') {
                continue;
            }
            throw error;
        }
    }

    throw new Error(
        `Config file not found. Tried: ${CONFIG_CANDIDATES.join(', ')}`
    );
}

function writeTextFileAtomically(filePath, content) {
    mkdirSync(dirname(filePath), { recursive: true });

    const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.${Math.random()
        .toString(16)
        .slice(2)}.tmp`;

    writeFileSync(tempFilePath, content, 'utf8');
    try {
        renameSync(tempFilePath, filePath);
    } catch {
        writeFileSync(filePath, content, 'utf8');
        try {
            unlinkSync(tempFilePath);
        } catch {
            // ignore cleanup failure for temporary file
        }
    }
}

function parseJsonl(filePath, label) {
    if (!existsSync(filePath)) {
        return [];
    }

    const content = readFileSync(filePath, 'utf8');
    if (!content.trim()) {
        return [];
    }

    return content
        .split(/\r?\n/)
        .map((line, index) => ({
            line: line.trim(),
            lineNumber: index + 1
        }))
        .filter((entry) => entry.line.length > 0)
        .map((entry) => {
            let parsed;
            try {
                parsed = JSON.parse(entry.line);
            } catch {
                throw new Error(
                    `Invalid ${label} JSONL at line ${entry.lineNumber}: not valid JSON`
                );
            }

            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                throw new Error(
                    `Invalid ${label} JSONL at line ${entry.lineNumber}: expected object`
                );
            }

            return parsed;
        });
}

function parseEmuCode(emuCode) {
    const normalized = normalizeCode(emuCode);
    const separatorIndex = normalized.lastIndexOf('-');
    if (separatorIndex <= 0 || separatorIndex >= normalized.length - 1) {
        return null;
    }

    return {
        model: normalized.slice(0, separatorIndex),
        trainSetNo: normalized.slice(separatorIndex + 1)
    };
}

function buildKey(model, trainSetNo) {
    return `${normalizeCode(model)}#${normalizeCode(trainSetNo)}`;
}

function renderJsonl(records) {
    if (records.length === 0) {
        return '';
    }

    return `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
}

function createRateLimiter(minIntervalMs) {
    let lastRequestAt = 0;
    let queue = Promise.resolve();

    return async function waitForSlot() {
        if (!Number.isFinite(minIntervalMs) || minIntervalMs <= 0) {
            return;
        }

        queue = queue.catch(() => undefined).then(async () => {
            const now = Date.now();
            const waitMs = Math.max(0, lastRequestAt + minIntervalMs - now);
            if (waitMs > 0) {
                await new Promise((resolveWait) => setTimeout(resolveWait, waitMs));
            }

            lastRequestAt = Date.now();
        });

        await queue;
    };
}

async function fetchJson(url, options, waitForSlot) {
    await waitForSlot();
    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
    }

    return response.json();
}

async function decodeCode(code, userAgent, eKey, waitForSlot) {
    const decodedJson = await fetchJson(
        DECODE_URL,
        {
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'user-agent': userAgent
            },
            body: `c=${encodeURIComponent(code)}&w=h&eKey=${encodeURIComponent(eKey)}&cb=function(e)%7Be%26%26t.decodeCallBack()%7D`,
            method: 'POST'
        },
        waitForSlot
    );

    const data = decodedJson?.data;
    return {
        status: decodedJson?.status === true,
        decodedEmuCode: normalizeCode(data?.carCode),
        coachNo: normalizeInput(data?.coachNo),
        seatNo: normalizeInput(data?.seatNo),
        errorCode: normalizeInput(decodedJson?.errorCode),
        errorMsg: normalizeInput(decodedJson?.errorMsg)
    };
}

function printRowPrompt(row, index, totalRows) {
    console.log('');
    console.log(`=== [${index + 1}/${totalRows}] failed_code row ===`);
    console.log(`rowId: ${row.id}`);
    console.log(`emuCode: ${row.emu_code}`);
    console.log(`seatCode: ${row.seat_code}`);
    console.log(`reason: ${row.reason}`);
    console.log(`checkedAt: ${row.checked_at}`);
}

async function promptForRecordCode(
    readlineInterface,
    row,
    index,
    totalRows,
    userAgent,
    eKey,
    waitForSlot,
    stats
) {
    const expectedEmuCode = normalizeCode(row.emu_code);

    printRowPrompt(row, index, totalRows);

    while (true) {
        const code = normalizeInput(
            await readlineInterface.question('Input CODE (Enter to skip): ')
        );

        if (!code) {
            stats.skippedRows += 1;
            log('info', 'skipped failed_code row by user', {
                rowId: row.id,
                emuCode: expectedEmuCode
            });
            return null;
        }

        stats.decodeAttempts += 1;

        let decoded;
        try {
            decoded = await decodeCode(code, userAgent, eKey, waitForSlot);
        } catch (error) {
            stats.retryAttempts += 1;
            const message =
                error instanceof Error ? error.message : String(error);
            log('warn', '12306 decode request failed, retry required', {
                rowId: row.id,
                emuCode: expectedEmuCode,
                code,
                message
            });
            console.log(`Decode failed: ${message}`);
            continue;
        }

        if (!decoded.status) {
            stats.retryAttempts += 1;
            log('warn', '12306 decode returned non-success status, retry required', {
                rowId: row.id,
                emuCode: expectedEmuCode,
                code,
                errorCode: decoded.errorCode,
                errorMsg: decoded.errorMsg
            });
            console.log(
                `Decode failed: status=false errorCode=${decoded.errorCode || 'N/A'} errorMsg=${decoded.errorMsg || 'N/A'}`
            );
            continue;
        }

        if (!decoded.decodedEmuCode || !decoded.coachNo || !decoded.seatNo) {
            stats.retryAttempts += 1;
            log('warn', '12306 decode payload incomplete, retry required', {
                rowId: row.id,
                emuCode: expectedEmuCode,
                code,
                decodedEmuCode: decoded.decodedEmuCode,
                coachNo: decoded.coachNo,
                seatNo: decoded.seatNo
            });
            console.log('Decode failed: missing carCode, coachNo, or seatNo.');
            continue;
        }

        if (decoded.decodedEmuCode !== expectedEmuCode) {
            stats.retryAttempts += 1;
            log('warn', 'decoded emu_code mismatched, retry required', {
                rowId: row.id,
                emuCode: expectedEmuCode,
                code,
                decodedEmuCode: decoded.decodedEmuCode
            });
            console.log(
                `Decode failed: expected ${expectedEmuCode}, got ${decoded.decodedEmuCode}.`
            );
            continue;
        }

        const parsedEmuCode = parseEmuCode(decoded.decodedEmuCode);
        if (!parsedEmuCode) {
            stats.retryAttempts += 1;
            log('warn', 'decoded emu_code could not be parsed, retry required', {
                rowId: row.id,
                emuCode: expectedEmuCode,
                code,
                decodedEmuCode: decoded.decodedEmuCode
            });
            console.log(
                `Decode failed: carCode ${decoded.decodedEmuCode} could not be parsed.`
            );
            continue;
        }

        stats.successfulRows += 1;
        log('info', 'decoded manual qrcode successfully', {
            rowId: row.id,
            emuCode: expectedEmuCode,
            code,
            model: parsedEmuCode.model,
            trainSetNo: parsedEmuCode.trainSetNo,
            coachNo: decoded.coachNo,
            seatNo: decoded.seatNo
        });

        return {
            rowId: row.id,
            emuCode: expectedEmuCode,
            record: {
                code: String(code),
                model: String(parsedEmuCode.model),
                trainSetNo: String(parsedEmuCode.trainSetNo),
                coachNo: String(decoded.coachNo),
                seatNo: String(decoded.seatNo)
            }
        };
    }
}

function createStats(totalRows) {
    return {
        totalRows,
        decodeAttempts: 0,
        retryAttempts: 0,
        successfulRows: 0,
        skippedRows: 0
    };
}

async function main() {
    const { filePath: configPath, value: config } = loadConfig();
    const dbPath = config?.data?.databases?.EMUTracked;
    const userAgent = config?.spider?.userAgent;
    const eKey = config?.spider?.params?.eKey;
    const minIntervalMs = Number(config?.spider?.rateLimit?.query?.minIntervalMs ?? 0);

    if (typeof dbPath !== 'string' || dbPath.trim().length === 0) {
        throw new Error(`Invalid EMUTracked database path in ${configPath}`);
    }
    if (typeof userAgent !== 'string' || userAgent.trim().length === 0) {
        throw new Error(`Invalid spider.userAgent in ${configPath}`);
    }
    if (typeof eKey !== 'string' || eKey.trim().length === 0) {
        throw new Error(`Invalid spider.params.eKey in ${configPath}`);
    }

    const databasePath = resolve(repoRoot, dbPath);
    const database = new Database(databasePath);
    const waitForSlot = createRateLimiter(minIntervalMs);
    const readlineInterface = createInterface({ input, output });

    log('info', 'started manual-update-qrcodes', {
        configPath,
        databasePath,
        qrcodePath: QRCODE_PATH,
        minIntervalMs
    });

    try {
        const rows = database
            .prepare(
                `SELECT id, emu_code, seat_code, reason, checked_at
                 FROM failed_codes
                 ORDER BY checked_at DESC, id DESC`
            )
            .all();

        const stats = createStats(rows.length);
        const successfulRecordsByKey = new Map();
        const successfulEmuCodes = new Set();

        log('info', 'loaded failed_codes rows for manual update', {
            totalRows: rows.length
        });

        if (rows.length === 0) {
            log('info', 'no failed_codes rows to process', {
                databasePath
            });
            return;
        }

        for (const [index, row] of rows.entries()) {
            const result = await promptForRecordCode(
                readlineInterface,
                row,
                index,
                rows.length,
                userAgent,
                eKey,
                waitForSlot,
                stats
            );

            if (!result) {
                continue;
            }

            successfulRecordsByKey.set(
                buildKey(result.record.model, result.record.trainSetNo),
                result.record
            );
            successfulEmuCodes.add(result.emuCode);
        }

        if (successfulRecordsByKey.size === 0) {
            log('info', 'finished manual-update-qrcodes with no successful rows', {
                totalRows: stats.totalRows,
                decodeAttempts: stats.decodeAttempts,
                retryAttempts: stats.retryAttempts,
                successfulRows: stats.successfulRows,
                skippedRows: stats.skippedRows
            });
            return;
        }

        const baseRecords = parseJsonl(QRCODE_PATH, 'qrcode.jsonl');
        const successfulRecords = Array.from(successfulRecordsByKey.values());
        const mergedRecords = baseRecords.concat(successfulRecords);

        writeTextFileAtomically(QRCODE_PATH, renderJsonl(mergedRecords));
        log('info', 'rewrote qrcode.jsonl after manual updates', {
            qrcodePath: QRCODE_PATH,
            baseCount: baseRecords.length,
            successfulUniqueCount: successfulRecords.length,
            mergedCount: mergedRecords.length
        });

        const emuCodesToDelete = Array.from(successfulEmuCodes);
        const deleteStatement = database.prepare(
            'DELETE FROM failed_codes WHERE emu_code = ?'
        );
        const deleteFailedCodes = database.transaction((codes) => {
            let totalChanges = 0;
            for (const emuCode of codes) {
                const result = deleteStatement.run(emuCode);
                totalChanges += result.changes;
            }
            return totalChanges;
        });
        const deletedFailedCodeRows = deleteFailedCodes(emuCodesToDelete);

        log('info', 'deleted failed_codes rows for successful emu_codes', {
            databasePath,
            emuCodeCount: emuCodesToDelete.length,
            deletedFailedCodeRows
        });

        log('info', 'finished manual-update-qrcodes', {
            totalRows: stats.totalRows,
            decodeAttempts: stats.decodeAttempts,
            retryAttempts: stats.retryAttempts,
            successfulRows: stats.successfulRows,
            successfulUniqueCount: successfulRecords.length,
            skippedRows: stats.skippedRows,
            mergedCount: mergedRecords.length,
            deletedFailedCodeRows
        });
    } finally {
        readlineInterface.close();
        database.close();
    }
}

main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    log('error', 'manual-update-qrcodes failed', { message });
    process.exitCode = 1;
});
