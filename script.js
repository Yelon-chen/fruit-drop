const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const nextFruitEl = document.getElementById("nextFruit");
const nextFruitPreviewEl = document.getElementById("nextFruitPreview");
const fruitCountEl = document.getElementById("fruitCount");
const statusEl = document.getElementById("status");
const restartButton = document.getElementById("restartButton");
const blendButton = document.getElementById("blendButton");
const fruitProgressionEl = document.getElementById("fruitProgression");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const SPAWN_Y = 84;
const GRAVITY = 1380;
const AIR_DRAG = 0.997;
const RESTITUTION = 0.22;
const WALL_FRICTION = 0.992;
const MERGE_PULL_RANGE = 28;
const MERGE_PULL_FORCE = 46;
const DROP_COOLDOWN = 0.32;
const MAX_SUBSTEP = 1 / 120;
const COLLISION_PASSES = 4;

const BUCKET = {
  left: 38,
  right: WIDTH - 38,
  top: 322,
  bottom: HEIGHT - 24,
  lipHeight: 26,
};

const WARNING_Y = BUCKET.top;

const FRUIT_TYPES = [
  { name: "Banana", shortName: "BN", radius: 19, color: "#f4cf39", ring: "#b98d0c", score: 25, sprite: "assets/small-banana.svg" },
  { name: "Orange", shortName: "OR", radius: 24, color: "#ff9d36", ring: "#cf6a14", score: 45, sprite: "assets/orange.svg" },
  { name: "Apple", shortName: "AP", radius: 30, color: "#e9574f", ring: "#ad302d", score: 70, sprite: "assets/apple.svg" },
  { name: "Pear", shortName: "PE", radius: 34, color: "#9cc95c", ring: "#618330", score: 110, sprite: "assets/pear.svg" },
  { name: "Peach", shortName: "PC", radius: 39, color: "#ffa775", ring: "#cd6941", score: 160, sprite: "assets/peach.svg" },
  { name: "Coconut", shortName: "CO", radius: 45, color: "#9f6e4c", ring: "#6e4628", score: 220, sprite: "assets/coconut.svg" },
  { name: "Melon", shortName: "ME", radius: 54, color: "#76cb6a", ring: "#3f9136", score: 300, sprite: "assets/melon.svg" },
  { name: "Watermelon", shortName: "WM", radius: 64, color: "#59b153", ring: "#2b7131", score: 420, sprite: "assets/watermelon.svg" },
  { name: "Giant Watermelon", shortName: "GW", radius: 78, color: "#338d43", ring: "#1c5c2a", score: 700, sprite: "assets/giant-watermelon.svg" },
];

const STARTING_FRUIT_POOL = 4;
const fruitSprites = new Map();

let nextId = 1;
let lastTimestamp = 0;
let accumulator = 0;

const gameState = {
  fruits: [],
  score: 0,
  nextFruitTier: 0,
  cooldown: 0,
  previewX: (BUCKET.left + BUCKET.right) / 2,
  status: "Left click to drop the fruit.",
  gameOver: false,
  overflowTimer: 0,
  blending: false,
  blendTimer: 0,
  blendDuration: 1.45,
  smoothieColor: "#f7be63",
  blendParticles: [],
};

