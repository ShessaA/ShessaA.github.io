// ...new file...
document.addEventListener('DOMContentLoaded', () => {
    const player = document.getElementById('player');
    const gameContainer = document.getElementById('game-container');
    const arrows = document.querySelectorAll('.tutorial-arrows img');
    const leftImg = arrows[0];
    const rightImg = arrows[1];

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
            rightImg.src = 'assets/RightArrow Down.png';
            await moveFor(1000, speedPxPerMs);
            // stop and revert right arrow
            rightImg.src = 'assets/RightArrow Up.png';

            if (!tutorialActive) break;

            // small pause (let player stop)
            await sleep(200);

            // 4) left arrow down + move left for 2s (back toward start point)
            leftImg.src = 'assets/LeftArrow Down.png';
            await moveFor(1000, -speedPxPerMs);
            leftImg.src = 'assets/LeftArrow Up.png';

            if (!tutorialActive) break;

            // wait 1s before repeating
            await sleep(1000);
        }
    })();
});