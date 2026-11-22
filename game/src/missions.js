// Missions: three short jobs with a story hook, played in order. Each mission
// is a list of stages; a stage is complete when the player (or their car)
// reaches its marker, steals a car, or hits a wanted level. Completing a
// mission pays cash and unlocks the next one; the story is told through the
// briefs and the toast line.
import * as THREE from 'three';
import { MISSIONS } from './config.js';
import { dist2 } from './util.js';

/** A translucent beam material for the mission marker. */
function beaconMaterial(color) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
  });
}

export class MissionSystem {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.index = 0;          // which mission is active (0..2); 3 = story done
    this.stage = 0;
    this.done = false;
    this.target = null;      // { x, z, label } or null
    this.marker = null;      // beacon meshes
    this.markerTime = 0;
    this.onComplete = null;  // (mission) => void
    this.onEvent = null;     // (text) => void, story beats
    this.setMission(0);
  }

  current() { return this.index < MISSIONS.length ? MISSIONS[this.index] : null; }

  /** Mission target list, built from the city's named anchors. */
  stagesFor(index) {
    const a = this.city.anchors;
    if (index === 0) {
      return [
        { kind: 'steal', label: 'Steal a car (walk up to one, press E)' },
        { kind: 'reach', x: a.marina.x, z: a.marina.z, label: 'Drive to the marina pickup', radius: 9 },
      ];
    }
    if (index === 1) {
      return [
        { kind: 'reach', x: a.garage.x, z: a.garage.z, label: 'Go to the north garage on foot', radius: 7 },
        { kind: 'reach', x: a.beachBar.x, z: a.beachBar.z, label: 'Deliver the package to the beach bar', radius: 8 },
      ];
    }
    return [
      { kind: 'wanted', stars: 3, label: 'Get the heat to 3 stars' },
      { kind: 'escape', x: a.hideout.x, z: a.hideout.z, label: 'Lose the cops, then reach the hideout', radius: 9 },
    ];
  }

  setMission(index) {
    this.index = index;
    this.stage = 0;
    this.done = index >= MISSIONS.length;
    this.showMarker();
    if (this.onEvent && !this.done) {
      this.onEvent(`${MISSIONS[index].title}: ${MISSIONS[index].brief}`);
    }
  }

  stageDef() {
    if (this.done) return null;
    return this.stagesFor(this.index)[this.stage];
  }

  objectiveText() {
    if (this.done) return 'Story complete — Solmar is yours. Free roam!';
    const def = this.stageDef();
    return def ? def.label : '';
  }

  /** Show the beacon at the current stage's marker, if it has one. */
  showMarker() {
    this.hideMarker();
    const def = this.stageDef();
    if (!def || (def.kind !== 'reach' && def.kind !== 'escape')) {
      this.target = null;
      return;
    }
    this.target = { x: def.x, z: def.z, label: def.label };
    const group = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 26, 12, 1, true),
      beaconMaterial(0xffb400),
    );
    beam.position.y = 13;
    group.add(beam);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.4, 32),
      new THREE.MeshBasicMaterial({ color: 0xffb400, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.25;
    group.add(ring);
    group.position.set(def.x, 0, def.z);
    this.scene.add(group);
    this.marker = group;
  }

  hideMarker() {
    if (this.marker) { this.scene.remove(this.marker); this.marker = null; }
  }

  advance() {
    const stages = this.stagesFor(this.index);
    this.stage += 1;
    if (this.stage >= stages.length) {
      const mission = MISSIONS[this.index];
      if (this.onComplete) this.onComplete(mission);
      this.setMission(this.index + 1);
    } else {
      this.showMarker();
    }
  }

  /** Check the active stage against the game state; returns what happened. */
  step(game) {
    if (this.done) return null;
    const def = this.stageDef();
    const px = game.playerCar ? game.playerCar.x : game.player.x;
    const pz = game.playerCar ? game.playerCar.z : game.player.z;
    if (def.kind === 'steal') {
      if (game.playerCar) { this.advance(); return 'stole-car'; }
    } else if (def.kind === 'reach' || def.kind === 'escape') {
      if (def.kind === 'escape' && game.police.stars > 0) return null; // still hot
      if (dist2(px, pz, def.x, def.z) < def.radius * def.radius) {
        if (this.index === 1 && this.stage === 0) {
          game.police.crime(1); // picking up the package draws the cops
          if (this.onEvent) this.onEvent('Package grabbed — the cops noticed. Run it to the beach bar!');
        }
        this.advance();
        return 'reached';
      }
    } else if (def.kind === 'wanted') {
      if (game.police.stars >= def.stars) {
        if (this.onEvent) this.onEvent('Three stars! Now shake them — stay out of sight until the heat dies.');
        this.advance();
        return 'wanted';
      }
    }
    return null;
  }

  /** Pulse the beacon. */
  animate(dt) {
    this.markerTime += dt;
    if (this.marker) {
      this.marker.rotation.y += dt * 0.8;
      const s = 1 + Math.sin(this.markerTime * 3) * 0.12;
      this.marker.scale.set(s, 1, s);
    }
  }

  setIndex(index) { this.setMission(Math.max(0, Math.min(MISSIONS.length, index))); }
}