function randomStartingTier() {
  return Math.floor(Math.random() * STARTING_FRUIT_POOL);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resetGame() {
  gameState.fruits = [];
  gameState.score = 0;
  gameState.nextFruitTier = randomStartingTier();
  gameState.cooldown = 0;
  gameState.previewX = (BUCKET.left + BUCKET.right) / 2;
  gameState.status = "Left click to drop the fruit.";
  gameState.gameOver = false;
  gameState.overflowTimer = 0;
  gameState.blending = false;
  gameState.blendTimer = 0;
  gameState.smoothieColor = "#f7be63";
  gameState.blendParticles = [];
  updateHud();
}

function updateHud() {
  scoreEl.textContent = String(gameState.score);
  nextFruitEl.textContent = FRUIT_TYPES[gameState.nextFruitTier].name;
  nextFruitPreviewEl.src = FRUIT_TYPES[gameState.nextFruitTier].sprite;
  nextFruitPreviewEl.alt = FRUIT_TYPES[gameState.nextFruitTier].name;
  fruitCountEl.textContent = `${gameState.fruits.length} fruit${gameState.fruits.length === 1 ? "" : "s"}`;
  statusEl.textContent = gameState.status;
  updateFruitProgression();
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex({ r, g, b }) {
  const toHex = (value) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixSmoothieColor(fruits) {
  if (fruits.length === 0) {
    return "#f7be63";
  }

  let totalWeight = 0;
  const mixed = { r: 0, g: 0, b: 0 };

  for (const fruit of fruits) {
    const def = FRUIT_TYPES[fruit.tier];
    const rgb = hexToRgb(def.color);
    const weight = fruit.radius * fruit.radius;
    totalWeight += weight;
    mixed.r += rgb.r * weight;
    mixed.g += rgb.g * weight;
    mixed.b += rgb.b * weight;
  }

  mixed.r /= totalWeight;
  mixed.g /= totalWeight;
  mixed.b /= totalWeight;

  mixed.r = mixed.r * 0.92 + 28;
  mixed.g = mixed.g * 0.9 + 20;
  mixed.b = mixed.b * 0.88 + 18;
  return rgbToHex(mixed);
}

function createBlendParticles(fruits) {
  const particles = [];

  for (const fruit of fruits) {
    const def = FRUIT_TYPES[fruit.tier];
    const count = Math.max(8, Math.round(fruit.radius / 3));

    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 130;
      particles.push({
        x: fruit.x,
        y: fruit.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        size: 3 + Math.random() * 6,
        color: def.color,
        alpha: 0.9,
      });
    }
  }

  return particles;
}

function startBlend() {
  if (gameState.blending || gameState.gameOver) {
    return;
  }

  if (gameState.fruits.length === 0) {
    gameState.status = "Drop some fruit in the bucket first.";
    updateHud();
    return;
  }

  gameState.blending = true;
  gameState.blendTimer = 0;
  gameState.blendDuration = 1.45;
  gameState.smoothieColor = mixSmoothieColor(gameState.fruits);
  gameState.blendParticles = createBlendParticles(gameState.fruits);
  gameState.fruits = [];
  gameState.cooldown = gameState.blendDuration;
  gameState.status = "Blending smoothie...";
  updateHud();
}

function preloadFruitSprites() {
  for (const fruit of FRUIT_TYPES) {
    const image = new Image();
    image.src = fruit.sprite;
    fruitSprites.set(fruit.name, image);
  }
}

function renderFruitProgression() {
  fruitProgressionEl.replaceChildren();

  FRUIT_TYPES.forEach((fruit, index) => {
    const item = document.createElement("div");
    item.className = "progression__item";
    item.dataset.tier = String(index);

    const sprite = document.createElement("img");
    sprite.className = "progression__sprite";
    sprite.src = fruit.sprite;
    sprite.alt = fruit.name;

    item.append(sprite);
    fruitProgressionEl.append(item);
  });
}

function updateFruitProgression() {
  if (!fruitProgressionEl) {
    return;
  }

  const items = fruitProgressionEl.querySelectorAll(".progression__item");

  items.forEach((item, index) => {
    item.classList.toggle("progression__item--active", index === gameState.nextFruitTier);
  });
}

function createFruit(tier, x, y, options = {}) {
  const def = FRUIT_TYPES[tier];
  return {
    id: nextId++,
    tier,
    x,
    y,
    vx: options.vx ?? 0,
    vy: options.vy ?? 0,
    radius: def.radius,
    mergeCooldown: options.mergeCooldown ?? 0,
    age: options.age ?? 0,
  };
}

function spawnFruit(x) {
  if (gameState.cooldown > 0 || gameState.gameOver || gameState.blending) {
    return;
  }

  const tier = gameState.nextFruitTier;
  const radius = FRUIT_TYPES[tier].radius;
  const clampedX = clamp(x, BUCKET.left + radius + 6, BUCKET.right - radius - 6);

  gameState.fruits.push(
    createFruit(tier, clampedX, SPAWN_Y, {
      mergeCooldown: 0.28,
    }),
  );

  gameState.cooldown = DROP_COOLDOWN;
  gameState.nextFruitTier = randomStartingTier();
  gameState.status = "Fruit dropped. Match two of the same kind to merge.";
  updateHud();
}

function applyBucketCollision(fruit) {
  const innerLeft = BUCKET.left + 14;
  const innerRight = BUCKET.right - 14;
  const floorY = BUCKET.bottom - 14;

  if (fruit.y + fruit.radius > floorY) {
    fruit.y = floorY - fruit.radius;
    fruit.vy = -Math.abs(fruit.vy) * RESTITUTION;
    fruit.vx *= WALL_FRICTION;
  }

  if (
    fruit.y + fruit.radius > BUCKET.top &&
    fruit.y - fruit.radius < BUCKET.bottom
  ) {
    if (fruit.x - fruit.radius < innerLeft) {
      fruit.x = innerLeft + fruit.radius;
      fruit.vx = Math.abs(fruit.vx) * RESTITUTION;
    }

    if (fruit.x + fruit.radius > innerRight) {
      fruit.x = innerRight - fruit.radius;
      fruit.vx = -Math.abs(fruit.vx) * RESTITUTION;
    }
  }

  fruit.x = clamp(fruit.x, fruit.radius + 4, WIDTH - fruit.radius - 4);
}

function resolveFruitCollision(a, b) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let distanceSq = dx * dx + dy * dy;
  const minDistance = a.radius + b.radius;

  if (distanceSq === 0) {
    dx = (Math.random() - 0.5) * 0.01;
    dy = -0.01;
    distanceSq = dx * dx + dy * dy;
  }

  if (distanceSq >= minDistance * minDistance) {
    return;
  }

  const distance = Math.sqrt(distanceSq) || 0.0001;
  const nx = dx / distance;
  const ny = dy / distance;
  const overlap = minDistance - distance;
  const separation = overlap / 2;

  a.x -= nx * separation;
  a.y -= ny * separation;
  b.x += nx * separation;
  b.y += ny * separation;

  const relativeVelocityX = b.vx - a.vx;
  const relativeVelocityY = b.vy - a.vy;
  const velocityAlongNormal = relativeVelocityX * nx + relativeVelocityY * ny;

  if (velocityAlongNormal > 0) {
    return;
  }

  const impulse = (-(1 + RESTITUTION) * velocityAlongNormal) / 2;
  const impulseX = impulse * nx;
  const impulseY = impulse * ny;

  a.vx -= impulseX;
  a.vy -= impulseY;
  b.vx += impulseX;
  b.vy += impulseY;
}

function resolveCollisions() {
  for (let pass = 0; pass < COLLISION_PASSES; pass += 1) {
    for (const fruit of gameState.fruits) {
      applyBucketCollision(fruit);
    }

    for (let i = 0; i < gameState.fruits.length; i += 1) {
      for (let j = i + 1; j < gameState.fruits.length; j += 1) {
        resolveFruitCollision(gameState.fruits[i], gameState.fruits[j]);
      }
    }
  }
}

function checkMerges() {
  const removed = new Set();
  const additions = [];

  for (let i = 0; i < gameState.fruits.length; i += 1) {
    const a = gameState.fruits[i];

    if (removed.has(a.id) || a.mergeCooldown > 0) {
      continue;
    }

    for (let j = i + 1; j < gameState.fruits.length; j += 1) {
      const b = gameState.fruits[j];

      if (
        removed.has(b.id) ||
        b.mergeCooldown > 0 ||
        a.tier !== b.tier ||
        a.tier >= FRUIT_TYPES.length - 1
      ) {
        continue;
      }

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);
      const touchingDistance = a.radius + b.radius + 1.5;

      if (distance > touchingDistance) {
        continue;
      }

      const nextTier = a.tier + 1;
      removed.add(a.id);
      removed.add(b.id);

      additions.push(
        createFruit(
          nextTier,
          (a.x + b.x) / 2,
          (a.y + b.y) / 2,
          {
            vx: (a.vx + b.vx) / 2,
            vy: Math.min((a.vy + b.vy) / 2 - 160, 0),
            mergeCooldown: 0.16,
          },
        ),
      );

      gameState.score += FRUIT_TYPES[nextTier].score;
      gameState.status =
        nextTier === FRUIT_TYPES.length - 1
          ? "You made a giant watermelon!"
          : `${FRUIT_TYPES[a.tier].name} merged into ${FRUIT_TYPES[nextTier].name}.`;
      break;
    }
  }

  if (removed.size > 0) {
    gameState.fruits = gameState.fruits.filter((fruit) => !removed.has(fruit.id));
    gameState.fruits.push(...additions);
    updateHud();
  }
}

