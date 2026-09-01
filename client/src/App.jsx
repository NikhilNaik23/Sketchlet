import { useEffect, useState } from "react";
import { useSocket } from "./hooks/useSocket.js";
import Toolbar from "./components/Toolbar.jsx";
import Canvas from "./components/Canvas.jsx";

const API_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:5000";
const TOKEN_KEY = "mini-figma-token";

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const { socketRef, connected } = useSocket(token);

  const [authUser, setAuthUser] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [elements, setElements] = useState([]);
  const [users, setUsers] = useState([]);
  const [self, setSelf] = useState(null);
  const [roomMembers, setRoomMembers] = useState([]);
  const [roomRequests, setRoomRequests] = useState([]);
  const [requestRoles, setRequestRoles] = useState({});
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [roomName, setRoomName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState("info");
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#111827");

  function setSession(nextToken, payload) {
    localStorage.setItem(TOKEN_KEY, nextToken);
    setToken(nextToken);
    setAuthUser(payload.user || null);
    setRooms(payload.rooms || []);
    setCurrentRoom(payload.primaryRoom || payload.rooms?.[0] || null);
    setStatusMessage("");
  }

  function clearSession(message = "") {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setAuthUser(null);
    setRooms([]);
    setCurrentRoom(null);
    setElements([]);
    setUsers([]);
    setRoomMembers([]);
    setRoomRequests([]);
    setRequestRoles({});
    setSelf(null);
    setStatusMessage(message);
    setShowClearConfirm(false);
  }

  async function loadRoomDetails(roomKey) {
    if (!roomKey) return null;
    const data = await apiRequest(`/api/rooms/${encodeURIComponent(roomKey)}`, { method: "GET" });
    setCurrentRoom(data.room);
    setRoomMembers(data.members || []);
    setRoomRequests(data.requests || []);
    setRequestRoles((prev) => {
      const next = { ...prev };
      for (const request of data.requests || []) {
        if (!next[request.id]) next[request.id] = "viewer";
      }
      return next;
    });
    return data;
  }

  async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || "Request failed.");
      error.data = data;
      throw error;
    }

    return data;
  }

  useEffect(() => {
    if (!statusMessage || statusType === "error") return undefined;

    const timer = window.setTimeout(() => {
      setStatusMessage("");
    }, 3500);

    return () => window.clearTimeout(timer);
  }, [statusMessage, statusType]);

  useEffect(() => {
    if (!token) return undefined;

    let cancelled = false;

    async function hydrateSession() {
      try {
        const data = await apiRequest("/api/me", { method: "GET" });
        if (cancelled) return;

        setAuthUser(data.user);
        setRooms(data.rooms || []);
        const primaryRoom = data.primaryRoom || data.rooms?.[0] || null;
        setCurrentRoom(primaryRoom);
        if (primaryRoom?.slug) {
          loadRoomDetails(primaryRoom.slug).catch(() => {});
        }
      } catch (error) {
        if (!cancelled) {
          clearSession(error.message);
        }
      }
    }

    hydrateSession();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ---------- Wire up the events that mutate persisted board state ----------
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !connected) return;

    const onInit = ({ self, room, elements, users }) => {
      setSelf(self);
      if (room) {
        setCurrentRoom(room);
        setRooms((prev) => {
          const next = prev.filter((item) => item.id !== room.id);
          return [room, ...next];
        });
        loadRoomDetails(room.slug).catch(() => {});
      }
      setElements(elements);
      setUsers(users.filter((u) => u.id !== self.id));
    };

    const onUserJoined = (user) => {
      setUsers((prev) => (prev.some((u) => u.id === user.id) ? prev : [...prev, user]));
    };

    const onUserLeft = ({ id }) => {
      setUsers((prev) => prev.filter((u) => u.id !== id));
    };

    const onElementAdd = (element) => {
      setElements((prev) => (prev.some((e) => e.clientId === element.clientId) ? prev : [...prev, element]));
    };

    const onElementUpdate = (element) => {
      setElements((prev) => prev.map((e) => (e.clientId === element.clientId ? element : e)));
    };

    const onElementDelete = ({ clientId }) => {
      setElements((prev) => prev.filter((e) => e.clientId !== clientId));
    };

    const onCanvasClear = () => setElements([]);

    const onRoomJoinRequested = () => {
      if (currentRoom?.slug) {
        loadRoomDetails(currentRoom.slug).catch(() => {});
      }
    };

    const onRoomMembersUpdated = (payload = {}) => {
      if (payload.memberId && authUser?._id && payload.memberId === authUser._id.toString() && payload.role) {
        setCurrentRoom((prev) => (prev ? { ...prev, role: payload.role } : prev));
      }

      if (currentRoom?.slug) {
        loadRoomDetails(currentRoom.slug).catch(() => {});
      }
    };

    const onRoomAccessReviewed = async (payload = {}) => {
      if (payload.status === "accepted") {
        setStatusType("success");
        setStatusMessage(`Access approved for ${payload.roomName || "the room"}. Select it from the room list to open it.`);
      } else {
        setStatusType("info");
        setStatusMessage(`Access request rejected for ${payload.roomName || "the room"}.`);
      }

      const data = await apiRequest("/api/me", { method: "GET" }).catch(() => null);
      if (data) {
        setRooms(data.rooms || []);
      }
    };

    socket.on("canvas:init", onInit);
    socket.on("user:joined", onUserJoined);
    socket.on("user:left", onUserLeft);
    socket.on("element:add", onElementAdd);
    socket.on("element:update", onElementUpdate);
    socket.on("element:delete", onElementDelete);
    socket.on("canvas:clear", onCanvasClear);
    socket.on("room:join-requested", onRoomJoinRequested);
    socket.on("room:members-updated", onRoomMembersUpdated);
    socket.on("room:access-reviewed", onRoomAccessReviewed);

    return () => {
      socket.off("canvas:init", onInit);
      socket.off("user:joined", onUserJoined);
      socket.off("user:left", onUserLeft);
      socket.off("element:add", onElementAdd);
      socket.off("element:update", onElementUpdate);
      socket.off("element:delete", onElementDelete);
      socket.off("canvas:clear", onCanvasClear);
      socket.off("room:join-requested", onRoomJoinRequested);
      socket.off("room:members-updated", onRoomMembersUpdated);
      socket.off("room:access-reviewed", onRoomAccessReviewed);
    };
  }, [authUser?._id, connected, token, socketRef, currentRoom?.slug]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !connected || !currentRoom?.slug) return;

    socket.emit("room:join", { roomKey: currentRoom.slug });
  }, [connected, currentRoom?.slug, socketRef]);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setStatusMessage("");

    try {
      const path = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload = {
        email: authForm.email,
        password: authForm.password,
        ...(authMode === "register" ? { name: authForm.name } : {}),
      };
      const data = await apiRequest(path, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setSession(data.token, data);
      setAuthForm({ name: "", email: "", password: "" });
      setAuthMode("login");
      setStatusType("success");
      setStatusMessage(authMode === "login" ? "Signed in." : "Account created.");

      if (data.primaryRoom?.slug && data.joined) {
        loadRoomDetails(data.primaryRoom.slug).catch(() => {});
      }
    } catch (error) {
      setStatusType("error");
      setStatusMessage(error.message);
    }
  }

  async function handleCreateRoom(event) {
    event.preventDefault();
    if (!roomName.trim()) return;

    try {
      const data = await apiRequest("/api/rooms", {
        method: "POST",
        body: JSON.stringify({ name: roomName }),
      });

      setRooms((prev) => [data.room, ...prev.filter((room) => room.id !== data.room.id)]);
      setCurrentRoom(data.room);
      loadRoomDetails(data.room.slug).catch(() => {});
      setRoomName("");
      setStatusType("success");
      setStatusMessage(`Created room ${data.room.name}.`);
    } catch (error) {
      setStatusType("error");
      setStatusMessage(error.message);
    }
  }

  async function handleJoinRoom(event) {
    event.preventDefault();
    if (!joinCode.trim()) return;

    try {
      const data = await apiRequest("/api/rooms/join", {
        method: "POST",
        body: JSON.stringify({ roomKey: joinCode }),
      });

      if (data.pending) {
        setStatusType("info");
        setStatusMessage(data.message || "Join request sent.");
      } else {
        setRooms((prev) => [data.room, ...prev.filter((room) => room.id !== data.room.id)]);
        setCurrentRoom(data.room);
        loadRoomDetails(data.room.slug).catch(() => {});
        setStatusType("success");
        setStatusMessage(`Joined ${data.room.name}.`);
      }
      setJoinCode("");
    } catch (error) {
      setStatusType("error");
      setStatusMessage(error.message);
    }
  }

  function handleSelectRoom(slug) {
    const room = rooms.find((item) => item.slug === slug);
    if (room) {
      setCurrentRoom(room);
      setStatusMessage("");
      loadRoomDetails(room.slug).catch(() => {});
    }
  }

  async function handleChangeMemberRole(memberId, role) {
    if (!currentRoom?.slug) return;

    try {
      await apiRequest(`/api/rooms/${encodeURIComponent(currentRoom.slug)}/members/${memberId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });

      await loadRoomDetails(currentRoom.slug);
      setStatusType("success");
      setStatusMessage("Member permissions updated.");
    } catch (error) {
      setStatusType("error");
      setStatusMessage(error.message);
    }
  }

  async function handleRequestAction(memberId, action) {
    if (!currentRoom?.slug) return;

    try {
      const role = requestRoles[memberId] || "viewer";
      await apiRequest(`/api/rooms/${encodeURIComponent(currentRoom.slug)}/requests/${memberId}/${action}`, {
        method: "POST",
        body: action === "accept" ? JSON.stringify({ role }) : undefined,
      });

      await loadRoomDetails(currentRoom.slug);
      setStatusType("success");
      setStatusMessage(action === "accept" ? "Join request accepted." : "Join request rejected.");
    } catch (error) {
      setStatusType("error");
      setStatusMessage(error.message);
    }
  }

  function handleLogout() {
    clearSession("Signed out.");
  }

  function handleClear() {
    setShowClearConfirm(true);
  }

  function confirmClear() {
    socketRef.current?.emit("canvas:clear");
    setElements([]);
    setShowClearConfirm(false);
    setStatusType("success");
    setStatusMessage("Board cleared for everyone.");
  }

  function cancelClear() {
    setShowClearConfirm(false);
  }

  const canEdit = currentRoom?.role === "owner" || currentRoom?.role === "editor";

  if (!token) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-brand">
            <span className="brand-mark">SL</span>
            <div>
              <div className="brand">Sketchlet</div>
              <div className="auth-subtitle">Secure collaborative whiteboards with rooms and roles.</div>
            </div>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {authMode === "register" && (
              <label className="field">
                <span>Name</span>
                <input
                  value={authForm.name}
                  onChange={(event) => setAuthForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Ada Lovelace"
                  autoComplete="name"
                />
              </label>
            )}

            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={authForm.email}
                onChange={(event) => setAuthForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="ada@example.com"
                autoComplete="email"
              />
            </label>

            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthForm((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="At least 8 characters"
                autoComplete={authMode === "login" ? "current-password" : "new-password"}
              />
            </label>

            <button className="primary-btn" type="submit">
              {authMode === "login" ? "Sign in" : "Create account"}
            </button>

            <button
              className="ghost-btn"
              type="button"
              onClick={() => {
                setAuthMode(authMode === "login" ? "register" : "login");
                setStatusMessage("");
              }}
            >
              {authMode === "login" ? "Need an account? Register" : "Already have an account? Sign in"}
            </button>
          </form>

          {statusMessage && <div className={`status-banner ${statusType}`}>{statusMessage}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {showClearConfirm && (
        <div className="modal-backdrop" onClick={cancelClear}>
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="clear-board-title" onClick={(event) => event.stopPropagation()}>
            <div className="confirm-modal-header">
              <div className="confirm-badge">Clear board</div>
              <button className="icon-close" type="button" onClick={cancelClear} aria-label="Close dialog">
                ×
              </button>
            </div>
            <h2 id="clear-board-title">Erase every element in this room?</h2>
            <p>
              This removes all shapes, notes, and strokes for everyone in the room. The action cannot be undone.
            </p>
            <div className="confirm-actions">
              <button className="ghost-btn" type="button" onClick={cancelClear}>
                Cancel
              </button>
              <button className="danger-btn" type="button" onClick={confirmClear}>
                Clear board
              </button>
            </div>
          </div>
        </div>
      )}
      <Toolbar
        tool={tool}
        setTool={setTool}
        color={color}
        setColor={setColor}
        connected={connected}
        users={users}
        self={self}
        onClear={handleClear}
        rooms={rooms}
        currentRoom={currentRoom}
        onSelectRoom={handleSelectRoom}
        roomName={roomName}
        setRoomName={setRoomName}
        joinCode={joinCode}
        setJoinCode={setJoinCode}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        onLogout={handleLogout}
        authUser={authUser}
        currentRole={currentRoom?.role}
        canEdit={canEdit}
        roomMembers={roomMembers}
        roomRequests={roomRequests}
        requestRoles={requestRoles}
        onChangeRequestRole={(memberId, role) => setRequestRoles((prev) => ({ ...prev, [memberId]: role }))}
        onChangeMemberRole={handleChangeMemberRole}
        onRequestAction={handleRequestAction}
      />
      {statusMessage && <div className={`status-banner room-banner ${statusType}`}>{statusMessage}</div>}
      <Canvas
        socketRef={socketRef}
        elements={elements}
        setElements={setElements}
        tool={tool}
        color={color}
        self={self}
        canEdit={canEdit}
      />
    </div>
  );
}
