import highsLoader from 'highs';

export interface StationCoverCandidate {
    key: string;
    stations: string[];
}

interface StationCoverSolutionColumn {
    Primal?: number;
}

interface StationCoverSolution {
    Status?: string;
    Columns?: Record<string, StationCoverSolutionColumn | undefined>;
}

function normalizeStationName(value: string) {
    const stationName = value.trim();
    if (stationName.length === 0) {
        return '';
    }

    if (/\s/u.test(stationName)) {
        return '';
    }

    return stationName;
}

function buildNormalizedCandidates(
    candidates: readonly StationCoverCandidate[]
): StationCoverCandidate[] {
    const normalized: StationCoverCandidate[] = [];

    for (const candidate of candidates) {
        const key = candidate.key.trim();
        if (key.length === 0) {
            continue;
        }

        const seenStations = new Set<string>();
        const stations: string[] = [];
        for (const stationName of candidate.stations) {
            const normalizedStationName = normalizeStationName(stationName);
            if (
                normalizedStationName.length === 0 ||
                seenStations.has(normalizedStationName)
            ) {
                continue;
            }

            seenStations.add(normalizedStationName);
            stations.push(normalizedStationName);
        }

        if (stations.length === 0) {
            continue;
        }

        normalized.push({
            key,
            stations
        });
    }

    return normalized;
}

function buildLpModel(candidates: readonly StationCoverCandidate[]) {
    const stationNames = [
        ...new Set(candidates.flatMap((item) => item.stations))
    ].sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
    if (stationNames.length === 0) {
        throw new Error('No candidate stations were found.');
    }

    const variableByStationName = new Map<string, string>();
    const stationNameByVariable = new Map<string, string>();

    stationNames.forEach((stationName, index) => {
        const variableName = `x_${index + 1}`;
        variableByStationName.set(stationName, variableName);
        stationNameByVariable.set(variableName, stationName);
    });

    const lines = ['Minimize'];
    lines.push(
        ` obj: ${stationNames
            .map((stationName) => variableByStationName.get(stationName))
            .join(' + ')}`
    );
    lines.push('Subject To');

    candidates.forEach((candidate, index) => {
        const terms = candidate.stations
            .map((stationName) => variableByStationName.get(stationName))
            .filter((value): value is string => typeof value === 'string');
        lines.push(` cover_${index + 1}: ${terms.join(' + ')} >= 1`);
    });

    lines.push('Binary');
    stationNames.forEach((stationName) => {
        lines.push(` ${variableByStationName.get(stationName)}`);
    });
    lines.push('End');

    return {
        lpText: lines.join('\n'),
        stationNameByVariable
    };
}

function extractSelectedStations(
    solution: StationCoverSolution,
    stationNameByVariable: ReadonlyMap<string, string>
) {
    const selectedStations: string[] = [];

    for (const [variableName, column] of Object.entries(
        solution.Columns ?? {}
    )) {
        if (
            !column ||
            typeof column.Primal !== 'number' ||
            column.Primal <= 0.5
        ) {
            continue;
        }

        const stationName = stationNameByVariable.get(variableName);
        if (stationName) {
            selectedStations.push(stationName);
        }
    }

    selectedStations.sort((left, right) =>
        left.localeCompare(right, 'zh-Hans-CN')
    );
    return selectedStations;
}

function validateCoverage(
    candidates: readonly StationCoverCandidate[],
    selectedStations: readonly string[]
) {
    const selectedStationSet = new Set(selectedStations);
    const uncovered = candidates
        .filter(
            (candidate) =>
                !candidate.stations.some((stationName) =>
                    selectedStationSet.has(stationName)
                )
        )
        .map((candidate) => candidate.key);

    if (uncovered.length > 0) {
        throw new Error(
            `Computed station cover does not cover all groups: ${uncovered.slice(0, 10).join(', ')}`
        );
    }
}

export default async function solveStationCover(
    candidates: readonly StationCoverCandidate[]
) {
    const normalizedCandidates = buildNormalizedCandidates(candidates);
    if (normalizedCandidates.length === 0) {
        return [];
    }

    const { lpText, stationNameByVariable } =
        buildLpModel(normalizedCandidates);
    const highs = await highsLoader();
    const solution = highs.solve(lpText, {
        presolve: 'on'
    }) as StationCoverSolution;

    if (solution.Status !== 'Optimal') {
        throw new Error(
            `Failed to solve station cover optimally: ${solution.Status ?? 'unknown'}`
        );
    }

    const selectedStations = extractSelectedStations(
        solution,
        stationNameByVariable
    );
    if (selectedStations.length === 0) {
        throw new Error('Solver returned an empty station cover.');
    }

    validateCoverage(normalizedCandidates, selectedStations);
    return selectedStations;
}