function updateOverflow(dt) {
  const hasOverflow = gameState.fruits.some(
    (fruit) => fruit.age > 1.2 && fruit.y - fruit.radius < WARNING_Y,
  );

  if (hasOverflow) {
    gameState.overflowTimer += dt;
    gameState.status = "Bucket is overflowing. Clear space!";
    if (gameState.overflowTimer >= 0.9) {
      gameState.gameOver = true;
      gameState.status = "Game over. Restart to try another giant watermelon run.";
      updateHud();
    }
  } else {
    gameState.overflowTimer = 0;
  }
}

function update(dt) {
  if (gameState.blending) {
    updateBlend(dt);
    return;
  }

  if (gameState.gameOver) {
    return;
  }

  if (gameState.cooldown > 0) {
    gameState.cooldown = Math.max(0, gameState.cooldown - dt);
  }

  for (const fruit of gameState.fruits) {
    fruit.age += dt;
    fruit.mergeCooldown = Math.max(0, fruit.mergeCooldown - dt);
    fruit.vy += GRAVITY * dt;
    fruit.vx *= AIR_DRAG;
    fruit.vy *= AIR_DRAG;
    fruit.x += fruit.vx * dt;
    fruit.y += fruit.vy * dt;
  }

  pullMatchingFruitPairs(dt);
  checkMerges();
  resolveCollisions();
  checkMerges();
  updateOverflow(dt);
}

