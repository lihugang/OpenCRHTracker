const HLL_PRECISION = 12;
const HLL_REGISTER_COUNT = 1 << HLL_PRECISION;
const HLL_MAX_RANK = 32 - HLL_PRECISION + 1;
const HLL_ALPHA_MM =
    (0.7213 / (1 + 1.079 / HLL_REGISTER_COUNT)) *
    HLL_REGISTER_COUNT *
    HLL_REGISTER_COUNT;

export type HyperLogLogSketch = Uint8Array;

export function createHyperLogLogSketch() {
    return new Uint8Array(HLL_REGISTER_COUNT);
}

export function clearHyperLogLogSketch(sketch: HyperLogLogSketch) {
    sketch.fill(0);
}

export function addHyperLogLogHash(
    sketch: HyperLogLogSketch,
    hash: number
): void {
    const normalizedHash = hash >>> 0;
    const index = normalizedHash & (HLL_REGISTER_COUNT - 1);
    const remainder = normalizedHash >>> HLL_PRECISION;
    const rank =
        remainder === 0
            ? HLL_MAX_RANK
            : Math.min(
                  HLL_MAX_RANK,
                  Math.clz32(remainder) - HLL_PRECISION + 1
              );

    if (rank > (sketch[index] ?? 0)) {
        sketch[index] = rank;
    }
}

export function mergeHyperLogLogSketch(
    target: HyperLogLogSketch,
    source: HyperLogLogSketch
): void {
    for (let index = 0; index < HLL_REGISTER_COUNT; index += 1) {
        if ((source[index] ?? 0) > (target[index] ?? 0)) {
            target[index] = source[index] ?? 0;
        }
    }
}

export function estimateHyperLogLog(sketch: HyperLogLogSketch) {
    let inverseSum = 0;
    let zeroRegisters = 0;

    for (let index = 0; index < HLL_REGISTER_COUNT; index += 1) {
        const registerValue = sketch[index] ?? 0;
        inverseSum += 2 ** -registerValue;
        if (registerValue === 0) {
            zeroRegisters += 1;
        }
    }

    if (inverseSum <= 0) {
        return 0;
    }

    const rawEstimate = HLL_ALPHA_MM / inverseSum;
    if (
        rawEstimate <= 2.5 * HLL_REGISTER_COUNT &&
        zeroRegisters > 0
    ) {
        return HLL_REGISTER_COUNT * Math.log(HLL_REGISTER_COUNT / zeroRegisters);
    }

    return rawEstimate;
}
