// A marker and its name are one indivisible cartographic object. Selection is
// spread across the viewport, independent of the camera target and city order.
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
export const LOCAL_CITY_REVEAL = 0.2;

export function layoutCityMarkers(candidates, width, height, previous, tier = 3, canEnter = () => true) {
  const budget = Math.min(64, Math.max(8, Math.floor(width * height / 26000)));
  const localBudget = [0, 12, 24, 36][tier];
  const accepted = [], boxes = [], cells = new Map();
  const priority = (a, b) => Number(previous.has(b.city.id)) - Number(previous.has(a.city.id))
    || a.city.rank - b.city.rank
    || (b.city.population || 0) - (a.city.population || 0)
    || a.city.id.localeCompare(b.city.id);
  const accept = item => {
    const retained = previous.has(item.city.id);
    const half = item.labelWidth / 2 + 6;
    const box = { left: item.x - Math.max(half, 14), right: item.x + Math.max(half, 14),
      top: item.y - 14, bottom: item.y + 34 };
    // Admission needs spare room; an existing label keeps its place until its
    // actual bounds collide. Small movements cannot alternate two neighbours.
    const margin = retained ? 8 : 28;
    const admissionBox = retained ? box : { left: box.left - 12, right: box.right + 12,
      top: box.top - 10, bottom: box.bottom + 10 };
    if (accepted.length >= budget || box.left < margin || box.right > width - margin || box.top < margin || box.bottom > height - margin
      || boxes.some(other => overlaps(admissionBox, other)) || (!retained && !canEnter(item))) return false;
    accepted.push(item); boxes.push(box);
    return true;
  };
  // Preserve incumbents within each tier, but reserve room for reference towns
  // before villages. A retained village must never hide an arriving main city.
  for (const item of candidates.filter(item => item.city.major).sort(priority)) accept(item);
  for (const item of candidates.filter(item => item.city.regional).sort(priority)) accept(item);
  const principalCount = accepted.length;
  const locals = candidates.filter(item => !item.city.major && !item.city.regional);
  for (const item of locals.filter(item => previous.has(item.city.id)).sort(priority)) {
    if (accepted.length - principalCount >= localBudget) break;
    accept(item);
  }
  const newcomers = locals.filter(item => !previous.has(item.city.id));
  // One local name per screen cell first. Further names are considered only
  // after all cells have had a turn, so a village cluster cannot take the budget.
  const cellWidth = 180, cellHeight = 110;
  for (const item of newcomers) {
    const column = Math.floor(item.x / cellWidth), row = Math.floor(item.y / cellHeight);
    const key = `${column}:${row}`;
    if (!cells.has(key)) cells.set(key, { key, x: (column + 0.5) * cellWidth, y: (row + 0.5) * cellHeight, candidates: [] });
    cells.get(key).candidates.push(item);
  }
  for (const cell of cells.values()) cell.candidates.sort(priority);
  for (let round = 0; round < 2 && accepted.length < budget && accepted.length - principalCount < localBudget; round++) {
    const pending = [...cells.values()].filter(cell => cell.candidates.length);
    while (pending.length && accepted.length < budget && accepted.length - principalCount < localBudget) {
      // Fill the largest gaps between existing names before adding neighbours.
      let best = 0, spacing = -1;
      for (let i = 0; i < pending.length; i++) {
        const cell = pending[i];
        const separation = accepted.length ? Math.min(...accepted.map(item => (item.x - cell.x) ** 2 + (item.y - cell.y) ** 2)) : 0;
        if (separation > spacing) { spacing = separation; best = i; }
      }
      const [cell] = pending.splice(best, 1);
      while (cell.candidates.length) if (accept(cell.candidates.shift())) break;
    }
  }
  return accepted;
}
