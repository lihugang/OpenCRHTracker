#let data = __RENDER_DATA__

#set text(
    font: (
        "New Computer Modern",
        "SimSun",
        "NSimSun",
        "Droid Sans Fallback",
        "Noto Sans",
    ),
    fill: black,
    hyphenate: false,
)

#let cm(value) = value * 1cm
#let pt(value) = value * 1pt
#let paint(value) = rgb(value)
#let border = cm(data.layout.documentBorderCm)

#let project-time(timestamp, chart-width) = {
    (
        (timestamp - data.timeAxis.axisStartTimestamp) / data.timeAxis.axisRangeSeconds * chart-width
    )
}

#let text-placement(
    x,
    y,
    body,
    anchor,
    font-size,
    fill: none,
    inset: 0pt,
    text-fill: black,
) = {
    let content = box(width: auto, inset: inset, fill: fill)[
        #text(size: font-size, fill: text-fill, hyphenate: false, body)
    ]
    let measured = measure(content)
    let width = measured.width
    let height = measured.height
    let min-x = if anchor == "east" {
        x - width
    } else if anchor == "west" {
        x
    } else {
        x - width / 2
    }
    let max-x = min-x + width
    let min-y = if anchor == "south" {
        y
    } else if anchor == "north" {
        y - height
    } else {
        y - height / 2
    }
    let max-y = min-y + height

    (
        minX: min-x,
        maxX: max-x,
        minY: min-y,
        maxY: max-y,
        content: content,
    )
}

#let top-right-text-placement(
    x,
    y,
    body,
    font-size,
    fill: none,
    inset: 0pt,
    text-fill: black,
) = {
    let content = box(width: auto, inset: inset, fill: fill)[
        #text(size: font-size, fill: text-fill, hyphenate: false, body)
    ]
    let measured = measure(content)

    (
        minX: x - measured.width,
        maxX: x,
        minY: y,
        maxY: y + measured.height,
        content: content,
    )
}

#let protected-station-label-box(label) = {
    (
        minX: label.minX,
        maxX: calc.max(label.maxX, cm(data.layout.stationLabelRightProtectionXCm)),
        minY: label.minY,
        maxY: label.maxY,
    )
}

#let expand-box(box-data, delta-x, delta-y) = {
    (
        minX: box-data.minX - delta-x,
        maxX: box-data.maxX + delta-x,
        minY: box-data.minY - delta-y,
        maxY: box-data.maxY + delta-y,
    )
}

#let boxes-overlap(left, right) = {
    not (
        left.maxX <= right.minX or
            left.minX >= right.maxX or
            left.maxY <= right.minY or
            left.minY >= right.maxY
    )
}

#let box-overlap-area(left, right) = {
    if boxes-overlap(left, right) {
        (
            (calc.min(left.maxX, right.maxX) - calc.max(left.minX, right.minX)) + (calc.min(left.maxY, right.maxY) - calc.max(left.minY, right.minY))
        )
    } else {
        0cm
    }
}

#let total-overlap-area(box-data, boxes) = {
    let total = 0cm
    for occupied in boxes {
        total += box-overlap-area(box-data, occupied)
    }

    total
}

#let station-y(stations, telecode) = {
    stations.find(station => station.stationTelecode == telecode).y
}

#let draw-text-placement(placement, shift-x, shift-y, chart-height) = {
    place(
        dx: shift-x + placement.minX,
        dy: border + chart-height - (placement.maxY + shift-y),
        placement.content,
    )
}

#let draw-line(
    x-start,
    y-start,
    x-end,
    y-end,
    stroke-color,
    stroke-width,
    shift-x,
    chart-height,
) = {
    let page-x-start = shift-x + x-start
    let page-y-start = border + chart-height - y-start
    let page-x-end = shift-x + x-end
    let page-y-end = border + chart-height - y-end

    place(
        dx: 0cm,
        dy: 0cm,
        line(
            start: (page-x-start, page-y-start),
            end: (page-x-end, page-y-end),
            stroke: (paint: stroke-color, thickness: stroke-width),
        ),
    )
}

#let draw-circle(x, y, radius, fill-color, shift-x, chart-height) = {
    place(
        dx: shift-x + x - radius,
        dy: border + chart-height - y - radius,
        circle(radius: radius, fill: fill-color),
    )
}

