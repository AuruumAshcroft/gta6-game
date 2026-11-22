// The wanted system: crimes raise stars (1–5), police cars spawn at a
// distance and chase the player, ramming to damage them. Stay quiet and out
// of sight and the stars decay one at a time; at zero the heat is off and the
// cops leave.
import * as THREE from 'three';
import { POLICE, PALETTE } from './config.js';
import { clamp, mulberry32, dist2 } from './util.js';
import { Car } from './vehicles.js';

export class Police {
  constructor(scene, city, seed = 33) {
    this.scene = scene;
    this.city = city;
    this.rng = mulberry32(seed);
    this.stars = 0;
    this.cars = [];
    this.quietTime = 0;    // seconds since the last crime
    this.decayTimer = 0;
    this.ramTimer = 0;
    this.flash = 0;        // light-bar phase
    this.onCrime = null;   // set by main: (stars) => void
  }

  /** A crime happened: raise the heat and reset the quiet clock. */
  crime(amount) {
    const before = this.stars;
    this.stars = clamp(this.stars + amount, 0, 5);
    this.quietTime = 0;
    this.decayTimer = 0;
    if (this.stars !== before && this.onCrime) this.onCrime(this.stars);
  }

  /** Where a cop spawns: on a road, off-screen from the player — preferably
   * the player's own road, so the chase arrives visibly down the same street. */
  spawnPoint(playerX, playerZ) {
    const roads = this.city.roadCentres();
    const half = this.city.cityHalf();
    const nearRoadZ = roads.find((r) => Math.abs(r - playerZ) < 8);
    const nearRoadX = roads.find((r) => Math.abs(r - playerX) < 8);
    if (nearRoadZ !== undefined && this.rng() < 0.8) {
      const dir = this.rng() < 0.5 ? 1 : -1;
      return { x: playerX + dir * (60 + this.rng() * 30), z: nearRoadZ };
    }
    if (nearRoadX !== undefined && this.rng() < 0.8) {
      const dir = this.rng() < 0.5 ? 1 : -1;
      return { x: nearRoadX, z: playerZ + dir * (60 + this.rng() * 30) };
    }
    for (let tries = 0; tries < 12; tries += 1) {
      const road = roads[Math.floor(this.rng() * roads.length)];
      const along = (this.rng() * 2 - 1) * (half - 10);
      const p = this.rng() < 0.5 ? { x: along, z: road } : { x: road, z: along };
      if (dist2(p.x, p.z, playerX, playerZ) > POLICE.spawnDistance * POLICE.spawnDistance) return p;
    }
    return { x: playerX + 70, z: playerZ };
  }

  /** Place a cruiser at an exact spot (used to stage the chase screenshot). */
  placeCruiser(x, z, heading) {
    const car = new Car(this.scene, x, z, heading, PALETTE.police, this.rng, true);
    car.speed = 24;
    this.cars.push(car);
    return car;
  }

  step(dt, player, playerCar, city) {
    const px = playerCar ? playerCar.x : player.x;
    const pz = playerCar ? playerCar.z : player.z;
    this.quietTime += dt;
    this.ramTimer = Math.max(0, this.ramTimer - dt);
    this.flash += dt;

    // Keep the right number of cruisers on the street: stars + 1, capped.
    const wanted = this.stars === 0 ? 0 : Math.min(POLICE.maxActive, this.stars + 1);
    while (this.cars.length < wanted) {
      const p = this.spawnPoint(px, pz);
      const car = new Car(this.scene, p.x, p.z, 0, PALETTE.police, this.rng, true);
      this.cars.push(car);
    }
    while (this.cars.length > wanted) this.cars.pop().remove();

    // Decay: quiet for a while, then one star at a time.
    if (this.stars > 0 && this.quietTime > POLICE.decayQuietSeconds) {
      this.decayTimer += dt;
      if (this.decayTimer > POLICE.decayStepSeconds) {
        this.decayTimer = 0;
        this.stars -= 1;
        if (this.onCrime) this.onCrime(this.stars);
      }
    }

    // Chase: steer at the player, ram on contact, flash the light bar.
    for (const car of this.cars) {
      if (car.disabled) continue;
      const d = car.steerToward(px, pz, dt, POLICE.chaseSpeed, city);
      const close = Math.hypot(car.x - px, car.z - pz);
      if (close < 4.6 && this.ramTimer <= 0) {
        this.ramTimer = POLICE.ramCooldown;
        if (playerCar) {
          playerCar.speed *= 0.4;
          playerCar.health -= POLICE.ramDamage;
        } else {
          player.hurt(POLICE.ramDamage);
        }
        return 'rammed';
      }
      if (car.lightBar) {
        const on = Math.floor(this.flash * 4) % 2 === 0;
        car.lightBar.material.emissive.setHex(on ? 0x2244ff : 0xff2222);
      }
      if (d < 2) car.speed *= 0.9;
    }
    return null;
  }

  /** How close the nearest cruiser is, in metres (Infinity when none). */
  nearestDistance(px, pz) {
    let best = Infinity;
    for (const car of this.cars) best = Math.min(best, Math.hypot(car.x - px, car.z - pz));
    return best;
  }

  clear() {
    for (const car of this.cars) car.remove();
    this.cars = [];
    this.stars = 0;
    this.quietTime = 0;
  }
}
