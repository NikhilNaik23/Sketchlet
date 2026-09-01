export default function Cursors({ cursors }) {
  return (
    <div className="cursors-layer">
      {Object.values(cursors).map((c) => (
        <div
          key={c.id}
          className="remote-cursor"
          style={{ transform: `translate(${c.x}px, ${c.y}px)` }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M2 2L18 9L10 11L8 18L2 2Z" fill={c.color} stroke="white" strokeWidth="1" />
          </svg>
          <span className="cursor-label" style={{ background: c.color }}>
            {c.name}
          </span>
        </div>
      ))}
    </div>
  );
}