function updateBlend(dt) {
  gameState.blendTimer += dt;

  for (const particle of gameState.blendParticles) {
    particle.vx *= 0.96;
    particle.vy = particle.vy * 0.94 + 220 * dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.alpha = Math.max(0, particle.alpha - dt * 0.7);
  }

  gameState.blendParticles = gameState.blendParticles.filter((particle) => particle.alpha > 0.04);

  if (gameState.blendTimer >= gameState.blendDuration) {
    resetGame();
    gameState.status = "Smoothie done. Start a fresh bucket.";
    updateHud();
  }
}

function pullMatchingFruitPairs(dt) {
  for (let i = 0; i < gameState.fruits.length; i += 1) {
    const a = gameState.fruits[i];

    if (a.mergeCooldown > 0) {
      continue;
    }

    for (let j = i + 1; j < gameState.fruits.length; j += 1) {
      const b = gameState.fruits[j];

      if (b.mergeCooldown > 0 || a.tier !== b.tier) {
        continue;
      }

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);
      const nearDistance = a.radius + b.radius + MERGE_PULL_RANGE;

      if (distance === 0 || distance > nearDistance) {
        continue;
      }

      const nx = dx / distance;
      const ny = dy / distance;
      const pull = ((nearDistance - distance) / nearDistance) * MERGE_PULL_FORCE * dt;

      a.vx += nx * pull;
      a.vy += ny * pull * 0.25;
      b.vx -= nx * pull;
      b.vy -= ny * pull * 0.25;
    }
  }
}

function drawBackground() {
  const fruitDef = FRUIT_TYPES[gameState.nextFruitTier];
  const guideX = clamp(
    gameState.previewX,
    BUCKET.left + fruitDef.radius + 6,
    BUCKET.right - fruitDef.radius - 6,
  );

  ctx.fillStyle = "#f4aec3";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.beginPath();
  ctx.ellipse(118, 126, 72, 30, -0.2, 0, Math.PI * 2);
  ctx.ellipse(324, 166, 90, 32, 0.18, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.88)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(guideX, 90);
  ctx.lineTo(guideX, WARNING_Y - 8);
  ctx.stroke();
}

