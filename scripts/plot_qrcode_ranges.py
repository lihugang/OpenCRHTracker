#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    import matplotlib.pyplot as plt
except ImportError as exc:  # pragma: no cover - dependency failure path
    print(
        'matplotlib is required to run this script. Install it with '
        '`python -m pip install matplotlib`.',
        file=sys.stderr
    )
    raise SystemExit(1) from exc


CODE_PATTERN = re.compile(r'^([A-Z])(\d{6}|\d{7})$')
MULTIPLE_LENGTH = 400.0
SINGLE_LENGTH = 800.0
SMALL_GAP_THRESHOLD = 400.0
REPO_ROOT = Path(__file__).resolve().parents[1]
QRCODE_PATH = REPO_ROOT / 'data' / 'qrcode.jsonl'
EMU_LIST_PATH = REPO_ROOT / 'data' / 'emu_list.jsonl'


@dataclass(frozen=True)
class CodeRecord:
    code: str
    letter: str
    digits: int
    number: int
    model: str
    train_set_no: str


@dataclass(frozen=True)
class Interval:
    start: float
    end: float

    @property
    def width(self) -> float:
        return self.end - self.start


def normalize_code(value: Any) -> str:
    if value is None:
        return ''
    return str(value).strip().upper()


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open('r', encoding='utf-8-sig') as handle:
        for line_number, raw_line in enumerate(handle, start=1):
            line = raw_line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(
                    f'Failed to parse {path} line {line_number}: {exc.msg}'
                ) from exc
            if isinstance(row, dict):
                rows.append(row)
    return rows


def build_emu_index(rows: list[dict[str, Any]]) -> dict[tuple[str, str], bool]:
    index: dict[tuple[str, str], bool] = {}
    for row in rows:
        model = normalize_code(row.get('model'))
        train_set_no = normalize_code(row.get('trainSetNo'))
        if not model or not train_set_no:
            continue
        index[(model, train_set_no)] = row.get('multiple') is True
    return index


def extract_candidate_qrcodes(rows: list[dict[str, Any]]) -> list[CodeRecord]:
    records: list[CodeRecord] = []
    for row in rows:
        code = normalize_code(row.get('code'))
        match = CODE_PATTERN.fullmatch(code)
        if not match:
            continue

        model = normalize_code(row.get('model'))
        train_set_no = normalize_code(row.get('trainSetNo'))
        if not model or not train_set_no:
            continue

        number_text = match.group(2)
        records.append(
            CodeRecord(
                code=code,
                letter=match.group(1),
                digits=len(number_text),
                number=int(number_text),
                model=model,
                train_set_no=train_set_no
            )
        )
    return records


def prompt_choice(prompt: str, options: list[str], provided: str | None) -> str:
    if not options:
        raise ValueError(f'No available options for {prompt}.')

    normalized_map = {option.upper(): option for option in options}
    if provided is not None:
        chosen = provided.strip().upper()
        if chosen in normalized_map:
            return normalized_map[chosen]
        raise ValueError(
            f'Invalid {prompt}: {provided}. Available: {", ".join(options)}'
        )

    print(f'{prompt}:')
    for index, option in enumerate(options, start=1):
        print(f'  {index}. {option}')

    while True:
        answer = input(f'Select {prompt} by number or value: ').strip()
        if not answer:
            continue
        if answer.isdigit():
            option_index = int(answer) - 1
            if 0 <= option_index < len(options):
                return options[option_index]
        answer_upper = answer.upper()
        if answer_upper in normalized_map:
            return normalized_map[answer_upper]
        print(f'Invalid selection. Available: {", ".join(options)}')


def resolve_group_interval(
    rows: list[CodeRecord],
    emu_index: dict[tuple[str, str], bool]
) -> tuple[Interval, dict[str, int]]:
    lengths: list[float] = []
    missing_matches = 0

    for row in rows:
        key = (row.model, row.train_set_no)
        multiple = emu_index.get(key)
        if multiple is None:
            missing_matches += 1
            lengths.append(SINGLE_LENGTH)
        else:
            lengths.append(MULTIPLE_LENGTH if multiple else SINGLE_LENGTH)

    chosen_length = max(lengths) if lengths else SINGLE_LENGTH
    half_length = chosen_length / 2.0
    center = float(rows[0].number)
    interval = Interval(center - half_length, center + half_length)

    anomaly = {
        'duplicate_codes': 1 if len(rows) > 1 else 0,
        'missing_matches': missing_matches,
        'conflicting_lengths': 1 if len(set(lengths)) > 1 else 0
    }
    return interval, anomaly


