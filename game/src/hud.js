// The HUD: health bar, cash, wanted stars, the mission objective line, a
// live minimap canvas (roads, beach, buildings, player arrow, police blips,
// mission marker), and the toast line for story beats. All DOM — no textures
// to load.
import { CITY } from './config.js';

export class HUD {
  constructor(city) {
    this.city = city;
    this.el = {
      health: document.getElementById('health-fill'),
      healthText: document.getElementById('health-text'),
      cash: document.getElementById('cash'),
      stars: document.getElementById('stars'),
      objective: document.getElementById('objective'),
      mission: document.getElementById('mission'),
      toast: document.getElementById('toast'),
      speed: document.getElementById('speed'),
      minimap: document.getElementById('minimap'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.toastTimer = 0;
    this.lastStars = -1;
  }

  toast(text, seconds = 4) {
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = '1';
    this.toastTimer = seconds;
  }

  step(dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el.toast.style.opacity = '0';
    }
  }

  /** Refresh every HUD field from the game state. Called once a frame. */
  update(game) {
    const p = game.player;
    const pct = Math.max(0, Math.round((p.health / 100) * 100));
    this.el.health.style.width = `${pct}%`;
    this.el.health.style.background = pct > 50 ? '#37c978' : pct > 25 ? '#ffb400' : '#e5484d';
    this.el.healthText.textContent = `${pct}`;
    this.el.cash.textContent = `$${game.cash.toLocaleString('en-US')}`;
    const stars = game.police.stars;
    if (stars !== this.lastStars) {
      this.lastStars = stars;
      let s = '';
      for (let i = 0; i < 5; i += 1) s += i < stars ? '★' : '☆';
      this.el.stars.textContent = s;
      this.el.stars.style.color = stars > 0 ? '#ffd23e' : 'rgba(255,255,255,0.35)';
    }
    const mission = game.missions.current();
    this.el.mission.textContent = mission ? mission.title : 'Free roam';
    this.el.objective.textContent = game.missions.objectiveText();
    const car = game.playerCar;
    this.el.speed.textContent = car ? `${Math.round(Math.abs(car.speed) * 3.6)} km/h` : '';
    this.drawMinimap(game);
  }

  drawMinimap(game) {
    const ctx = this.mapCtx;
    const S = 180;
    const half = this.city.cityHalf() + 60;
    const toMap = (x, z) => [((x + half) / (half * 2)) * S, ((z + half) / (half * 2)) * S];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(10, 18, 26, 0.78)';
    ctx.fillRect(0, 0, S, S);
    // Beach and sea along the south edge.
    const [, beachY] = toMap(0, this.city.cityHalf() + 7);
    ctx.fillStyle = '#c9a86a';
    ctx.fillRect(0, beachY, S, S - beachY);
    ctx.fillStyle = '#2e7f9e';
    ctx.fillRect(0, beachY + (S - beachY) * 0.45, S, S);
    // Roads.
    ctx.strokeStyle = '#5a636e';
    ctx.lineWidth = 3;
    for (const c of this.city.roadCentres()) {
      const [x] = toMap(c, 0);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
      const [, y] = toMap(0, c);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
    }
    // Buildings.
    ctx.fillStyle = 'rgba(200, 210, 220, 0.5)';
    for (const b of this.city.colliders) {
      const [x1, y1] = toMap(b.minX, b.minZ);
      const [x2, y2] = toMap(b.maxX, b.maxZ);
      ctx.fillRect(x1, y1, Math.max(1, x2 - x1), Math.max(1, y2 - y1));
    }
    // Mission marker: a pulsing yellow diamond.
    const target = game.missions.target;
    if (target) {
      const [mx, my] = toMap(target.x, target.z);
      const r = 5 + Math.sin(performance.now() / 300) * 1.5;
      ctx.fillStyle = '#ffb400';
      ctx.beginPath();
      ctx.moveTo(mx, my - r); ctx.lineTo(mx + r, my); ctx.lineTo(mx, my + r); ctx.lineTo(mx - r, my);
      ctx.closePath(); ctx.fill();
    }
    // Traffic: faint white dots. Police: red dots with a ring.
    for (const car of game.traffic.cars) {
      const [x, y] = toMap(car.x, car.z);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    for (const cop of game.police.cars) {
      const [x, y] = toMap(cop.x, cop.z);
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.stroke();
    }
    // The player: a white arrow pointing where they face.
    const px = game.playerCar ? game.playerCar.x : game.player.x;
    const pz = game.playerCar ? game.playerCar.z : game.player.z;
    const heading = game.playerCar ? game.playerCar.heading : game.player.heading;
    const [ax, ay] = toMap(px, pz);
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(Math.atan2(Math.sin(heading), Math.cos(heading)) + Math.PI / 2);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // North tick.
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('N', S - 12, 12);
  }
}
