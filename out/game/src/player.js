// The player on foot: a low-poly figure (torso, head, swinging limbs) with
// WASD movement relative to the camera, and the third-person orbit camera that
// follows on foot and chases the car while driving.
import * as THREE from 'three';
import { PLAYER } from './config.js';
import { clamp, damp, angleDelta } from './util.js';

export function buildPersonMesh(shirt, pants) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirtMat);
  torso.position.y = 1.12;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.72;
  head.castShadow = true;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.44), new THREE.MeshLambertMaterial({ color: 0x2b2118 }));
  hair.position.y = 1.96;
  group.add(hair);
  const limbs = {};
  for (const [name, x, y, mat, w] of [
    ['armL', -0.4, 1.28, skin, 0.18], ['armR', 0.4, 1.28, skin, 0.18],
    ['legL', -0.17, 0.62, pantsMat, 0.24], ['legR', 0.17, 0.62, pantsMat, 0.24],
  ]) {
    const limb = new THREE.Mesh(new THREE.BoxGeometry(w, 0.72, w), mat);
    limb.geometry.translate(0, -0.36, 0);
    limb.position.set(x, y, 0);
    limb.castShadow = true;
    group.add(limb);
    limbs[name] = limb;
  }
  return { group, limbs };
}

export class Player {
  constructor(scene, x, z) {
    const built = buildPersonMesh(0x3a6fd8, 0x2b2f36);
    this.group = built.group;
    this.limbs = built.limbs;
    this.scene = scene;
    this.x = x; this.z = z;
    this.heading = 0;       // facing, radians
    this.health = PLAYER.health;
    this.walkPhase = 0;
    this.moving = false;
    this.invulnerable = 0;
    this.meleeTimer = 0;
    this.pistolTimer = 0;
    this.group.position.set(x, 0, z);
    scene.add(this.group);
  }

  /** Move on foot. move: {x, z} in world space, run: boolean. */
  step(dt, move, run, city) {
    const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const mx = move.x, mz = move.z;
    const len = Math.hypot(mx, mz);
    this.moving = len > 0.01;
    if (this.moving) {
      const nx = this.x + (mx / len) * speed * dt;
      const nz = this.z + (mz / len) * speed * dt;
      const fixed = city.resolveCollision(nx, nz, PLAYER.radius);
      this.x = fixed.x; this.z = fixed.z;
      const want = Math.atan2(mz, mx);
      this.heading += angleDelta(this.heading, want) * Math.min(1, dt * 12);
      this.walkPhase += dt * speed * 1.6;
    }
    const swing = this.moving ? Math.sin(this.walkPhase) * 0.7 : 0;
    this.limbs.armL.rotation.x = swing;
    this.limbs.armR.rotation.x = -swing;
    this.limbs.legL.rotation.x = -swing;
    this.limbs.legR.rotation.x = swing;
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = -this.heading;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.meleeTimer = Math.max(0, this.meleeTimer - dt);
    this.pistolTimer = Math.max(0, this.pistolTimer - dt);
  }

  hurt(amount) {
    if (this.invulnerable > 0) return false;
    this.health = Math.max(0, this.health - amount);
    this.invulnerable = 0.6;
    return true;
  }

  setPosition(x, z, heading) {
    this.x = x; this.z = z;
    if (heading !== undefined) this.heading = heading;
    this.group.position.set(x, 0, z);
    this.group.rotation.y = -this.heading;
  }
}

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0.6;      // orbit angle around the player
    this.pitch = 0.32;   // look-down angle
    this.distance = 9;
    this.shake = 0;
  }

  addLook(dx, dy) {
    this.yaw -= dx * 0.0032;
    this.pitch = clamp(this.pitch + dy * 0.0028, 0.08, 1.1);
  }

  /** Follow a target point; while driving, swing behind the car's heading. */
  update(dt, target, driving, carHeading) {
    if (driving) {
      const want = carHeading + Math.PI;
      this.yaw += angleDelta(this.yaw, want) * Math.min(1, dt * 1.6);
      this.distance = damp(this.distance, 12.5, 3, dt);
    } else {
      this.distance = damp(this.distance, 8.5, 4, dt);
    }
    const cx = target.x - Math.cos(this.yaw) * Math.cos(this.pitch) * this.distance;
    const cz = target.z - Math.sin(this.yaw) * Math.cos(this.pitch) * this.distance;
    const cy = 1.6 + Math.sin(this.pitch) * this.distance;
    let sx = 0, sy = 0, sz = 0;
    if (this.shake > 0.001) {
      sx = (Math.random() - 0.5) * this.shake;
      sy = (Math.random() - 0.5) * this.shake;
      sz = (Math.random() - 0.5) * this.shake;
      this.shake = damp(this.shake, 0, 6, dt);
    }
    this.camera.position.set(cx + sx, cy + sy, cz + sz);
    this.camera.lookAt(target.x, target.y + 1.4, target.z);
  }

  /** World-space move direction for WASD, from the camera yaw. */
  moveBasis() {
    return { fx: Math.cos(this.yaw), fz: Math.sin(this.yaw), rx: -Math.sin(this.yaw), rz: Math.cos(this.yaw) };
  }
}
