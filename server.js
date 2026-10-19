const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static(path.join(__dirname, "public")));

const players = new Map();
const WIDTH = 960, FLOOR = 490;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

io.on("connection", socket => {
  const spawnX = players.size % 2 ? 720 : 240;
  players.set(socket.id, {
    id: socket.id, name: "Fighter " + (players.size + 1),
    x: spawnX, y: FLOOR, vx: 0, vy: 0, hp: 100,
    facing: spawnX < WIDTH / 2 ? 1 : -1, color: ["#54d6ff", "#ff5c83", "#ffc857", "#b28cff"][players.size % 4],
    grounded: true, attackUntil: 0, attackCooldown: 0, hitTargets: [],
    keys: {}, lastInput: 0
  });
  socket.emit("welcome", { id: socket.id });
  socket.on("input", input => {
    const p = players.get(socket.id);
    if (!p || !input || typeof input !== "object") return;
    p.keys = {
      left: !!input.left, right: !!input.right,
      jump: !!input.jump, attack: !!input.attack,
      block: !!input.block
    };
  });
  socket.on("disconnect", () => players.delete(socket.id));
});

function resetRound() {
  const all = [...players.values()];
  if (all.length < 2 || !all.some(p => p.hp <= 0)) return;
  setTimeout(() => {
    for (const [i, p] of [...players.values()].entries()) {
      p.x = i % 2 ? 720 : 240; p.y = FLOOR; p.vx = 0; p.vy = 0;
      p.hp = 100; p.grounded = true; p.attackUntil = 0; p.hitTargets = [];
    }
  }, 1800);
}
setInterval(() => {
  const now = Date.now();
  const all = [...players.values()];
  for (const p of all) {
    if (p.hp <= 0) { p.vx = 0; continue; }
    const k = p.keys;
    p.vx = (k.left ? -1 : 0) + (k.right ? 1 : 0);
    p.vx *= k.block ? 2.1 : 4.1;
    if (k.jump && p.grounded) { p.vy = -12.5; p.grounded = false; }
    p.vy += 0.62;
    p.x += p.vx;
    p.y += p.vy;
    if (p.y >= FLOOR) { p.y = FLOOR; p.vy = 0; p.grounded = true; }
    p.x = clamp(p.x, 45, WIDTH - 45);
    if (p.vx !== 0) p.facing = p.vx > 0 ? 1 : -1;
    const attacking = k.attack && now > p.attackCooldown;
    if (attacking) {
      p.attackUntil = now + 180; p.attackCooldown = now + 460; p.hitTargets = [];
    }
    if (now > p.attackUntil) p.attackUntil = 0;
    if (p.attackUntil) {
      for (const other of all) {
        if (other.id === p.id || other.hp <= 0 || p.hitTargets.includes(other.id)) continue;
        const dx = other.x - p.x;
        const inFront = dx * p.facing > 0;
        if (inFront && Math.abs(dx) < 100 && Math.abs(other.y - p.y) < 80) {
          p.hitTargets.push(other.id);
          if (other.keys.block) {
            other.hp = Math.max(0, other.hp - 3);
            other.vx = p.facing * 2;
          } else {
            other.hp = Math.max(0, other.hp - 10);
            other.vx = p.facing * 7;
            other.vy = -3.5;
            other.grounded = false;
          }
        }
      }
    }
  }
  resetRound();
  io.emit("state", { players: all.map(p => ({
    id: p.id, name: p.name, x: p.x, y: p.y, hp: p.hp,
    facing: p.facing, color: p.color, grounded: p.grounded,
    attacking: !!p.attackUntil, blocking: !!p.keys.block
  })), time: now });
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Arena Brawl running at http://localhost:${PORT}`));
