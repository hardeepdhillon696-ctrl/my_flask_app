<<<<<<< HEAD
(function () {
  const canvas = document.getElementById("poolCanvas");
  const ctx = canvas.getContext("2d");

  const TABLE = { width: canvas.width, height: canvas.height, rail: 28, pocketRadius: 24 };
  const BALL = { r: 10, m: 1, friction: 0.992, minSpeed: 0.05 };

  let balls = [], cueBall = null, currentPlayer = 1, ownership = { 1: null, 2: null };
  let ballsMoving = false, pottedThisShot = [], scratchThisShot = false;
  let blackPottedThisShot = false, gameOver = false, firstContact = null;

  const pockets = [
    { x: TABLE.rail, y: TABLE.rail },
    { x: TABLE.width / 2, y: TABLE.rail },
    { x: TABLE.width - TABLE.rail, y: TABLE.rail },
    { x: TABLE.rail, y: TABLE.height - TABLE.rail },
    { x: TABLE.width / 2, y: TABLE.height - TABLE.rail },
    { x: TABLE.width - TABLE.rail, y: TABLE.height - TABLE.rail }
  ].map(p => ({ ...p, r: TABLE.pocketRadius }));

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  class Ball {
    constructor(x, y, color, opts = {}) {
      this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.r = BALL.r; this.m = BALL.m;
      this.color = color; this.isCue = !!opts.isCue; this.isBlack = !!opts.isBlack;
      this.inPocket = false; this.id = Ball._id++;
    }
    speed() { return Math.hypot(this.vx, this.vy); }
    update() {
      if (this.inPocket) return;
      this.x += this.vx; this.y += this.vy; this.vx *= BALL.friction; this.vy *= BALL.friction;
      if (Math.abs(this.vx) < BALL.minSpeed) this.vx = 0;
      if (Math.abs(this.vy) < BALL.minSpeed) this.vy = 0;
      const minX = TABLE.rail + this.r, maxX = TABLE.width - TABLE.rail - this.r;
      const minY = TABLE.rail + this.r, maxY = TABLE.height - TABLE.rail - this.r;
      if (this.x < minX) { this.x = minX; this.vx = -this.vx; }
      if (this.x > maxX) { this.x = maxX; this.vx = -this.vx; }
      if (this.y < minY) { this.y = minY; this.vy = -this.vy; }
      if (this.y > maxY) { this.y = maxY; this.vy = -this.vy; }
      for (const p of pockets) {
        if (dist(this.x, this.y, p.x, p.y) < p.r) { this.inPocket = true; this.vx = this.vy = 0; onPotted(this); break; }
      }
    }
    draw(ctx) {
      if (this.inPocket) return;
      ctx.beginPath(); ctx.arc(this.x + 3, this.y + 3, this.r, 0, Math.PI * 2); ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fill();
      const gradient = ctx.createRadialGradient(this.x - this.r / 3, this.y - this.r / 3, this.r / 6, this.x, this.y, this.r);
      if (this.color === "white") { gradient.addColorStop(0, "#fff"); gradient.addColorStop(1, "#bbb"); }
      else if (this.color === "black") { gradient.addColorStop(0, "#444"); gradient.addColorStop(1, "#000"); }
      else if (this.color === "red") { gradient.addColorStop(0, "#ff6666"); gradient.addColorStop(1, "#b22222"); }
      else { gradient.addColorStop(0, "#fff176"); gradient.addColorStop(1, "#d4a017"); }
      ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(this.x - this.r / 3, this.y - this.r / 3, this.r / 3, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.stroke();
    }
  }
  Ball._id = 0;

  function rackBalls() {
    balls = []; cueBall = new Ball(TABLE.rail + 120, TABLE.height / 2, "white", { isCue: true }); balls.push(cueBall);
    const baseX = TABLE.width - TABLE.rail - 220, baseY = TABLE.height / 2, gap = BALL.r * 2 + 0.6;
    const positions = [];
    for (let row = 0; row < 5; row++) { for (let i = 0; i <= row; i++) { const x = baseX + row * gap; const y = baseY - row * (BALL.r) + i * (BALL.r * 2); positions.push({ x, y }); } }
    const colors = new Array(15).fill(null); colors[7] = "black";
    const bag = Array(7).fill("red").concat(Array(7).fill("yellow"));
    for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    let bi = 0; for (let k = 0; k < 15; k++) { if (k === 7) continue; colors[k] = bag[bi++]; }
    for (let k = 0; k < 15; k++) { const c = colors[k]; const pos = positions[k]; balls.push(new Ball(pos.x, pos.y, c, { isBlack: c === "black" })); }
    currentPlayer = 1; ownership = { 1: null, 2: null }; ballsMoving = false; pottedThisShot = []; scratchThisShot = false; blackPottedThisShot = false; gameOver = false; firstContact = null;
    updateBallCount();
  }

  function showMessage(text, color = "linear-gradient(135deg,#ff5252,#ff1744)") {
    const msgBox = document.getElementById("gameMessage"); msgBox.innerText = text; msgBox.style.background = color; msgBox.classList.add("show");
    setTimeout(() => { msgBox.classList.remove("show"); }, 2500);
  }

  function resolveCollision(A, B) {
    if (A.inPocket || B.inPocket) return;
    const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy), minD = A.r + B.r;
    if (d <= 0 || d >= minD) return;
    const overlap = (minD - d) / 2, nx = dx / d, ny = dy / d;
    A.x -= nx * overlap; A.y -= ny * overlap; B.x += nx * overlap; B.y += ny * overlap;
    const dvx = B.vx - A.vx, dvy = B.vy - A.vy, rel = dvx * nx + dvy * ny; if (rel > 0) return;
    if (!firstContact) { if (A.isCue && !B.isCue) firstContact = B; else if (B.isCue && !A.isCue) firstContact = A; }
    const e = 0.98, j = -(1 + e) * rel / (1 / A.m + 1 / B.m), ix = j * nx, iy = j * ny; A.vx -= ix / A.m; A.vy -= iy / A.m; B.vx += ix / B.m; B.vy += iy / B.m;
  }

  function onPotted(ball) {
    if (ball.isCue) { scratchThisShot = true; return; }
    if (ball.isBlack) { blackPottedThisShot = true; return; }
    ball.inPocket = true;
    pottedThisShot.push(ball);
    if (!ownership[1] && !ownership[2] && !ball.isBlack) {
      ownership[currentPlayer] = ball.color;
      ownership[otherPlayer()] = ball.color === "red" ? "yellow" : "red";
    }
    updateBallCount();
  }

  function updateBallCount() {
    [1, 2].forEach(player => {
      const color = ownership[player]; if (!color) return;
      const count = balls.filter(b => !b.inPocket && b.color === color).length;
      document.getElementById(`p${player}BallCount`).textContent = count;
      const container = document.getElementById(`p${player}Balls`);
      container.innerHTML = "";
      for (let i = 0; i < count; i++) { const dot = document.createElement("div"); dot.className = `ball-dot ${color}`; container.appendChild(dot); }
    });
  }

  function playerClearedAll(playerColor) { return balls.filter(b => !b.inPocket && b.color === playerColor).length === 0; }

  function endOfShot() {
    if (blackPottedThisShot) {
      const myColor = ownership[currentPlayer];
      if (myColor && playerClearedAll(myColor)) { endGame(getPlayerName(currentPlayer), getPlayerName(otherPlayer()), false); }
      else { endGame(getPlayerName(otherPlayer()), getPlayerName(currentPlayer), true); }
      ballsMoving = false; updateBallCount(); return;
    }
    const myColor = ownership[currentPlayer];
    if (myColor && firstContact && firstContact.color !== myColor && !firstContact.isBlack) { announce(`❌ Foul! Wrong ball first.`); switchTurn(); resetCue(); return; }
    if (!firstContact && !scratchThisShot) { announce(`❌ Foul! Missed all balls.`); switchTurn(); resetCue(); return; }
    if (myColor && pottedThisShot.length > 0) { const onlyOpponent = pottedThisShot.every(b => b.color !== myColor && !b.isBlack); if (onlyOpponent) { announce(`❌ Foul! Only opponent's balls potted.`); switchTurn(); resetCue(); return; } }
    if (scratchThisShot) { resetCue(); announce(`❌ Scratch! Ball in hand for ${getPlayerName(otherPlayer())}.`); switchTurn(); return; }
    const pottedMine = myColor ? pottedThisShot.some(b => b.color === myColor) : pottedThisShot.length > 0;
    if (pottedMine) announce(`${getPlayerName(currentPlayer)} continues.`); else switchTurn();
    updateBallCount();
  }

  function otherPlayer() { return currentPlayer === 1 ? 2 : 1; }
  function switchTurn() { currentPlayer = otherPlayer(); announce(`Turn: ${getPlayerName(currentPlayer)}`); }
  function getPlayerName(n) { return document.getElementById(n === 1 ? "p1Name" : "p2Name").value; }
  function resetCue() { cueBall.inPocket = false; cueBall.x = TABLE.rail + 120; cueBall.y = TABLE.height / 2; cueBall.vx = cueBall.vy = 0; }

  // Pointer aiming
  let aiming = false, aimStart = null, aimCurrent = null;
  canvas.addEventListener("pointerdown", (e) => { if (gameOver || ballsMoving) return; const p = pointerPos(e); if (dist(p.x, p.y, cueBall.x, cueBall.y) <= BALL.r * 2.2) { aiming = true; aimStart = { x: cueBall.x, y: cueBall.y }; aimCurrent = p; canvas.setPointerCapture(e.pointerId); } });
  canvas.addEventListener("pointermove", (e) => { if (!aiming) return; aimCurrent = pointerPos(e); });
  canvas.addEventListener("pointerup", (e) => {
    if (!aiming) return; aiming = false; canvas.releasePointerCapture(e.pointerId);
    const dx = aimStart.x - aimCurrent.x, dy = aimStart.y - aimCurrent.y, L = Math.hypot(dx, dy);
    if (L < 2) return;
    const speed = clamp(L * 0.6, 0, 60); cueBall.vx = (dx / L) * speed; cueBall.vy = (dy / L) * speed;
    ballsMoving = true; pottedThisShot = []; scratchThisShot = false; blackPottedThisShot = false; firstContact = null;
  });

  function pointerPos(e) { const rect = canvas.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; }

  // Draw functions
  function drawTable() {
    const clothGradient = ctx.createLinearGradient(0, 0, 0, TABLE.height); clothGradient.addColorStop(0, "#2e5d3f"); clothGradient.addColorStop(1, "#1e3d2b"); ctx.fillStyle = clothGradient; ctx.fillRect(0, 0, TABLE.width, TABLE.height);
    const railThickness = TABLE.rail; ctx.fillStyle = "#5c3a1b";
    ctx.fillRect(0, 0, TABLE.width, railThickness); ctx.fillRect(0, TABLE.height - railThickness, TABLE.width, railThickness);
    ctx.fillRect(0, 0, railThickness, TABLE.height); ctx.fillRect(TABLE.width - railThickness, 0, railThickness, TABLE.height);
    ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 6; ctx.strokeRect(railThickness, railThickness, TABLE.width - railThickness * 2, TABLE.height - railThickness * 2);
    for (const p of pockets) { ctx.beginPath(); ctx.arc(p.x + 2, p.y + 2, p.r, 0, Math.PI * 2); ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fill(); ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = "#000"; ctx.fill(); }
  }

  function drawAim() { if (!aiming) return; ctx.save(); ctx.setLineDash([6, 6]); ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cueBall.x, cueBall.y); ctx.lineTo(aimCurrent.x, aimCurrent.y); ctx.stroke(); ctx.restore(); }

  let stickAngle = 0, stickLength = 160;
  function drawCue() { if (ballsMoving || gameOver) return; if (!aiming) return; const dx = aimCurrent.x - cueBall.x, dy = aimCurrent.y - cueBall.y; stickAngle = Math.atan2(dy, dx); ctx.save(); ctx.translate(cueBall.x, cueBall.y); ctx.rotate(stickAngle); const grad = ctx.createLinearGradient(-stickLength, 0, 0, 0); grad.addColorStop(0, "#3e2723"); grad.addColorStop(0.5, "#795548"); grad.addColorStop(1, "#d7ccc8"); ctx.fillStyle = grad; ctx.fillRect(-stickLength, -4, stickLength, 8); ctx.fillStyle = "#2196f3"; ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }

  // Game loop
  function gameLoop() {
    ctx.clearRect(0, 0, TABLE.width, TABLE.height);
    drawTable(); balls.forEach(b => b.update());
    for (let i = 0; i < balls.length; i++) { for (let j = i + 1; j < balls.length; j++) { resolveCollision(balls[i], balls[j]); } }
    balls.forEach(b => b.draw(ctx)); drawAim(); drawCue();
    if (ballsMoving && balls.every(b => b.speed() < BALL.minSpeed)) { ballsMoving = false; endOfShot(); }
    requestAnimationFrame(gameLoop);
  }

  function announce(msg) { console.log(msg); showMessage(msg); }

  // Start game
  rackBalls(); requestAnimationFrame(gameLoop);

  // Expose functions
  window.restartGame = function () { rackBalls(); drawTable(); balls.forEach(b => b.draw(ctx)); gameOver = false; updateBallCount(); document.getElementById("gameOverOverlay").classList.add("hidden"); document.getElementById("gameMessage").innerHTML = ""; document.getElementById("turnIndicator").innerText = "Turn: Player 1"; };
  window.exitGame = function () { window.location.href = "/dashboard"; };
})();
=======
(function () {
  const canvas = document.getElementById("poolCanvas");
  const ctx = canvas.getContext("2d");

  const TABLE = { width: canvas.width, height: canvas.height, rail: 28, pocketRadius: 24 };
  const BALL = { r: 10, m: 1, friction: 0.992, minSpeed: 0.05 };

  let balls = [], cueBall = null, currentPlayer = 1, ownership = { 1: null, 2: null };
  let ballsMoving = false, pottedThisShot = [], scratchThisShot = false;
  let blackPottedThisShot = false, gameOver = false, firstContact = null;

  const pockets = [
    { x: TABLE.rail, y: TABLE.rail },
    { x: TABLE.width / 2, y: TABLE.rail },
    { x: TABLE.width - TABLE.rail, y: TABLE.rail },
    { x: TABLE.rail, y: TABLE.height - TABLE.rail },
    { x: TABLE.width / 2, y: TABLE.height - TABLE.rail },
    { x: TABLE.width - TABLE.rail, y: TABLE.height - TABLE.rail }
  ].map(p => ({ ...p, r: TABLE.pocketRadius }));

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  class Ball {
    constructor(x, y, color, opts = {}) {
      this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.r = BALL.r; this.m = BALL.m;
      this.color = color; this.isCue = !!opts.isCue; this.isBlack = !!opts.isBlack;
      this.inPocket = false; this.id = Ball._id++;
    }
    speed() { return Math.hypot(this.vx, this.vy); }
    update() {
      if (this.inPocket) return;
      this.x += this.vx; this.y += this.vy; this.vx *= BALL.friction; this.vy *= BALL.friction;
      if (Math.abs(this.vx) < BALL.minSpeed) this.vx = 0;
      if (Math.abs(this.vy) < BALL.minSpeed) this.vy = 0;
      const minX = TABLE.rail + this.r, maxX = TABLE.width - TABLE.rail - this.r;
      const minY = TABLE.rail + this.r, maxY = TABLE.height - TABLE.rail - this.r;
      if (this.x < minX) { this.x = minX; this.vx = -this.vx; }
      if (this.x > maxX) { this.x = maxX; this.vx = -this.vx; }
      if (this.y < minY) { this.y = minY; this.vy = -this.vy; }
      if (this.y > maxY) { this.y = maxY; this.vy = -this.vy; }
      for (const p of pockets) {
        if (dist(this.x, this.y, p.x, p.y) < p.r) { this.inPocket = true; this.vx = this.vy = 0; onPotted(this); break; }
      }
    }
    draw(ctx) {
      if (this.inPocket) return;
      ctx.beginPath(); ctx.arc(this.x + 3, this.y + 3, this.r, 0, Math.PI * 2); ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fill();
      const gradient = ctx.createRadialGradient(this.x - this.r / 3, this.y - this.r / 3, this.r / 6, this.x, this.y, this.r);
      if (this.color === "white") { gradient.addColorStop(0, "#fff"); gradient.addColorStop(1, "#bbb"); }
      else if (this.color === "black") { gradient.addColorStop(0, "#444"); gradient.addColorStop(1, "#000"); }
      else if (this.color === "red") { gradient.addColorStop(0, "#ff6666"); gradient.addColorStop(1, "#b22222"); }
      else { gradient.addColorStop(0, "#fff176"); gradient.addColorStop(1, "#d4a017"); }
      ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(this.x - this.r / 3, this.y - this.r / 3, this.r / 3, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.stroke();
    }
  }
  Ball._id = 0;

  function rackBalls() {
    balls = []; cueBall = new Ball(TABLE.rail + 120, TABLE.height / 2, "white", { isCue: true }); balls.push(cueBall);
    const baseX = TABLE.width - TABLE.rail - 220, baseY = TABLE.height / 2, gap = BALL.r * 2 + 0.6;
    const positions = [];
    for (let row = 0; row < 5; row++) { for (let i = 0; i <= row; i++) { const x = baseX + row * gap; const y = baseY - row * (BALL.r) + i * (BALL.r * 2); positions.push({ x, y }); } }
    const colors = new Array(15).fill(null); colors[7] = "black";
    const bag = Array(7).fill("red").concat(Array(7).fill("yellow"));
    for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    let bi = 0; for (let k = 0; k < 15; k++) { if (k === 7) continue; colors[k] = bag[bi++]; }
    for (let k = 0; k < 15; k++) { const c = colors[k]; const pos = positions[k]; balls.push(new Ball(pos.x, pos.y, c, { isBlack: c === "black" })); }
    currentPlayer = 1; ownership = { 1: null, 2: null }; ballsMoving = false; pottedThisShot = []; scratchThisShot = false; blackPottedThisShot = false; gameOver = false; firstContact = null;
    updateBallCount();
  }

  function showMessage(text, color = "linear-gradient(135deg,#ff5252,#ff1744)") {
    const msgBox = document.getElementById("gameMessage"); msgBox.innerText = text; msgBox.style.background = color; msgBox.classList.add("show");
    setTimeout(() => { msgBox.classList.remove("show"); }, 2500);
  }

  function resolveCollision(A, B) {
    if (A.inPocket || B.inPocket) return;
    const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy), minD = A.r + B.r;
    if (d <= 0 || d >= minD) return;
    const overlap = (minD - d) / 2, nx = dx / d, ny = dy / d;
    A.x -= nx * overlap; A.y -= ny * overlap; B.x += nx * overlap; B.y += ny * overlap;
    const dvx = B.vx - A.vx, dvy = B.vy - A.vy, rel = dvx * nx + dvy * ny; if (rel > 0) return;
    if (!firstContact) { if (A.isCue && !B.isCue) firstContact = B; else if (B.isCue && !A.isCue) firstContact = A; }
    const e = 0.98, j = -(1 + e) * rel / (1 / A.m + 1 / B.m), ix = j * nx, iy = j * ny; A.vx -= ix / A.m; A.vy -= iy / A.m; B.vx += ix / B.m; B.vy += iy / B.m;
  }

  function onPotted(ball) {
    if (ball.isCue) { scratchThisShot = true; return; }
    if (ball.isBlack) { blackPottedThisShot = true; return; }
    ball.inPocket = true;
    pottedThisShot.push(ball);
    if (!ownership[1] && !ownership[2] && !ball.isBlack) {
      ownership[currentPlayer] = ball.color;
      ownership[otherPlayer()] = ball.color === "red" ? "yellow" : "red";
    }
    updateBallCount();
  }

  function updateBallCount() {
    [1, 2].forEach(player => {
      const color = ownership[player]; if (!color) return;
      const count = balls.filter(b => !b.inPocket && b.color === color).length;
      document.getElementById(`p${player}BallCount`).textContent = count;
      const container = document.getElementById(`p${player}Balls`);
      container.innerHTML = "";
      for (let i = 0; i < count; i++) { const dot = document.createElement("div"); dot.className = `ball-dot ${color}`; container.appendChild(dot); }
    });
  }

  function playerClearedAll(playerColor) { return balls.filter(b => !b.inPocket && b.color === playerColor).length === 0; }

  function endOfShot() {
    if (blackPottedThisShot) {
      const myColor = ownership[currentPlayer];
      if (myColor && playerClearedAll(myColor)) { endGame(getPlayerName(currentPlayer), getPlayerName(otherPlayer()), false); }
      else { endGame(getPlayerName(otherPlayer()), getPlayerName(currentPlayer), true); }
      ballsMoving = false; updateBallCount(); return;
    }
    const myColor = ownership[currentPlayer];
    if (myColor && firstContact && firstContact.color !== myColor && !firstContact.isBlack) { announce(`❌ Foul! Wrong ball first.`); switchTurn(); resetCue(); return; }
    if (!firstContact && !scratchThisShot) { announce(`❌ Foul! Missed all balls.`); switchTurn(); resetCue(); return; }
    if (myColor && pottedThisShot.length > 0) { const onlyOpponent = pottedThisShot.every(b => b.color !== myColor && !b.isBlack); if (onlyOpponent) { announce(`❌ Foul! Only opponent's balls potted.`); switchTurn(); resetCue(); return; } }
    if (scratchThisShot) { resetCue(); announce(`❌ Scratch! Ball in hand for ${getPlayerName(otherPlayer())}.`); switchTurn(); return; }
    const pottedMine = myColor ? pottedThisShot.some(b => b.color === myColor) : pottedThisShot.length > 0;
    if (pottedMine) announce(`${getPlayerName(currentPlayer)} continues.`); else switchTurn();
    updateBallCount();
  }

  function otherPlayer() { return currentPlayer === 1 ? 2 : 1; }
  function switchTurn() { currentPlayer = otherPlayer(); announce(`Turn: ${getPlayerName(currentPlayer)}`); }
  function getPlayerName(n) { return document.getElementById(n === 1 ? "p1Name" : "p2Name").value; }
  function resetCue() { cueBall.inPocket = false; cueBall.x = TABLE.rail + 120; cueBall.y = TABLE.height / 2; cueBall.vx = cueBall.vy = 0; }

  // Pointer aiming
  let aiming = false, aimStart = null, aimCurrent = null;
  canvas.addEventListener("pointerdown", (e) => { if (gameOver || ballsMoving) return; const p = pointerPos(e); if (dist(p.x, p.y, cueBall.x, cueBall.y) <= BALL.r * 2.2) { aiming = true; aimStart = { x: cueBall.x, y: cueBall.y }; aimCurrent = p; canvas.setPointerCapture(e.pointerId); } });
  canvas.addEventListener("pointermove", (e) => { if (!aiming) return; aimCurrent = pointerPos(e); });
  canvas.addEventListener("pointerup", (e) => {
    if (!aiming) return; aiming = false; canvas.releasePointerCapture(e.pointerId);
    const dx = aimStart.x - aimCurrent.x, dy = aimStart.y - aimCurrent.y, L = Math.hypot(dx, dy);
    if (L < 2) return;
    const speed = clamp(L * 0.6, 0, 60); cueBall.vx = (dx / L) * speed; cueBall.vy = (dy / L) * speed;
    ballsMoving = true; pottedThisShot = []; scratchThisShot = false; blackPottedThisShot = false; firstContact = null;
  });

  function pointerPos(e) { const rect = canvas.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; }

  // Draw functions
  function drawTable() {
    const clothGradient = ctx.createLinearGradient(0, 0, 0, TABLE.height); clothGradient.addColorStop(0, "#2e5d3f"); clothGradient.addColorStop(1, "#1e3d2b"); ctx.fillStyle = clothGradient; ctx.fillRect(0, 0, TABLE.width, TABLE.height);
    const railThickness = TABLE.rail; ctx.fillStyle = "#5c3a1b";
    ctx.fillRect(0, 0, TABLE.width, railThickness); ctx.fillRect(0, TABLE.height - railThickness, TABLE.width, railThickness);
    ctx.fillRect(0, 0, railThickness, TABLE.height); ctx.fillRect(TABLE.width - railThickness, 0, railThickness, TABLE.height);
    ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 6; ctx.strokeRect(railThickness, railThickness, TABLE.width - railThickness * 2, TABLE.height - railThickness * 2);
    for (const p of pockets) { ctx.beginPath(); ctx.arc(p.x + 2, p.y + 2, p.r, 0, Math.PI * 2); ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fill(); ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = "#000"; ctx.fill(); }
  }

  function drawAim() { if (!aiming) return; ctx.save(); ctx.setLineDash([6, 6]); ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cueBall.x, cueBall.y); ctx.lineTo(aimCurrent.x, aimCurrent.y); ctx.stroke(); ctx.restore(); }

  let stickAngle = 0, stickLength = 160;
  function drawCue() { if (ballsMoving || gameOver) return; if (!aiming) return; const dx = aimCurrent.x - cueBall.x, dy = aimCurrent.y - cueBall.y; stickAngle = Math.atan2(dy, dx); ctx.save(); ctx.translate(cueBall.x, cueBall.y); ctx.rotate(stickAngle); const grad = ctx.createLinearGradient(-stickLength, 0, 0, 0); grad.addColorStop(0, "#3e2723"); grad.addColorStop(0.5, "#795548"); grad.addColorStop(1, "#d7ccc8"); ctx.fillStyle = grad; ctx.fillRect(-stickLength, -4, stickLength, 8); ctx.fillStyle = "#2196f3"; ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }

  // Game loop
  function gameLoop() {
    ctx.clearRect(0, 0, TABLE.width, TABLE.height);
    drawTable(); balls.forEach(b => b.update());
    for (let i = 0; i < balls.length; i++) { for (let j = i + 1; j < balls.length; j++) { resolveCollision(balls[i], balls[j]); } }
    balls.forEach(b => b.draw(ctx)); drawAim(); drawCue();
    if (ballsMoving && balls.every(b => b.speed() < BALL.minSpeed)) { ballsMoving = false; endOfShot(); }
    requestAnimationFrame(gameLoop);
  }

  function announce(msg) { console.log(msg); showMessage(msg); }

  // Start game
  rackBalls(); requestAnimationFrame(gameLoop);

  // Expose functions
  window.restartGame = function () { rackBalls(); drawTable(); balls.forEach(b => b.draw(ctx)); gameOver = false; updateBallCount(); document.getElementById("gameOverOverlay").classList.add("hidden"); document.getElementById("gameMessage").innerHTML = ""; document.getElementById("turnIndicator").innerText = "Turn: Player 1"; };
  window.exitGame = function () { window.location.href = "/dashboard"; };
})();
>>>>>>> 1c86a86 (Initial commit)
