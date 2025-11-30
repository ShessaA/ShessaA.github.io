const player = document.getElementById('player');
const gameContainer = document.getElementById('game-container');
const containerWidth = gameContainer.offsetWidth;
const playerWidth = player.offsetWidth;
const scoreEl = document.getElementById('score');
const cronometerEl = document.getElementById('cronometer');
const maxMisses = 5;

let startTime = Date.now();
let missedCount = 0;
let score = 0;
let playerPosition = Math.round((containerWidth - playerWidth) / 2); // left-edge px to center visually
player.style.left = playerPosition + 'px';
let vx = 0; // current velocity

// new: player temporary state / animation controls
let playerStateTimer = null;      // timeout to restore player image
let playerAnimInterval = null;    // interval for frame animation
const playerIsImg = player.tagName === 'IMG';
const originalPlayerSrc = playerIsImg ? player.src : getComputedStyle(player).backgroundImage;

document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft')  vx = -8;
    if (e.key === 'ArrowRight') vx = 8;
});

document.addEventListener('keyup', (e) => {
    if ((e.key === 'ArrowLeft' && vx < 0) || (e.key === 'ArrowRight' && vx > 0)) {
        vx = 0;
    }
});

function movePlayerSmoothly() {
    // playerPosition represents the left-edge in px, so clamp to [0, containerWidth - playerWidth]
    const minLeft = 0;
    const maxLeft = containerWidth - playerWidth;

    playerPosition += vx;
    if (playerPosition < minLeft) playerPosition = minLeft;
    if (playerPosition > maxLeft) playerPosition = maxLeft;

    // Combine flip and float using CSS variable
    if (vx > 0) {
        player.style.setProperty('--flip', -1);
    } else if (vx < 0) {
        player.style.setProperty('--flip', 1);
    }

    player.style.left = playerPosition + 'px';
    requestAnimationFrame(movePlayerSmoothly);
}

movePlayerSmoothly();

// Keep physical gap constant: interval(ms) = distance(px) / speed(px/sec) * 1000
function getSpawnInterval(currentSpeedPxPerSec) {
    const HONEYCOMB_GAP_DISTANCE = 200; // pixels - desired physical gap
    if (currentSpeedPxPerSec <= 0) return 1000;
    return (HONEYCOMB_GAP_DISTANCE / currentSpeedPxPerSec) * 1000;
}

// Smooth exponential speed growth by score.
// start at 5 px/sec, asymptote to 25 px/sec (tweak k to change how fast it grows)
function calculateCurrentSpeed(currentScore, opts = {}) {
    const startSpeed = typeof opts.start === 'number' ? opts.start : 100;   // px/sec
    const maxSpeed   = typeof opts.max === 'number'   ? opts.max   : 400;  // px/sec
    const k          = typeof opts.k === 'number'     ? opts.k     : 0.02; // growth rate
    const s = Math.max(0, currentScore || 0);
    const speed = maxSpeed - (maxSpeed - startSpeed) * Math.exp(-k * s);
    return Math.min(maxSpeed, Math.max(startSpeed, speed));
}

// spawn timer handle used by the adaptive spawn loop
let spawnTimerId = null;
let spawnActive = false;

