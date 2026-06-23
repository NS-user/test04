/* =========================================================
   サイバー成金防衛 ～AIファイアウォールＴＤ～
   「成金大防衛」リスペクトのタワーディフェンス。
   AIが防衛プログラム(タワー)を配置し、サイバー攻撃から
   コア(サーバー)を守る。倒して稼いで強化＝成金！
   外部画像なし・すべてCanvas描画・ビルド不要。
   ========================================================= */
"use strict";

/* ---------- 盤面定数 ---------- */
const TILE = 60;
const COLS = 12;
const ROWS = 9;
const W = COLS * TILE; // 720
const H = ROWS * TILE; // 540

/* 進軍ルート（グリッドセル座標）。左外から入り、蛇行してコアへ */
const PATH_CELLS = [
  [0, 1], [10, 1], [10, 3], [1, 3], [1, 5], [10, 5], [10, 7], [1, 7],
];
const waypoints = PATH_CELLS.map(([c, r]) => ({
  x: c * TILE + TILE / 2,
  y: r * TILE + TILE / 2,
}));
/* 入口は左外側から */
const ENTRY = { x: -TILE / 2, y: 1 * TILE + TILE / 2 };
const corePos = waypoints[waypoints.length - 1];

/* ルートが通るセル（ここにはタワーを置けない） */
const pathCells = new Set();
const ckey = (c, r) => c + "," + r;
for (let i = 0; i < PATH_CELLS.length - 1; i++) {
  let [c1, r1] = PATH_CELLS[i];
  const [c2, r2] = PATH_CELLS[i + 1];
  const dc = Math.sign(c2 - c1);
  const dr = Math.sign(r2 - r1);
  pathCells.add(ckey(c1, r1));
  while (c1 !== c2 || r1 !== r2) {
    c1 += dc; r1 += dr;
    pathCells.add(ckey(c1, r1));
  }
}

/* ---------- タワー定義 ---------- */
/* dmg/range/cooldown はレベル1。強化で倍率がかかる */
const TOWER_TYPES = {
  firewall: {
    name: "ファイアウォール", short: "FW", color: "#34d3ff",
    cost: 50, range: 115, dmg: 14, cd: 0.55, splash: 0, slow: 0,
    desc: "標準型。バランス良く安い基本防壁。",
  },
  antivirus: {
    name: "アンチウイルス", short: "AV", color: "#36f58a",
    cost: 70, range: 95, dmg: 6, cd: 0.16, splash: 0, slow: 0,
    desc: "連射型。手数で削る対小型ウイルス。",
  },
  ids: {
    name: "暗号砲ＩＤＳ", short: "ID", color: "#ff9d3a",
    cost: 120, range: 135, dmg: 48, cd: 1.25, splash: 48, slow: 0,
    desc: "重砲型。高威力＆範囲ダメージ。",
  },
  honeypot: {
    name: "ハニーポット", short: "HP", color: "#c77dff",
    cost: 90, range: 105, dmg: 3, cd: 0.7, splash: 0, slow: 0.5,
    desc: "減速型。敵を罠にハメて足止め。",
  },
  sentinel: {
    name: "ＡＩセンチネル", short: "AI", color: "#ff4d8d",
    cost: 200, range: 155, dmg: 34, cd: 0.42, splash: 0, slow: 0,
    desc: "最新鋭AI。高火力・高速・長射程。",
  },
};
const BUILD_ORDER = ["firewall", "antivirus", "ids", "honeypot", "sentinel"];

/* 強化レベルごとの倍率（index = level-1）。最大Lv3 */
const UP_DMG = [1, 1.7, 2.7];
const UP_RANGE = [1, 1.15, 1.32];
const UP_CD = [1, 0.82, 0.66]; // 小さいほど速い
const MAX_LEVEL = 3;

/* ---------- 敵(脅威)定義 ---------- */
const ENEMY_TYPES = {
  virus: { name: "ウイルス", hp: 34, speed: 62, reward: 7, leak: 1, color: "#7CFC00", r: 11 },
  worm: { name: "ワーム", hp: 24, speed: 118, reward: 9, leak: 1, color: "#00e5ff", r: 9 },
  trojan: { name: "トロイの木馬", hp: 150, speed: 42, reward: 22, leak: 3, color: "#ff7043", r: 15 },
  bot: { name: "ボットネット", hp: 16, speed: 78, reward: 5, leak: 1, color: "#ffd54f", r: 8 },
  ransom: { name: "ランサムウェア", hp: 1100, speed: 34, reward: 250, leak: 12, color: "#ff1744", r: 22 },
};

