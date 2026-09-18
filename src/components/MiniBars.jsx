import { useState } from 'react'

/**
 * One series, magnitude over a short time range — a plain bar chart.
 * Built from HTML rather than a stretched SVG so the labels stay crisp at
 * any container width. No legend (the card title names the series); every
 * bar has a hover tooltip; the grid is a recessive track behind each bar.
 */
export default function MiniBars({ data, valueLabel = 'value', height = 150 }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...data.map((d) => d.value))

  return (
    <div className="bars" style={{ '--bars-h': `${height}px` }}>
      {data.map((d, i) => {
        const pct = (d.value / max) * 100
        return (
          <div
            className="bars-col"
            key={d.label + i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            {hover === i && (
              <div className="bars-tip">
                <b>{d.value}</b> {valueLabel}
                {d.sub ? <span className="bars-tip-sub">{d.sub}</span> : null}
              </div>
            )}
            <div className="bars-track">
              <div
                className="bars-fill"
                style={{ height: `${d.value > 0 ? Math.max(pct, 4) : 0}%` }}
                aria-hidden="true"
              />
            </div>
            <span className="bars-label">{d.label}</span>
            <span className="sr-only">{`${d.label}: ${d.value} ${valueLabel}`}</span>
          </div>
        )
      })}
    </div>
  )
}
