import EventBus from './EventBus.js';
import GameFSM from './GameFSM.js';
import GameLoop from './GameLoop.js';
import DataManager from './DataManagerV2.js';

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
            commitTurn: this.commitTurn.bind(this),
            saveGame: this.saveGame.bind(this)
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
        
        // 初始化后自动跳转到登录状态
        this.fsm.changeState('LOGIN');
        console.log('Engine initialized.');
    }

    // --- 输入处理程序 ---

    login(username) {
        if (this.fsm.currentState !== 'LOGIN') return;

        console.log(`User logging in: ${username}`);
        // 尝试先加载现有游戏
        if (!this.data.loadGame()) {
            this.data.createNewGame(username);
            this.fsm.changeState('MAIN_MENU');
            this.eventBus.emit('DATA_UPDATE', this.data.playerData);
        } else {
            // 先发出数据更新以确保生成 UI 元素（如技能按钮）
            this.eventBus.emit('DATA_UPDATE', this.data.playerData);

            // 检查我们是否在战斗中
            if (this.data.dataConfig.runtime && this.data.dataConfig.runtime.levelData) {
                console.log('Resuming saved battle...');
                this.resumeBattle();
            } else {
                this.fsm.changeState('MAIN_MENU');
            }
        }
        
        this.eventBus.emit('DATA_UPDATE', this.data.playerData);
    }

    // 强制创建新游戏，覆盖现有存档
    resetGame(username) {
        console.log(`Resetting game for user: ${username}`);
        this.data.createNewGame(username);
        
        // 如果我们在登录状态，转换到主菜单
        // 如果我们已经在游戏中，只需更新数据
        if (this.fsm.currentState === 'LOGIN') {
            this.fsm.changeState('MAIN_MENU');
        }
        
        this.eventBus.emit('DATA_UPDATE', this.data.playerData);
        this.eventBus.emit('BATTLE_LOG', { text: 'Game has been reset. New game started.' });
    }

    selectLevel(levelId) {
        if (this.fsm.currentState !== 'MAIN_MENU' && this.fsm.currentState !== 'LEVEL_SELECT') return;

        const levelData = this.data.instantiateLevel(levelId);
        if (!levelData) {
            console.error('Level not found:', levelId);
            return;
        }

        console.log(`Level selected: ${levelId}`);
        this.data.currentLevelData = levelData;
        this.fsm.changeState('BATTLE_PREPARE');
        
        // 暂时模拟立即进入战斗
        setTimeout(() => {
            this.startBattle();
        }, 500);
    }

    startBattle() {
        this.currentTurn = 0;
        this.fsm.changeState('BATTLE_LOOP');
        
        // 初始化运行时数据结构
        if (!this.data.dataConfig.runtime) this.data.dataConfig.runtime = {};
        const runtime = this.data.dataConfig.runtime;

        // 1. 初始状态快照
        runtime.initialState = {
            enemies: JSON.parse(JSON.stringify(this.data.currentLevelData.enemies))
        };

        // 2. 历史记录
        runtime.history = [];

        // 3. 队列
        runtime.queues = {
            player: [],
            enemy: []
        };

        // 4. 玩家临时状态
        runtime.playerBattleState = {
            buffs: [],
            tempStatModifiers: {},
            bodyParts: this.initializePlayerBodyParts(this.data.playerData)
        };

        this.eventBus.emit('BATTLE_START', { 
            player: this.data.playerData, 
            level: this.data.currentLevelData 
        });
        this.startTurn();
    }

    initializePlayerBodyParts(playerData) {
        const bodyParts = {};
        if (playerData.equipment && playerData.equipment.armor) {
            for (const [slot, item] of Object.entries(playerData.equipment.armor)) {
                // Map equipment slot to body part
                // Assuming slot names 'head', 'chest' etc. map directly or via some logic
                // For now, direct mapping: head -> head, chest -> body
                let partName = slot;
                if (slot === 'chest') partName = 'body';

                bodyParts[partName] = {
                    armor: item.durability || 0,
                    maxArmor: item.maxDurability || (item.durability || 0),
                    weakness: 1.0, // Default weakness
                    status: 'NORMAL'
                };
            }
        }
        // Ensure basic parts exist if no armor
        if (!bodyParts.head) bodyParts.head = { armor: 0, maxArmor: 0, weakness: 1.5, status: 'NORMAL' };
        if (!bodyParts.body) bodyParts.body = { armor: 0, maxArmor: 0, weakness: 1.0, status: 'NORMAL' };
        
        return bodyParts;
    }

    resumeBattle() {
        const runtime = this.data.dataConfig.runtime;
        this.currentTurn = runtime.turn || 1;
        this.battlePhase = runtime.phase || 'PLANNING';
        
        // 恢复队列
        this.playerSkillQueue = runtime.queues ? (runtime.queues.player || []) : [];
        this.enemySkillQueue = runtime.queues ? (runtime.queues.enemy || []) : [];

        this.fsm.changeState('BATTLE_LOOP');
        this.eventBus.emit('BATTLE_START', { 
            player: this.data.playerData, 
            level: this.data.currentLevelData 
        });
        
        console.log(`Resumed battle at Turn ${this.currentTurn}, Phase ${this.battlePhase}`);
        
        // 如果我们在执行阶段恢复，我们可能需要继续执行或重新开始回合逻辑
        // 为简单起见，如果在执行阶段恢复，我们可能只是重新开始回合或重置为规划阶段
        // 但让我们假设我们只是恢复 UI 状态。
        
        this.emitBattleUpdate();
        this.eventBus.emit('BATTLE_LOG', { text: `Game Resumed. Turn ${this.currentTurn}.` });
    }

    saveGame() {
        // 保存前将当前战斗状态同步到 DataManager
        if (this.fsm.currentState === 'BATTLE_LOOP') {
            this.saveBattleState();
        } else {
            // 如果不在战斗中，清除战斗运行时数据
            if (this.data.dataConfig.runtime) {
                delete this.data.dataConfig.runtime.levelData;
                delete this.data.dataConfig.runtime.turn;
                delete this.data.dataConfig.runtime.phase;
                delete this.data.dataConfig.runtime.initialState;
                delete this.data.dataConfig.runtime.history;
                delete this.data.dataConfig.runtime.queues;
                delete this.data.dataConfig.runtime.playerTempState;
            }
            this.data.currentLevelData = null;
        }
        
        this.data.saveGame();
        this.eventBus.emit('BATTLE_LOG', { text: 'Game Saved.' });
    }

    startTurn() {
        this.currentTurn++;
        console.log('Turn Started: ' + this.currentTurn);
        
        this.battlePhase = 'PLANNING';
        
        // 记录历史快照
        if (this.data.dataConfig.runtime) {
            if (!this.data.dataConfig.runtime.history) this.data.dataConfig.runtime.history = [];
            
            const snapshot = {
                player: { 
                    hp: this.data.playerData.stats.hp, 
                    ap: this.data.playerData.stats.ap 
                },
                enemies: this.data.currentLevelData.enemies.map(e => ({
                    id: e.id,
                    hp: e.hp,
                    pos: e.position || 0
                }))
            };

            this.currentHistoryEntry = {
                turn: this.currentTurn,
                timestamp: Date.now(),
                seed: 'mock_seed_' + Date.now(),
                snapshot: snapshot,
                systemEvents: [],
                actions: []
            };
            this.data.dataConfig.runtime.history.push(this.currentHistoryEntry);
        }

        this.saveBattleState();

        this.playerSkillQueue = [];
        this.enemySkillQueue = [];

        // 重置 AP
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

        // 验证目标身体部位
        // 攻击和辅助技能需要身体部位，除非它们是全局/AOE
        const requiresBodyPart = (skillConfig.type === 'DAMAGE' || skillConfig.type === 'HEAL' || skillConfig.type === 'BUFF') && skillConfig.targetType !== 'GLOBAL' && skillConfig.targetType !== 'AOE';

        if (requiresBodyPart) {
            if (!bodyPart) {
                this.eventBus.emit('BATTLE_LOG', { text: `Skill ${skillConfig.name} requires a target body part.` });
                return;
            }

            // 查找目标
            let target = null;
            if (targetId === this.data.playerData.id) {
                target = this.data.playerData;
            } else if (this.data.currentLevelData && this.data.currentLevelData.enemies) {
                target = this.data.currentLevelData.enemies.find(e => e.id === targetId);
            }

            if (!target) {
                this.eventBus.emit('BATTLE_LOG', { text: `Invalid target: ${targetId}` });
                return;
            }

            // 检查目标是否存在身体部位
            let isValidPart = false;
            if (target.bodyParts) {
                // 具有明确身体部位的敌人
                if (target.bodyParts[bodyPart]) isValidPart = true;
            } else if (target.equipment && target.equipment.armor) {
                // 玩家（使用护甲槽作为身体部位）
                if (target.equipment.armor.hasOwnProperty(bodyPart)) isValidPart = true;
            }

            if (!isValidPart) {
                this.eventBus.emit('BATTLE_LOG', { text: `Invalid body part '${bodyPart}' for target.` });
                return;
            }
        }

        const cost = skillConfig.cost;

        // 计算当前 AP 使用量
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
        
        // 生成敌人行动（模拟）
        if (this.data.currentLevelData && this.data.currentLevelData.enemies) {
            this.data.currentLevelData.enemies.forEach(enemy => {
                if (enemy.hp > 0) {
                    // 简单 AI：选择第一个可用技能或默认技能
                    const skillId = (enemy.skills && enemy.skills.length > 0) ? enemy.skills[0] : 'skill_bite';
                    const skillConfig = this.data.getSkillConfig(skillId);
                    const speed = (enemy.speed || 10) + (skillConfig ? skillConfig.speed : 0);

                    this.enemySkillQueue.push({
                        source: 'ENEMY',
                        sourceId: enemy.id,
                        skillId: skillId,
                        targetId: this.data.playerData.id, // 目标玩家
                        cost: 0, // 敌人在这个简单版本中可能不使用 AP
                        speed: speed
                    });
                }
            });
        }

        this.saveBattleState(); // 同步状态（包括队列）
        this.emitBattleUpdate(); // 更新 UI 以禁用控件

        this.executeTurn();
    }

    async executeTurn() {
        // 合并和排序
        const allActions = [
            ...this.playerSkillQueue,
            ...this.enemySkillQueue
        ];

        // 按速度降序排序
        allActions.sort((a, b) => b.speed - a.speed);

        this.eventBus.emit('BATTLE_LOG', { text: `--- Execution Phase ---` });

        let actionOrder = 0;
        for (const action of allActions) {
            // 检查战斗是否在上一个动作中结束
            if (this.fsm.currentState !== 'BATTLE_LOOP') break;

            await new Promise(resolve => setTimeout(resolve, 1000)); // 延迟动画

            actionOrder++;
            let result = null;

            if (action.source === 'PLAYER') {
                result = this.executePlayerSkill(action);
            } else {
                result = this.executeEnemySkill(action);
            }
            
            // 将动作记录到历史记录
            if (this.currentHistoryEntry) {
                this.currentHistoryEntry.actions.push({
                    order: actionOrder,
                    ...action,
                    result: result
                });
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
        
        if (!skillConfig) return null;

        // 扣除 AP（实际扣除）
        player.stats.ap -= action.cost;
        this.eventBus.emit('DATA_UPDATE', player);

        if (skillConfig.type === 'HEAL') {
            const healAmount = skillConfig.value;
            player.stats.hp += healAmount;
            if (player.stats.hp > player.stats.maxHp) player.stats.hp = player.stats.maxHp;
            
            const log = `Player used ${skillConfig.name} healed ${healAmount} HP!`;
            this.eventBus.emit('BATTLE_LOG', { text: log });
            this.emitBattleUpdate();
            return { isHit: true, heal: healAmount, targetHpRemaining: player.stats.hp };
        }

        const damage = skillConfig.value;
        let targetName = action.targetId;
        let result = { isHit: false, damage: 0 };
        
        if (this.data.currentLevelData && this.data.currentLevelData.enemies) {
            const enemy = this.data.currentLevelData.enemies.find(e => e.id === action.targetId);
            if (enemy) {
                if (enemy.hp <= 0) {
                    this.eventBus.emit('BATTLE_LOG', { text: `Target ${enemy.id} is dead, skill failed.` });
                    return { isHit: false, reason: 'dead' };
                }

                // New Damage Logic: Armor -> HP
                let actualDamage = damage;
                let armorDamage = 0;
                let targetPart = action.bodyPart || 'body'; // Default to body if not specified
                
                if (enemy.bodyParts && enemy.bodyParts[targetPart]) {
                    const part = enemy.bodyParts[targetPart];
                    
                    // Apply weakness
                    if (part.weakness) {
                        actualDamage = Math.floor(actualDamage * part.weakness);
                    }

                    // Reduce Armor first
                    if (part.armor > 0) {
                        if (part.armor >= actualDamage) {
                            part.armor -= actualDamage;
                            armorDamage = actualDamage;
                            actualDamage = 0;
                        } else {
                            armorDamage = part.armor;
                            actualDamage -= part.armor;
                            part.armor = 0;
                            part.status = 'BROKEN';
                        }
                    }
                }

                // Remaining damage goes to HP
                if (actualDamage > 0) {
                    enemy.hp -= actualDamage;
                    if (enemy.hp < 0) enemy.hp = 0;
                }

                targetName = `${enemy.id} (HP: ${enemy.hp})`;
                result = { 
                    isHit: true, 
                    damage: actualDamage, 
                    armorDamage: armorDamage,
                    targetHpRemaining: enemy.hp,
                    targetPart: targetPart
                };
            }
        }

        const log = `Player used ${skillConfig.name} attacked ${targetName} for ${result.damage} HP damage (Armor: ${result.armorDamage})!`;
        this.eventBus.emit('BATTLE_LOG', { text: log });
        this.emitBattleUpdate();
        return result;
    }

    executeEnemySkill(action) {
        const player = this.data.playerData;
        if (player.stats.hp <= 0) return { isHit: false, reason: 'dead' };

        const skillConfig = this.data.getSkillConfig(action.skillId);
        const baseDamage = skillConfig ? skillConfig.value : 10;
        const skillName = skillConfig ? skillConfig.name : action.skillId;

        // New Damage Logic for Player
        let actualDamage = baseDamage;
        let armorDamage = 0;
        let targetPart = action.bodyPart || 'body'; // Default to body
        
        // Access player battle state for body parts
        const runtime = this.data.dataConfig.runtime;
        const playerBattleState = runtime ? runtime.playerBattleState : null;

        if (playerBattleState && playerBattleState.bodyParts && playerBattleState.bodyParts[targetPart]) {
            const part = playerBattleState.bodyParts[targetPart];
            
            // Apply weakness
            if (part.weakness) {
                actualDamage = Math.floor(actualDamage * part.weakness);
            }

            // Reduce Armor first
            if (part.armor > 0) {
                if (part.armor >= actualDamage) {
                    part.armor -= actualDamage;
                    armorDamage = actualDamage;
                    actualDamage = 0;
                } else {
                    armorDamage = part.armor;
                    actualDamage -= part.armor;
                    part.armor = 0;
                    part.status = 'BROKEN';
                }
                
                // Sync back to equipment durability
                // Mapping: head -> head, body -> chest
                let equipSlot = targetPart;
                if (targetPart === 'body') equipSlot = 'chest';
                
                if (player.equipment.armor && player.equipment.armor[equipSlot]) {
                    player.equipment.armor[equipSlot].durability = part.armor;
                }
            }
        }

        if (actualDamage > 0) {
            player.stats.hp -= actualDamage;
            if (player.stats.hp < 0) player.stats.hp = 0;
        }
        
        this.eventBus.emit('DATA_UPDATE', player);
        
        const log = `${action.sourceId} used ${skillName} attacked Player for ${actualDamage} HP damage (Armor: ${armorDamage})!`;
        this.eventBus.emit('BATTLE_LOG', { text: log });
        this.emitBattleUpdate();

        return { 
            isHit: true, 
            damage: actualDamage, 
            armorDamage: armorDamage,
            targetHpRemaining: player.stats.hp 
        };
    }

    checkBattleStatus() {
        if (!this.data.currentLevelData || !this.data.currentLevelData.enemies) return;

        const enemies = this.data.currentLevelData.enemies;
        const player = this.data.playerData;

        // 检查胜利
        if (enemies.every(e => e.hp <= 0)) {
            this.endBattle(true);
            return;
        }

        // 检查失败
        if (player.stats.hp <= 0) {
            this.endBattle(false);
            return;
        }
    }

    endBattle(isVictory) {
        const result = isVictory ? 'Victory' : 'Defeat';
        this.eventBus.emit('BATTLE_LOG', { text: `Battle Ended: ${result}!` });
        
        // 从 DataManager 清除战斗状态
        if (this.data.dataConfig.runtime) {
            delete this.data.dataConfig.runtime.levelData;
            delete this.data.dataConfig.runtime.turn;
            delete this.data.dataConfig.runtime.phase;
            delete this.data.dataConfig.runtime.initialState;
            delete this.data.dataConfig.runtime.history;
            delete this.data.dataConfig.runtime.queues;
            delete this.data.dataConfig.runtime.playerTempState;
        }
        this.data.currentLevelData = null;
        this.data.saveGame(); // 战斗结束时自动保存

        this.fsm.changeState('MAIN_MENU');
        this.eventBus.emit('BATTLE_END', { victory: isVictory });
    }

    saveBattleState() {
        if (this.fsm.currentState === 'BATTLE_LOOP') {
            if (!this.data.dataConfig.runtime) this.data.dataConfig.runtime = {};
            const runtime = this.data.dataConfig.runtime;
            runtime.turn = this.currentTurn;
            runtime.phase = this.battlePhase;
            
            // 保存队列
            if (!runtime.queues) runtime.queues = {};
            runtime.queues.player = this.playerSkillQueue;
            runtime.queues.enemy = this.enemySkillQueue;
        }
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

// 导出单例实例
window.Engine = new CoreEngine();
export default window.Engine;