/* ---------- ウェーブ定義 ---------- */
/* 各ウェーブ: 出現グループの配列 {type,count,gap,delay} */
function buildWaves() {
  const w = [];
  // 1-3: 入門
  w.push([{ type: "virus", count: 8, gap: 0.9, delay: 0 }]);
  w.push([{ type: "virus", count: 10, gap: 0.7, delay: 0 }, { type: "worm", count: 3, gap: 0.6, delay: 5 }]);
  w.push([{ type: "worm", count: 8, gap: 0.5, delay: 0 }, { type: "virus", count: 8, gap: 0.6, delay: 2 }]);
  // 4: 最初のトロイ
  w.push([{ type: "trojan", count: 2, gap: 1.5, delay: 0 }, { type: "virus", count: 12, gap: 0.5, delay: 1 }]);
  // 5: ボット群
  w.push([{ type: "bot", count: 25, gap: 0.25, delay: 0 }]);
  w.push([{ type: "worm", count: 14, gap: 0.4, delay: 0 }, { type: "trojan", count: 3, gap: 1.2, delay: 3 }]);
  w.push([{ type: "virus", count: 18, gap: 0.45, delay: 0 }, { type: "bot", count: 20, gap: 0.2, delay: 4 }]);
  // 8: ミニボス級トロイ多数
  w.push([{ type: "trojan", count: 6, gap: 0.9, delay: 0 }, { type: "worm", count: 16, gap: 0.35, delay: 2 }]);
  w.push([{ type: "bot", count: 35, gap: 0.18, delay: 0 }, { type: "trojan", count: 4, gap: 1.0, delay: 1 }]);
  w.push([{ type: "worm", count: 24, gap: 0.3, delay: 0 }, { type: "virus", count: 20, gap: 0.35, delay: 1 }]);
  // 11-12: 混成 強敵
  w.push([{ type: "trojan", count: 10, gap: 0.7, delay: 0 }, { type: "bot", count: 30, gap: 0.18, delay: 2 }]);
  w.push([{ type: "worm", count: 30, gap: 0.25, delay: 0 }, { type: "trojan", count: 8, gap: 0.8, delay: 3 }]);
  // 13-14: ランサム前哨
  w.push([{ type: "ransom", count: 1, gap: 1, delay: 0 }, { type: "trojan", count: 6, gap: 0.8, delay: 1 }]);
  w.push([{ type: "bot", count: 45, gap: 0.14, delay: 0 }, { type: "worm", count: 25, gap: 0.25, delay: 2 }]);
  // 15: 最終決戦
  w.push([
    { type: "ransom", count: 3, gap: 6, delay: 0 },
    { type: "trojan", count: 14, gap: 0.6, delay: 3 },
    { type: "worm", count: 30, gap: 0.25, delay: 5 },
  ]);
  return w;
}
const WAVES = buildWaves();

/* ---------- ゲーム状態 ---------- */
const state = {
  money: 0,
  coreHP: 0,
  coreMaxHP: 20,
  wave: 0,            // 現在ウェーブ番号(1始まり)。0=未開始
  inWave: false,      // 出現処理中か
  towers: [],
  enemies: [],
  beams: [],
  particles: [],
  spawnQueue: [],     // {type, time}
  spawnTimer: 0,
  selectedBuild: null,
  selectedTower: null,
  speed: 1,
  score: 0,
  killed: 0,
  over: false,
  won: false,
  running: false,
};

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const canvas = $("game-canvas");
const ctx = canvas.getContext("2d");

/* ============================================================
   ゲーム開始 / リセット
   ============================================================ */
function startGame() {
  state.money = 200;
  state.coreHP = state.coreMaxHP;
  state.wave = 0;
  state.inWave = false;
  state.towers = [];
  state.enemies = [];
  state.beams = [];
  state.particles = [];
  state.spawnQueue = [];
  state.spawnTimer = 0;
  state.selectedBuild = null;
  state.selectedTower = null;
  state.speed = 1;
  state.score = 0;
  state.killed = 0;
  state.over = false;
  state.won = false;
  state.running = true;
  $("speed-btn").textContent = "▶ 等速";
  showScreen("game");
  showTowerPanel();
  syncShopButtons();
  updateHUD();
  refreshWaveButton();
}

