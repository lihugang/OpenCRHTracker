export default function extractEmuModelFromCode(emuCode: string) {
    const normalizedCode = emuCode.trim().toUpperCase();
    const separatorIndex = normalizedCode.lastIndexOf('-');

    if (separatorIndex <= 0 || separatorIndex >= normalizedCode.length - 1) {
        return normalizedCode;
    }

    return normalizedCode.slice(0, separatorIndex);
}
