// Screenshot staging: ?shot=chase|street|mission|sunset. Each scene sets the
// real game to a chosen state — a police chase, a busy sidewalk, a mission
// drive, a sunset cruise — then plays the real simulation forward with a
// scripted driver, so the frame is exactly what playing the game looks like.
// The same seed always gives the same frame. No shot is posed with anything
// the game cannot do.
import { STEP } from './config.js';

/** Steer a car straight along its road, drifting back to the centre line. */
function driveStraight(game, dt, throttle = 1) {
  const car = game.playerCar;
  if (!car) return;
  const road = game.city.roadCentres().reduce(
    (best, r) => (Math.abs(r - car.z) < Math.abs(best - car.z) ? r : best), 0,
  );
  const want = Math.atan2((road - car.z) * 0.06, 1);
  let dh = want - car.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  car.drive(dt, { throttle, steer: Math.max(-1, Math.min(1, dh * 2)), handbrake: false }, game.city);
}

/** Drive through waypoints in order (used for the mission drive, which turns). */
function driveWaypoints(game, waypoints, seconds) {
  let wi = 0;
  for (let i = 0; i < seconds * 60; i += 1) {
    const car = game.playerCar;
    const t = waypoints[Math.min(wi, waypoints.length - 1)];
    const d = Math.hypot(t.x - car.x, t.z - car.z);
    if (d < 10 && wi < waypoints.length - 1) wi += 1;
    const want = Math.atan2(t.z - car.z, t.x - car.x);
    let dh = want - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    car.drive(STEP, { throttle: 1, steer: Math.max(-1, Math.min(1, dh * 2)), handbrake: false }, game.city);
    game.stepWorld(STEP);
  }
}

/** Put the player in a fresh car on a road, already moving. */
function putInCar(game, x, z, heading) {
  const car = game.spawnPlayerCar(x, z, heading);
  car.speed = 24;
  game.playerCar = car;
  game.player.group.visible = false;
  return car;
}

export function stageShot(name, game) {
  game.resetWorld(7);
  game.startGame();
  // Clean HUD for the frame: no story toasts over the objective line.
  game.missions.onEvent = () => {};
  game.police.onCrime = () => {};
  const city = game.city;

  if (name === 'chase') {
    // Cover: a 3-star chase — the player speeding down a road, two cruisers
    // staged right behind the car so they read clearly in the frame.
    const car = putInCar(game, -60, 30, 0);
    game.police.stars = 3;
    game.police.quietTime = 0;
    game.missions.setIndex(0);
    game.missions.stage = 1; // already stole the car: drive to the marina
    game.missions.showMarker();
    for (let i = 0; i < 7 * 60; i += 1) {
      driveStraight(game, STEP, 0.65);
      game.stepWorld(STEP);
    }
    // Two cruisers tucked in behind the player car, same lane, same heading.
    const fx = Math.cos(car.heading), fz = Math.sin(car.heading);
    game.police.placeCruiser(car.x - fx * 11, car.z - fz * 11, car.heading);
    game.police.placeCruiser(car.x - fx * 19, car.z - fz * 19, car.heading);
    game.shotCamera = { front: true, height: 4.2, distance: 15, side: 6 };
    return 'chase';
  }

  if (name === 'mission') {
    // A mission drive: the player racing down the beach road toward the marina
    // beacon, one cruiser already on their tail. The camera sits off to the
    // side so the beacon beam clears the mission title at the top of the HUD.
    putInCar(game, -30, 60, Math.PI / 2);
    game.missions.setIndex(0);
    game.missions.stage = 1; // already stole the car: drive to the marina
    game.missions.showMarker();
    game.police.stars = 1;
    driveWaypoints(game, [{ x: -30, z: 210 }, { x: -40, z: 245 }], 6);
    // Ease to a stop just short of the beacon, mission still live.
    for (let i = 0; i < 1.2 * 60; i += 1) {
      game.playerCar.drive(STEP, { throttle: 0, steer: 0, handbrake: true }, city);
      game.stepWorld(STEP);
    }
    game.shotCamera = { behind: true, height: 5, distance: 14, side: -9 };
    return 'mission';
  }

  if (name === 'sunset') {
    // A sunset cruise down the beach road, palms and the sea on the right.
    city.setSunset(true);
    putInCar(game, -120, 210, 0);
    game.missions.setIndex(0);
    game.missions.stage = 1;
    game.missions.showMarker();
    for (let i = 0; i < 3 * 60; i += 1) {
      driveStraight(game, STEP);
      game.stepWorld(STEP);
    }
    game.shotCamera = { behind: true, height: 3.5, distance: 14, side: -6 };
    return 'sunset';
  }

  // 'street' (default): on foot at a busy intersection — traffic, pedestrians,
  // the city around the player, mission 1 on the HUD.
  game.player.setPosition(24, 24, -Math.PI * 0.75);
  game.missions.setIndex(0);
  // Bring two traffic cars and two pedestrians onto the player's crossing.
  const t = game.traffic;
  const placeCar = (car, x, z, heading) => {
    car.setPosition(x, z, heading);
    car.target = t.nextIntersection(car);
  };
  if (t.cars[0]) placeCar(t.cars[0], 30, -60, Math.PI / 2);
  if (t.cars[1]) placeCar(t.cars[1], -60, 30, 0);
  if (t.peds[0]) { t.peds[0].x = 34; t.peds[0].z = 40; t.peds[0].heading = -Math.PI / 2; }
  if (t.peds[1]) { t.peds[1].x = 16; t.peds[1].z = 36; t.peds[1].heading = Math.PI / 2; }
  for (let i = 0; i < 4 * 60; i += 1) game.stepWorld(STEP);
  game.shotCamera = { orbit: true, yaw: 2.4, pitch: 0.5, distance: 11 };
  return 'street';
}