/* ============================================================
   ウェーブ制御
   ============================================================ */
function startNextWave() {
  if (state.over || state.won) return;
  if (state.inWave) return;
  if (state.wave >= WAVES.length) return;

  // 早期開始ボーナス（2ウェーブ目以降）
  if (state.wave > 0) {
    const bonus = 20 + state.wave * 4;
    state.money += bonus;
    floatText(corePos.x, corePos.y - 30, "+" + bonus + " 早期ボーナス", "#ffd54f");
  }

  state.wave++;
  const groups = WAVES[state.wave - 1];
  const queue = [];
  for (const g of groups) {
    for (let i = 0; i < g.count; i++) {
      queue.push({ type: g.type, time: g.delay + i * g.gap });
    }
  }
  queue.sort((a, b) => a.time - b.time);
  state.spawnQueue = queue;
  state.spawnTimer = 0;
  state.inWave = true;
  refreshWaveButton();
  updateHUD();
}

function refreshWaveButton() {
  const btn = $("wave-btn");
  if (state.won) { btn.textContent = "🏆 完全防衛！"; btn.disabled = true; return; }
  if (state.over) { btn.textContent = "💥 防衛失敗"; btn.disabled = true; return; }
  if (state.wave >= WAVES.length && !state.inWave) {
    btn.textContent = "最終ウェーブ完遂"; btn.disabled = true; return;
  }
  btn.disabled = state.inWave;
  if (state.inWave) {
    btn.textContent = "WAVE " + state.wave + " 進行中…";
  } else if (state.wave === 0) {
    btn.textContent = "▶ 防衛開始 (WAVE 1)";
  } else {
    const bonus = 20 + state.wave * 4;
    btn.textContent = "▶ 次のWAVE " + (state.wave + 1) + " (+" + bonus + "💰)";
  }
}

/* ============================================================
   敵の出現
   ============================================================ */
function spawnEnemy(typeKey) {
  const t = ENEMY_TYPES[typeKey];
  // ウェーブが進むほど体力UP（後半の使い回しタイプ対策）
  const scale = 1 + (state.wave - 1) * 0.06;
  state.enemies.push({
    type: typeKey,
    name: t.name,
    color: t.color,
    r: t.r,
    maxhp: t.hp * scale,
    hp: t.hp * scale,
    speed: t.speed,
    reward: t.reward,
    leak: t.leak,
    x: ENTRY.x, y: ENTRY.y,
    seg: 0,
    traveled: 0,
    slowUntil: 0,
    hitFlash: 0,
  });
}

/* ============================================================
   メイン更新
   ============================================================ */
let lastTime = 0;
function loop(ts) {
  if (!state.running) return;
  let dt = (ts - lastTime) / 1000;
  lastTime = ts;
  if (dt > 0.05) dt = 0.05; // タブ復帰時の暴走防止
  dt *= state.speed;

  if (!state.over && !state.won) update(dt);
  render();
  requestAnimationFrame(loop);
}