#let build-station-axis() = {
    let max-distance-km = if data.stations.len() > 0 {
        data.stations.last().cumulativeDistanceKm
    } else {
        0
    }
    let base-chart-height = calc.max(
        8cm,
        data.stations.len() * 0.9cm,
        max-distance-km / 180 * 1cm,
    ) * 2
    let base-y-scale = if max-distance-km > 0 {
        base-chart-height / max-distance-km
    } else {
        0cm
    }
    let projected-distance = 0cm
    let projected-stations = ()

    for index in range(data.stations.len()) {
        let station = data.stations.at(index)
        if index > 0 {
            let previous = data.stations.at(index - 1)
            let raw-gap-km = (
                station.cumulativeDistanceKm - previous.cumulativeDistanceKm
            )
            projected-distance += calc.max(
                raw-gap-km * base-y-scale,
                cm(data.layout.minStationGapCm),
            )
        }

        projected-stations.push((
            stationTelecode: station.stationTelecode,
            stationName: station.stationName,
            projectedDistance: projected-distance,
        ))
    }

    let chart-body-height = calc.max(base-chart-height, projected-distance)
    let stations = ()
    for station in projected-stations {
        stations.push((
            stationTelecode: station.stationTelecode,
            stationName: station.stationName,
            y: chart-body-height - station.projectedDistance,
        ))
    }

    (chartBodyHeight: chart-body-height, stations: stations)
}

#let build-midnight-marker-placements(chart-width, chart-body-height) = {
    let placements = ()

    for tick in data.timeAxis.ticks {
        if tick.isMidnight {
            placements.push(text-placement(
                project-time(tick.timestamp, chart-width),
                chart-body-height + cm(data.layout.midnightMarkerOffsetYCm),
                str(tick.midnightIndex),
                "south",
                pt(data.styles.largeTimeFontPt),
                text-fill: paint(data.styles.blackColor),
            ))
        }
    }

    placements
}

#let build-endpoint-time-candidates(stations, chart-width) = {
    let candidates = ()

    for node in data.nodes {
        let x-start = project-time(node.start.timestamp, chart-width)
        let x-end = project-time(node.end.timestamp, chart-width)
        let y-start = station-y(stations, node.start.stationTelecode)
        let y-end = station-y(stations, node.end.stationTelecode)
        let start-above-line = y-end < y-start
        let end-above-line = y-end >= y-start

        candidates.push((
            text: node.start.timeText,
            x: x-start,
            y: y-start + if start-above-line {
                cm(data.layout.endpointTimeOffsetYCm)
            } else {
                -cm(data.layout.endpointTimeOffsetYCm)
            },
            anchor: if start-above-line { "south" } else { "north" },
            direction: "right",
        ))
        candidates.push((
            text: node.end.timeText,
            x: x-end,
            y: y-end + if end-above-line {
                cm(data.layout.endpointTimeOffsetYCm)
            } else {
                -cm(data.layout.endpointTimeOffsetYCm)
            },
            anchor: if end-above-line { "south" } else { "north" },
            direction: "left",
        ))
    }

    candidates
}

#let place-endpoint-time-labels(candidates, occupied-boxes) = {
    let placed = ()
    let boxes = occupied-boxes
    let required-chart-width = 0cm
    let had-overlap-fallback = false
    let huge-area = 100000000cm

    for candidate in candidates {
        let selected = none
        let fallback = none
        let fallback-overlap-area = huge-area
        let used-fallback = false
        let candidate-metrics = measure(box(width: auto, inset: 1.1pt)[
            #text(size: pt(data.styles.largeTimeFontPt), candidate.text)
        ])
        let half-width = candidate-metrics.width / 2

        for step in range(data.layout.endpointTimeMaxHorizontalSteps + 1) {
            let candidate-x = if candidate.direction == "right" {
                (
                    candidate.x + cm(data.layout.endpointTimeMinXGapCm) + half-width + step * cm(data.layout.endpointTimeHorizontalStepCm)
                )
            } else {
                (
                    candidate.x - cm(data.layout.endpointTimeMinXGapCm) - half-width - step * cm(data.layout.endpointTimeHorizontalStepCm)
                )
            }
            let placement = text-placement(
                candidate-x,
                candidate.y,
                candidate.text,
                candidate.anchor,
                pt(data.styles.largeTimeFontPt),
                fill: paint(data.styles.whiteColor),
                inset: 1.1pt,
                text-fill: paint(data.styles.blackColor),
            )
            let occupied-box = expand-box(
                placement,
                cm(data.layout.endpointTimeMinXGapCm) / 2,
                0cm,
            )
            let overlap-area = total-overlap-area(occupied-box, boxes)

            if overlap-area == 0cm {
                selected = placement + (occupiedBox: occupied-box)
                break
            }

            if overlap-area < fallback-overlap-area {
                fallback-overlap-area = overlap-area
                fallback = placement + (occupiedBox: occupied-box)
            }
        }

        if selected == none {
            selected = fallback
            used-fallback = selected != none
        }

        if selected != none {
            if used-fallback and fallback-overlap-area > 0cm {
                had-overlap-fallback = true
            }

            boxes.push(selected.occupiedBox)
            placed.push(selected)
            required-chart-width = calc.max(
                required-chart-width,
                selected.occupiedBox.maxX + cm(data.layout.endpointTimeRightPaddingCm),
            )
        }
    }

    (
        placements: placed,
        occupiedBoxes: boxes,
        requiredChartWidth: required-chart-width,
        hadOverlapFallback: had-overlap-fallback,
    )
}

