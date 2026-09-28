import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

// Rebuild only when the pinned native DSP changes. Regular Vite/Electron builds
// ship the checked-in WASM and do not need a compiler on the user's machine.
const compiler = process.env.EMXX || "em++";
mkdirSync("public/audio", { recursive: true });
const result = spawnSync(compiler, [
  resolve("native/voice-dsp/voice-dsp.cpp"), "-std=c++17", "-O2",
  "-fno-exceptions", "-fno-rtti", "--no-entry",
  "-sSTANDALONE_WASM=1", "-sALLOW_MEMORY_GROWTH=0",
  "-sINITIAL_MEMORY=2097152", "-sSTACK_SIZE=262144",
  '-sEXPORTED_FUNCTIONS=["_mw_init","_mw_buffer","_mw_process","_mw_process_pro"]',
  "-o", resolve("public/audio/meewav-android-voice.wasm"),
], { stdio: "inherit", shell: false });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
