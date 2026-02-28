// ...new file...
document.addEventListener('DOMContentLoaded', () => {
    const player = document.getElementById('player');
    const gameContainer = document.getElementById('game-container');
    const arrows = document.querySelectorAll('.tutorial-arrows img');
    const leftImg = arrows[0];
    const rightImg = arrows[1];
    // find movement tutorial text image (flexible selector)
    const movementImg = Array.from(document.images).find(img => img.src && img.src.includes('MovementTutorialText')) || null;

    // image sets
    const originalSet = {
        rightDown: '../assets/RightArrow Down.png',
        rightUp: '../assets/RightArrow Up.png',
        leftDown: '../assets/LeftArrow Down.png',
        leftUp: '../assets/LeftArrow Up.png',
        movement: '../assets/MovementTutorialText.png'
    };
    const altSet = {
        rightDown: '../assets/DKey Down.png',
        rightUp: '../assets/DKey Up.png',
        leftDown: '../assets/AKey Down.png',
        leftUp: '../assets/AKey Up.png',
        movement: '../assets/MovementAltTutorialText.png'
    };
    let currentSet = originalSet;
    let usingAlt = false;

    // sizes / bounds
    const containerWidth = gameContainer.offsetWidth;
    const playerWidth = player.offsetWidth || 120;
    const minCenter = playerWidth / 2;
    const maxCenter = containerWidth - playerWidth / 2;

    // start centered (playerPosition is the center X)
    let playerPosition = Math.round(containerWidth / 2);
    player.style.left = playerPosition + 'px';
    player.style.setProperty('--flip', 1);

    let tutorialActive = true;

    // If user presses arrow, exit tutorial and go to actual game
    function startGameHandler(e) {
        const key = (e.key || '').toLowerCase();
        const code = (e.code || '').toLowerCase();
        const keyCode = e.keyCode || e.which || 0;

        const isLeft = key === 'arrowleft' || code === 'arrowleft' || key === 'left' || keyCode === 37 || key === 'a' || code === 'keya' || keyCode === 65;
        const isRight = key === 'arrowright' || code === 'arrowright' || key === 'right' || keyCode === 39 || key === 'd' || code === 'keyd' || keyCode === 68;

        if (isLeft || isRight) {
            tutorialActive = false;
            // cleanup listeners
            window.removeEventListener('keydown', startGameHandler);
            gameContainer.removeEventListener('click', startGameHandler);
            gameContainer.removeEventListener('touchstart', startGameHandler);
            // navigate to real game
            window.location.href = 'index.html';
        }
    }
    // attach to window and provide click/touch fallback (no { once } to ensure proper detection/cleanup)
    window.addEventListener('keydown', startGameHandler);
    gameContainer.addEventListener('click', startGameHandler);
    gameContainer.addEventListener('touchstart', startGameHandler);

    // helper: sleep
    const sleep = ms => new Promise(res => setTimeout(res, ms));

    // move for duration with a given velocity (px per ms)
    function moveFor(durationMs, velocityPxPerMs) {
        return new Promise(resolve => {
            const start = performance.now();
            let last = start;

            function step(now) {
                if (!tutorialActive) return resolve();
                const elapsed = now - start;
                const dt = Math.min(now - last, 40); // cap dt to avoid big jumps
                last = now;

                playerPosition += velocityPxPerMs * dt;
                if (playerPosition < minCenter) playerPosition = minCenter;
                if (playerPosition > maxCenter) playerPosition = maxCenter;

                player.style.left = Math.round(playerPosition) + 'px';
                // update flip variable: right -> -1, left -> 1
                player.style.setProperty('--flip', velocityPxPerMs > 0 ? -1 : 1);

                if (elapsed < durationMs) {
                    requestAnimationFrame(step);
                } else {
                    resolve();
                }
            }

            requestAnimationFrame(step);
        });
    }

    // helper: fade swap between sets (fades out, swaps srcs to the provided set's "up"/idle images, then fades in)
    async function fadeSwapTo(targetSet, duration = 300) {
        const imgs = [leftImg, rightImg];
        if (movementImg) imgs.push(movementImg);
        imgs.forEach(img => {
            img.style.transition = `opacity ${duration}ms ease`;
        });
        // fade out
        imgs.forEach(img => img.style.opacity = 0);
        await sleep(duration + 20);
        if (!tutorialActive) return;
        // switch current set
        currentSet = targetSet;
        // set to idle/up images so next loop shows correct sprites
        leftImg.src = currentSet.leftUp;
        rightImg.src = currentSet.rightUp;
        if (movementImg) movementImg.src = currentSet.movement;
        // fade in
        imgs.forEach(img => img.style.opacity = 1);
        await sleep(duration + 20);
    }

    // demo loop as specified
    (async function demoLoop() {
        // choose a reasonable speed similar to gameplay (px/sec)
        const speedPxPerSec = 300; // tweak if needed
        const speedPxPerMs = speedPxPerSec / 1000;

        while (tutorialActive) {
            // 1) wait 1s
            await sleep(1000);
            if (!tutorialActive) break;

            // 2) right arrow down + move right for 1s
            rightImg.src = currentSet.rightDown;
            await moveFor(1000, speedPxPerMs);
            // stop and revert right arrow
            rightImg.src = currentSet.rightUp;

            if (!tutorialActive) break;

            // small pause (let player stop)
            await sleep(200);

            // 4) left arrow down + move left for 2s (back toward start point)
            leftImg.src = currentSet.leftDown;
            await moveFor(1000, -speedPxPerMs);
            leftImg.src = currentSet.leftUp;

            if (!tutorialActive) break;

            // before repeating: swap to the other image-set with a fade so user sees A/D examples
            const nextSet = usingAlt ? originalSet : altSet;
            await fadeSwapTo(nextSet);
            usingAlt = !usingAlt;
            // small pause before next iteration
            await sleep(1000);
        }
    })();
});