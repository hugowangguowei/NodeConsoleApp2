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
        this.eventBus.emit('BATTLE_LOG', { text: `回合 ${this.currentTurn} 开始，请配置技能。` });
    }

    addSkillToQueue(skillId, targetId, bodyPart) {
        if (this.fsm.currentState !== 'BATTLE_LOOP' || this.battlePhase !== 'PLANNING') return;

        const player = this.data.playerData;
        const cost = 2; // Mock cost

        // Calculate current AP usage
        const currentQueueCost = this.playerSkillQueue.reduce((sum, action) => sum + action.cost, 0);
        if (player.stats.ap < currentQueueCost + cost) {
            this.eventBus.emit('BATTLE_LOG', { text: `行动力不足！无法添加更多技能。` });
            return;
        }

        const skillAction = {
            source: 'PLAYER',
            skillId,
            targetId,
            bodyPart,
            cost
        };
        this.playerSkillQueue.push(skillAction);
        
        this.eventBus.emit('BATTLE_LOG', { text: `已添加技能: ${skillId} (待消耗 ${cost} AP)` });
        this.emitBattleUpdate();
    }

    removeSkillFromQueue(index) {
        if (this.fsm.currentState !== 'BATTLE_LOOP' || this.battlePhase !== 'PLANNING') return;
        
        if (index >= 0 && index < this.playerSkillQueue.length) {
            const removed = this.playerSkillQueue.splice(index, 1)[0];
            this.eventBus.emit('BATTLE_LOG', { text: `已移除技能: ${removed.skillId}` });
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
                    this.enemySkillQueue.push({
                        source: 'ENEMY',
                        sourceId: enemy.id,
                        skillId: 'attack_normal',
                        targetId: this.data.playerData.id, // Target Player
                        cost: 0,
                        speed: enemy.speed || 10
                    });
                }
            });
        }

        this.executeTurn();
    }

    async executeTurn() {
        // Merge and Sort
        const playerSpeed = this.data.playerData.stats.speed || 10;
        
        const allActions = [
            ...this.playerSkillQueue.map(a => ({ ...a, speed: playerSpeed })),
            ...this.enemySkillQueue
        ];

        // Sort by speed descending
        allActions.sort((a, b) => b.speed - a.speed);

        this.eventBus.emit('BATTLE_LOG', { text: `--- 技能释放阶段 ---` });

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
        
        // Deduct AP (Real deduction)
        player.stats.ap -= action.cost;
        this.eventBus.emit('DATA_UPDATE', player);

        const damage = 20;
        let targetName = action.targetId;
        
        if (this.data.currentLevelData && this.data.currentLevelData.enemies) {
            const enemy = this.data.currentLevelData.enemies.find(e => e.id === action.targetId);
            if (enemy) {
                if (enemy.hp <= 0) {
                    this.eventBus.emit('BATTLE_LOG', { text: `目标 ${enemy.id} 已死亡，技能失效。` });
                    return;
                }
                enemy.hp -= damage;
                if (enemy.hp < 0) enemy.hp = 0;
                targetName = `${enemy.id} (HP: ${enemy.hp})`;
            }
        }

        const log = `玩家使用 ${action.skillId} 攻击 ${targetName} 造成 ${damage} 点伤害!`;
        this.eventBus.emit('BATTLE_LOG', { text: log });
        this.emitBattleUpdate();
    }

    executeEnemySkill(action) {
        const player = this.data.playerData;
        if (player.stats.hp <= 0) return;

        const damage = 10;
        player.stats.hp -= damage;
        if (player.stats.hp < 0) player.stats.hp = 0;
        
        this.eventBus.emit('DATA_UPDATE', player);
        
        const log = `敌人 ${action.sourceId} 攻击 玩家 造成 ${damage} 点伤害!`;
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
        const result = isVictory ? '胜利' : '失败';
        this.eventBus.emit('BATTLE_LOG', { text: `战斗结束: ${result}!` });
        
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
