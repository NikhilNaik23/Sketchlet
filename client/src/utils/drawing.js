// Pure helper functions for rendering elements onto a 2D canvas context,
// computing bounding boxes (for hit-testing / selection), and translating
// an element's geometry when it's dragged. Kept framework-agnostic so it's
// easy to unit test or reuse.

export function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getBounds(type, data) {
  switch (type) {
    case "stroke": {
      const xs = data.points.map((p) => p.x);
      const ys = data.points.map((p) => p.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
    }
    case "rect":
    case "ellipse":
    case "note":
      return {
        x: Math.min(data.x, data.x + data.w),
        y: Math.min(data.y, data.y + data.h),
        w: Math.abs(data.w),
        h: Math.abs(data.h),
      };
    case "line": {
      const x = Math.min(data.x1, data.x2);
      const y = Math.min(data.y1, data.y2);
      return { x, y, w: Math.abs(data.x2 - data.x1), h: Math.abs(data.y2 - data.y1) };
    }
    default:
      return { x: 0, y: 0, w: 0, h: 0 };
  }
}

export function hitTest(type, data, px, py, padding = 6) {
  const { x, y, w, h } = getBounds(type, data);
  return px >= x - padding && px <= x + w + padding && py >= y - padding && py <= y + h + padding;
}

export function translateData(type, data, dx, dy) {
  switch (type) {
    case "stroke":
      return { ...data, points: data.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    case "rect":
    case "ellipse":
    case "note":
      return { ...data, x: data.x + dx, y: data.y + dy };
    case "line":
      return { ...data, x1: data.x1 + dx, y1: data.y1 + dy, x2: data.x2 + dx, y2: data.y2 + dy };
    default:
      return data;
  }
}

export function drawElement(ctx, type, data) {
  ctx.save();
  switch (type) {
    case "stroke": {
      if (!data.points || data.points.length < 2) break;
      ctx.strokeStyle = data.color;
      ctx.lineWidth = data.width;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(data.points[0].x, data.points[0].y);
      for (let i = 1; i < data.points.length; i++) {
        ctx.lineTo(data.points[i].x, data.points[i].y);
      }
      ctx.stroke();
      break;
    }
    case "rect": {
      ctx.strokeStyle = data.color;
      ctx.lineWidth = data.strokeWidth || 2;
      ctx.strokeRect(data.x, data.y, data.w, data.h);
      break;
    }
    case "ellipse": {
      ctx.strokeStyle = data.color;
      ctx.lineWidth = data.strokeWidth || 2;
      const cx = data.x + data.w / 2;
      const cy = data.y + data.h / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.abs(data.w / 2), Math.abs(data.h / 2), 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "line": {
      ctx.strokeStyle = data.color;
      ctx.lineWidth = data.strokeWidth || 2;
      ctx.beginPath();
      ctx.moveTo(data.x1, data.y1);
      ctx.lineTo(data.x2, data.y2);
      ctx.stroke();
      break;
    }
    // "note" is rendered as an HTML overlay (see StickyNoteLayer in Canvas.jsx),
    // not on the canvas itself, so text stays crisp and editable.
    default:
      break;
  }
  ctx.restore();
}