function drawBucket() {
  ctx.save();
  const topLeftX = BUCKET.left - 20;
  const topRightX = BUCKET.right + 20;
  const bottomLeftX = BUCKET.left + 32;
  const bottomRightX = BUCKET.right - 32;

  ctx.fillStyle = "rgba(233, 227, 231, 0.86)";
  ctx.strokeStyle = "#8f8ca7";
  ctx.lineWidth = 8;
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(topLeftX, BUCKET.top);
  ctx.lineTo(bottomLeftX, BUCKET.bottom);
  ctx.lineTo(bottomRightX, BUCKET.bottom);
  ctx.lineTo(topRightX, BUCKET.top);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2 + 106, BUCKET.top + 10);
  ctx.lineTo(bottomRightX - 12, BUCKET.bottom - 16);
  ctx.lineTo(bottomRightX + 8, BUCKET.bottom - 16);
  ctx.lineTo(topRightX - 6, BUCKET.top + 10);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#fdf8ff";
  ctx.lineWidth = 6;
  ctx.setLineDash([16, 10]);
  ctx.beginPath();
  ctx.moveTo(18, WARNING_Y + 4);
  ctx.lineTo(topLeftX + 18, WARNING_Y + 4);
  ctx.moveTo(topRightX - 18, WARNING_Y + 4);
  ctx.lineTo(WIDTH - 18, WARNING_Y + 4);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(241, 236, 238, 0.96)";
  ctx.fillRect(topLeftX, BUCKET.top - 6, topRightX - topLeftX, 56);
  ctx.strokeStyle = "#8f8ca7";
  ctx.lineWidth = 8;
  ctx.strokeRect(topLeftX, BUCKET.top - 6, topRightX - topLeftX, 56);

  ctx.strokeStyle = "rgba(143, 140, 167, 0.35)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(topLeftX, BUCKET.top + 54);
  ctx.lineTo(topRightX, BUCKET.top + 54);
  ctx.stroke();
  ctx.restore();
}