def clamp_interval(interval: Interval, domain_max: float) -> Interval | None:
    start = max(0.0, interval.start)
    end = min(domain_max, interval.end)
    if end <= start:
        return None
    return Interval(start, end)


def merge_intervals(intervals: list[Interval]) -> list[Interval]:
    if not intervals:
        return []

    sorted_intervals = sorted(intervals, key=lambda item: (item.start, item.end))
    merged: list[Interval] = [sorted_intervals[0]]
    for current in sorted_intervals[1:]:
        previous = merged[-1]
        if current.start <= previous.end:
            merged[-1] = Interval(previous.start, max(previous.end, current.end))
            continue
        merged.append(current)
    return merged


def find_gap_intervals(
    merged_intervals: list[Interval],
    domain_max: float
) -> list[Interval]:
    if domain_max <= 0:
        return []

    if not merged_intervals:
        return [Interval(0.0, domain_max)]

    gaps: list[Interval] = []
    cursor = 0.0
    for interval in merged_intervals:
        if interval.start > cursor:
            gaps.append(Interval(cursor, interval.start))
        cursor = max(cursor, interval.end)

    if cursor < domain_max:
        gaps.append(Interval(cursor, domain_max))

    return [gap for gap in gaps if gap.width > 0]


def format_number(value: float) -> str:
    if math.isclose(value, round(value)):
        return str(int(round(value)))
    return f'{value:.1f}'.rstrip('0').rstrip('.')


def print_gap_summary(
    letter: str,
    digits: int,
    selected_count: int,
    unique_code_count: int,
    domain_max: int,
    anomalies: dict[str, int],
    gaps: list[Interval]
) -> None:
    yellow_gaps = [gap for gap in gaps if gap.width < SMALL_GAP_THRESHOLD]
    green_gaps = [gap for gap in gaps if gap.width >= SMALL_GAP_THRESHOLD]

    print('')
    print(f'QRCode range summary for {letter} ({digits} digits)')
    print(f'  Selected rows: {selected_count}')
    print(f'  Unique codes: {unique_code_count}')
    print(f'  Domain: [0, {domain_max}]')
    print(f'  Duplicate codes: {anomalies["duplicate_codes"]}')
    print(f'  Missing EMU matches (defaulted to 800): {anomalies["missing_matches"]}')
    print(f'  Conflicting duplicate lengths: {anomalies["conflicting_lengths"]}')
    print(f'  Yellow gaps (< 400): {len(yellow_gaps)}')
    print(f'  Green gaps (>= 400): {len(green_gaps)}')

    if yellow_gaps:
        print('')
        print('Yellow gaps:')
        for gap in yellow_gaps:
            print(
                f'  {format_number(gap.start)} - {format_number(gap.end)} '
                f'(length {format_number(gap.width)})'
            )

    if green_gaps:
        print('')
        print('Green gaps:')
        for gap in green_gaps:
            print(
                f'  {format_number(gap.start)} - {format_number(gap.end)} '
                f'(length {format_number(gap.width)})'
            )


