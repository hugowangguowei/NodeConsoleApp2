
import EventBus from './EventBus.js';
import GameFSM from './GameFSM.js';
import GameLoop from './GameLoop.js';
import DataManager from './DataManager.js';

class CoreEngine {
    constructor() {
        this.eventBus = EventBus;
        this.fsm = GameFSM;
        this.loop = GameLoop;
        this.data = DataManager;
        
        this.input = {
            login: this.login.bind(this),
            selectLevel: this.selectLevel.bind(this),
            castSkill: this.castSkill.bind(this),
            endTurn: this.endTurn.bind(this)
        };

        this.init();
    }

    async init() {
        console.log('Engine initializing...');
        this.fsm.changeState('INIT');
        
        await this.data.loadConfigs();
        
        this.loop.start();
        
        // Auto transition to LOGIN after init
        this.fsm.changeState('LOGIN');
        console.log('Engine initialized.');
    }

    // --- Input Handlers ---

    login(username) {
        if (this.fsm.currentState !== 'LOGIN') return;

        console.log(`User logging in: ${username}`);
        if (!this.data.loadGame()) {
            this.data.createNewGame(username);
        }
        
        this.fsm.changeState('MAIN_MENU');
        this.eventBus.emit('DATA_UPDATE', this.data.playerData);
    }

    selectLevel(levelId) {
        if (this.fsm.currentState !== 'MAIN_MENU' && this.fsm.currentState !== 'LEVEL_SELECT') return;

        const levelConfig = this.data.getLevelConfig(levelId);
        if (!levelConfig) {
            console.error('Level not found:', levelId);
            return;
        }

        console.log(`Level selected: ${levelId}`);
        this.data.currentLevelData = levelConfig;
        this.fsm.changeState('BATTLE_PREPARE');
        
        // Simulate entering battle immediately for now
        setTimeout(() => {
            this.startBattle();
        }, 500);
    }

    startBattle() {
        this.fsm.changeState('BATTLE_LOOP');
        this.eventBus.emit('BATTLE_START', { 
            player: this.data.playerData, 
            level: this.data.currentLevelData 
        });
        this.startTurn();
    }

    startTurn() {
        console.log('Turn Started');
        // Reset AP
        if (this.data.playerData) {
            this.data.playerData.stats.ap = this.data.playerData.stats.maxAp;
            this.eventBus.emit('DATA_UPDATE', this.data.playerData);
        }
        this.eventBus.emit('TURN_START', { turn: 1 }); // Mock turn number
    }

    castSkill(skillId, targetId, bodyPart) {
        if (this.fsm.currentState !== 'BATTLE_LOOP') return;

        const player = this.data.playerData;
        const cost = 2; // Mock cost

        if (player.stats.ap < cost) {
            this.eventBus.emit('BATTLE_LOG', { text: `行动力不足！需要 ${cost} AP` });
            return;
        }

        console.log(`Casting skill ${skillId} on ${targetId} at ${bodyPart}`);
        
        // Deduct AP
        player.stats.ap -= cost;
        this.eventBus.emit('DATA_UPDATE', player);
        
        // Mock damage calculation
        const damage = 20;
        const log = `玩家使用 ${skillId} 攻击 ${targetId} 造成 ${damage} 点伤害!`;
        
        this.eventBus.emit('BATTLE_LOG', { text: log });
        
        // Check for victory/defeat (Mock)
        // ...
    }

    endTurn() {
        if (this.fsm.currentState !== 'BATTLE_LOOP') return;
        console.log('Player ended turn.');
        // Enemy turn logic would go here
        this.startTurn(); // Loop back to start turn
    }
}

// Export a singleton instance
window.Engine = new CoreEngine();
export default window.Engine;
