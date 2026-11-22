// Vehicles: box-built cars (body, cabin, wheels, lights) and simple arcade
// driving — acceleration, steering that tightens with speed, braking, and a
// slide when the handbrake is held. No physics engine, no assets.
import * as THREE from 'three';
import { CAR, PALETTE } from './config.js';
import { clamp, damp, pick } from './util.js';

const PAINTS = [0xd84040, 0x3a6fd8, 0xf2c94c, 0x2ecc71, 0xe8e8e8, 0x222831, 0x9b59b6, 0xe67e22];

/** Build one car mesh group, facing +X. Returns { group, wheels }. */
export function buildCarMesh(paint) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: paint });
  const glassMat = new THREE.MeshLambertMaterial({ color: PALETTE.glass });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1d22 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.75, 2), bodyMat);
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.65, 1.8), glassMat);
  cabin.position.set(-0.25, 1.3, 0);
  cabin.castShadow = true;
  group.add(cabin);
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 2), darkMat);
  bumperF.position.set(2.25, 0.45, 0);
  group.add(bumperF);
  const bumperB = bumperF.clone();
  bumperB.position.x = -2.25;
  group.add(bumperB);
  // Headlights and taillights.
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff6c9, emissive: 0xaa9955 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xdd2222, emissive: 0x661111 });
  for (const z of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.4), headMat);
    h.position.set(2.24, 0.7, z);
    group.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.4), tailMat);
    t.position.set(-2.24, 0.7, z);
    group.add(t);
  }
  // Wheels: cylinders spun to roll on the X axis.
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
  const wheels = [];
  for (const [wx, wz] of [[1.45, 0.95], [1.45, -0.95], [-1.45, 0.95], [-1.45, -0.95]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.x = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    w.castShadow = true;
    group.add(w);
    wheels.push(w);
  }
  return { group, wheels };
}

export class Car {
  constructor(scene, x, z, heading, paint, rng, isPolice = false) {
    const built = buildCarMesh(paint, rng);
    this.group = built.group;
    this.wheels = built.wheels;
    this.scene = scene;
    this.x = x; this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.isPolice = isPolice;
    this.health = 100;
    this.disabled = false;
    this.group.position.set(x, 0, z);
    this.group.rotation.y = -heading;
    scene.add(this.group);
    if (isPolice) this.addLightBar();
  }

  /** Blue bar + red half on the roof, flashing while chasing. */
  addLightBar() {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.18, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x2233aa }),
    );
    bar.position.set(-0.25, 1.75, 0);
    this.group.add(bar);
    this.lightBar = bar;
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.18, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xaa1111 }),
    );
    red.position.set(-0.25, 1.75, 0.28);
    this.group.add(red);
  }

  /** Arcade drive step. input: { throttle -1..1, steer -1..1, handbrake }. */
  drive(dt, input, city) {
    const forward = input.throttle;
    const target = forward > 0 ? CAR.maxSpeed * forward : forward < 0 ? CAR.maxReverse * forward : 0;
    const rate = forward > 0 ? CAR.accel : forward < 0 ? CAR.brake : CAR.brake * 0.6;
    this.speed = damp(this.speed, target, rate / CAR.maxSpeed, dt);
    if (input.handbrake) this.speed = damp(this.speed, 0, 4, dt);
    // Bicycle-model steering: the wheel angle shrinks as speed rises, so the
    // car stays controllable on the highway and nimble in the streets.
    const speedFrac = clamp(Math.abs(this.speed) / CAR.maxSpeed, 0, 1);
    const maxAngle = 0.55 + (0.13 - 0.55) * speedFrac;
    const angle = clamp(input.steer, -1, 1) * maxAngle;
    this.steer = damp(this.steer, angle, 8, dt);
    const turnRate = clamp((this.speed / 2.6) * Math.tan(this.steer), -1.8, 1.8);
    this.heading += turnRate * dt * (this.speed >= 0 ? 1 : -1);
    const nx = this.x + Math.cos(this.heading) * this.speed * dt;
    const nz = this.z + Math.sin(this.heading) * this.speed * dt;
    // Buildings stop the car; a hard hit costs speed and health.
    if (city.hitsBuilding(nx, nz, CAR.radius)) {
      if (Math.abs(this.speed) > 12) this.health -= 8;
      this.speed *= -0.25;
    } else {
      this.x = nx; this.z = nz;
    }
    const fixed = city.resolveCollision(this.x, this.z, CAR.radius);
    this.x = fixed.x; this.z = fixed.z;
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = -this.heading;
    const roll = (this.speed * dt) / 0.38;
    for (const w of this.wheels) w.rotation.y += roll;
  }

  /** Simple chase steering toward a point, used by police and traffic. */
  steerToward(tx, tz, dt, speed, city) {
    const want = Math.atan2(tz - this.z, tx - this.x);
    let d = want - this.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const steer = clamp(d * 1.6, -1, 1);
    this.drive(dt, { throttle: 1, steer, handbrake: false }, city);
    this.speed = Math.min(this.speed, speed);
    return Math.hypot(tx - this.x, tz - this.z);
  }

  setPosition(x, z, heading) {
    this.x = x; this.z = z; this.heading = heading;
    this.group.position.set(x, 0, z);
    this.group.rotation.y = -heading;
  }

  remove() { this.scene.remove(this.group); }
}

/** A parked or ambient car the player can steal: same mesh, no driver. */
export function spawnCivilianCar(scene, x, z, heading, rng) {
  return new Car(scene, x, z, heading, pick(rng, PAINTS), rng, false);
}