def render_plot(
    letter: str,
    digits: int,
    domain_max: int,
    merged_red_intervals: list[Interval],
    gaps: list[Interval],
    output_path: Path,
    show_plot: bool
) -> None:
    figure, axis = plt.subplots(figsize=(16, 4.8))
    bar_y = 8
    bar_height = 12

    for gap in gaps:
        color = '#facc15' if gap.width < SMALL_GAP_THRESHOLD else '#16a34a'
        axis.broken_barh(
            [(gap.start, gap.width)],
            (bar_y, bar_height),
            facecolors=color
        )

    for interval in merged_red_intervals:
        axis.broken_barh(
            [(interval.start, interval.width)],
            (bar_y, bar_height),
            facecolors='#dc2626'
        )

    for gap in gaps:
        if gap.width < SMALL_GAP_THRESHOLD:
            continue
        label_y = bar_y + bar_height + 1.5
        axis.text(
            gap.start,
            label_y,
            format_number(gap.start),
            color='#166534',
            rotation=90,
            va='bottom',
            ha='center',
            fontsize=8
        )
        axis.text(
            gap.end,
            label_y,
            format_number(gap.end),
            color='#166534',
            rotation=90,
            va='bottom',
            ha='center',
            fontsize=8
        )

    axis.set_xlim(0, max(float(domain_max), 1.0))
    axis.set_ylim(0, 28)
    axis.set_yticks([])
    axis.set_xlabel('Numeric range')
    axis.set_title(f'QRCode coverage for {letter} ({digits} digits)')
    axis.grid(axis='x', linestyle='--', alpha=0.25)

    legend_handles = [
        plt.Rectangle((0, 0), 1, 1, color='#dc2626', label='Covered'),
        plt.Rectangle((0, 0), 1, 1, color='#facc15', label='Gap < 400'),
        plt.Rectangle((0, 0), 1, 1, color='#16a34a', label='Gap >= 400')
    ]
    axis.legend(handles=legend_handles, loc='upper right')

    figure.tight_layout()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    figure.savefig(output_path, dpi=160)
    print('')
    print(f'Saved plot to: {output_path}')

    if show_plot:
        try:
            plt.show()
        except Exception as exc:  # pragma: no cover - GUI backend failure path
            print(f'Unable to display plot window: {exc}', file=sys.stderr)

    plt.close(figure)


def main() -> int:
    parser = argparse.ArgumentParser(
        description='Visualize QRCode coverage ranges from JSONL assets.'
    )
    parser.add_argument('--letter', help='QRCode leading letter, for example H')
    parser.add_argument(
        '--digits',
        type=int,
        choices=(6, 7),
        help='QRCode numeric length'
    )
    parser.add_argument(
        '--output',
        type=Path,
        help='Optional output PNG path'
    )
    parser.add_argument(
        '--no-show',
        action='store_true',
        help='Save the PNG without opening a plot window'
    )
    args = parser.parse_args()

    qrcode_rows = load_jsonl(QRCODE_PATH)
    emu_rows = load_jsonl(EMU_LIST_PATH)
    emu_index = build_emu_index(emu_rows)
    records = extract_candidate_qrcodes(qrcode_rows)

    if not records:
        print('No valid QRCode records were found.', file=sys.stderr)
        return 1

    available_letters = sorted({record.letter for record in records})
    letter = prompt_choice('letter', available_letters, args.letter)

    available_digits = sorted(
        {str(record.digits) for record in records if record.letter == letter}
    )
    provided_digits = str(args.digits) if args.digits else None
    digits = int(prompt_choice('digit length', available_digits, provided_digits))

    filtered_records = [
        record
        for record in records
        if record.letter == letter and record.digits == digits
    ]
    if not filtered_records:
        print(
            f'No QRCode records found for letter {letter} with {digits} digits.',
            file=sys.stderr
        )
        return 1

    domain_max = max(record.number for record in filtered_records)
    grouped_records: dict[str, list[CodeRecord]] = defaultdict(list)
    for record in filtered_records:
        grouped_records[record.code].append(record)

    anomaly_counts = {
        'duplicate_codes': 0,
        'missing_matches': 0,
        'conflicting_lengths': 0
    }
    raw_intervals: list[Interval] = []
    for rows in grouped_records.values():
        interval, anomalies = resolve_group_interval(rows, emu_index)
        clamped = clamp_interval(interval, float(domain_max))
        if clamped is None:
            continue
        raw_intervals.append(clamped)
        for key, value in anomalies.items():
            anomaly_counts[key] += value

    merged_intervals = merge_intervals(raw_intervals)
    gaps = find_gap_intervals(merged_intervals, float(domain_max))

    output_path = args.output or (
        REPO_ROOT / 'data' / f'qrcode_range_{letter}_{digits}digit.png'
    )

    print_gap_summary(
        letter=letter,
        digits=digits,
        selected_count=len(filtered_records),
        unique_code_count=len(grouped_records),
        domain_max=domain_max,
        anomalies=anomaly_counts,
        gaps=gaps
    )
    render_plot(
        letter=letter,
        digits=digits,
        domain_max=domain_max,
        merged_red_intervals=merged_intervals,
        gaps=gaps,
        output_path=output_path,
        show_plot=not args.no_show
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
