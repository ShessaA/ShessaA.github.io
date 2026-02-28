// grab both player elements and the container
const player1 = document.getElementById('player1');
const player2 = document.getElementById('player2');
const gameContainer = document.getElementById('game-container');
const containerWidth = gameContainer.offsetWidth;
const halfWidth = containerWidth / 2;
// assume both players use same sprite dimensions
const playerWidth = player1.offsetWidth;

// UI elements (arrays, index 0 = left, 1 = right)
const scoreEls = document.querySelectorAll('.score');
const cronometerEls = document.querySelectorAll('.cronometer');
const livesContainers = document.querySelectorAll('.lives-container');
const maxMisses = 5;

// player alive state
let alive = [true, true];

function onPlayerDead(i) {
    alive[i] = false;
    vx[i] = 0; // stop movement
    const p = i === 0 ? player1 : player2;
    const half = document.getElementById(i === 0 ? 'left-area' : 'right-area');
    if (p) p.classList.add('dead');
    if (half) half.classList.add('dead');
    // remove any existing objects in that half
    document.querySelectorAll('.falling-object').forEach(obj => {
        const x = obj.offsetLeft;
        if ((i === 0 && x < halfWidth) || (i === 1 && x >= halfWidth)) {
            obj.remove();
        }
    });
    // if both dead, trigger game over
    if (!alive[0] && !alive[1]) {
        gameOver(i); // whatever index
        return;
    }
    // if only one player remains alive, see if they lead by at least one point
    const survivor = alive[0] ? 0 : 1;
    const loser = survivor === 0 ? 1 : 0;
    if (score[survivor] - score[loser] >= 1) {
        gameOver(survivor);
    }
}

let startTime = Date.now();
let missedCount = [0, 0];
let score = [0, 0];
// two player positions (left-edge pixel relative to each half)
let playerPosition = [
    Math.round((halfWidth - playerWidth) / 2),
    Math.round((halfWidth - playerWidth) / 2)
];
player1.style.left = playerPosition[0] + 'px';
player2.style.left = playerPosition[1] + 'px';
let vx = [0, 0]; // velocities for each player

// temporary animation/state helpers (one per player)
let playerStateTimer = [null, null];
let playerAnimInterval = [null, null];
const player1IsImg = player1.tagName === 'IMG';
const player2IsImg = player2.tagName === 'IMG';
const originalPlayerSrc1 = player1IsImg ? player1.src : getComputedStyle(player1).backgroundImage;
const originalPlayerSrc2 = player2IsImg ? player2.src : getComputedStyle(player2).backgroundImage;

// control left player with A/D and right player with arrow keys
document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'a') vx[0] = -8;
    if (k === 'd') vx[0] = 8;
    if (k === 'arrowleft') vx[1] = -8;
    if (k === 'arrowright') vx[1] = 8;
});

document.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'a' && vx[0] < 0) vx[0] = 0;
    if (k === 'd' && vx[0] > 0) vx[0] = 0;
    if (k === 'arrowleft' && vx[1] < 0) vx[1] = 0;
    if (k === 'arrowright' && vx[1] > 0) vx[1] = 0;
});

function movePlayersSmoothly() {
    // update player 1 (left half)
    if (alive[0]) {
        const min1 = 0;
        const max1 = halfWidth - playerWidth;
        playerPosition[0] += vx[0];
        if (playerPosition[0] < min1) playerPosition[0] = min1;
        if (playerPosition[0] > max1) playerPosition[0] = max1;
        if (vx[0] > 0) {
            player1.style.setProperty('--flip', -1);
        } else if (vx[0] < 0) {
            player1.style.setProperty('--flip', 1);
        }
        player1.style.left = playerPosition[0] + 'px';
    }

    // update player 2 (right half) – position relative to its own half
    if (alive[1]) {
        const min2 = 0;
        const max2 = halfWidth - playerWidth;
        playerPosition[1] += vx[1];
        if (playerPosition[1] < min2) playerPosition[1] = min2;
        if (playerPosition[1] > max2) playerPosition[1] = max2;
        if (vx[1] > 0) {
            player2.style.setProperty('--flip', -1);
        } else if (vx[1] < 0) {
            player2.style.setProperty('--flip', 1);
        }
        player2.style.left = playerPosition[1] + 'px';
    }

    requestAnimationFrame(movePlayersSmoothly);
}

