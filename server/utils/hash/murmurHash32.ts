const textEncoder = new TextEncoder();

function multiply32(left: number, right: number) {
    return Math.imul(left, right) >>> 0;
}

function rotateLeft32(value: number, bits: number) {
    return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function finalizeHash(hash: number) {
    let result = hash >>> 0;
    result ^= result >>> 16;
    result = multiply32(result, 0x85ebca6b);
    result ^= result >>> 13;
    result = multiply32(result, 0xc2b2ae35);
    result ^= result >>> 16;
    return result >>> 0;
}

export default function murmurHash32(value: string, seed = 0) {
    const bytes = textEncoder.encode(value);
    const length = bytes.length;
    const blockCount = Math.floor(length / 4);
    let hash = seed >>> 0;

    for (let index = 0; index < blockCount; index += 1) {
        const offset = index * 4;
        let block =
            ((bytes[offset] ?? 0) |
                ((bytes[offset + 1] ?? 0) << 8) |
                ((bytes[offset + 2] ?? 0) << 16) |
                ((bytes[offset + 3] ?? 0) << 24)) >>>
            0;

        block = multiply32(block, 0xcc9e2d51);
        block = rotateLeft32(block, 15);
        block = multiply32(block, 0x1b873593);

        hash ^= block;
        hash = rotateLeft32(hash, 13);
        hash = (multiply32(hash, 5) + 0xe6546b64) >>> 0;
    }

    let tail = 0;
    const tailOffset = blockCount * 4;
    switch (length & 3) {
        case 3:
            tail ^= (bytes[tailOffset + 2] ?? 0) << 16;
        case 2:
            tail ^= (bytes[tailOffset + 1] ?? 0) << 8;
        case 1:
            tail ^= bytes[tailOffset] ?? 0;
            tail = multiply32(tail >>> 0, 0xcc9e2d51);
            tail = rotateLeft32(tail, 15);
            tail = multiply32(tail, 0x1b873593);
            hash ^= tail;
    }

    hash ^= length;
    return finalizeHash(hash);
}
