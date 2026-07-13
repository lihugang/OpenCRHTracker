#let data = json(
  ```
  __RENDER_DATA__
  ```.text,
)

#set text(
  font: "Noto Serif CJK SC",
  fill: black,
)

#set page(
  width: auto,
  height: auto,
  header: align(right, data.headerText),
  footer: align(right, data.footerText),
)

#set document(author: "Open CRH Tracker")

// helper functions
#let lerp(a, b, v) = {
  let is_scalar = type(a) != array and type(b) != array
  let a_arr = if type(a) != array { (a,) } else { a }
  let b_arr = if type(b) != array { (b,) } else { b }
  let result = a_arr
    .zip(b_arr)
    .map(((min, max)) => {
      (max - min) * v + min
    })
  if is_scalar { result.at(0) } else { result }
}
// inverse lerp
#let ilerp(tmin, tmax, t) = (t - tmin) / (tmax - tmin)
// inverse lerp with time preapplied
#let ilerpt = ilerp.with(
  data.timeAxis.axisStartTimestamp,
  data.timeAxis.axisEndTimestamp,
)

#let get-height(stn) = (
  data.stations.find(dtn => dtn.stationName == stn).cumulativeDistanceKm * 0.20mm
)

#let epoch = datetime(
  year: 1970,
  month: 01,
  day: 01,
  hour: 8, // timezone offset
  minute: 0,
  second: 0,
)

#let get-interval-marks(start, end, interval-seconds) = {
  if start == end { return () }
  let first-index = calc.ceil(start / interval-seconds)
  let last-index = calc.floor(end / interval-seconds)
  let marks = ()
  if first-index > last-index {
    return ()
  }
  for index in range(int(first-index), int(last-index) + 1) {
    let mark-timestamp = index * interval-seconds
    let progress = (mark-timestamp - start) / (end - start)
    marks.push((mark-timestamp, progress))
  }
  marks
}

#let grid-content = {
  // mark placement
  for (_, mark) in get-interval-marks(
    data.timeAxis.axisStartTimestamp + 8 * 3600,
    data.timeAxis.axisEndTimestamp + 8 * 3600,
    data.timeAxis.timeGridStepSeconds,
  ) {
    place(line(
      stroke: .7pt + luma(90%),
      start: (mark * 100%, 0%),
      end: (mark * 100%, 100%),
    ))
  }
  for (timestamp, mark) in get-interval-marks(
    data.timeAxis.axisStartTimestamp + 8 * 3600,
    data.timeAxis.axisEndTimestamp + 8 * 3600,
    86400,
  ) {
    place(line(stroke: 1pt, start: (mark * 100%, 0%), end: (mark * 100%, 100%)))
    place(dx: mark * 100%, dy: 0%, place(
      center + bottom,
      pad(
        .5em,
        (epoch + duration(seconds: timestamp)).display("[month]-[day]"),
      ),
    ))
  }
  // line placemenet
  for nd in data.nodes {
    let start-pos = (
      ilerpt(nd.start.timestamp) * 100%,
      get-height(nd.start.stationName),
    )
    let end-pos = (
      ilerpt(nd.end.timestamp) * 100%,
      get-height(nd.end.stationName),
    )
    let is-downwards = start-pos.at(1) < end-pos.at(1)
    let fill = if is-downwards { rgb(data.styles.blueLineColor) } else {
      rgb(data.styles.tealLineColor)
    }
    place(curve(
      stroke: 2pt + fill,
      curve.move(start-pos),
      curve.line(end-pos),
    ))
    let (label-pos-x, label-pos-y) = lerp(start-pos, end-pos, 1 / 4)
    place(dx: label-pos-x + .5cm, dy: label-pos-y, place(
      horizon + left,
      nd.labelText,
    ))
    for ((x, y), t, align) in (
      (
        start-pos,
        nd.start.timestamp,
        left + if is-downwards { bottom } else { top },
      ),
      (
        end-pos,
        nd.end.timestamp,
        right + if is-downwards { top } else { bottom },
      ),
    ) {
      place(dx: x, dy: y, {
        place(center + horizon, circle(
          radius: 2.5pt,
          stroke: none,
          fill: fill,
        ))
        place(align, pad(
          .5em,
          (epoch + duration(seconds: t)).display("[hour]:[minute]"),
        ))
      })
    }
  }
}

#grid(
  stroke: (x, y) => if x == 1 { (y: 1pt) },
  column-gutter: .5cm,
  columns: (
    auto,
    (data.timeAxis.axisEndTimestamp - data.timeAxis.axisStartTimestamp) * 0.0026mm,
  ),
  rows: data
    .stations
    .fold(
      (0mm,),
      (acc, stn) => {
        acc + (stn.cumulativeDistanceKm * 0.20mm - acc.last(),)
      },
    )
    .slice(1),
  ..data
    .stations
    .map(stn => text(size: 15pt, move(dy: .4em, stn.stationName.clusters().join(h(1fr)))))
    .map(n => grid.cell(x: 0, n, align: bottom + right)),
  grid.cell(rowspan: data.stations.len(), grid-content),
)
