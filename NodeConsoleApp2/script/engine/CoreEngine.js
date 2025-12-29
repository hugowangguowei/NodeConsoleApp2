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
            addSkillToQueue: this.addSkillToQueue.bind(this),
            removeSkillFromQueue: this.removeSkillFromQueue.bind(this),
            commitTurn: this.commitTurn.bind(this)
        };

        this.playerSkillQueue = [];
        this.enemySkillQueue = [];
        this.battlePhase = 'IDLE'; // IDLE, PLANNING, EXECUTION

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
        this.currentTurn = 0;
        this.fsm.changeState('BATTLE_LOOP');
        this.eventBus.emit('BATTLE_START', { 
            player: this.data.playerData, 
            level: this.data.currentLevelData 
        });
        this.startTurn();
    }

    startTurn() {
        this.currentTurn++;
        console.log('Turn Started: ' + this.currentTurn);
        
        this.battlePhase = 'PLANNING';
        this.playerSkillQueue = [];
        this.enemySkillQueue = [];

        // Reset AP
        if (this.data.playerData) {
            this.data.playerData.stats.ap = this.data.playerData.stats.maxAp;
            this.eventBus.emit('DATA_UPDATE', this.data.playerData);
        }
        this.eventBus.emit('TURN_START', { turn: this.currentTurn });
        this.emitBattleUpdate();
        this.eventBus.emit('BATTLE_LOG', { text: `Turn ${this.currentTurn} started. Please configure skills.` });
    }

    addSkillToQueue(skillId, targetId, bodyPart) {
        if (this.fsm.currentState !== 'BATTLE_LOOP' || this.battlePhase !== 'PLANNING') return;

        const player = this.data.playerData;
        const skillConfig = this.data.getSkillConfig(skillId);
        
        if (!skillConfig) {
            this.eventBus.emit('BATTLE_LOG', { text: `Unknown skill: ${skillId}` });
            return;
        }

        const cost = skillConfig.cost;

        // Calculate current AP usage
        const currentQueueCost = this.playerSkillQueue.reduce((sum, action) => sum + action.cost, 0);
        if (player.stats.ap < currentQueueCost + cost) {
            this.eventBus.emit('BATTLE_LOG', { text: `Not enough AP! Cannot add more skills.` });
            return;
        }

        const skillAction = {
            source: 'PLAYER',
            skillId,
            targetId,
            bodyPart,
            cost,
            speed: (player.stats.speed || 10) + (skillConfig.speed || 0)
        };
        this.playerSkillQueue.push(skillAction);
        
        this.eventBus.emit('BATTLE_LOG', { text: `Added skill: ${skillConfig.name} (Cost: ${cost} AP)` });
        this.emitBattleUpdate();
    }

    removeSkillFromQueue(index) {
        if (this.fsm.currentState !== 'BATTLE_LOOP' || this.battlePhase !== 'PLANNING') return;
        
        if (index >= 0 && index < this.playerSkillQueue.length) {
            const removed = this.playerSkillQueue.splice(index, 1)[0];
            this.eventBus.emit('BATTLE_LOG', { text: `Removed skill: ${removed.skillId}` });
            this.emitBattleUpdate();
        }
    }

    commitTurn() {
        if (this.fsm.currentState !== 'BATTLE_LOOP' || this.battlePhase !== 'PLANNING') return;

        console.log('Player committed turn.');
        this.battlePhase = 'EXECUTION';
        this.emitBattleUpdate(); // Update UI to disable controls
        
        // Generate Enemy Actions (Mock)
        if (this.data.currentLevelData && this.data.currentLevelData.enemies) {
            this.data.currentLevelData.enemies.forEach(enemy => {
                if (enemy.hp > 0) {
                    // Simple AI: Pick first available skill or default
                    const skillId = (enemy.skills && enemy.skills.length > 0) ? enemy.skills[0] : 'skill_bite';
                    const skillConfig = this.data.getSkillConfig(skillId);
                    const speed = (enemy.speed || 10) + (skillConfig ? skillConfig.speed : 0);

                    this.enemySkillQueue.push({
                        source: 'ENEMY',
                        sourceId: enemy.id,
                        skillId: skillId,
                        targetId: this.data.playerData.id, // Target Player
                        cost: 0, // Enemies might not use AP in this simple version
                        speed: speed
                    });
                }
            });
        }

        this.executeTurn();
    }

    async executeTurn() {
        // Merge and Sort
        const allActions = [
            ...this.playerSkillQueue,
            ...this.enemySkillQueue
        ];

        // Sort by speed descending
        allActions.sort((a, b) => b.speed - a.speed);

        this.eventBus.emit('BATTLE_LOG', { text: `--- Execution Phase ---` });

        for (const action of allActions) {
            // Check if battle ended in previous action
            if (this.fsm.currentState !== 'BATTLE_LOOP') break;

            await new Promise(resolve => setTimeout(resolve, 1000)); // Delay for animation

            if (action.source === 'PLAYER') {
                this.executePlayerSkill(action);
            } else {
                this.executeEnemySkill(action);
            }
            
            this.checkBattleStatus();
        }

        if (this.fsm.currentState === 'BATTLE_LOOP') {
            this.startTurn();
        }
    }

    executePlayerSkill(action) {
        const player = this.data.playerData;
        const skillConfig = this.data.getSkillConfig(action.skillId);
        
        if (!skillConfig) return;

        // Deduct AP (Real deduction)
        player.stats.ap -= action.cost;
        this.eventBus.emit('DATA_UPDATE', player);

        if (skillConfig.type === 'HEAL') {
            const healAmount = skillConfig.value;
            player.stats.hp += healAmount;
            if (player.stats.hp > player.stats.maxHp) player.stats.hp = player.stats.maxHp;
            
            const log = `Player used ${skillConfig.name} healed ${healAmount} HP!`;
            this.eventBus.emit('BATTLE_LOG', { text: log });
            this.emitBattleUpdate();
            return;
        }

        const damage = skillConfig.value;
        let targetName = action.targetId;
        
        if (this.data.currentLevelData && this.data.currentLevelData.enemies) {
            const enemy = this.data.currentLevelData.enemies.find(e => e.id === action.targetId);
            if (enemy) {
                if (enemy.hp <= 0) {
                    this.eventBus.emit('BATTLE_LOG', { text: `Target ${enemy.id} is dead, skill failed.` });
                    return;
                }
                enemy.hp -= damage;
                if (enemy.hp < 0) enemy.hp = 0;
                targetName = `${enemy.id} (HP: ${enemy.hp})`;
            }
        }

        const log = `Player used ${skillConfig.name} attacked ${targetName} for ${damage} damage!`;
        this.eventBus.emit('BATTLE_LOG', { text: log });
        this.emitBattleUpdate();
    }

    executeEnemySkill(action) {
        const player = this.data.playerData;
        if (player.stats.hp <= 0) return;

        const skillConfig = this.data.getSkillConfig(action.skillId);
        const damage = skillConfig ? skillConfig.value : 10;
        const skillName = skillConfig ? skillConfig.name : action.skillId;

        player.stats.hp -= damage;
        if (player.stats.hp < 0) player.stats.hp = 0;
        
        this.eventBus.emit('DATA_UPDATE', player);
        
        const log = `Enemy ${action.sourceId} used ${skillName} attacked Player for ${damage} damage!`;
        this.eventBus.emit('BATTLE_LOG', { text: log });
        this.emitBattleUpdate();
    }

    checkBattleStatus() {
        if (!this.data.currentLevelData || !this.data.currentLevelData.enemies) return;

        const enemies = this.data.currentLevelData.enemies;
        const player = this.data.playerData;

        // Check Victory
        if (enemies.every(e => e.hp <= 0)) {
            this.endBattle(true);
            return;
        }

        // Check Defeat
        if (player.stats.hp <= 0) {
            this.endBattle(false);
            return;
        }
    }

    endBattle(isVictory) {
        const result = isVictory ? 'Victory' : 'Defeat';
        this.eventBus.emit('BATTLE_LOG', { text: `Battle Ended: ${result}!` });
        
        this.fsm.changeState('MAIN_MENU');
        this.eventBus.emit('BATTLE_END', { victory: isVictory });
    }

    emitBattleUpdate() {
        this.eventBus.emit('BATTLE_UPDATE', {
            player: this.data.playerData,
            enemies: this.data.currentLevelData ? this.data.currentLevelData.enemies : [],
            turn: this.currentTurn,
            phase: this.battlePhase,
            queue: this.playerSkillQueue
        });
    }
}

// Export a singleton instance
window.Engine = new CoreEngine();
export default window.Engine;