#let place-train-labels(stations, chart-width, occupied-boxes) = {
    let placed = ()
    let boxes = occupied-boxes
    let huge-area = 100000000cm

    for node in data.nodes {
        let x-start = project-time(node.start.timestamp, chart-width)
        let x-end = project-time(node.end.timestamp, chart-width)
        let y-start = station-y(stations, node.start.stationTelecode)
        let y-end = station-y(stations, node.end.stationTelecode)
        let default-direction = if y-end > y-start { 1 } else { -1 }
        let selected = none
        let fallback = none
        let fallback-score = huge-area

        for progress in data.layout.trainLabelCandidateProgress {
            for direction in (default-direction, -default-direction) {
                let base-x = x-start + (x-end - x-start) * progress
                let base-y = y-start + (y-end - y-start) * progress
                let placement = text-placement(
                    base-x + direction * cm(data.layout.trainLabelOffsetXCm),
                    base-y,
                    node.labelText,
                    if direction > 0 { "west" } else { "east" },
                    pt(data.styles.trainLabelFontPt),
                    fill: paint(data.styles.whiteColor),
                    inset: 2pt,
                    text-fill: paint(data.styles.blackColor),
                )
                let boundary-violation = calc.max(
                    0cm,
                    cm(data.layout.trainLabelSafeMinXCm) - placement.minX,
                ) + calc.max(
                    0cm,
                    (
                        placement.maxX - (chart-width - cm(data.layout.trainLabelSafeMaxXPaddingCm))
                    ),
                )
                let overlap-area = total-overlap-area(placement, boxes)
                let score = overlap-area + boundary-violation * 1000

                if boundary-violation == 0cm and overlap-area == 0cm {
                    selected = placement
                    break
                }

                if score < fallback-score {
                    fallback-score = score
                    fallback = placement
                }
            }

            if selected != none {
                break
            }
        }

        let final-placement = if selected != none { selected } else { fallback }
        if final-placement != none {
            boxes.push(final-placement)
            placed.push(final-placement)
        }
    }

    (placements: placed, occupiedBoxes: boxes)
}

