import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const webRoot = resolve(import.meta.dirname, '../..');
const androidRoot = resolve(process.argv[2] || resolve(webRoot, '../Meewav-Android'));
const iconDirectory = resolve(import.meta.dirname, 'assets');
const rendererDirectory = resolve(webRoot, 'src/features/studio/assets');
const attributes = {
  fillColor: 'fill', pathData: 'd', strokeColor: 'stroke', strokeWidth: 'stroke-width',
  strokeLineCap: 'stroke-linecap', strokeLineJoin: 'stroke-linejoin', fillType: 'fill-rule',
};

function toSvg(xml) {
  const width = xml.match(/android:viewportWidth="([^"]+)"/)?.[1];
  const height = xml.match(/android:viewportHeight="([^"]+)"/)?.[1];
  if (!width || !height || /<(?:group|clip-path)\b/.test(xml)) throw new Error('Unsupported Android drawable structure');
  const paths = [...xml.matchAll(/<path\s+([^>]+)\/>/g)].map(([, source]) => {
    const values = [...source.matchAll(/android:(\w+)="([^"]*)"/g)].map(([, key, raw]) => {
      if (!attributes[key]) throw new Error(`Unsupported path attribute: ${key}`);
      const value = raw === '@android:color/transparent' ? 'none' : raw;
      return `${attributes[key]}="${value}"`;
    });
    return `  <path ${values.join(' ')} />`;
  });
  if (!paths.length) throw new Error('Android drawable has no paths');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${paths.join('\n')}\n</svg>\n`;
}

await mkdir(iconDirectory, { recursive: true });
await mkdir(rendererDirectory, { recursive: true });
const provenance = {};
for (const [sourceName, outputName] of [['ic_launcher', 'meewav-icon'], ['meewav_logo', 'meewav-logo']]) {
  const relative = `app/src/main/res/drawable/${sourceName}.xml`;
  const xml = await readFile(resolve(androidRoot, relative), 'utf8');
  const svg = toSvg(xml);
  await writeFile(resolve(rendererDirectory, `${outputName}.svg`), svg);
  provenance[outputName] = { source: `Meewav-Android/${relative}`, sha256: createHash('sha256').update(xml).digest('hex') };
  if (sourceName !== 'ic_launcher') continue;
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = await Promise.all(sizes.map((size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()));
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((png, index) => {
    const entry = 6 + index * 16;
    header[entry] = sizes[index] === 256 ? 0 : sizes[index];
    header[entry + 1] = header[entry];
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  await writeFile(resolve(iconDirectory, 'meewav.ico'), Buffer.concat([header, ...images]));
  await writeFile(resolve(iconDirectory, 'meewav.png'), images.at(-1));
}
await writeFile(resolve(iconDirectory, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
console.log('Android logo and launcher icon exported without changing their paths or colours.');
