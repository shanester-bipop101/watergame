// ===================================================================
// DROP BY DROP  —  hold to pour, stop inside the band, don't waste water
// ===================================================================

// ---- Difficulty modes (each one changes the rules meaningfully) -------
//   goal       = containers you must deliver to win
//   maxWaste   = how many wasted containers end the game
//   pourSpeed  = how fast the water rises (higher = harder to control)
//   bandWidth  = height of the target band as % (smaller = harder to hit)
const DIFFICULTIES = {
  easy:   { goal: 5,  maxWaste: 5, pourSpeed: 1.1, bandWidth: 18 },
  normal: { goal: 8,  maxWaste: 4, pourSpeed: 1.6, bandWidth: 12 },
  hard:   { goal: 12, maxWaste: 3, pourSpeed: 2.3, bandWidth: 8  }
};

// ---- Milestone messages (array + conditional) -------------------------
const MILESTONES = [
  { score: 1,  message: "First clean container delivered!" },
  { score: 3,  message: "3 down — steady hand!" },
  { score: 5,  message: "5 delivered. A household has water." },
  { score: 8,  message: "8! Not a drop wasted in a while." },
  { score: 12, message: "12 containers — an entire village served!" }
];

// ---- Game state -------------------------------------------------------
let settings   = DIFFICULTIES.normal;
let selectedMode = 'normal';
let delivered  = 0;     // containers correctly filled
let wasted     = 0;     // containers spilled or short
let fill       = 0;     // current water level, 0–100
let bandMin    = 0;     // bottom edge of target band (%)
let bandMax    = 0;     // top edge of target band (%)
let pouring    = false;
let gameActive = false;
let pourTimer;          // interval that raises the water while held

// Cache elements.
const waterEl   = document.getElementById('water');
const bandEl    = document.getElementById('target-band');
const jugEl     = document.getElementById('jug');
const pourBtn   = document.getElementById('pour-btn');
const startBtn  = document.getElementById('start-game');

// ===================================================================
// AUDIO — all generated with the Web Audio API. No sound files needed.
// ===================================================================
let audioCtx;
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

// A short tone — building block for the success/win/lose sounds.
function playTone(freq, start, duration, type = 'sine', volume = 0.18) {
  const ctx = getAudio();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration);
}

// Continuous pour sound: one oscillator whose pitch rises as the jug fills.
let pourOsc, pourGain;
function startPourSound() {
  const ctx = getAudio();
  pourOsc = ctx.createOscillator();
  pourGain = ctx.createGain();
  pourOsc.type = 'sine';
  pourOsc.frequency.value = 200;
  pourGain.gain.value = 0.0001;
  pourGain.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 0.05);
  pourOsc.connect(pourGain);
  pourGain.connect(ctx.destination);
  pourOsc.start();
}
function updatePourSound() {
  if (pourOsc) pourOsc.frequency.value = 200 + fill * 7; // higher as it fills
}
function stopPourSound() {
  if (pourOsc) {
    const ctx = getAudio();
    pourGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
    pourOsc.stop(ctx.currentTime + 0.06);
    pourOsc = null;
  }
}

function playSuccess() {
  const t = getAudio().currentTime;
  playTone(660, t, 0.12, 'sine', 0.2);
  playTone(990, t + 0.07, 0.14, 'sine', 0.18);
}
function playWaste() {
  const t = getAudio().currentTime;
  playTone(150, t, 0.28, 'sawtooth', 0.2);
}
function playWin() {
  const t = getAudio().currentTime;
  [523, 659, 784, 1047].forEach((f, i) => playTone(f, t + i * 0.12, 0.2, 'triangle', 0.2));
}
function playLose() {
  const t = getAudio().currentTime;
  [392, 330, 262].forEach((f, i) => playTone(f, t + i * 0.16, 0.25, 'sine', 0.18));
}

// ===================================================================
// ROUNDS
// ===================================================================
// Pick a new random target band for the next container.
function newTarget() {
  const half = settings.bandWidth / 2;
  const minCenter = 35 + half;
  const maxCenter = 95 - half;
  const center = Math.random() * (maxCenter - minCenter) + minCenter;
  bandMin = center - half;
  bandMax = center + half;

  // Position the yellow band on the jug.
  bandEl.style.bottom = bandMin + '%';
  bandEl.style.height = settings.bandWidth + '%';

  // Reset the water.
  fill = 0;
  waterEl.style.height = '0%';
}

