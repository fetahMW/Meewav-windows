import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const AVATAR_IMAGES = {
  "utilisatrice": "Frame 2 (9).png",
  "utilisateur": "Frame 2 (6).png",
  "chanteuse-rappeuse": "Frame 2 (23).png",
  "chanteur-rappeur": "Frame 2 (5).png",
  "danseuse": "Frame 2 (7).png",
  "danseur": "Frame 2 (8).png",
  "beatmaker": "Frame 2 (19).png",
  "dj": "dj 1.png",
  "guitariste-acoustique": "Frame 2 (2).png",
  "guitariste-electrique": "Frame 2.png",
  "pianiste": "Frame 2 (13).png",
  "batteur-batteuse": "Frame 2 (24).png",
  "bassiste": "Frame 2 (1).png",
  "percussionniste": "Frame 2 (11).png",
  "violoniste": "Frame 2 (3).png",
  "accordeoniste": "Frame 2 (17).png",
  "instrumentiste-a-vent": "Frame 2 (4).png",
  "instrumentiste-cuivre": "Frame 2 (4).png",
  "beatboxer": "Frame 2 (12).png",
  "compositeur": "Frame 2 (10).png",
  "auteur-parolier": "Frame 2 (5).png",
  "ingenieur-son": "Frame 2 (18).png",
  "sound-designer": "Frame 2 (21).png",
  "directeur-artistique": "Frame 2 (16).png",
  "management": "Frame 2 (20).png",
  "videaste-clipper": "Frame 2 (14).png",
  "coach-vocal": "Frame 2 (5).png",
  "organisateur-evenements": "Organiseurs d'événements. 1.png",
  "studio-enregistrement": "Frame 2 (15).png",
  "label": "Frame 2 (22).png"
};

const SRC_DIR = path.join('public', 'images', 'AVATAR V3');
const DEST_BASE = path.join('public', 'avatar');
const DIRS = {
  master: path.join(DEST_BASE, 'master'),
  carousel: path.join(DEST_BASE, 'web', 'carousel'),
  hd: path.join(DEST_BASE, 'web', 'hd'),
  png: path.join(DEST_BASE, 'web', 'png'),
};

// Create directories if they don't exist
Object.values(DIRS).forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

async function main() {
  console.log('Starting avatar V3 optimization...');
  const report = [];
  
  for (const [id, filename] of Object.entries(AVATAR_IMAGES)) {
    const srcPath = path.join(SRC_DIR, filename);
    if (!fs.existsSync(srcPath)) {
      console.warn(`Source file not found: ${srcPath}`);
      continue;
    }
    
    console.log(`Processing avatar [${id}] from ${filename}...`);
    const origStats = fs.statSync(srcPath);
    const origSizeKB = origStats.size / 1024;
    
    // Paths
    const masterPath = path.join(DIRS.master, `${id}.png`);
    const carouselPath = path.join(DIRS.carousel, `${id}.webp`);
    const hdPath = path.join(DIRS.hd, `${id}.webp`);
    const pngPath = path.join(DIRS.png, `${id}.png`);
    
    // 1. Copy to master
    fs.copyFileSync(srcPath, masterPath);
    
    // 2. WebP Carousel (height 640px, quality 85, keep aspect ratio)
    await sharp(srcPath)
      .resize({ height: 640, withoutEnlargement: true, fit: 'inside' })
      .webp({ quality: 85, effort: 6 })
      .toFile(carouselPath);
      
    // 3. WebP HD (height 1024px, quality 90, keep aspect ratio)
    await sharp(srcPath)
      .resize({ height: 1024, withoutEnlargement: true, fit: 'inside' })
      .webp({ quality: 90, effort: 6 })
      .toFile(hdPath);
      
    // 4. PNG Fallback (height 640px, optimized compression)
    await sharp(srcPath)
      .resize({ height: 640, withoutEnlargement: true, fit: 'inside' })
      .png({ compressionLevel: 8, palette: true, quality: 85 })
      .toFile(pngPath);
      
    // Get sizes
    const masterSizeKB = fs.statSync(masterPath).size / 1024;
    const carouselSizeKB = fs.statSync(carouselPath).size / 1024;
    const hdSizeKB = fs.statSync(hdPath).size / 1024;
    const pngSizeKB = fs.statSync(pngPath).size / 1024;
    
    report.push({
      id,
      original: filename,
      origSizeKB,
      masterSizeKB,
      carouselSizeKB,
      hdSizeKB,
      pngSizeKB,
    });
  }
  
  // Generate Markdown report
  let md = `# Avatar V3 Optimization Report\n\n`;
  md += `This report outlines the file sizes before and after optimizing Meewav's heavy avatar PNG images from **AVATAR V3**.\n\n`;
  md += `| Avatar ID | Original File | Orig Size (KB) | Carousel WebP (KB) | HD WebP (KB) | Fallback PNG (KB) | Carousel Red. % | HD Red. % |\n`;
  md += `|---|---|---|---|---|---|---|---|\n`;
  
  let totalOrig = 0;
  let totalCarousel = 0;
  let totalHd = 0;
  let totalPng = 0;
  
  report.forEach(item => {
    totalOrig += item.origSizeKB;
    totalCarousel += item.carouselSizeKB;
    totalHd += item.hdSizeKB;
    totalPng += item.pngSizeKB;
    
    const carouselRed = ((item.origSizeKB - item.carouselSizeKB) / item.origSizeKB * 100).toFixed(1);
    const hdRed = ((item.origSizeKB - item.hdSizeKB) / item.origSizeKB * 100).toFixed(1);
    
    md += `| \`${item.id}\` | ${item.original} | ${item.origSizeKB.toFixed(1)} KB | ${item.carouselSizeKB.toFixed(1)} KB | ${item.hdSizeKB.toFixed(1)} KB | ${item.pngSizeKB.toFixed(1)} KB | ${carouselRed}% | ${hdRed}% |\n`;
  });
  
  const totalCarouselRed = ((totalOrig - totalCarousel) / totalOrig * 100).toFixed(1);
  const totalHdRed = ((totalOrig - totalHd) / totalOrig * 100).toFixed(1);
  
  md += `| **TOTAL** | - | **${(totalOrig/1024).toFixed(2)} MB** | **${(totalCarousel/1024).toFixed(2)} MB** | **${(totalHd/1024).toFixed(2)} MB** | **${(totalPng/1024).toFixed(2)} MB** | **${totalCarouselRed}%** | **${totalHdRed}%** |\n`;
  
  fs.writeFileSync('public/avatar/optimization-report-v3.md', md);
  fs.writeFileSync(path.join('C:', 'Users', 'linkw', '.gemini', 'antigravity', 'brain', '04877cf7-1fe2-4f8f-b9da-c07cae82e829', 'avatar_optimization_report_v3.md'), md);
  console.log('Avatar V3 optimization complete! Reports generated.');
}

main().catch(err => {
  console.error('Error during optimization:', err);
});