movePlayersSmoothly();

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
    // determine horizontal spawn range based on alive halves
    let spawnMin, spawnMax;
    if (alive[0] && alive[1]) {
        spawnMin = 0;
        spawnMax = containerWidth;
    } else if (alive[0]) {
        spawnMin = 0;
        spawnMax = halfWidth;
    } else if (alive[1]) {
        spawnMin = halfWidth;
        spawnMax = containerWidth;
    } else {
        // nobody alive, stop spawning
        return;
    }
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
        object.style.backgroundImage = 'url(../assets/Leaf.png)';
        object.dataset.type = 'leaf';
        object.classList.add('leaf');
        isLeaf = true;
    } else if (r < LEAF_CHANCE + BLUE_CHANCE) {
        object.style.backgroundImage = 'url(../assets/BlueHoneyComb.png)';
        object.dataset.type = 'blue';
        object.dataset.value = '3';
        object.classList.add('blue');
    } else {
        object.style.backgroundImage = 'url(../assets/HoneyComb.png)';
        object.dataset.type = 'normal';
        object.dataset.value = '1';
    }

    // get object's width and set random left within container
    const objectWidth = object.offsetWidth || 40;
    // ensure object stays within chosen spawn interval
    const leftRange = (spawnMax - spawnMin) - objectWidth;
    const initialLeft = spawnMin + Math.random() * Math.max(0, leftRange);
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

        // collision detection (determine which half the object is in first)
        const objectRect = object.getBoundingClientRect();
        let hitPlayer = null; // 0 = left, 1 = right
        const objCenterX = objectRect.left + (objectRect.width || 0) / 2;
        const midLine = containerWidth / 2;

        if (objCenterX < midLine) {
            // object is on/over the left half, only check player1
            if (alive[0]) {
                const rect1 = player1.getBoundingClientRect();
                if (objectRect.bottom >= rect1.top &&
                    objectRect.left <= rect1.right &&
                    objectRect.right >= rect1.left) {
                    hitPlayer = 0;
                }
            }
        } else {
            // object is on/over the right half, only check player2
            if (alive[1]) {
                const rect2 = player2.getBoundingClientRect();
                if (objectRect.bottom >= rect2.top &&
                    objectRect.left <= rect2.right &&
                    objectRect.right >= rect2.left) {
                    hitPlayer = 1;
                }
            }
        }

        if (hitPlayer !== null) {
            const type = object.dataset.type;
            // update score/missed for the particular player
            const scoreEl = scoreEls[hitPlayer];
            const cronoEl = cronometerEls[hitPlayer];
            // compute position relative to game container for the animation

            // compute position relative to game container for the animation
            const containerRect = gameContainer.getBoundingClientRect();
            // use the object's center so the sparkle is truly centered
            const animLeft = (objectRect.left + objectRect.width  / 2) - containerRect.left;
            const animTop  = (objectRect.top  + objectRect.height / 2) - containerRect.top;

            if (type === 'leaf') {
                // player caught an obstacle -> lose a life
                missedCount[hitPlayer]++;
                loseLife(hitPlayer);
                // sparkle at catch location (slightly below center so feedback can appear above)
                createSparkleAnimation(animLeft, animTop, objectWidth, 6);
                // larger floating feedback, start ~24px above the object center
                createFloatingFeedback(animLeft, animTop, type, Math.round(objectWidth * 1.4), 24);

                // play disgust animation (alternating frames) for ~900ms
                setPlayerAnimated(
                    hitPlayer === 1
                        ? ['../assets/AbejitaP2DisgustedL1.png','../assets/AbejitaP2DisgustedL2.png']
                        : ['../assets/AbejitaDisgustedL1.png','../assets/AbejitaDisgustedL2.png'],
                    220, // ms per frame
                    900, // total duration
                    hitPlayer
                );
                 object.remove();
                 if (missedCount[hitPlayer] >= maxMisses) onPlayerDead(hitPlayer);
                 return;
             } else {
                 // normal / blue honeycomb
                 const value = parseInt(object.dataset.value, 10) || 1;
                 score[hitPlayer] += value;
                 scoreEl.textContent = `${score[hitPlayer]}`;
                 // if only one player remains alive and they are now ahead, end game
                 if ((!alive[0] || !alive[1]) ) {
                     const survivor = alive[0] ? 0 : 1;
                     const loser = survivor === 0 ? 1 : 0;
                     if (score[survivor] - score[loser] >= 1) {
                         gameOver(survivor);
                         return;
                     }
                 }
                 // sparkle at catch location (slightly below center so feedback can appear above)
                 createSparkleAnimation(animLeft, animTop, objectWidth, 6);
                 // larger floating feedback, start ~24px above the object center
                 createFloatingFeedback(animLeft, animTop, type, Math.round(objectWidth * 1.4), 24);
                // if blue, show happy face briefly
                if (type === 'blue') {
                    setPlayerTemporary(
                        hitPlayer === 1 ? '../assets/AbejitaP2HappyL.png' : '../assets/AbejitaHappyL.png',
                        700,
                        hitPlayer
                    );
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
                // missed a honeycomb -> decide which half it fell in
                let victim;
                const objCenter = objectRect.left + (objectRect.width || 0) / 2;
                if (objCenter < halfWidth) {
                    victim = alive[0] ? 0 : 1;
                } else {
                    victim = alive[1] ? 1 : 0;
                }
                missedCount[victim]++;
                loseLife(victim);
                object.remove();
                if (missedCount[victim] >= maxMisses) onPlayerDead(victim);
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
    const speed = calculateCurrentSpeed((alive[0]?score[0]:0) + (alive[1]?score[1]:0));
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
    const text = `${minutes}:${seconds.toString().padStart(2, '0')}:${milliseconds}`;
    cronometerEls.forEach(el => { if (el) el.textContent = text; });
}

function loseLife(playerIndex = 0) {
    const livesContainer = livesContainers[playerIndex] || document.getElementById('lives-container');
    if (!livesContainer) return;
    const lives = livesContainer.getElementsByClassName('life');
    if (lives.length > 0) {
        lives[0].remove(); // Removes from the bottom (because of column-reverse)
    }
}

function gameOver(playerIndex = 0) {
    // collect both players' score/time so the gameover screen can show both
    const time0 = (cronometerEls[0] && cronometerEls[0].textContent) || '';
    const time1 = (cronometerEls[1] && cronometerEls[1].textContent) || '';
    const s0 = Number(score[0] || 0);
    const s1 = Number(score[1] || 0);
    const params = `score0=${s0}&time0=${encodeURIComponent(time0)}&score1=${s1}&time1=${encodeURIComponent(time1)}`;
    window.location.href = `gameover-multiplayer.html?${params}`;
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
    anim.src = `../assets/SparkleAnimation${frame}.png`;
    gameContainer.appendChild(anim);

    const iv = setInterval(() => {
        frame++;
        if (frame > FRAME_COUNT) {
            clearInterval(iv);
            anim.remove();
            return;
        }
        anim.src = `../assets/SparkleAnimation${frame}.png`;
    }, FRAME_MS);
}

// new: floating feedback ( +1 / +3 / -1 heart ) that rises and fades above the catch location
// leftPx, topPx = center of object; sizePx = image width in px; offsetUpPx = how much above the center it starts
function createFloatingFeedback(leftPx, topPx, type, sizePx = 56, offsetUpPx = 20) {
    // map types to feedback images
    const MAP = {
        normal: '../assets/PlusOnePoint.png',
        blue:   '../assets/PlusThreePoints.png',
        leaf:   '../assets/OneHeartMissed.png'
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
function setPlayerImageSrc(src, playerIndex = 0) {
    const p = playerIndex === 0 ? player1 : player2;
    const isImg = playerIndex === 0 ? player1IsImg : player2IsImg;
    if (isImg) {
        p.src = src;
    } else {
        p.style.backgroundImage = `url("${src}")`;
    }
}

function restorePlayerImage(playerIndex = 0) {
    const p = playerIndex === 0 ? player1 : player2;
    const original = playerIndex === 0 ? originalPlayerSrc1 : originalPlayerSrc2;
    const isImg = playerIndex === 0 ? player1IsImg : player2IsImg;
    if (isImg) {
        p.src = original;
    } else {
        p.style.backgroundImage = original || '';
    }
}

// set a single image for `durationMs`, then restore
function setPlayerTemporary(src, durationMs = 700, playerIndex = 0) {
    // clear any running animations/timers for this player
    if (playerAnimInterval[playerIndex]) {
        clearInterval(playerAnimInterval[playerIndex]);
        playerAnimInterval[playerIndex] = null;
    }
    if (playerStateTimer[playerIndex]) {
        clearTimeout(playerStateTimer[playerIndex]);
        playerStateTimer[playerIndex] = null;
    }
    setPlayerImageSrc(src, playerIndex);
    playerStateTimer[playerIndex] = setTimeout(() => {
        restorePlayerImage(playerIndex);
        playerStateTimer[playerIndex] = null;
    }, durationMs);
}

// play an array of frames (paths) at frameMs, repeat until duration elapses, then restore
function setPlayerAnimated(frames = [], frameMs = 200, durationMs = 800, playerIndex = 0) {
    if (!frames || frames.length === 0) return;
    // clear any previous timers/intervals for this player
    if (playerAnimInterval[playerIndex]) {
        clearInterval(playerAnimInterval[playerIndex]);
        playerAnimInterval[playerIndex] = null;
    }
    if (playerStateTimer[playerIndex]) {
        clearTimeout(playerStateTimer[playerIndex]);
        playerStateTimer[playerIndex] = null;
    }

    let idx = 0;
    setPlayerImageSrc(frames[idx], playerIndex);
    playerAnimInterval[playerIndex] = setInterval(() => {
        idx = (idx + 1) % frames.length;
        setPlayerImageSrc(frames[idx], playerIndex);
    }, frameMs);

    playerStateTimer[playerIndex] = setTimeout(() => {
        if (playerAnimInterval[playerIndex]) {
            clearInterval(playerAnimInterval[playerIndex]);
            playerAnimInterval[playerIndex] = null;
        }
        restorePlayerImage(playerIndex);
        playerStateTimer[playerIndex] = null;
    }, durationMs);
}