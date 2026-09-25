import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const avatarsDir = path.resolve(__dirname, '../../public/images/V4');

function inspectAvatars() {
  console.log("=================================================================");
  console.log("INSPECTING V4 AVATAR DIMENSIONS AND FILE SIZES (PNG HEADERS)");
  console.log("=================================================================");

  if (!fs.existsSync(avatarsDir)) {
    console.error(`Error: Directory not found at ${avatarsDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(avatarsDir).filter(f => f.toLowerCase().endsWith('.png'));
  console.log(`Found ${files.length} PNG files in the V4 directory.\n`);

  const results = [];
  let allMeetRequirement = true;

  files.forEach(file => {
    const filePath = path.join(avatarsDir, file);
    const stats = fs.statSync(filePath);
    const sizeKB = (stats.size / 1024).toFixed(1);

    try {
      const fd = fs.openSync(filePath, 'r');
      const headerBuffer = Buffer.alloc(24);
      fs.readSync(fd, headerBuffer, 0, 24, 0);
      fs.closeSync(fd);

      // Verify PNG signature
      if (headerBuffer[0] !== 0x89 || headerBuffer[1] !== 0x50 || headerBuffer[2] !== 0x4E || headerBuffer[3] !== 0x47) {
        throw new Error("Not a valid PNG file");
      }

      // Read Width and Height at standard PNG IHDR offsets
      const width = headerBuffer.readUInt32BE(16);
      const height = headerBuffer.readUInt32BE(20);

      const meetsWidth = width >= 512;
      const meetsHeight = height >= 512;
      const ok = meetsWidth && meetsHeight;

      if (!ok) {
        allMeetRequirement = false;
      }

      results.push({
        'Fichier': file,
        'Largeur': `${width} px`,
        'Hauteur': `${height} px`,
        'Poids (Ko)': `${sizeKB} KB`,
        'Conforme (>=512)': ok ? "✅ OUI" : "❌ NON"
      });
    } catch (err) {
      results.push({
        'Fichier': file,
        'Largeur': 'ERROR',
        'Hauteur': 'ERROR',
        'Poids (Ko)': `${sizeKB} KB`,
        'Conforme (>=512)': '⚠️ INVALID'
      });
    }
  });

  console.table(results);

  console.log("\n=================================================================");
  if (allMeetRequirement) {
    console.log("🎉 SUCCESS: All V4 avatars meet the minimum size requirement of 512x512 px!");
  } else {
    console.log("⚠️ WARNING: Some V4 avatars are below the minimum size requirement of 512x512 px!");
  }
  console.log("=================================================================\n");
}

inspectAvatars();