// ===================================================================
// POURING
// ===================================================================
function startPour() {
  if (!gameActive || pouring) return;
  pouring = true;
  startPourSound();
  pourTimer = setInterval(() => {
    fill += settings.pourSpeed;
    if (fill >= 100) {            // overflowed the container
      fill = 100;
      waterEl.style.height = '100%';
      stopPour(true);             // forced stop = automatic waste
      return;
    }
    waterEl.style.height = fill + '%';
    updatePourSound();
  }, 30);
}

function stopPour(overflowed = false) {
  if (!pouring) return;
  pouring = false;
  clearInterval(pourTimer);
  stopPourSound();

  // Did the water land inside the yellow band?
  const hit = !overflowed && fill >= bandMin && fill <= bandMax;
  if (hit) {
    registerSuccess();
  } else {
    registerWaste(overflowed);
  }
}

function registerSuccess() {
  delivered++;
  document.getElementById('delivered').textContent = delivered;
  playSuccess();
  jugEl.classList.add('success');
  checkMilestone();

  pauseThen(() => {
    jugEl.classList.remove('success');
    if (delivered >= settings.goal) endGame(true);
    else newTarget();
  });
}

function registerWaste(overflowed) {
  wasted++;
  document.getElementById('wasted').textContent = wasted;
  playWaste();
  jugEl.classList.add('waste');
  showMilestone(overflowed ? 'Overflowed — water wasted!' : 'Missed the band — wasted!', '#F5402C');

  pauseThen(() => {
    jugEl.classList.remove('waste');
    if (wasted >= settings.maxWaste) endGame(false);
    else newTarget();
  });
}

// Briefly lock controls so the player can see the result, then continue.
function pauseThen(callback) {
  pourBtn.disabled = true;
  setTimeout(() => {
    if (gameActive) pourBtn.disabled = false;
    callback();
  }, 650);
}

// ===================================================================
// MILESTONES
// ===================================================================
function checkMilestone() {
  const m = MILESTONES.find(item => item.score === delivered);
  if (m) showMilestone(m.message, '#159A48');
}
function showMilestone(text, color) {
  const box = document.getElementById('achievements');
  box.textContent = text;
  box.style.color = color;
  box.classList.add('show');
  clearTimeout(showMilestone.timer);
  showMilestone.timer = setTimeout(() => box.classList.remove('show'), 1600);
}

// ===================================================================
// START / END
// ===================================================================
function startGame() {
  settings = DIFFICULTIES[selectedMode];
  delivered = 0;
  wasted = 0;
  gameActive = true;

  document.getElementById('delivered').textContent = '0';
  document.getElementById('wasted').textContent = '0';
  document.getElementById('goal').textContent = settings.goal;
  document.getElementById('max-waste').textContent = settings.maxWaste;
  document.getElementById('end-message').textContent = '';
  document.getElementById('end-message').className = 'end-message';

  getAudio();                 // unlock audio on this click
  setDifficultyEnabled(false);
  pourBtn.disabled = false;
  startBtn.textContent = 'Restart';

  newTarget();
}

function endGame(won) {
  gameActive = false;
  pouring = false;
  clearInterval(pourTimer);
  stopPourSound();
  pourBtn.disabled = true;
  setDifficultyEnabled(true);

  const msg = document.getElementById('end-message');
  if (won) {
    playWin();
    msg.textContent = `You delivered ${delivered} clean containers — you win!`;
    msg.className = 'end-message win';
  } else {
    playLose();
    msg.textContent = `Too much wasted! You delivered ${delivered} of ${settings.goal}. Try again.`;
    msg.className = 'end-message lose';
  }
  startBtn.textContent = 'Play Again';
}

// ===================================================================
// DIFFICULTY BUTTONS
// ===================================================================
function setDifficultyEnabled(enabled) {
  document.querySelectorAll('.diff-btn').forEach(b => (b.disabled = !enabled));
}
document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (gameActive) return;
    selectedMode = btn.dataset.mode;
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('is-selected'));
    btn.classList.add('is-selected');
    document.getElementById('goal').textContent = DIFFICULTIES[selectedMode].goal;
    document.getElementById('max-waste').textContent = DIFFICULTIES[selectedMode].maxWaste;
  });
});

// ===================================================================
// INPUT — works with both mouse and touch
// ===================================================================
pourBtn.addEventListener('mousedown', startPour);
pourBtn.addEventListener('mouseup', () => stopPour());
pourBtn.addEventListener('mouseleave', () => { if (pouring) stopPour(); });

pourBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startPour(); });
pourBtn.addEventListener('touchend',   (e) => { e.preventDefault(); stopPour(); });
pourBtn.addEventListener('touchcancel', () => { if (pouring) stopPour(); });

startBtn.addEventListener('click', startGame);