function update(dt) {
  const now = performance.now() / 1000;

  /* --- 敵出現 --- */
  if (state.inWave) {
    state.spawnTimer += dt;
    while (state.spawnQueue.length && state.spawnQueue[0].time <= state.spawnTimer) {
      spawnEnemy(state.spawnQueue.shift().type);
    }
    if (state.spawnQueue.length === 0 && state.enemies.length === 0) {
      // ウェーブクリア
      state.inWave = false;
      if (state.wave >= WAVES.length) {
        state.won = true;
        finishGame();
      }
      refreshWaveButton();
    }
  }

  /* --- 敵移動 --- */
  for (const e of state.enemies) {
    const mul = e.slowUntil > now ? 0.45 : 1;
    let move = e.speed * mul * dt;
    if (e.hitFlash > 0) e.hitFlash -= dt;
    while (move > 0 && e.seg < waypoints.length) {
      const target = waypoints[e.seg];
      const dx = target.x - e.x, dy = target.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d <= move) {
        e.x = target.x; e.y = target.y; move -= d; e.traveled += d; e.seg++;
      } else {
        e.x += (dx / d) * move; e.y += (dy / d) * move;
        e.traveled += move; move = 0;
      }
    }
    if (e.seg >= waypoints.length) e.reached = true;
  }

  /* --- コアに到達した敵を処理 --- */
  for (const e of state.enemies) {
    if (e.reached) {
      state.coreHP -= e.leak;
      burst(corePos.x, corePos.y, "#ff1744", 16);
      if (state.coreHP <= 0) {
        state.coreHP = 0;
        state.over = true;
        finishGame();
      }
    }
  }
  state.enemies = state.enemies.filter((e) => !e.reached && e.hp > 0);

  /* --- タワー攻撃 --- */
  for (const tw of state.towers) {
    tw.cool -= dt;
    const cfg = TOWER_TYPES[tw.type];
    const range = cfg.range * UP_RANGE[tw.level - 1];
    const cd = cfg.cd * UP_CD[tw.level - 1];
    const dmg = cfg.dmg * UP_DMG[tw.level - 1];

    // 射程内で最も先行している敵を狙う
    let target = null, best = -1;
    for (const e of state.enemies) {
      const d = Math.hypot(e.x - tw.x, e.y - tw.y);
      if (d <= range && e.traveled > best) { best = e.traveled; target = e; }
    }
    tw.target = target;
    if (target && tw.cool <= 0) {
      tw.cool = cd;
      fire(tw, target, cfg, dmg, now);
    }
  }

  /* --- ビーム/パーティクル寿命 --- */
  for (const b of state.beams) b.life -= dt;
  state.beams = state.beams.filter((b) => b.life > 0);
  for (const p of state.particles) {
    p.life -= dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.92; p.vy *= 0.92;
  }
  state.particles = state.particles.filter((p) => p.life > 0);

  updateHUD();
}

/* タワー発射（ヒットスキャン＋ビーム表示） */
function fire(tw, target, cfg, dmg, now) {
  state.beams.push({ x1: tw.x, y1: tw.y, x2: target.x, y2: target.y, color: cfg.color, life: 0.09 });
  applyDamage(target, dmg);
  burst(target.x, target.y, cfg.color, 4);
  if (cfg.slow > 0) target.slowUntil = now + cfg.slow + tw.level * 0.15;
  if (cfg.splash > 0) {
    for (const e of state.enemies) {
      if (e === target) continue;
      const d = Math.hypot(e.x - target.x, e.y - target.y);
      if (d <= cfg.splash) applyDamage(e, dmg * 0.6);
    }
    ring(target.x, target.y, cfg.splash, cfg.color);
  }
}

function applyDamage(e, dmg) {
  e.hp -= dmg;
  e.hitFlash = 0.08;
  if (e.hp <= 0 && !e.dead) {
    e.dead = true;
    state.money += e.reward;
    state.score += e.reward;
    state.killed++;
    floatText(e.x, e.y, "+" + e.reward, "#36f58a");
    burst(e.x, e.y, e.color, 14);
  }
}

function finishGame() {
  $("ov-title").textContent = state.won ? "🏆 完全防衛 成功！" : "💥 コア陥落…防衛失敗";
  $("ov-sub").textContent = state.won
    ? "全" + WAVES.length + "ウェーブを撃退した！さすがAI。"
    : "WAVE " + state.wave + " でコアが破壊された。";
  $("ov-stats").innerHTML =
    "撃破した脅威: <b>" + state.killed + "</b> 体<br>" +
    "到達ウェーブ: <b>" + state.wave + " / " + WAVES.length + "</b><br>" +
    "スコア: <b>" + state.score + "</b>";
  $("overlay").classList.add("show");
  refreshWaveButton();
}

/* ============================================================
   エフェクト
   ============================================================ */
function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 30 + Math.random() * 90;
    state.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.3 + Math.random() * 0.3, color, size: 1 + Math.random() * 2.5,
    });
  }
}
function ring(x, y, r, color) {
  state.beams.push({ ring: true, x, y, r, color, life: 0.2 });
}
function floatText(x, y, text, color) {
  state.particles.push({ x, y, vx: 0, vy: -28, life: 0.9, color, text, size: 13 });
}

/* ============================================================
   描画
   ============================================================ */
