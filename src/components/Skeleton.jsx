export function SkeletonRows({ rows = 5, avatar = true }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div className="skel-row" key={i}>
          {avatar && <span className="skel" style={{ width: 30, height: 30, borderRadius: '50%', flex: 'none' }} />}
          <span className="skel" style={{ height: 10, width: `${38 + ((i * 13) % 34)}%` }} />
          <span className="skel" style={{ height: 10, width: 70, marginLeft: 'auto' }} />
        </div>
      ))}
    </div>
  )
}

export function SkeletonTiles({ count = 4 }) {
  return (
    <div className="grid grid-4">
      {Array.from({ length: count }).map((_, i) => (
        <div className="tile" key={i}>
          <span className="skel" style={{ height: 30, width: 30, borderRadius: 9 }} />
          <span className="skel" style={{ height: 26, width: 62, marginTop: 8 }} />
          <span className="skel" style={{ height: 9, width: '70%', marginTop: 6 }} />
        </div>
      ))}
    </div>
  )
}