function drawSmoothie() {
  if (!gameState.blending) {
    return;
  }

  const topLeftX = BUCKET.left - 20;
  const topRightX = BUCKET.right + 20;
  const bottomLeftX = BUCKET.left + 32;
  const bottomRightX = BUCKET.right - 32;
  const progress = clamp(gameState.blendTimer / gameState.blendDuration, 0, 1);
  const liquidTop = BUCKET.bottom - (BUCKET.bottom - BUCKET.top - 72) * progress;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(topLeftX, BUCKET.top + 52);
  ctx.lineTo(bottomLeftX, BUCKET.bottom);
  ctx.lineTo(bottomRightX, BUCKET.bottom);
  ctx.lineTo(topRightX, BUCKET.top + 52);
  ctx.closePath();
  ctx.clip();

  const smoothieGradient = ctx.createLinearGradient(0, liquidTop, 0, BUCKET.bottom);
  smoothieGradient.addColorStop(0, "#fff6fb");
  smoothieGradient.addColorStop(0.14, gameState.smoothieColor);
  smoothieGradient.addColorStop(1, gameState.smoothieColor);
  ctx.fillStyle = smoothieGradient;
  ctx.fillRect(topLeftX - 8, liquidTop, topRightX - topLeftX + 16, BUCKET.bottom - liquidTop + 16);

  ctx.fillStyle = "rgba(255,255,255,0.34)";
  ctx.beginPath();
  ctx.ellipse(WIDTH / 2, liquidTop + 10, (topRightX - topLeftX) * 0.34, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  for (const particle of gameState.blendParticles) {
    ctx.globalAlpha = particle.alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPreview() {
  if (gameState.gameOver || gameState.blending) {
    return;
  }

  const fruitDef = FRUIT_TYPES[gameState.nextFruitTier];
  const x = clamp(
    gameState.previewX,
    BUCKET.left + fruitDef.radius + 6,
    BUCKET.right - fruitDef.radius - 6,
  );

  ctx.globalAlpha = gameState.cooldown > 0 ? 0.5 : 0.82;
  drawFruit({ x, y: SPAWN_Y, radius: fruitDef.radius, tier: gameState.nextFruitTier });
  ctx.globalAlpha = 1;
}

function drawFruitFallback(fruit) {
  const def = FRUIT_TYPES[fruit.tier];

  ctx.beginPath();
  ctx.fillStyle = def.color;
  ctx.arc(fruit.x, fruit.y, fruit.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 5;
  ctx.strokeStyle = def.ring;
  ctx.stroke();

  const highlight = ctx.createRadialGradient(
    fruit.x - fruit.radius * 0.35,
    fruit.y - fruit.radius * 0.45,
    2,
    fruit.x,
    fruit.y,
    fruit.radius,
  );
  highlight.addColorStop(0, "rgba(255,255,255,0.5)");
  highlight.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = highlight;
  ctx.beginPath();
  ctx.arc(fruit.x, fruit.y, fruit.radius, 0, Math.PI * 2);
  ctx.fill();

  if (fruit.radius >= 18) {
    ctx.fillStyle = "rgba(47, 24, 10, 0.82)";
    ctx.font = `700 ${Math.max(11, fruit.radius * 0.55)}px Trebuchet MS`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(def.shortName, fruit.x, fruit.y + 1);
  }
}

function drawFruit(fruit) {
  const def = FRUIT_TYPES[fruit.tier];
  const sprite = fruitSprites.get(def.name);

  if (!sprite || !sprite.complete) {
    drawFruitFallback(fruit);
    return;
  }

  const size = fruit.radius * 2.35;
  ctx.drawImage(sprite, fruit.x - size / 2, fruit.y - size / 2, size, size);
}

function drawFruits() {
  const sorted = [...gameState.fruits].sort((a, b) => a.radius - b.radius);
  for (const fruit of sorted) {
    drawFruit(fruit);
  }
}

function drawOverlay() {
  if (!gameState.gameOver) {
    return;
  }

  ctx.fillStyle = "rgba(55, 28, 16, 0.4)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(255, 244, 225, 0.95)";
  ctx.beginPath();
  ctx.roundRect(62, 220, WIDTH - 124, 168, 28);
  ctx.fill();

  ctx.fillStyle = "#4a2817";
  ctx.textAlign = "center";
  ctx.font = "700 32px Trebuchet MS";
  ctx.fillText("Game Over", WIDTH / 2, 282);
  ctx.font = "600 18px Trebuchet MS";
  ctx.fillText(`Final score: ${gameState.score}`, WIDTH / 2, 324);
  ctx.font = "500 16px Trebuchet MS";
  ctx.fillText("Press Restart Game to play again.", WIDTH / 2, 356);
}

function render() {
  statusEl.textContent = gameState.status;
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawBackground();
  drawSmoothie();
  drawPreview();
  drawBucket();
  drawFruits();
  drawOverlay();
}

function tick(timestamp) {
  if (!lastTimestamp) {
    lastTimestamp = timestamp;
  }

  const frameTime = Math.min((timestamp - lastTimestamp) / 1000, 0.033);
  lastTimestamp = timestamp;
  accumulator += frameTime;

  while (accumulator >= MAX_SUBSTEP) {
    update(MAX_SUBSTEP);
    accumulator -= MAX_SUBSTEP;
  }

  render();
  requestAnimationFrame(tick);
}

canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = WIDTH / rect.width;
  gameState.previewX = (event.clientX - rect.left) * scaleX;
});

canvas.addEventListener("mousedown", (event) => {
  if (event.button !== 0) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const scaleX = WIDTH / rect.width;
  const x = (event.clientX - rect.left) * scaleX;
  spawnFruit(x);
});

restartButton.addEventListener("click", () => {
  resetGame();
});

blendButton.addEventListener("click", () => {
  startBlend();
});

preloadFruitSprites();
renderFruitProgression();
resetGame();
requestAnimationFrame(tick);