function render() {
  ctx.clearRect(0, 0, W, H);

  // 背景
  ctx.fillStyle = "#070b14";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(40,80,120,0.22)";
  ctx.lineWidth = 1;
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath(); ctx.moveTo(c * TILE, 0); ctx.lineTo(c * TILE, H); ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * TILE); ctx.lineTo(W, r * TILE); ctx.stroke();
  }

  drawPath();
  if (state.selectedBuild) drawBuildHints();
  drawCore();

  for (const tw of state.towers) drawTower(tw);

  // 選択中タワーの射程
  if (state.selectedTower) {
    const cfg = TOWER_TYPES[state.selectedTower.type];
    const range = cfg.range * UP_RANGE[state.selectedTower.level - 1];
    ctx.beginPath();
    ctx.arc(state.selectedTower.x, state.selectedTower.y, range, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(80,200,255,0.08)";
    ctx.fill();
    ctx.strokeStyle = "rgba(80,200,255,0.5)";
    ctx.setLineDash([6, 5]); ctx.stroke(); ctx.setLineDash([]);
  }

  for (const e of state.enemies) drawEnemy(e);

  // ビーム
  for (const b of state.beams) {
    if (b.ring) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * (1.2 - b.life), 0, Math.PI * 2);
      ctx.strokeStyle = b.color; ctx.globalAlpha = b.life * 4; ctx.lineWidth = 3;
      ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
    } else {
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2);
      ctx.strokeStyle = b.color; ctx.globalAlpha = Math.min(1, b.life * 11);
      ctx.lineWidth = 3; ctx.shadowColor = b.color; ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.lineWidth = 1;
    }
  }

  // パーティクル / フロートテキスト
  for (const p of state.particles) {
    if (p.text) {
      ctx.globalAlpha = Math.min(1, p.life * 1.5);
      ctx.fillStyle = p.color;
      ctx.font = "bold " + p.size + "px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(p.text, p.x, p.y);
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.globalAlpha = 1;
    }
  }
}

function drawPath() {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(ENTRY.x, ENTRY.y);
  for (const wp of waypoints) ctx.lineTo(wp.x, wp.y);
  ctx.strokeStyle = "rgba(0,180,255,0.12)";
  ctx.lineWidth = 46; ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(ENTRY.x, ENTRY.y);
  for (const wp of waypoints) ctx.lineTo(wp.x, wp.y);
  ctx.strokeStyle = "#13314a";
  ctx.lineWidth = 30; ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(ENTRY.x, ENTRY.y);
  for (const wp of waypoints) ctx.lineTo(wp.x, wp.y);
  ctx.strokeStyle = "rgba(64,224,255,0.7)";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 14]);
  ctx.lineDashOffset = -(performance.now() / 28) % 24;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 1;
}

function drawBuildHints() {
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (pathCells.has(ckey(c, r))) continue;
      if (towerAt(c, r)) continue;
      ctx.fillStyle = "rgba(54,245,138,0.07)";
      ctx.fillRect(c * TILE + 3, r * TILE + 3, TILE - 6, TILE - 6);
      ctx.strokeStyle = "rgba(54,245,138,0.25)";
      ctx.strokeRect(c * TILE + 3, r * TILE + 3, TILE - 6, TILE - 6);
    }
  }
}

function drawCore() {
  const x = corePos.x, y = corePos.y;
  const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 300);
  ctx.save();
  ctx.shadowColor = "#2bd9ff"; ctx.shadowBlur = 20 * pulse;
  ctx.fillStyle = "#0b2c3d";
  ctx.fillRect(x - 22, y - 22, 44, 44);
  ctx.restore();
  ctx.strokeStyle = "#2bd9ff"; ctx.lineWidth = 2;
  ctx.strokeRect(x - 22, y - 22, 44, 44);
  ctx.fillStyle = "#2bd9ff";
  ctx.globalAlpha = 0.4 + 0.6 * pulse;
  ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#eaffff";
  ctx.font = "bold 9px monospace"; ctx.textAlign = "center";
  ctx.fillText("CORE", x, y + 33);
  const w = 44, hp = state.coreHP / state.coreMaxHP;
  ctx.fillStyle = "#22303a"; ctx.fillRect(x - w / 2, y - 33, w, 5);
  ctx.fillStyle = hp > 0.5 ? "#36f58a" : hp > 0.25 ? "#ffd54f" : "#ff4d4d";
  ctx.fillRect(x - w / 2, y - 33, w * Math.max(0, hp), 5);
}

