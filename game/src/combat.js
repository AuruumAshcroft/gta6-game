// Combat: fists and a pistol. Melee swings at the nearest pedestrian or cop in
// range; the pistol fires a hitscan shot from the camera with a tracer line and
// a muzzle flash, and hurting anyone in front of witnesses raises the heat.
import * as THREE from 'three';
import { PLAYER } from './config.js';
import { dist2 } from './util.js';

export class Combat {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.tracer = null;
    this.tracerLife = 0;
    this.flash = null;
    this.flashLife = 0;
    const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
    const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.tracer = new THREE.Line(tracerGeo, tracerMat);
    this.tracer.visible = false;
    scene.add(this.tracer);
    this.flash = new THREE.PointLight(0xffd27a, 0, 14);
    scene.add(this.flash);
    this.raycaster = new THREE.Raycaster();
  }

  /** Melee swing: hits the nearest living ped or police car in front of the player. */
  melee(game) {
    const p = game.player;
    if (p.meleeTimer > 0 || game.playerCar) return null;
    p.meleeTimer = PLAYER.meleeCooldown;
    game.sounds.punch();
    const fx = Math.cos(p.heading), fz = Math.sin(p.heading);
    const ped = game.traffic.nearestPed(p.x + fx * 1.2, p.z + fz * 1.2, PLAYER.meleeRange);
    if (ped) {
      game.traffic.knockPed(ped);
      game.police.crime(1);
      return 'ped-down';
    }
    for (const cop of game.police.cars) {
      if (dist2(p.x, p.z, cop.x, cop.z) < PLAYER.meleeRange * PLAYER.meleeRange) {
        cop.health -= PLAYER.meleeDamage;
        game.police.crime(1);
        if (cop.health <= 0) { this.disableCop(game, cop); return 'cop-down'; }
        return 'cop-hit';
      }
    }
    return 'swing';
  }

  /** Hitscan pistol shot from the camera centre. Returns what it hit. */
  shoot(game) {
    const p = game.player;
    if (p.pistolTimer > 0) return null;
    p.pistolTimer = PLAYER.pistolCooldown;
    game.sounds.gunshot();
    game.cameraShake(0.25);
    this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
    this.raycaster.far = PLAYER.pistolRange;
    const targets = [];
    for (const ped of game.traffic.peds) if (ped.alive) targets.push(ped.group);
    for (const cop of game.police.cars) targets.push(cop.group);
    const hits = this.raycaster.intersectObjects(targets, true);
    const from = this.camera.position.clone();
    let end = from.clone().add(this.raycaster.ray.direction.clone().multiplyScalar(PLAYER.pistolRange));
    let result = 'miss';
    if (hits.length > 0) {
      const hit = hits[0];
      end = hit.point.clone();
      // Walk up to the object that owns the hit mesh.
      let obj = hit.object;
      while (obj.parent && obj.parent !== this.scene) obj = obj.parent;
      const ped = game.traffic.peds.find((pd) => pd.group === obj);
      if (ped) {
        game.traffic.knockPed(ped);
        game.police.crime(1);
        result = 'ped-down';
      } else {
        const cop = game.police.cars.find((c) => c.group === obj);
        if (cop) {
          cop.health -= PLAYER.pistolDamage;
          game.police.crime(1);
          if (cop.health <= 0) { this.disableCop(game, cop); result = 'cop-down'; }
          else result = 'cop-hit';
        }
      }
    }
    const pos = this.tracer.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, end.x, end.y, end.z);
    pos.needsUpdate = true;
    this.tracer.visible = true;
    this.tracerLife = 0.07;
    this.flash.position.copy(end);
    this.flash.intensity = 60;
    this.flashLife = 0.06;
    return result;
  }

  disableCop(game, cop) {
    cop.health = 0;
    // A disabled cruiser stops chasing and smokes; it is removed when out of sight.
    cop.disabled = true;
    cop.speed = 0;
    game.police.cars = game.police.cars.filter((c) => c !== cop);
    game.sounds.pickup();
  }

  step(dt) {
    if (this.tracerLife > 0) {
      this.tracerLife -= dt;
      if (this.tracerLife <= 0) this.tracer.visible = false;
    }
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      if (this.flashLife <= 0) this.flash.intensity = 0;
    }
  }
}
