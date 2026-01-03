import EventBus from './EventBus.js';

class GameFSM {
    constructor() {
        this.currentState = 'INIT';
        this.states = {
            'INIT': { onEnter: () => {}, onExit: () => {} },
            'LOGIN': { onEnter: () => {}, onExit: () => {} },
            'MAIN_MENU': { onEnter: () => {}, onExit: () => {} },
            'LEVEL_SELECT': { onEnter: () => {}, onExit: () => {} },
            'BATTLE_PREPARE': { onEnter: () => {}, onExit: () => {} },
            'BATTLE_LOOP': { onEnter: () => {}, onExit: () => {} },
            'BATTLE_SETTLEMENT': { onEnter: () => {}, onExit: () => {} }
        };
    }

    changeState(newState, params = {}) {
        if (!this.states[newState]) {
            console.error(`Invalid state: ${newState}`);
            return;
        }

        const oldState = this.currentState;
        
        // 0. Log intent before action (Pre-log)
        console.log(`[FSM] Changing state: ${oldState} -> ${newState}`);

        // 1. Trigger onExit of current state
        if (this.states[oldState] && this.states[oldState].onExit) {
            this.states[oldState].onExit();
        }

        // 2. Update current state
        this.currentState = newState;

        // 3. Trigger onEnter of new state
        if (this.states[newState] && this.states[newState].onEnter) {
            this.states[newState].onEnter(params);
        }

        // 4. Publish STATE_CHANGED event
        EventBus.emit('STATE_CHANGED', { from: oldState, to: newState, params });
    }
}

export default new GameFSM();
