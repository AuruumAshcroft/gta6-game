// Solmar City — boot, the fixed-step loop, input, and the state machine.
// Menu -> playing -> paused / busted, plus the ?shot= staging mode that sets
// a scene, plays it forward, renders one frame and flags window.__shotReady.
import * as THREE from 'three';
import { STEP, PLAYER, SAVE_KEY } from './config.js';
import { clamp, mulberry32 } from './util.js';
import { City } from './city.js';
import { Player, ChaseCamera } from './player.js';
import { Car, spawnCivilianCar } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Police } from './police.js';
import { MissionSystem } from './missions.js';
import { Combat } from './combat.js';
import { HUD } from './hud.js';
import { SoundBank } from './audio.js';
import { saveGame, loadGame, hasSave, recordBest, readBest } from './save.js';
import { stageShot } from './shots.js';

const $ = (id) => document.getElementById(id);

class Game {
  constructor() {
    this.canvas = $('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
    this.camera.position.set(60, 50, 90);

    this.city = new City(this.scene, 7);
    this.player = new Player(this.scene, 0, 0);
    this.cameraRig = new ChaseCamera(this.camera);
    this.traffic = new Traffic(this.scene, this.city, 21);
    this.police = new Police(this.scene, this.city, 33);
    this.missions = new MissionSystem(this.scene, this.city);
    this.combat = new Combat(this.scene, this.camera);
    this.hud = new HUD(this.city);
    this.sounds = new SoundBank();

    this.cash = 0;
    this.playerCar = null;
    this.parked = [];
    this.mode = 'menu';           // menu | playing | paused | dead
    this.shotMode = null;         // ?shot=name, or null
    this.shotCamera = null;
    this.keys = new Set();
    this.menuAngle = 0;
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.deadTimer = 0;

    this.wireCallbacks();
    this.spawnParked();
    this.bindInput();
    this.bindButtons();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    window.__game = this;
  }

  /** Hook police and mission events up to the HUD and the save slot. */
  wireCallbacks() {
    this.police.onCrime = (stars) => {
      if (stars >= 3) this.hud.toast('Three stars — the whole force is after you!', 4);
      else if (stars > 0) this.hud.toast('The cops noticed you.', 3);
    };
    this.missions.onComplete = (mission) => {
      this.cash += mission.reward;
      this.sounds.cash();
      recordBest(this.cash);
      this.hud.toast(`Job done: ${mission.title} — +$${mission.reward.toLocaleString('en-US')}`, 5);
      saveGame(this);
    };
    this.missions.onEvent = (text) => this.hud.toast(text, 5);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---- world setup -------------------------------------------------------

  spawnParked() {
    const rng = mulberry32(99);
    const roads = this.city.roadCentres();
    const half = this.city.cityHalf();
    for (let i = 0; i < 8; i += 1) {
      const road = roads[Math.floor(rng() * roads.length)];
      const along = (rng() * 2 - 1) * (half - 20);
      const side = rng() < 0.5 ? 1 : -1;
      const horizontal = rng() < 0.5;
      const x = horizontal ? along : road + side * 9.5;
      const z = horizontal ? road + side * 9.5 : along;
      const heading = horizontal ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
      this.parked.push(spawnCivilianCar(this.scene, x, z, heading, rng));
    }
  }

  spawnPlayerCar(x, z, heading) {
    return new Car(this.scene, x, z, heading, 0xd84040, mulberry32(5), false);
  }

  /** Fresh dynamic world: traffic, police, parked cars, player and missions. */
  resetWorld(seed = 7) {
    for (const car of this.parked) car.remove();
    this.parked = [];
    if (this.playerCar) { this.playerCar.remove(); this.playerCar = null; }
    this.traffic.remove();
    this.traffic = new Traffic(this.scene, this.city, seed + 14);
    this.police.clear();
    this.police = new Police(this.scene, this.city, seed + 26);
    this.missions.hideMarker();
    this.missions = new MissionSystem(this.scene, this.city);
    this.wireCallbacks();
    this.player.setPosition(0, 0, 0);
    this.player.health = PLAYER.health;
    this.player.group.visible = true;
    this.cash = 0;
    this.spawnParked();
  }

  // ---- modes -------------------------------------------------------------

  startGame(fromSave) {
    this.sounds.ensure();
    this.sounds.click();
    if (fromSave) {
      const data = loadGame();
      if (data) {
        this.cash = data.cash;
        this.missions.setIndex(data.missionIndex);
        this.player.setPosition(data.player.x, data.player.z, 0);
        this.player.health = data.player.health;
        this.police.stars = data.wanted || 0;
        this.hud.toast(
          `Welcome back, Marlo. Cash $${this.cash.toLocaleString('en-US')} — ${this.missions.current() ? this.missions.current().title : 'free roam'}.`,
          5,
        );
      }
    }
    $('start-screen').style.display = 'none';
    $('pause-screen').style.display = 'none';
    $('dead-screen').style.display = 'none';
    $('hud').style.display = 'block';
    this.mode = 'playing';
  }

  pause() {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    $('pause-screen').style.display = 'flex';
    document.exitPointerLock?.();
  }

  resume() {
    if (this.mode !== 'paused') return;
    $('pause-screen').style.display = 'none';
    this.mode = 'playing';
    this.sounds.ensure();
  }

  die() {
    this.mode = 'dead';
    this.sounds.busted();
    $('dead-screen').style.display = 'flex';
    document.exitPointerLock?.();
    this.hud.toast('', 0);
  }

  respawn() {
    const hospital = this.city.anchors.hospital;
    if (this.playerCar) { this.playerCar.remove(); this.playerCar = null; }
    this.player.group.visible = true;
    this.player.setPosition(hospital.x, hospital.z, 0);
    this.player.health = PLAYER.health;
    this.police.clear();
    this.cash = Math.max(0, this.cash - 200);
    $('dead-screen').style.display = 'none';
    this.mode = 'playing';
    this.hud.toast('Back on the street. The car is gone — steal another one.', 4);
    saveGame(this);
  }

  // ---- input -------------------------------------------------------------

  bindInput() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.mode === 'playing') this.pause();
        else if (this.mode === 'paused') this.resume();
      }
      if (e.code === 'KeyM') {
        this.sounds.ensure();
        this.sounds.setMuted(!this.sounds.muted);
        this.hud.toast(this.sounds.muted ? 'Sound off.' : 'Sound on.', 2);
      }
      if (e.code === 'KeyE' && this.mode === 'playing') this.tryEnterExitCar();
      if (e.code === 'KeyF' && this.mode === 'playing') this.combat.melee(this);
      if (e.code === 'Enter' && this.mode === 'menu') this.startGame(hasSave());
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    this.canvas.addEventListener('click', () => {
      if (this.mode === 'playing' && !this.shotMode) {
        this.sounds.ensure();
        this.canvas.requestPointerLock?.();
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.canvas && this.mode === 'playing') {
        this.cameraRig.addLook(e.movementX, e.movementY);
      }
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.mode === 'playing' && !this.playerCar && e.button === 0) this.combat.shoot(this);
    });
    document.addEventListener('pointerlockchange', () => {
      $('crosshair').style.display =
        document.pointerLockElement === this.canvas && !this.playerCar ? 'block' : 'none';
    });
  }

  bindButtons() {
    $('start-btn').addEventListener('click', () => this.startGame(false));
    $('resume-btn').addEventListener('click', () => this.resume());
    $('save-btn').addEventListener('click', () => {
      if (saveGame(this)) this.hud.toast('Game saved.', 2);
    });
    $('respawn-btn').addEventListener('click', () => this.respawn());
    if (hasSave()) {
      const data = loadGame();
      const btn = document.createElement('button');
      btn.textContent = `CONTINUE — $${(data?.cash ?? 0).toLocaleString('en-US')}`;
      btn.style.background = '#3a6fd8';
      btn.style.color = '#fff';
      btn.addEventListener('click', () => this.startGame(true));
      $('start-btn').after(btn);
      $('save-note').textContent =
        `Save found: mission ${(data?.missionIndex ?? 0) + 1} of 3 · best cash $${readBest().toLocaleString('en-US')}`;
    }
  }

  tryEnterExitCar() {
    if (this.playerCar) {
      // Get out: the car stays where it is, parked.
      const car = this.playerCar;
      this.playerCar = null;
      this.parked.push(car);
      this.player.setPosition(car.x - Math.sin(car.heading) * 2.4, car.z + Math.cos(car.heading) * 2.4, car.heading);
      this.player.group.visible = true;
      this.sounds.click();
      return;
    }
    let best = null, bestD = 7 * 7;
    for (const car of this.parked) {
      const dx = car.x - this.player.x, dz = car.z - this.player.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = car; }
    }
    if (!best) return;
    this.parked = this.parked.filter((c) => c !== best);
    this.playerCar = best;
    this.player.group.visible = false;
    this.police.crime(1);
    this.hud.toast('You stole the car! The cops are coming.', 3);
    this.sounds.engineHum(0.2, true);
  }

  // ---- simulation ----------------------------------------------------------

  cameraShake(amount) { this.cameraRig.shake = Math.max(this.cameraRig.shake, amount); }

  /** One fixed step of the living world (traffic, police, missions, combat). */
  stepWorld(dt) {
    this.traffic.step(dt);
    const rammed = this.police.step(dt, this.player, this.playerCar, this.city);
    if (rammed === 'rammed') {
      this.cameraShake(0.7);
      $('vignette').style.boxShadow = 'inset 0 0 120px 40px rgba(229,72,77,.55)';
      setTimeout(() => {
        $('vignette').style.boxShadow = 'inset 0 0 120px 40px rgba(229,72,77,0)';
      }, 220);
    }
    this.missions.step(this);
    this.missions.animate(dt);
    this.combat.step(dt);
    this.hud.step(dt);

    // The player's car vs the world: running over pedestrians is a crime,
    // and traffic cars shove each other out of the way.
    if (this.playerCar) {
      const car = this.playerCar;
      for (const ped of this.traffic.peds) {
        if (!ped.alive) continue;
        const dx = ped.x - car.x, dz = ped.z - car.z;
        if (dx * dx + dz * dz < 2.4 * 2.4) {
          this.traffic.knockPed(ped);
          this.police.crime(1);
          this.cameraShake(0.4);
        }
      }
      for (const other of this.traffic.cars) {
        const dx = car.x - other.x, dz = car.z - other.z;
        const d = Math.hypot(dx, dz);
        if (d < 4.4 && d > 0.01) {
          const push = (4.4 - d) / 2;
          car.x += (dx / d) * push;
          car.z += (dz / d) * push;
          car.speed *= 0.85;
        }
      }
    } else {
      // On foot, a traffic car that clips the player hurts.
      for (const other of this.traffic.cars) {
        const dx = this.player.x - other.x, dz = this.player.z - other.z;
        if (dx * dx + dz * dz < 2.2 * 2.2) this.player.hurt(6);
      }
    }
    // Slow health regen while the heat is off.
    if (this.police.stars === 0 && this.player.health > 0 && this.player.health < PLAYER.health) {
      this.player.health = Math.min(PLAYER.health, this.player.health + 2 * dt);
    }
    // Engine and siren follow the action.
    const speedFrac = this.playerCar ? Math.abs(this.playerCar.speed) / 38 : 0;
    this.sounds.engineHum(speedFrac, !!this.playerCar);
    this.sounds.sirenTick(dt, this.police.stars);
  }

  /** One fixed step of player input -> movement, then the camera and HUD. */
  stepPlayer(dt) {
    const k = this.keys;
    const basis = this.cameraRig.moveBasis();
    let fx = 0, fz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) { fx += basis.fx; fz += basis.fz; }
    if (k.has('KeyS') || k.has('ArrowDown')) { fx -= basis.fx; fz -= basis.fz; }
    if (k.has('KeyD') || k.has('ArrowRight')) { fx += basis.rx; fz += basis.rz; }
    if (k.has('KeyA') || k.has('ArrowLeft')) { fx -= basis.rx; fz -= basis.rz; }

    if (this.playerCar) {
      const throttle = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0)
        - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      const steer = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0)
        - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      this.playerCar.drive(dt, { throttle, steer, handbrake: k.has('Space') }, this.city);
      this.player.setPosition(this.playerCar.x, this.playerCar.z, this.playerCar.heading);
    } else {
      this.player.step(dt, { x: fx, z: fz }, k.has('ShiftLeft') || k.has('ShiftRight'), this.city);
    }

    const target = this.playerCar
      ? { x: this.playerCar.x, y: 0, z: this.playerCar.z }
      : { x: this.player.x, y: 0, z: this.player.z };
    this.cameraRig.update(
      dt, target, !!this.playerCar, this.playerCar ? this.playerCar.heading : 0,
    );
    this.city.follow(target);
    if (this.player.health <= 0 && this.mode === 'playing') this.die();
    this.hud.update(this);
  }

  // ---- main loop -----------------------------------------------------------

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    if (this.mode === 'menu') {
      // Slow orbit over the city behind the start screen.
      this.menuAngle += dt * 0.05;
      const cx = Math.cos(this.menuAngle) * 130, cz = Math.sin(this.menuAngle) * 130;
      this.camera.position.set(cx, 55, cz);
      this.camera.lookAt(0, 4, 40);
      this.traffic.step(dt);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.mode !== 'playing') { this.renderer.render(this.scene, this.camera); return; }
    this.accumulator += dt;
    let guard = 0;
    while (this.accumulator >= STEP && guard < 8) {
      this.stepPlayer(STEP);
      this.stepWorld(STEP);
      this.accumulator -= STEP;
      guard += 1;
    }
    this.renderer.render(this.scene, this.camera);
  }

  run() {
    const params = new URLSearchParams(window.location.search);
    const shot = params.get('shot');
    if (shot) {
      // Screenshot mode: stage the scene, render one frame, signal readiness.
      this.shotMode = shot;
      $('start-screen').style.display = 'none';
      $('hud').style.display = 'block';
      this.mode = 'playing';
      this.sounds.ensure = () => {}; // no audio in headless shots
      try {
        stageShot(shot, this);
      } catch (err) {
        window.__shotError = String((err && err.stack) || err);
      }
      this.placeShotCamera();
      this.hud.update(this);
      this.renderer.render(this.scene, this.camera);
      window.__shotReady = true;
      return;
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Put the camera where the staged shot wants it. */
  placeShotCamera() {
    const sc = this.shotCamera;
    const target = this.playerCar
      ? { x: this.playerCar.x, z: this.playerCar.z }
      : { x: this.player.x, z: this.player.z };
    const heading = this.playerCar ? this.playerCar.heading : this.player.heading;
    const fx = Math.cos(heading), fz = Math.sin(heading);
    const rx = -Math.sin(heading), rz = Math.cos(heading);
    if (sc?.behind) {
      // Behind the car, looking forward down the road.
      const bx = target.x - fx * sc.distance + rx * (sc.side || 0);
      const bz = target.z - fz * sc.distance + rz * (sc.side || 0);
      this.camera.position.set(bx, sc.height, bz);
      this.camera.lookAt(target.x, 1.5, target.z);
    } else if (sc?.front) {
      // Ahead of the car, looking back: the car fills the frame and the
      // pursuing police are visible behind it.
      const cx = target.x + fx * sc.distance + rx * (sc.side || 0);
      const cz = target.z + fz * sc.distance + rz * (sc.side || 0);
      this.camera.position.set(cx, sc.height, cz);
      this.camera.lookAt(target.x, 1.5, target.z);
    } else if (sc?.orbit) {
      this.cameraRig.yaw = sc.yaw;
      this.cameraRig.pitch = sc.pitch;
      this.cameraRig.distance = sc.distance;
      this.cameraRig.update(0.016, { x: target.x, y: 0, z: target.z }, false, 0);
    }
  }
}

const game = new Game();
game.run();
