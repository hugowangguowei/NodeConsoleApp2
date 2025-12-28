
import EventBus from './EventBus.js';

class GameLoop {
    constructor() {
        this.lastTime = 0;
        this.isRunning = false;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastTime = performance.now();
        requestAnimationFrame(this.loop.bind(this));
    }

    stop() {
        this.isRunning = false;
    }

    loop(currentTime) {
        if (!this.isRunning) return;

        const deltaTime = (currentTime - this.lastTime) / 1000; // Seconds
        this.lastTime = currentTime;

        this.update(deltaTime);
        
        requestAnimationFrame(this.loop.bind(this));
    }

    update(dt) {
        // Trigger 'tick' event for other systems to update
        EventBus.emit('TICK', dt);
    }
}

export default new GameLoop();