#let render() = context {
    let axis = build-station-axis()
    let stations = axis.stations
    let chart-body-height = axis.chartBodyHeight
    let station-labels = ()
    let station-label-occupied-boxes = ()

    for station in stations {
        let placement = text-placement(
            cm(data.styles.leftLabelXCm),
            station.y,
            station.stationName,
            "east",
            pt(data.styles.largeCjkFontPt),
            text-fill: paint(data.styles.blackColor),
        )
        station-labels.push(placement)
        station-label-occupied-boxes.push(protected-station-label-box(placement))
    }

    let chart-width = calc.max(
        18cm,
        data.timeAxis.axisRangeSeconds / 3600 / 1.2 * 1cm,
    )
    let midnight-marker-placements = ()
    let endpoint-time-placements = ()
    let occupied-boxes = ()

    for iteration in range(data.layout.endpointTimeLayoutMaxIterations) {
        let current-midnight-marker-placements = build-midnight-marker-placements(
            chart-width,
            chart-body-height,
        )
        let current-occupied-boxes = ()
        for box-data in station-label-occupied-boxes {
            current-occupied-boxes.push(box-data)
        }
        for placement in current-midnight-marker-placements {
            current-occupied-boxes.push(placement)
        }

        let endpoint-result = place-endpoint-time-labels(
            build-endpoint-time-candidates(stations, chart-width),
            current-occupied-boxes,
        )
        let next-chart-width = calc.max(
            chart-width,
            endpoint-result.requiredChartWidth,
        )

        if next-chart-width > chart-width + 0.000001cm {
            chart-width = next-chart-width
        } else if (
            endpoint-result.hadOverlapFallback and
                iteration < data.layout.endpointTimeLayoutMaxIterations - 1
        ) {
            chart-width += cm(data.layout.endpointTimeRelayoutGrowthCm)
        } else {
            midnight-marker-placements = current-midnight-marker-placements
            endpoint-time-placements = endpoint-result.placements
            occupied-boxes = endpoint-result.occupiedBoxes
            break
        }
    }

    if endpoint-time-placements.len() == 0 and data.nodes.len() > 0 {
        midnight-marker-placements = build-midnight-marker-placements(
            chart-width,
            chart-body-height,
        )
        occupied-boxes = ()
        for box-data in station-label-occupied-boxes {
            occupied-boxes.push(box-data)
        }
        for placement in midnight-marker-placements {
            occupied-boxes.push(placement)
        }
        let endpoint-result = place-endpoint-time-labels(
            build-endpoint-time-candidates(stations, chart-width),
            occupied-boxes,
        )
        endpoint-time-placements = endpoint-result.placements
        occupied-boxes = endpoint-result.occupiedBoxes
    }

    let train-label-result = place-train-labels(
        stations,
        chart-width,
        occupied-boxes,
    )
    let train-label-placements = train-label-result.placements
    let header-placement = if data.headerText == none {
        none
    } else {
        top-right-text-placement(
            chart-width,
            chart-body-height + cm(data.layout.headerInfoOffsetYCm),
            data.headerText,
            pt(data.styles.headerFontPt),
            fill: paint(data.styles.whiteColor),
            inset: 2pt,
            text-fill: paint(data.styles.blackColor),
        )
    }
    let footer-placement = top-right-text-placement(
        chart-width,
        0cm,
        data.footerText,
        pt(data.styles.footerFontPt),
        text-fill: paint(data.styles.blackColor),
    )
    let all-boxes = ()
    for placement in station-labels {
        all-boxes.push(placement)
    }
    for placement in midnight-marker-placements {
        all-boxes.push(placement)
    }
    for placement in endpoint-time-placements {
        all-boxes.push(placement)
    }
    for placement in train-label-placements {
        all-boxes.push(placement)
    }
    if header-placement != none {
        all-boxes.push(header-placement)
    }
    all-boxes.push(footer-placement)

    let min-text-x = 0cm
    let max-text-x = chart-width
    let min-text-y = 0cm
    let max-text-y = chart-body-height
    for box-data in all-boxes {
        min-text-x = calc.min(min-text-x, box-data.minX)
        max-text-x = calc.max(max-text-x, box-data.maxX)
        min-text-y = calc.min(min-text-y, box-data.minY)
        max-text-y = calc.max(max-text-y, box-data.maxY)
    }

    let shift-y = calc.max(0cm, cm(data.layout.plotBottomPaddingCm) - min-text-y)
    let shift-x = border - min-text-x
    let chart-bottom-y = shift-y
    let chart-top-y = shift-y + chart-body-height
    let chart-height = shift-y + max-text-y + cm(data.layout.plotTopPaddingCm)
    let page-width = shift-x + max-text-x + border
    let page-height = chart-height + border * 2

    set page(width: page-width, height: page-height, margin: 0cm)

    for tick in data.timeAxis.ticks {
        let x = project-time(tick.timestamp, chart-width)
        draw-line(
            x,
            chart-bottom-y,
            x,
            chart-top-y,
            if tick.isMidnight {
                paint(data.styles.midnightLineColor)
            } else {
                paint(data.styles.gridLineColor)
            },
            if tick.isMidnight { 0.04cm } else { 0.01cm },
            shift-x,
            chart-height,
        )
    }

    for placement in midnight-marker-placements {
        draw-text-placement(placement, shift-x, shift-y, chart-height)
    }

    for station in stations {
        let y = station.y + shift-y
        draw-line(
            0cm,
            y,
            chart-width,
            y,
            paint(data.styles.stationLineColor),
            0.02cm,
            shift-x,
            chart-height,
        )
    }

    for placement in station-labels {
        draw-text-placement(placement, shift-x, shift-y, chart-height)
    }

    for node in data.nodes {
        let x-start = project-time(node.start.timestamp, chart-width)
        let x-end = project-time(node.end.timestamp, chart-width)
        let y-start = station-y(stations, node.start.stationTelecode) + shift-y
        let y-end = station-y(stations, node.end.stationTelecode) + shift-y
        let line-color = if calc.rem(node.routeNodeIndex, 2) == 0 {
            paint(data.styles.blueLineColor)
        } else {
            paint(data.styles.tealLineColor)
        }

        draw-line(
            x-start,
            y-start,
            x-end,
            y-end,
            line-color,
            0.08cm,
            shift-x,
            chart-height,
        )
        draw-circle(x-start, y-start, 0.06cm, line-color, shift-x, chart-height)
        draw-circle(x-end, y-end, 0.06cm, line-color, shift-x, chart-height)
    }

    for placement in endpoint-time-placements {
        draw-text-placement(placement, shift-x, shift-y, chart-height)
    }

    for placement in train-label-placements {
        draw-text-placement(placement, shift-x, shift-y, chart-height)
    }

    if header-placement != none {
        draw-text-placement(header-placement, shift-x, shift-y, chart-height)
    }

    draw-text-placement(footer-placement, shift-x, 0cm, chart-height)
}

#render()
