// Traffic: cars that cruise the road grid and pedestrians that stroll the
// sidewalks. Both are simple waypoint followers — a traffic car picks a road,
// drives to the next intersection, and turns; a pedestrian walks a straight
// sidewalk stretch, then turns around. They give the city life and give the
// player something to hit (which the police notice).
import * as THREE from 'three';
import { TRAFFIC } from './config.js';
import { mulberry32, pick } from './util.js';
import { Car, spawnCivilianCar } from './vehicles.js';
import { buildPersonMesh } from './player.js';

const SHIRTS = [0xd84040, 0x3a6fd8, 0xf2c94c, 0x2ecc71, 0xe8e8e8, 0x9b59b6, 0xe67e22, 0xffffff];

export class Traffic {
  constructor(scene, city, seed = 21) {
    this.scene = scene;
    this.city = city;
    this.rng = mulberry32(seed);
    this.cars = [];
    this.peds = [];
    this.roads = city.roadCentres();
    this.spawnCars();
    this.spawnPeds();
  }

  /** A random point on a random road. */
  randomRoadPoint() {
    const rng = this.rng;
    const road = pick(rng, this.roads);
    const along = (rng() * 2 - 1) * (this.city.cityHalf() - 10);
    return rng() < 0.5 ? { x: along, z: road } : { x: road, z: along };
  }

  spawnCars() {
    for (let i = 0; i < TRAFFIC.cars; i += 1) {
      const p = this.randomRoadPoint();
      const car = spawnCivilianCar(this.scene, p.x, p.z, this.rng() * Math.PI * 2, this.rng);
      car.traffic = true;
      car.lane = (this.rng() < 0.5 ? 1 : -1) * 3.2; // keep right
      car.target = this.nextIntersection(car);
      car.speed = TRAFFIC.carSpeed * (0.8 + this.rng() * 0.4);
      this.cars.push(car);
    }
  }

  /** The next road crossing along the car's current axis. */
  nextIntersection(car) {
    const half = this.city.cityHalf();
    const alongX = Math.abs(Math.sin(car.heading)) < 0.7;
    const pos = alongX ? car.x : car.z;
    const dir = alongX ? Math.cos(car.heading) : Math.sin(car.heading);
    let next = Math.max(-half, Math.min(half, pos + dir * 60));
    const cross = this.roads.reduce(
      (best, r) => (Math.abs(r - next) < Math.abs(best - next) ? r : best),
      this.roads[0],
    );
    if (alongX) return { x: cross, z: car.z };
    return { x: car.x, z: cross };
  }

  spawnPeds() {
    for (let i = 0; i < TRAFFIC.peds; i += 1) {
      const p = this.randomRoadPoint();
      const built = buildPersonMesh(pick(this.rng, SHIRTS), 0x2b2f36);
      const ped = {
        group: built.group, limbs: built.limbs,
        x: p.x + (this.rng() - 0.5) * 6, z: p.z + (this.rng() - 0.5) * 6,
        heading: this.rng() * Math.PI * 2,
        speed: TRAFFIC.pedSpeed * (0.7 + this.rng() * 0.6),
        phase: this.rng() * 6,
        walkTime: 4 + this.rng() * 8,
        alive: true,
      };
      ped.group.position.set(ped.x, 0, ped.z);
      this.scene.add(ped.group);
      this.peds.push(ped);
    }
  }

  /** Remove every traffic mesh from the scene (used when the world resets). */
  remove() {
    for (const car of this.cars) car.remove();
    for (const ped of this.peds) this.scene.remove(ped.group);
    this.cars = [];
    this.peds = [];
  }

  /** One traffic step: cars follow their lane to the next crossing, peds stroll. */
  step(dt) {
    for (const car of this.cars) {
      const dx = car.target.x - car.x, dz = car.target.z - car.z;
      const d = Math.hypot(dx, dz);
      if (d < 4) {
        // At the crossing: turn left, right or straight on.
        const turn = pick(this.rng, [-Math.PI / 2, 0, Math.PI / 2]);
        car.heading += turn;
        car.target = this.nextIntersection(car);
        continue;
      }
      // Lane offset: keep right of the road centre.
      const px = -Math.sin(car.heading) * car.lane;
      const pz = Math.cos(car.heading) * car.lane;
      const want = Math.atan2(car.target.z + pz - car.z, car.target.x + px - car.x);
      let dh = want - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      car.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, dh));
      car.x += Math.cos(car.heading) * car.speed * dt;
      car.z += Math.sin(car.heading) * car.speed * dt;
      car.group.position.set(car.x, 0, car.z);
      car.group.rotation.y = -car.heading;
      const roll = (car.speed * dt) / 0.38;
      for (const w of car.wheels) w.rotation.y += roll;
    }
    for (const ped of this.peds) {
      if (!ped.alive) continue;
      ped.walkTime -= dt;
      if (ped.walkTime <= 0) {
        ped.heading += Math.PI * (0.5 + this.rng());
        ped.walkTime = 5 + this.rng() * 9;
      }
      ped.x += Math.cos(ped.heading) * ped.speed * dt;
      ped.z += Math.sin(ped.heading) * ped.speed * dt;
      const fixed = this.city.resolveCollision(ped.x, ped.z, 0.5);
      ped.x = fixed.x; ped.z = fixed.z;
      ped.phase += dt * ped.speed * 2.2;
      const swing = Math.sin(ped.phase) * 0.6;
      ped.limbs.armL.rotation.x = swing;
      ped.limbs.armR.rotation.x = -swing;
      ped.limbs.legL.rotation.x = -swing;
      ped.limbs.legR.rotation.x = swing;
      ped.group.position.set(ped.x, 0, ped.z);
      ped.group.rotation.y = -ped.heading;
    }
  }

  /** Nearest living pedestrian within `radius` of (x, z), or null. */
  nearestPed(x, z, radius) {
    let best = null, bestD = radius * radius;
    for (const ped of this.peds) {
      if (!ped.alive) continue;
      const dx = ped.x - x, dz = ped.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = ped; }
    }
    return best;
  }

  /** Nearest traffic car within `radius` of (x, z), or null. */
  nearestCar(x, z, radius) {
    let best = null, bestD = radius * radius;
    for (const car of this.cars) {
      const dx = car.x - x, dz = car.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  /** Knock a pedestrian down; they stay on the ground. */
  knockPed(ped) {
    ped.alive = false;
    ped.group.rotation.z = Math.PI / 2;
    ped.group.position.y = 0.4;
  }
}
