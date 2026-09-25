const smooth = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function labelOpacity(label, height) {
  if (label.kind === "quartier") return 1 - smooth(0.2, 0.55, height);
  if (label.kind === "country") {
    const far = [400, 400, 260, 150, 80, 35, 18][Math.min(6, Math.max(1, label.rank))];
    return smooth(6, 18, height) * (1 - smooth(far * 0.7, far * 1.1, height));
  }
  const far = label.rank === 1 ? 65 : label.rank === 2 ? 38 : 22;
  return (1 - smooth(far * 0.6, far, height)) * smooth(0.3, 0.65, height);
}

const overlaps = (a, b) => a.left < b.right && a.right > b.left
  && a.top < b.bottom && a.bottom > b.top;

// Bounded catalogue; deterministic priorities and a little incumbent preference
// prevent peers swapping at every small mouse movement. No DOM measurement.
export function layoutGeographicLabels(labels, project, height, width, viewportHeight, previous = new Set()) {
  const candidates = [];
  for (const label of labels) {
    let opacity = labelOpacity(label, height);
    if (opacity < 0.08) continue;
    const point = project(label);
    if (!point || point.facing <= 0 || point.z < -1 || point.z > 1) continue;
    opacity *= smooth(0, 0.16, point.facing);
    if (opacity < 0.08) continue;
    const x = (point.x + 1) * width / 2;
    const y = (1 - point.y) * viewportHeight / 2;
    const box = { left: x - label.width / 2 - 5, right: x + label.width / 2 + 5,
      top: y - label.height / 2 - 3, bottom: y + label.height / 2 + 3 };
    if (box.left < 6 || box.right > width - 6 || box.top < 6 || box.bottom > viewportHeight - 6) continue;
    // Leave the existing zoom/home controls unobstructed, including safe-area margins.
    if (box.right > width - 110 && box.bottom > viewportHeight - 260) continue;
    candidates.push({ label, x, y, opacity, box });
  }
  candidates.sort((a, b) => a.label.rank - b.label.rank
    || Number(previous.has(b.label.id)) - Number(previous.has(a.label.id))
    || a.label.id.localeCompare(b.label.id));
  const accepted = [];
  for (const candidate of candidates) {
    if (accepted.length >= 100) break;
    if (accepted.some(other => overlaps(candidate.box, other.box))) continue;
    accepted.push(candidate);
  }
  return accepted;
}