function drawTower(tw) {
  const cfg = TOWER_TYPES[tw.type];
  const x = tw.x, y = tw.y;
  ctx.fillStyle = "#10202e";
  ctx.fillRect(x - 22, y - 22, 44, 44);
  ctx.strokeStyle = tw === state.selectedTower ? "#ffffff" : cfg.color;
  ctx.lineWidth = tw === state.selectedTower ? 3 : 2;
  ctx.strokeRect(x - 22, y - 22, 44, 44);
  ctx.lineWidth = 1;
  // 砲身は最寄り敵へ向く
  let ang = -Math.PI / 2;
  if (tw.target) ang = Math.atan2(tw.target.y - y, tw.target.x - x);
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = cfg.color;
  ctx.shadowColor = cfg.color; ctx.shadowBlur = 8;
  ctx.fillRect(0, -4, 20, 8);
  ctx.restore();
  ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fillStyle = cfg.color; ctx.fill();
  ctx.fillStyle = "#03121c";
  ctx.font = "bold 9px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(cfg.short, x, y);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffd54f"; ctx.font = "8px sans-serif";
  ctx.fillText("★".repeat(tw.level), x, y + 20);
}

function drawEnemy(e) {
  const x = e.x, y = e.y;
  ctx.save();
  if (e.hitFlash > 0) { ctx.shadowColor = "#fff"; ctx.shadowBlur = 12; }
  ctx.fillStyle = e.hitFlash > 0 ? "#ffffff" : e.color;
  if (e.type === "trojan") {
    ctx.fillRect(x - e.r, y - e.r, e.r * 2, e.r * 2);
  } else if (e.type === "ransom") {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + performance.now() / 600;
      const px = x + Math.cos(a) * e.r, py = y + Math.sin(a) * e.r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill();
  } else if (e.type === "worm") {
    ctx.beginPath(); ctx.ellipse(x, y, e.r + 3, e.r - 2, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(x, y, e.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  if (e.slowUntil > performance.now() / 1000) {
    ctx.strokeStyle = "#c77dff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, e.r + 4, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
  }
  const w = e.r * 2.2, hp = e.hp / e.maxhp;
  ctx.fillStyle = "#220";
  ctx.fillRect(x - w / 2, y - e.r - 8, w, 3);
  ctx.fillStyle = hp > 0.5 ? "#36f58a" : hp > 0.25 ? "#ffd54f" : "#ff4d4d";
  ctx.fillRect(x - w / 2, y - e.r - 8, w * Math.max(0, hp), 3);
}

/* ============================================================
   入力（建築・選択）
   ============================================================ */
function cellFromEvent(ev) {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;
  const px = (ev.clientX - rect.left) * sx;
  const py = (ev.clientY - rect.top) * sy;
  return { c: Math.floor(px / TILE), r: Math.floor(py / TILE), px, py };
}
function towerAt(c, r) {
  return state.towers.find((t) => t.cell.c === c && t.cell.r === r) || null;
}

canvas.addEventListener("click", (ev) => {
  if (state.over || state.won) return;
  const { c, r } = cellFromEvent(ev);
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return;
  const existing = towerAt(c, r);

  if (state.selectedBuild && !existing && !pathCells.has(ckey(c, r))) {
    const cfg = TOWER_TYPES[state.selectedBuild];
    if (state.money >= cfg.cost) {
      state.money -= cfg.cost;
      state.towers.push({
        type: state.selectedBuild,
        cell: { c, r },
        x: c * TILE + TILE / 2,
        y: r * TILE + TILE / 2,
        level: 1, cool: 0, target: null,
        invested: cfg.cost,
      });
      burst(c * TILE + TILE / 2, r * TILE + TILE / 2, cfg.color, 10);
      updateHUD();
    } else {
      floatText(c * TILE + TILE / 2, r * TILE + TILE / 2, "資金不足!", "#ff4d4d");
    }
    return;
  }

  state.selectedTower = existing;
  state.selectedBuild = null;
  syncShopButtons();
  showTowerPanel();
});

/* ============================================================
   ショップ / パネル UI
   ============================================================ */
function buildShop() {
  const shop = $("shop");
  shop.innerHTML = "";
  for (const key of BUILD_ORDER) {
    const cfg = TOWER_TYPES[key];
    const b = document.createElement("button");
    b.className = "shop-btn";
    b.dataset.type = key;
    b.innerHTML =
      '<span class="sb-icon" style="color:' + cfg.color + ';border-color:' + cfg.color + '">' + cfg.short + "</span>" +
      '<span class="sb-info"><b>' + cfg.name + "</b>" +
      "<small>" + cfg.desc + "</small></span>" +
      '<span class="sb-cost">💰' + cfg.cost + "</span>";
    b.addEventListener("click", () => {
      state.selectedBuild = state.selectedBuild === key ? null : key;
      state.selectedTower = null;
      showTowerPanel();
      syncShopButtons();
    });
    shop.appendChild(b);
  }
}

function syncShopButtons() {
  document.querySelectorAll(".shop-btn").forEach((b) => {
    const cfg = TOWER_TYPES[b.dataset.type];
    b.classList.toggle("selected", state.selectedBuild === b.dataset.type);
    b.classList.toggle("nomoney", state.money < cfg.cost);
  });
}

function upgradeCost(tw) {
  const cfg = TOWER_TYPES[tw.type];
  return Math.round(cfg.cost * (0.8 + tw.level * 0.7));
}

function showTowerPanel() {
  const panel = $("tower-panel");
  const tw = state.selectedTower;
  if (!tw) { panel.classList.remove("show"); return; }
  panel.classList.add("show");
  const cfg = TOWER_TYPES[tw.type];
  const dmg = Math.round(cfg.dmg * UP_DMG[tw.level - 1]);
  const range = Math.round(cfg.range * UP_RANGE[tw.level - 1]);
  const rate = (1 / (cfg.cd * UP_CD[tw.level - 1])).toFixed(1);
  $("tp-name").textContent = cfg.name + " ★" + tw.level;
  $("tp-stats").innerHTML =
    "威力 <b>" + dmg + "</b>／射程 <b>" + range + "</b>／連射 <b>" + rate + "</b>発/秒" +
    (cfg.splash ? "／範囲攻撃" : "") + (cfg.slow ? "／減速" : "");
  const upBtn = $("tp-upgrade");
  if (tw.level >= MAX_LEVEL) {
    upBtn.textContent = "最大レベル";
    upBtn.disabled = true;
  } else {
    const cost = upgradeCost(tw);
    upBtn.textContent = "⬆ 強化 (💰" + cost + ")";
    upBtn.disabled = state.money < cost;
  }
  const sell = Math.round(tw.invested * 0.6);
  $("tp-sell").textContent = "売却 (+💰" + sell + ")";
}

function doUpgrade() {
  const tw = state.selectedTower;
  if (!tw || tw.level >= MAX_LEVEL) return;
  const cost = upgradeCost(tw);
  if (state.money < cost) return;
  state.money -= cost;
  tw.invested += cost;
  tw.level++;
  burst(tw.x, tw.y, "#ffd54f", 14);
  updateHUD();
  showTowerPanel();
}

function doSell() {
  const tw = state.selectedTower;
  if (!tw) return;
  const refund = Math.round(tw.invested * 0.6);
  state.money += refund;
  floatText(tw.x, tw.y, "+" + refund, "#ffd54f");
  state.towers = state.towers.filter((t) => t !== tw);
  state.selectedTower = null;
  showTowerPanel();
  updateHUD();
}

/* ============================================================
   HUD / 画面切替
   ============================================================ */
function updateHUD() {
  $("hud-money").textContent = state.money;
  $("hud-core").textContent = state.coreHP;
  $("hud-wave").textContent = state.wave + " / " + WAVES.length;
  $("hud-score").textContent = state.score;
  syncShopButtons();
  if (state.selectedTower) {
    const tw = state.selectedTower;
    const upBtn = $("tp-upgrade");
    if (tw.level < MAX_LEVEL) upBtn.disabled = state.money < upgradeCost(tw);
  }
}

function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(name + "-screen").classList.add("active");
}

/* ============================================================
   配線
   ============================================================ */
let loopStarted = false;
function init() {
  buildShop();
  $("start-btn").addEventListener("click", () => {
    startGame();
    if (!loopStarted) { loopStarted = true; lastTime = performance.now(); requestAnimationFrame(loop); }
  });
  $("wave-btn").addEventListener("click", startNextWave);
  $("tp-upgrade").addEventListener("click", doUpgrade);
  $("tp-sell").addEventListener("click", doSell);
  $("speed-btn").addEventListener("click", () => {
    state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 3 : 1;
    $("speed-btn").textContent = state.speed === 1 ? "▶ 等速" : "▶▶ " + state.speed + "倍速";
  });
  $("retry-btn").addEventListener("click", () => {
    $("overlay").classList.remove("show");
    startGame();
  });
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    state.selectedBuild = null; state.selectedTower = null;
    syncShopButtons(); showTowerPanel();
  });
}
init();
