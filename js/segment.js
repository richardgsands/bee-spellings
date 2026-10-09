// Split handwriting into letter groups so each can be recognised on its own.
// Strokes whose horizontal extents overlap (e.g. the dot of an i, the cross of a t,
// the two strokes of a k) are kept together; a horizontal gap starts a new group.
// Joined-up writing simply comes back as fewer, multi-letter groups.

export function groupStrokes(ink, tolerance = 3) {
  const boxes = ink
    .map((stroke) => ({ stroke, x0: Math.min(...stroke[0]), x1: Math.max(...stroke[0]) }))
    .sort((a, b) => a.x0 - b.x0);
  const groups = [];
  let cur = null;
  for (const b of boxes) {
    if (cur && b.x0 <= cur.x1 + tolerance) {
      cur.strokes.push(b.stroke);
      cur.x1 = Math.max(cur.x1, b.x1);
    } else {
      cur = { strokes: [b.stroke], x1: b.x1 };
      groups.push(cur);
    }
  }
  // Keep the original writing order of strokes within each group.
  return groups.map((g) => ink.filter((s) => g.strokes.includes(s)));
}
