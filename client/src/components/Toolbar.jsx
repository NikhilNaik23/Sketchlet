const TOOLS = [
  { id: "select", label: "Select", icon: "\u2196" },
  { id: "pen", label: "Pen", icon: "\u270F" },
  { id: "eraser", label: "Eraser", icon: "\u232b" },
  { id: "rect", label: "Rectangle", icon: "\u25AD" },
  { id: "ellipse", label: "Ellipse", icon: "\u25EF" },
  { id: "line", label: "Line", icon: "\u2571" },
  { id: "note", label: "Sticky note", icon: "\u{1F4DD}" },
];

const SWATCHES = ["#111827", "#EF4444", "#F97316", "#EAB308", "#22C55E", "#06B6D4", "#3B82F6", "#8B5CF6", "#EC4899"];

export default function Toolbar({
  tool,
  setTool,
  color,
  setColor,
  connected,
  users,
  self,
  onClear,
  rooms,
  currentRoom,
  onSelectRoom,
  roomName,
  setRoomName,
  joinCode,
  setJoinCode,
  onCreateRoom,
  onJoinRoom,
  onLogout,
  authUser,
  currentRole,
  canEdit,
  roomMembers,
  roomRequests,
  requestRoles,
  onChangeRequestRole,
  onChangeMemberRole,
  onRequestAction,
}) {
  return (
    <div className="toolbar">
      <div className="toolbar-section">
        <span className="brand">Sketchlet</span>
        <span className={`status-dot ${connected ? "online" : "offline"}`} title={connected ? "Connected" : "Disconnected"} />
      </div>

      <div className="toolbar-section room-switcher">
        <label className="inline-label">
          <span>Room</span>
          <select value={currentRoom?.slug || ""} onChange={(event) => onSelectRoom(event.target.value)}>
            {rooms.map((room) => (
              <option key={room.id} value={room.slug}>
                {room.name}
              </option>
            ))}
          </select>
        </label>

        <form className="room-form" onSubmit={onCreateRoom}>
          <input value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="New room" />
          <button type="submit">Create</button>
        </form>

        <form className="room-form" onSubmit={onJoinRoom}>
          <input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="Room name or code" />
          <button type="submit">Request access</button>
        </form>
      </div>

      <div className="toolbar-section tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`tool-btn ${tool === t.id ? "active" : ""}`}
            onClick={() => setTool(t.id)}
            disabled={!canEdit && t.id !== "select"}
            title={t.label}
          >
            <span className="tool-icon">{t.icon}</span>
            <span className="tool-label">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="toolbar-section">
        <div className="swatches">
          {SWATCHES.map((c) => (
            <button
              key={c}
              className={`swatch ${color === c ? "active" : ""}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              title={c}
            />
          ))}
        </div>
      </div>

      <div className="toolbar-section">
        <button className="clear-btn" onClick={onClear} disabled={!canEdit}>
          Clear board
        </button>
      </div>

      <div className="toolbar-section account-chip">
        {authUser && (
          <span className="presence-chip self">
            <span className="dot" style={{ background: authUser.color }} />
            {authUser.name}
          </span>
        )}
        {currentRole && <span className={`role-pill role-${currentRole}`}>{currentRole}</span>}
        <button className="ghost-btn logout-btn" onClick={onLogout}>
          Sign out
        </button>
      </div>

      {roomMembers?.length > 0 && (
        <div className="toolbar-section members-panel">
          <span className="members-title">Room members</span>
          <div className="members-list">
            {roomMembers.map((member) => (
              <div key={member.id} className="member-row">
                <span className="presence-chip" style={{ borderColor: member.color }}>
                  <span className="dot" style={{ background: member.color }} />
                  {member.name}
                </span>
                <span className="member-email">{member.email}</span>
                <select
                  value={member.role}
                  disabled={currentRole !== "owner" || member.id === authUser?.id}
                  onChange={(event) => onChangeMemberRole(member.id, event.target.value)}
                >
                  <option value="viewer">view only</option>
                  <option value="editor">view and edit</option>
                  <option value="owner">owner</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {currentRole === "owner" && roomRequests?.length > 0 && (
        <div className="toolbar-section members-panel">
          <span className="members-title">Access requests</span>
          <div className="members-list">
            {roomRequests.map((request) => (
              <div key={request.id} className="member-row">
                <span className="presence-chip" style={{ borderColor: request.color }}>
                  <span className="dot" style={{ background: request.color }} />
                  {request.name}
                </span>
                <span className="member-email">{request.email}</span>
                <div className="request-actions">
                  <select value={requestRoles?.[request.id] || "viewer"} onChange={(event) => onChangeRequestRole(request.id, event.target.value)}>
                    <option value="viewer">view only</option>
                    <option value="editor">view and edit</option>
                  </select>
                  <button type="button" onClick={() => onRequestAction(request.id, "accept")}>Accept</button>
                  <button type="button" onClick={() => onRequestAction(request.id, "reject")}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="toolbar-section presence">
        {self && (
          <span className="presence-chip self" style={{ borderColor: self.color }}>
            <span className="dot" style={{ background: self.color }} />
            {self.name} (you)
          </span>
        )}
        {users.map((u) => (
          <span key={u.id} className="presence-chip" style={{ borderColor: u.color }}>
            <span className="dot" style={{ background: u.color }} />
            {u.name}
          </span>
        ))}
      </div>
    </div>
  );
}