function createFallingObject(initialSpeedPxPerSec) {
    let objectY = -10; // start slightly above
    const object = document.createElement('div');
    object.classList.add('falling-object');

    // variant chances (adjust as needed)
    const BLUE_CHANCE = 0.08; // ~8% chance for +3 points
    const LEAF_CHANCE = 0.07; // ~7% chance for obstacle (lose a life if caught)
    const r = Math.random();

    // append first so offsetWidth is available if CSS sets sizes
    gameContainer.appendChild(object);

    // decide variant and set appearance / metadata
    let isLeaf = false;
    if (r < LEAF_CHANCE) {
        object.style.backgroundImage = 'url(assets/Leaf.png)';
        object.dataset.type = 'leaf';
        object.classList.add('leaf');
        isLeaf = true;
    } else if (r < LEAF_CHANCE + BLUE_CHANCE) {
        object.style.backgroundImage = 'url(assets/BlueHoneyComb.png)';
        object.dataset.type = 'blue';
        object.dataset.value = '3';
        object.classList.add('blue');
    } else {
        object.style.backgroundImage = 'url(assets/HoneyComb.png)';
        object.dataset.type = 'normal';
        object.dataset.value = '1';
    }

    // get object's width and set random left within container
    const objectWidth = object.offsetWidth || 40;
    const initialLeft = Math.random() * (containerWidth - objectWidth);
    // For leaves we will update left each frame to create a sway
    let objectX = initialLeft;
    object.style.left = Math.round(objectX) + 'px';
    object.style.top = objectY + 'px';

    // leaf sway parameters (tweak to taste)
    let swayAmp = 30;      // px amplitude
    let swayFreq = 1.2;    // Hz (oscillations per second)
    let swayPhase = Math.random() * Math.PI * 2;
    const spawnTime = performance.now();

    // animate using requestAnimationFrame so movement is based on real time
    let last = performance.now();

    function step(now) {
        const dt = (now - last) / 1000; // seconds
        last = now;

        // move according to the speed captured at spawn
        objectY += initialSpeedPxPerSec * dt;
        object.style.top = Math.round(objectY) + 'px';

        // if this object is a leaf, compute horizontal sway and clamp inside container
        if (isLeaf) {
            const t = (now - spawnTime) / 1000;
            objectX = initialLeft + Math.sin(2 * Math.PI * swayFreq * t + swayPhase) * swayAmp;
            if (objectX < 0) objectX = 0;
            if (objectX > containerWidth - objectWidth) objectX = containerWidth - objectWidth;
            object.style.left = Math.round(objectX) + 'px';
        }

        // collision detection
        const playerRect = player.getBoundingClientRect();
        const objectRect = object.getBoundingClientRect();

        if (objectRect.bottom >= playerRect.top &&
            objectRect.left <= playerRect.right &&
            objectRect.right >= playerRect.left) {

            const type = object.dataset.type;

            // compute position relative to game container for the animation
            const containerRect = gameContainer.getBoundingClientRect();
            // use the object's center so the sparkle is truly centered
            const animLeft = (objectRect.left + objectRect.width  / 2) - containerRect.left;
            const animTop  = (objectRect.top  + objectRect.height / 2) - containerRect.top;

            if (type === 'leaf') {
                // player caught an obstacle -> lose a life
                missedCount++;
                loseLife();
                // sparkle at catch location (slightly below center so feedback can appear above)
                createSparkleAnimation(animLeft, animTop, objectWidth, 6);
                // larger floating feedback, start ~24px above the object center
                createFloatingFeedback(animLeft, animTop, type, Math.round(objectWidth * 1.4), 24);

                // play disgust animation (alternating frames) for ~900ms
                setPlayerAnimated(
                    ['assets/AbejitaDisgustedL1.png','assets/AbejitaDisgustedL2.png'],
                    220, // ms per frame
                    900  // total duration
                );
                 object.remove();
                 if (missedCount >= maxMisses) gameOver();
                 return;
             } else {
                 // normal / blue honeycomb
                 const value = parseInt(object.dataset.value, 10) || 1;
                 score += value;
                 scoreEl.textContent = `${score}`;
                 // sparkle at catch location (slightly below center so feedback can appear above)
                 createSparkleAnimation(animLeft, animTop, objectWidth, 6);
                 // larger floating feedback, start ~24px above the object center
                 createFloatingFeedback(animLeft, animTop, type, Math.round(objectWidth * 1.4), 24);
                // if blue, show happy face briefly
                if (type === 'blue') {
                    setPlayerTemporary('assets/AbejitaHappyL.png', 700);
                }
                 object.remove();
                 return;
             }
        }

        // missed (bottom of game container)
        const containerBottom = gameContainer.getBoundingClientRect().bottom;
        if (objectRect.top > containerBottom) {
            const type = object.dataset.type;

            if (type === 'leaf') {
                // player avoided the obstacle — no life lost
                object.remove();
                return;
            } else {
                // missed a honeycomb -> lose life
                missedCount++;
                loseLife();
                object.remove();
                if (missedCount >= maxMisses) gameOver();
                return;
            }
        }

        requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
}

// Adaptive spawn loop: spawn one object, then schedule next based on desired physical gap
function createSpawnStep() {
    // compute speed (px/sec) from score and spawn one object with that speed
    const speed = calculateCurrentSpeed(score);
    createFallingObject(speed);

    // compute next interval so gap remains approximately constant in physical distance
    const intervalMs = Math.max(80, Math.round(getSpawnInterval(speed)));
    spawnTimerId = setTimeout(() => {
        if (spawnActive) createSpawnStep();
    }, intervalMs);
}

function startSpawnLoop() {
    if (spawnActive) return;
    spawnActive = true;
    // start immediately
    createSpawnStep();
}

function stopSpawnLoop() {
    spawnActive = false;
    if (spawnTimerId) {
        clearTimeout(spawnTimerId);
        spawnTimerId = null;
    }
}

// start spawning when the script runs
startSpawnLoop();

setInterval(updateCronometer, 10);

function updateCronometer() {
    const elapsedTime = Date.now() - startTime;
    const minutes = Math.floor(elapsedTime / 60000);
    const seconds = Math.floor((elapsedTime % 60000) / 1000);
    const milliseconds = Math.floor((elapsedTime % 1000) / 100);
    cronometerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}:${milliseconds}`;
}

function loseLife() {
    const livesContainer = document.getElementById('lives-container');
    const lives = livesContainer.getElementsByClassName('life');
    if (lives.length > 0) {
        lives[0].remove(); // Removes from the bottom (because of column-reverse)
    }
}

function gameOver() {
    const time = cronometerEl.textContent;
    window.location.href = `gameover.html?score=${score}&time=${encodeURIComponent(time)}`;
}

document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        stopSpawnLoop();
    } else {
        startSpawnLoop();
    }
});

// new: sparkle animation that plays where an object was caught
function createSparkleAnimation(leftPx, topPx, sizePx = 48, offsetDownPx = 0) {
    const FRAME_COUNT = 6;
    const FRAME_MS = 70; // frame duration (ms)
    const anim = document.createElement('img');
    anim.className = 'catch-animation';
    anim.style.position = 'absolute';
    anim.style.left = Math.round(leftPx) + 'px';
    // nudge sparkle a bit downward so floating feedback (above) doesn't overlap
    anim.style.top = Math.round(topPx + (offsetDownPx || 0)) + 'px';
    anim.style.width = sizePx + 'px';
    anim.style.height = sizePx + 'px';
    anim.style.pointerEvents = 'none';
    anim.style.transform = 'translate(-50%, -50%)'; // center on the position
    // start with first frame
    let frame = 1;
    anim.src = `assets/SparkleAnimation${frame}.png`;
    gameContainer.appendChild(anim);

    const iv = setInterval(() => {
        frame++;
        if (frame > FRAME_COUNT) {
            clearInterval(iv);
            anim.remove();
            return;
        }
        anim.src = `assets/SparkleAnimation${frame}.png`;
    }, FRAME_MS);
}

// new: floating feedback ( +1 / +3 / -1 heart ) that rises and fades above the catch location
// leftPx, topPx = center of object; sizePx = image width in px; offsetUpPx = how much above the center it starts
function createFloatingFeedback(leftPx, topPx, type, sizePx = 56, offsetUpPx = 20) {
    // map types to feedback images
    const MAP = {
        normal: 'assets/PlusOnePoint.png',
        blue:   'assets/PlusThreePoints.png',
        leaf:   'assets/OneHeartMissed.png'
    };
    const src = MAP[type] || MAP.normal;

    const el = document.createElement('img');
    el.className = 'floating-feedback';
    el.src = src;
    el.style.position = 'absolute';
    el.style.left = Math.round(leftPx) + 'px';
    // start slightly above the object's center to reduce overlap with sparkle
    const startTop = Math.round(topPx - (offsetUpPx || 0));
    el.style.top = startTop + 'px';
    el.style.width = sizePx + 'px';
    el.style.height = 'auto';
    el.style.pointerEvents = 'none';
    el.style.transform = 'translate(-50%, -50%)';
    el.style.opacity = '1';
    gameContainer.appendChild(el);

    const DURATION = 800; // ms
    const FLOAT_PX = 36;  // how many px it rises from the starting point
    const start = performance.now();

    function frame(now) {
        const t = Math.min(1, (now - start) / DURATION);
        // move up and fade out from startTop
        el.style.top = Math.round(startTop - t * FLOAT_PX) + 'px';
        el.style.opacity = String(1 - t);
        if (t < 1) {
            requestAnimationFrame(frame);
        } else {
            el.remove();
        }
    }
    requestAnimationFrame(frame);
}

// new: set player image (handles <img> or element with background-image)
function setPlayerImageSrc(src) {
    if (playerIsImg) {
        player.src = src;
    } else {
        player.style.backgroundImage = `url("${src}")`;
    }
}

function restorePlayerImage() {
    if (playerIsImg) {
        player.src = originalPlayerSrc;
    } else {
        // originalPlayerSrc from getComputedStyle returns like `url("...")`, reuse it
        player.style.backgroundImage = originalPlayerSrc || '';
    }
}

// set a single image for `durationMs`, then restore
function setPlayerTemporary(src, durationMs = 700) {
    // clear any running animations/timers
    if (playerAnimInterval) {
        clearInterval(playerAnimInterval);
        playerAnimInterval = null;
    }
    if (playerStateTimer) {
        clearTimeout(playerStateTimer);
        playerStateTimer = null;
    }
    setPlayerImageSrc(src);
    playerStateTimer = setTimeout(() => {
        restorePlayerImage();
        playerStateTimer = null;
    }, durationMs);
}

// play an array of frames (paths) at frameMs, repeat until duration elapses, then restore
function setPlayerAnimated(frames = [], frameMs = 200, durationMs = 800) {
    if (!frames || frames.length === 0) return;
    // clear any previous timers/intervals
    if (playerAnimInterval) {
        clearInterval(playerAnimInterval);
        playerAnimInterval = null;
    }
    if (playerStateTimer) {
        clearTimeout(playerStateTimer);
        playerStateTimer = null;
    }

    let idx = 0;
    setPlayerImageSrc(frames[idx]);
    playerAnimInterval = setInterval(() => {
        idx = (idx + 1) % frames.length;
        setPlayerImageSrc(frames[idx]);
    }, frameMs);

    playerStateTimer = setTimeout(() => {
        if (playerAnimInterval) {
            clearInterval(playerAnimInterval);
            playerAnimInterval = null;
        }
        restorePlayerImage();
        playerStateTimer = null;
    }, durationMs);
}