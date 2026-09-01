import { useEffect, useRef, useState, useCallback } from "react";
import { makeId, getBounds, hitTest, translateData, drawElement } from "../utils/drawing.js";
import Cursors from "./Cursors.jsx";

const PEN_WIDTH = 3;

// Simple leading-edge throttle so we don't flood the socket with every
// single pointermove event (cursor + stroke points are both high frequency).
function throttle(fn, ms) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    }
  };
}

export default function Canvas({ socketRef, elements, setElements, tool, color, self, canEdit }) {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);

  const [cursors, setCursors] = useState({}); // socketId -> {id,x,y,name,color}
  const [remoteStrokes, setRemoteStrokes] = useState({}); // socketId -> {points,color,width}
  const [editingNoteId, setEditingNoteId] = useState(null);

  // Refs for in-progress interaction state (avoids re-render churn during drag/draw).
  const drawState = useRef({ mode: null }); // mode: 'pen' | 'shape' | 'drag' | null

  useEffect(() => {
    if (!canEdit) {
      drawState.current = { mode: null };
    }
  }, [canEdit]);

  // ---------- Resize canvas to fill its container ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;

    function resize() {
      const rect = stage.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      redraw();
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Redraw whenever elements or remote in-progress strokes change ----------
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const el of elements) {
      if (el.type === "note") continue; // notes render as HTML overlay, not on canvas
      drawElement(ctx, el.type, el.data);
    }

    // Draw other users' strokes that are still being drawn (not yet persisted).
    for (const s of Object.values(remoteStrokes)) {
      drawElement(ctx, "stroke", s);
    }
  }, [elements, remoteStrokes]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // ---------- Socket listeners for ephemeral / live-drawing events ----------
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const onCursorMove = ({ id, x, y, name, color }) => {
      setCursors((prev) => ({ ...prev, [id]: { id, x, y, name, color } }));
    };

    const onStrokeStart = (payload) => {
      setRemoteStrokes((prev) => ({
        ...prev,
        [payload.socketId]: { points: [{ x: payload.x, y: payload.y }], color: payload.color, width: payload.width },
      }));
    };

    const onStrokePoint = (payload) => {
      setRemoteStrokes((prev) => {
        const existing = prev[payload.socketId];
        if (!existing) return prev;
        return {
          ...prev,
          [payload.socketId]: { ...existing, points: [...existing.points, { x: payload.x, y: payload.y }] },
        };
      });
    };

    const onStrokeEnd = (payload) => {
      setRemoteStrokes((prev) => {
        const next = { ...prev };
        delete next[payload.socketId];
        return next;
      });
    };

    const onUserLeft = ({ id }) => {
      setCursors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setRemoteStrokes((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    };

    socket.on("cursor:move", onCursorMove);
    socket.on("stroke:start", onStrokeStart);
    socket.on("stroke:point", onStrokePoint);
    socket.on("stroke:end", onStrokeEnd);
    socket.on("user:left", onUserLeft);

    return () => {
      socket.off("cursor:move", onCursorMove);
      socket.off("stroke:start", onStrokeStart);
      socket.off("stroke:point", onStrokePoint);
      socket.off("stroke:end", onStrokeEnd);
      socket.off("user:left", onUserLeft);
    };
  }, [socketRef]);

  // ---------- Pointer helpers ----------
  function getPos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  const emitCursor = useRef(
    throttle((x, y) => {
      socketRef.current?.emit("cursor:move", { x, y });
    }, 40)
  ).current;

  const emitStrokePoint = useRef(
    throttle((x, y) => {
      socketRef.current?.emit("stroke:point", { x, y });
    }, 20)
  ).current;

  // ---------- Pointer down: start drawing / dragging / placing a note ----------
  function handlePointerDown(e) {
    if (!canEdit) return;

    const { x, y } = getPos(e);
    const socket = socketRef.current;

    if (tool === "eraser") {
      const hit = [...elements].reverse().find((el) => el.type !== "note" && hitTest(el.type, el.data, x, y));
      const hitNote = [...elements].reverse().find((el) => el.type === "note" && hitTest(el.type, el.data, x, y));
      const target = hit || hitNote;

      if (target) {
        setElements((prev) => prev.filter((el) => el.clientId !== target.clientId));
        socket?.emit("element:delete", { clientId: target.clientId });
      }

      return;
    }

    if (tool === "pen") {
      const clientId = makeId();
      drawState.current = { mode: "pen", clientId, points: [{ x, y }], color, width: PEN_WIDTH };
      socket?.emit("stroke:start", { clientId, x, y, color, width: PEN_WIDTH });
      // Optimistic local preview while drawing (rendered like a remote stroke would be).
      setRemoteStrokes((prev) => ({ ...prev, __self: { points: [{ x, y }], color, width: PEN_WIDTH } }));
    } else if (["rect", "ellipse", "line"].includes(tool)) {
      const clientId = makeId();
      drawState.current = { mode: "shape", clientId, type: tool, startX: x, startY: y };
    } else if (tool === "note") {
      const clientId = makeId();
      const data = { x, y, w: 180, h: 120, text: "", color: "#FEF08A" };
      const optimistic = { clientId, type: "note", data, createdBy: self?.name };
      setElements((prev) => [...prev, optimistic]);
      socket?.emit("element:add", { clientId, type: "note", data });
      setEditingNoteId(clientId);
    } else if (tool === "select") {
      // Topmost element under the cursor (reverse search = last drawn = on top).
      const hit = [...elements].reverse().find((el) => el.type !== "note" && hitTest(el.type, el.data, x, y));
      const hitNote = [...elements].reverse().find((el) => el.type === "note" && hitTest(el.type, el.data, x, y));
      const target = hit || hitNote;
      if (target) {
        drawState.current = { mode: "drag", clientId: target.clientId, type: target.type, lastX: x, lastY: y };
      }
    }
  }

  // ---------- Pointer move: continue drawing / dragging, always broadcast cursor ----------
  function handlePointerMove(e) {
    const { x, y } = getPos(e);
    emitCursor(x, y);

    const state = drawState.current;
    if (!state.mode) return;

    if (state.mode === "pen") {
      state.points.push({ x, y });
      setRemoteStrokes((prev) => ({
        ...prev,
        __self: { points: [...state.points], color: state.color, width: state.width },
      }));
      emitStrokePoint(x, y);
    } else if (state.mode === "shape") {
      // Live local preview only (not broadcast until finalized on pointer up).
      setRemoteStrokes((prev) => ({
        ...prev,
        __selfShapePreview: shapePreviewToStroke(state.type, state.startX, state.startY, x, y, color),
      }));
    } else if (state.mode === "drag") {
      const dx = x - state.lastX;
      const dy = y - state.lastY;
      state.lastX = x;
      state.lastY = y;
      setElements((prev) =>
        prev.map((el) => (el.clientId === state.clientId ? { ...el, data: translateData(el.type, el.data, dx, dy) } : el))
      );
    }
  }

  // ---------- Pointer up: finalize the current action ----------
  function handlePointerUp(e) {
    if (!canEdit) return;

    const { x, y } = getPos(e);
    const state = drawState.current;
    const socket = socketRef.current;
    if (!state.mode) return;

    if (state.mode === "pen") {
      socket?.emit("stroke:end", { clientId: state.clientId, points: state.points, color: state.color, width: state.width });
      setElements((prev) => [
        ...prev,
        { clientId: state.clientId, type: "stroke", data: { points: state.points, color: state.color, width: state.width }, createdBy: self?.name },
      ]);
      setRemoteStrokes((prev) => {
        const next = { ...prev };
        delete next.__self;
        return next;
      });
    } else if (state.mode === "shape") {
      const data = shapeData(state.type, state.startX, state.startY, x, y, color);
      // Ignore accidental zero-size shapes (a click without a drag).
      if (Math.abs(x - state.startX) > 2 || Math.abs(y - state.startY) > 2) {
        setElements((prev) => [...prev, { clientId: state.clientId, type: state.type, data, createdBy: self?.name }]);
        socket?.emit("element:add", { clientId: state.clientId, type: state.type, data });
      }
      setRemoteStrokes((prev) => {
        const next = { ...prev };
        delete next.__selfShapePreview;
        return next;
      });
    } else if (state.mode === "drag") {
      const el = elements.find((e2) => e2.clientId === state.clientId);
      if (el) socket?.emit("element:update", { clientId: el.clientId, data: el.data });
    }

    drawState.current = { mode: null };
  }

  function shapeData(type, x1, y1, x2, y2, color) {
    if (type === "line") return { x1, y1, x2, y2, color, strokeWidth: 2 };
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1, color, strokeWidth: 2 };
  }

  // Renders an in-progress shape drag using the stroke-preview mechanism so we
  // don't need a second canvas layer just for "currently being drawn" shapes.
  function shapePreviewToStroke(type, x1, y1, x2, y2, color) {
    if (type === "line") return { points: [{ x: x1, y: y1 }, { x: x2, y: y2 }], color, width: 2 };
    const pts = [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
      { x: x1, y: y1 },
    ];
    return { points: pts, color, width: 2 };
  }

  // ---------- Sticky note text editing ----------
  function commitNoteText(clientId, text) {
    setElements((prev) => prev.map((el) => (el.clientId === clientId ? { ...el, data: { ...el.data, text } } : el)));
    const el = elements.find((e2) => e2.clientId === clientId);
    const data = { ...(el?.data || {}), text };
    socketRef.current?.emit("element:update", { clientId, data });
    setEditingNoteId(null);
  }

  const notes = elements.filter((el) => el.type === "note");

  return (
    <div className="canvas-container">
      <div className="canvas-stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          className={`board tool-${tool}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />

        {/* Sticky notes rendered as real HTML so text stays crisp and editable */}
        {notes.map((note) => (
          <div
            key={note.clientId}
            className="sticky-note"
            style={{
              left: note.data.x,
              top: note.data.y,
              width: Math.abs(note.data.w),
              height: Math.abs(note.data.h),
              background: note.data.color,
            }}
            onDoubleClick={() => setEditingNoteId(note.clientId)}
          >
            {editingNoteId === note.clientId ? (
              <textarea
                autoFocus
                defaultValue={note.data.text}
                onBlur={(e) => commitNoteText(note.clientId, e.target.value)}
              />
            ) : (
              <div className="note-text">{note.data.text || "Double-click to edit"}</div>
            )}
          </div>
        ))}

        <Cursors cursors={cursors} />
      </div>
    </div>
  );
}
