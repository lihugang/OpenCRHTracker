import fs from 'node:fs';
import path from 'node:path';
import zstdNapi from 'zstd-napi';

export const DAILY_EXPORT_COMPRESSION_LEVEL = 9;
export const DAILY_EXPORT_DICTIONARY_PATH = path.resolve(
    'assets/zstd/csv.zdict'
);

let codec;

function getCodec() {
    if (codec) {
        return codec;
    }

    const dictionary = fs.readFileSync(DAILY_EXPORT_DICTIONARY_PATH);
    const compressor = new zstdNapi.Compressor();
    compressor.setParameters({
        compressionLevel: DAILY_EXPORT_COMPRESSION_LEVEL,
        checksumFlag: true,
        dictIDFlag: true
    });
    compressor.loadDictionary(dictionary);

    const decompressor = new zstdNapi.Decompressor();
    decompressor.loadDictionary(dictionary);

    codec = {
        compressor,
        decompressor
    };
    return codec;
}

/** @param {Uint8Array} content */
export function compressDailyExportCsv(content) {
    return getCodec().compressor.compress(content);
}

/** @param {Uint8Array} content */
export function decompressDailyExportCsv(content) {
    return getCodec().decompressor.decompress(content);
}

/**
 * @param {Uint8Array} source
 * @param {Uint8Array} compressed
 */
export function assertDailyExportZstdRoundTrip(source, compressed) {
    const decompressed = decompressDailyExportCsv(compressed);
    if (!Buffer.from(decompressed).equals(Buffer.from(source))) {
        throw new Error('daily export zstd round-trip verification failed');
    }
}

/**
 * @param {string} filePath
 * @param {Uint8Array} content
 */
export function writeDailyExportZstdAtomically(filePath, content) {
    const directory = path.dirname(filePath);
    fs.mkdirSync(directory, { recursive: true });

    const tempFilePath = path.join(
        directory,
        `${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random()
            .toString(16)
            .slice(2)}.tmp`
    );

    try {
        fs.writeFileSync(tempFilePath, content);
        fs.renameSync(tempFilePath, filePath);
    } finally {
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
    }
}
