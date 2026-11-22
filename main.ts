// Solmar City — the gta6-01 entry program (Node 22, standard library only).
// It hands the game in: pre-flight checks the entry (every required game file
// and export, the screenshot set), then copies game/ and screenshots/ from
// beside this file to /output and writes /output/dossier.json with the
// vendored make.fun library, exactly as the kit's starter does.
//
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');

// The scorer's caps (reference/gate.json), as the starter passes them.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function fail(message: string): never {
  throw new Error(`solmar-city main.ts pre-flight: ${message}`);
}

// Every source file the game needs, with the declarations it must carry.
// A file that is missing — or gutted of its export — stops the run here,
// before anything is copied, instead of handing in a broken entry.
const REQUIRED_SOURCES: Array<[string, string[]]> = [
  ['index.html', ['"three"', 'three.module.min.js', './src/main.js']],
  ['src/config.js', ['export const STEP', 'export const CITY', 'export const PLAYER', 'export const MISSIONS']],
  ['src/util.js', ['export function mulberry32', 'export function clamp', 'export function angleDelta']],
  ['src/audio.js', ['export class SoundBank']],
  ['src/city.js', ['export class City']],
  ['src/player.js', ['export function buildPersonMesh', 'export class Player', 'export class ChaseCamera']],
  ['src/vehicles.js', ['export function buildCarMesh', 'export class Car', 'export function spawnCivilianCar']],
  ['src/traffic.js', ['export class Traffic']],
  ['src/police.js', ['export class Police']],
  ['src/missions.js', ['export class MissionSystem']],
  ['src/combat.js', ['export class Combat']],
  ['src/hud.js', ['export class HUD']],
  ['src/save.js', ['export function saveGame', 'export function loadGame', 'export function hasSave']],
  ['src/shots.js', ['export function stageShot']],
  ['src/main.js', ['new Game()', 'game.run()']],
  ['vendor/three.module.min.js', ['Three.js Authors']],
];

function checkSources(): void {
  for (const [rel, markers] of REQUIRED_SOURCES) {
    const path = join(gameDir, rel);
    if (!existsSync(path)) fail(`missing required file game/${rel}`);
    if (!lstatSync(path).isFile()) fail(`game/${rel} is not a regular file`);
    const text = readFileSync(path, 'utf8');
    for (const marker of markers) {
      if (!text.includes(marker)) fail(`game/${rel} is missing ${JSON.stringify(marker)}`);
    }
  }
  const indexBytes = statSync(join(gameDir, 'index.html')).size;
  if (indexBytes > 1024 * 1024) fail(`game/index.html is ${indexBytes} bytes, over the 1 MiB cap`);
}

// Walk game/ counting entries and bytes, refusing symlinks outright.
function checkGameTree(): void {
  let entries = 0;
  let bytes = 0;
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const st = lstatSync(path);
      entries += 1;
      if (entries > CAPS.game_max_files) fail(`game/ holds more than ${CAPS.game_max_files} files and directories`);
      if (st.isSymbolicLink()) fail(`game/ holds a symlink at ${path} — plain files only`);
      if (st.isDirectory()) { walk(path); continue; }
      if (!st.isFile()) fail(`game/ holds a non-file at ${path}`);
      if (Buffer.byteLength(path, 'utf8') > CAPS.game_path_max_bytes) fail(`path over 1000 bytes: ${path}`);
      bytes += st.size;
    }
  };
  walk(gameDir);
  if (bytes > CAPS.game_max_bytes) fail(`game/ is ${bytes} bytes, over the 48 MiB cap`);
}

// JPEG/PNG dimensions, read from the headers — no decoder needed.
function imageSize(file: string): { width: number; height: number; kind: string } {
  const buf = readFileSync(file);
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) fail(`${basename(file)}: bad JPEG marker at ${off}`);
      const marker = buf[off + 1];
      const len = buf.readUInt16BE(off + 2);
      if (marker === 0xc0 || marker === 0xc2) {
        return { width: buf.readUInt16BE(off + 7), height: buf.readUInt16BE(off + 5), kind: 'JPEG' };
      }
      off += 2 + len;
    }
    fail(`${basename(file)}: no JPEG frame header found`);
  }
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), kind: 'PNG' };
  }
  fail(`${basename(file)}: not a JPEG or PNG file`);
  return { width: 0, height: 0, kind: '' };
}

function checkScreenshots(): void {
  if (!existsSync(shotsDir)) fail('screenshots/ is missing');
  const names = readdirSync(shotsDir).filter((n) => !n.startsWith('.')).sort();
  if (names.length < 3 || names.length > 4) fail(`screenshots/ holds ${names.length} images, need 3 or 4`);
  for (const name of names) {
    if (!/^[A-Za-z0-9._-]+$/.test(name) || name.startsWith('-') || name.length > 128) {
      fail(`screenshot name ${JSON.stringify(name)} is not allowed`);
    }
    const path = join(shotsDir, name);
    if (!lstatSync(path).isFile()) fail(`screenshots/${name} is not a regular file`);
    const size = statSync(path).size;
    if (size > CAPS.screenshots.max_bytes) fail(`screenshots/${name} is ${size} bytes, over the 256 KiB cap`);
    const { width, height, kind } = imageSize(path);
    const long = Math.max(width, height);
    const short = Math.min(width, height);
    if (long > 1280 || short < 480) {
      fail(`screenshots/${name} is ${width}x${height} ${kind}, need long side <= 1280 and short side >= 480`);
    }
  }
  console.log(`pre-flight ok: ${names.length} screenshots, first is ${names[0]}`);
}

checkSources();
checkGameTree();
checkScreenshots();

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

writeFileSync(join(out, 'dossier.json'), buildDossier(out, CAPS));
console.log(`solmar-city entry written to ${out}`);
