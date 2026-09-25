import { writeFile } from 'node:fs/promises';
import { cityLandmarks } from './city-landmark-definitions.mjs';
const anchors = {};
for (const item of cityLandmarks) {
  const title = decodeURIComponent(item.source.split('/wiki/')[1]);
  try {
    const response = await fetch(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, { signal: AbortSignal.timeout(8000) });
    const data = await response.json();
    if (data.coordinates) anchors[item.id] = { ...data.coordinates, source: item.source };
    console.log(item.id, data.coordinates || 'use authored anchor');
  } catch { console.log(item.id, 'use authored anchor'); }
}
await writeFile(new URL('./city-landmark-anchors.json', import.meta.url), JSON.stringify(anchors, null, 2)+'\n');
