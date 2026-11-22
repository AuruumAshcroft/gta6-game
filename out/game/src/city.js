// Solmar City: the procedural sun-soaked coastal city. One seeded layout —
// the same seed always builds the same streets — made only of boxes, cylinders
// and canvas textures, so the whole city is a few hundred meshes and loads
// nothing from the network.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { mulberry32, pick } from './util.js';

const PITCH = CITY.block + CITY.road;      // 60 m, road centre to road centre
const HALF = (CITY.blocks * PITCH) / 2;   // 210 m, city edge
const ROADS = [];                          // road centre lines, in metres
for (let i = 0; i <= CITY.blocks; i += 1) ROADS.push(-HALF + i * PITCH);

/** One building facade: a wall colour with lit and dark windows. */
function facadeTexture(base) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  for (let y = 14; y < 240; y += 30) {
    for (let x = 12; x < 116; x += 28) {
      g.fillStyle = Math.random() < 0.35 ? '#ffe9a8' : '#22303f';
      g.fillRect(x, y, 18, 20);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Asphalt with a dashed centre line running along U, tiled along the road. */
function asphaltTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3f46'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#f5d76e'; g.fillRect(8, 30, 44, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class City {
  constructor(scene, seed = 7) {
    this.scene = scene;
    this.rng = mulberry32(seed);
    this.colliders = [];   // building footprints { minX, maxX, minZ, maxZ }
    this.palms = [];
    this.sun = null;
    this.anchors = {};     // named mission spots
    this.build();
  }

  roadCentres() { return ROADS; }
  cityHalf() { return HALF; }

  build() {
    this.buildSky();
    this.buildGround();
    this.buildRoads();
    this.buildBlocks();
    this.buildPalms();
    this.buildLamps();
    this.buildLandmarks();
  }

  buildSky() {
    const scene = this.scene;
    scene.background = new THREE.Color(PALETTE.sky);
    scene.fog = new THREE.Fog(PALETTE.sky, 260, 620);
    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.9);
    scene.add(hemi);
    this.sun = new THREE.DirectionalLight(PALETTE.sun, 2.4);
    this.sun.position.set(120, 180, 60);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -160; sc.right = 160; sc.top = 160; sc.bottom = -160;
    sc.near = 10; sc.far = 520;
    this.sun.shadow.bias = -0.0006;
    scene.add(this.sun);
    scene.add(this.sun.target);
  }

  buildGround() {
    const scene = this.scene;
    // Grass base, then the beach strip and the sea to the south (+Z).
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2 + 260, HALF * 2 + 340),
      new THREE.MeshLambertMaterial({ color: PALETTE.grass }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 20);
    ground.receiveShadow = true;
    scene.add(ground);
    const beach = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2 + 260, CITY.beach),
      new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
    );
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(0, 0.05, HALF + 7 + CITY.beach / 2);
    beach.receiveShadow = true;
    scene.add(beach);
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2 + 260, 200),
      new THREE.MeshLambertMaterial({ color: PALETTE.sea }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, 0.02, HALF + 7 + CITY.beach + 100);
    scene.add(sea);
  }

  buildRoads() {
    const scene = this.scene;
    const tex = asphaltTexture();
    const walkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
    const span = HALF * 2 + 14;
    for (const c of ROADS) {
      for (const horizontal of [true, false]) {
        const mat = new THREE.MeshLambertMaterial({ map: tex.clone() });
        mat.map.needsUpdate = true;
        mat.map.repeat.set(span / 16, 1);
        const road = new THREE.Mesh(new THREE.PlaneGeometry(span, CITY.road), mat);
        road.rotation.x = -Math.PI / 2;
        road.rotation.z = horizontal ? 0 : Math.PI / 2;
        road.position.set(horizontal ? 0 : c, 0.08, horizontal ? c : 0);
        road.receiveShadow = true;
        scene.add(road);
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(span, 3), walkMat);
        walk.rotation.x = -Math.PI / 2;
        walk.rotation.z = horizontal ? 0 : Math.PI / 2;
        walk.position.set(
          horizontal ? 0 : c + CITY.road / 2 + 1.5, 0.06,
          horizontal ? c + CITY.road / 2 + 1.5 : 0,
        );
        scene.add(walk);
      }
    }
  }

  buildBlocks() {
    const rng = this.rng;
    const scene = this.scene;
    const facades = PALETTE.building.map(
      (col) => facadeTexture(`#${col.toString(16).padStart(6, '0')}`),
    );
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x6b6560 });
    const acMat = new THREE.MeshLambertMaterial({ color: 0x9aa0a8 });
    for (let bx = 0; bx < CITY.blocks; bx += 1) {
      for (let bz = 0; bz < CITY.blocks; bz += 1) {
        const cx = -HALF + bx * PITCH + PITCH / 2;
        const cz = -HALF + bz * PITCH + PITCH / 2;
        if (rng() < 0.14) { this.makePark(cx, cz); continue; } // a park instead
        const count = rng() < 0.6 ? 1 : 2;
        for (let k = 0; k < count; k += 1) {
          const w = 13 + rng() * 12, d = 13 + rng() * 12, h = 8 + rng() * rng() * 26;
          const ox = count === 1 ? 0 : (k === 0 ? -11 : 11);
          const oz = count === 1 ? 0 : (k === 0 ? 9 : -9);
          const x = cx + ox, z = cz + oz;
          const b = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, d),
            new THREE.MeshLambertMaterial({ map: pick(rng, facades) }),
          );
          b.position.set(x, h / 2, z);
          b.castShadow = true; b.receiveShadow = true;
          scene.add(b);
          const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6), roofMat);
          roof.position.set(x, h + 0.25, z);
          scene.add(roof);
          if (rng() < 0.5) {
            const ac = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 2.4), acMat);
            ac.position.set(x + w / 4, h + 1, z - d / 4);
            ac.castShadow = true;
            scene.add(ac);
          }
          this.colliders.push({
            minX: x - w / 2 - 0.4, maxX: x + w / 2 + 0.4,
            minZ: z - d / 2 - 0.4, maxZ: z + d / 2 + 0.4,
          });
        }
      }
    }
  }

  makePark(cx, cz) {
    const rng = this.rng;
    for (let i = 0; i < 3; i += 1) {
      this.makePalm(cx + (rng() - 0.5) * 30, cz + (rng() - 0.5) * 30);
    }
    const bench = new THREE.Mesh(
      new THREE.BoxGeometry(3, 0.5, 1),
      new THREE.MeshLambertMaterial({ color: 0x6b4a2f }),
    );
    bench.position.set(cx, 0.5, cz);
    bench.castShadow = true;
    this.scene.add(bench);
  }

  buildPalms() {
    const rng = this.rng;
    // A palm row along the beach, plus a scatter through the city.
    for (let x = -HALF; x <= HALF; x += 26) {
      this.makePalm(x + (rng() - 0.5) * 8, HALF + 16 + rng() * 20);
    }
    for (let i = 0; i < 26; i += 1) {
      this.makePalm((rng() * 2 - 1) * (HALF - 20), (rng() * 2 - 1) * (HALF - 20));
    }
  }

  makePalm(x, z) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.3, 6.5, 6),
      new THREE.MeshLambertMaterial({ color: 0x8a6b4a }),
    );
    trunk.position.set(x, 3.25, z);
    trunk.castShadow = true;
    this.scene.add(trunk);
    const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.4, 4), frondMat);
      frond.position.set(x + Math.cos(a) * 1.6, 6.8, z + Math.sin(a) * 1.6);
      frond.rotation.z = Math.cos(a) * 1.1;
      frond.rotation.x = -Math.sin(a) * 1.1;
      frond.castShadow = true;
      this.scene.add(frond);
    }
    this.palms.push({ x, z });
  }

  buildLamps() {
    const rng = this.rng;
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
    const lampMat = new THREE.MeshLambertMaterial({ color: 0xfff6c9, emissive: 0xccaa55 });
    for (const x of ROADS) {
      for (const z of ROADS) {
        if (rng() < 0.6) continue;
        const lx = x + CITY.road / 2 + 1, lz = z + CITY.road / 2 + 1;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 6, 6), poleMat);
        pole.position.set(lx, 3, lz);
        this.scene.add(pole);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampMat);
        lamp.position.set(lx, 6.1, lz);
        this.scene.add(lamp);
      }
    }
  }

  buildLandmarks() {
    const scene = this.scene;
    // The marina pier, jutting into the sea — mission 1's destination.
    const pier = new THREE.Mesh(
      new THREE.BoxGeometry(8, 0.6, 60),
      new THREE.MeshLambertMaterial({ color: 0x8a6b4a }),
    );
    pier.position.set(-40, 0.8, HALF + 7 + CITY.beach + 22);
    pier.castShadow = true; pier.receiveShadow = true;
    scene.add(pier);
    this.anchors.marina = { x: -40, z: HALF + 7 + CITY.beach - 4, label: 'Marina' };
    this.anchors.garage = { x: 150, z: -150, label: 'North garage' };
    this.anchors.beachBar = { x: 90, z: HALF + 18, label: 'Beach bar' };
    this.anchors.hideout = { x: -150, z: -136, label: 'Hideout' };
    this.anchors.hospital = { x: 30, z: -30, label: 'Hospital' };

    // Beach bar hut with a cone roof, and the hideout garage shell.
    const hut = new THREE.Mesh(
      new THREE.BoxGeometry(10, 4, 7),
      new THREE.MeshLambertMaterial({ color: 0xd9a06f }),
    );
    hut.position.set(90, 2, HALF + 16);
    hut.castShadow = true;
    scene.add(hut);
    const hutRoof = new THREE.Mesh(
      new THREE.ConeGeometry(7.5, 3, 4),
      new THREE.MeshLambertMaterial({ color: 0x7a4a2b }),
    );
    hutRoof.position.set(90, 5.5, HALF + 16);
    hutRoof.rotation.y = Math.PI / 4;
    scene.add(hutRoof);
    this.colliders.push({ minX: 84.6, maxX: 95.4, minZ: HALF + 12.1, maxZ: HALF + 19.9 });
    const garage = new THREE.Mesh(
      new THREE.BoxGeometry(16, 6, 12),
      new THREE.MeshLambertMaterial({ color: 0x5a6068 }),
    );
    garage.position.set(-150, 3, -150);
    garage.castShadow = true;
    scene.add(garage);
    this.colliders.push({ minX: -158.4, maxX: -141.6, minZ: -156.4, maxZ: -143.6 });
  }

  /** Keep the shadow camera centred on `p` so shadows stay crisp at the action. */
  follow(p) {
    this.sun.position.set(p.x + 120, 180, p.z + 60);
    this.sun.target.position.set(p.x, 0, p.z);
  }

  /** Low golden sun for the sunset shot. */
  setSunset(on) {
    if (on) {
      this.sun.position.set(200, 42, 160);
      this.sun.color.setHex(0xffb36b);
      this.scene.background.setHex(0xf2a35e);
      this.scene.fog.color.setHex(0xf2a35e);
    } else {
      this.sun.color.setHex(PALETTE.sun);
      this.scene.background.setHex(PALETTE.sky);
      this.scene.fog.color.setHex(PALETTE.sky);
    }
  }

  /** True when the circle at (x, z) with radius r hits a building. */
  hitsBuilding(x, z, r) {
    for (const c of this.colliders) {
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
    }
    return false;
  }

  /** Push a circle out of buildings; returns the corrected position. */
  resolveCollision(x, z, r) {
    for (const c of this.colliders) {
      const nx = Math.max(c.minX, Math.min(x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
      const dx = x - nx, dz = z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        z = nz + (dz / d) * r;
      } else if (d2 <= 0.0001) {
        // Centre inside the box: push out along the smallest penetration axis.
        const pl = x - c.minX, pr = c.maxX - x, pt = z - c.minZ, pb = c.maxZ - z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) x = c.minX - r;
        else if (m === pr) x = c.maxX + r;
        else if (m === pt) z = c.minZ - r;
        else z = c.maxZ + r;
      }
    }
    const lim = HALF + 40;
    x = Math.max(-lim, Math.min(lim, x));
    // The waterline is the edge of the world: nobody drives into the sea.
    z = Math.max(-HALF - 10, Math.min(HALF + 7 + CITY.beach, z));
    return { x, z };
  }
}
