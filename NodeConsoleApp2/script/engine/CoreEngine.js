import EventBus from './EventBus.js';
import GameFSM from './GameFSM.js';
import GameLoop from './GameLoop.js';
import DataManager from './DataManagerV2.js';
import { BuffRegistry, BuffManager, BuffSystem } from './buff/index.js';

class CoreEngine {
    constructor() {
        this.eventBus = EventBus;
        this.fsm = GameFSM;
        this.loop = GameLoop;
        this.data = DataManager;

		this.buffRegistry = new BuffRegistry();
		this.buffSystem = new BuffSystem(this.eventBus, this.buffRegistry);
        
        this.input = {
            login: this.login.bind(this),
            selectLevel: this.selectLevel.bind(this),
            addSkillToQueue: this.addSkillToQueue.bind(this),
            removeSkillFromQueue: this.removeSkillFromQueue.bind(this),
            commitTurn: this.commitTurn.bind(this),
            saveGame: this.saveGame.bind(this),
            loadGame: this.loadGame.bind(this),
            resumeGame: this.resumeGame.bind(this),
            backToTitle: this.backToTitle.bind(this),
            resetTurn: this.resetTurn.bind(this),
            confirmSettlement: this.confirmSettlement.bind(this)
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
		this.buffRegistry.setDefinitions((this.data.gameConfig && this.data.gameConfig.buffs) ? this.data.gameConfig.buffs : {});
		this.buffSystem.start();
        
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
        }
        
        // 统一行为：登录后总是进入主菜单
        // 仅切换状态，具体显示逻辑（如是否显示“继续游戏”）由 UI 层根据数据决定
        this.fsm.changeState('MAIN_MENU');
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
        // Ensure BuffManager exists for player
        if (this.data.playerData) {
			if (!this.data.playerData.buffs) {
				this.data.playerData.buffs = new BuffManager(this.data.playerData, this.buffRegistry, this.eventBus);
				this.buffSystem.registerManager(this.data.playerData.buffs);
			}
		}

        // Reset Player State at start of battle (Design 3.3)
        if (this.data.playerData) {
            const p = this.data.playerData;
            // 1. Reset Stats
            if (p.stats) {
                p.stats.hp = p.stats.maxHp;
                p.stats.ap = p.stats.maxAp;
            }
            // 2. Reset Body Parts (Base)
            if (p.bodyParts) {
                for (const key in p.bodyParts) {
                    const part = p.bodyParts[key];
                    part.current = part.max || 0;
                    part.status = 'NORMAL';
                }
            }
            this.eventBus.emit('DATA_UPDATE', p);
        }

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

        const playerWithRuntime = {
            ...this.data.playerData,
            bodyParts: runtime.playerBattleState.bodyParts
        };

        this.eventBus.emit('BATTLE_START', { 
            player: playerWithRuntime, 
            level: this.data.currentLevelData 
        });

		// Ensure BuffManager exists for enemies
		if (this.data.currentLevelData && Array.isArray(this.data.currentLevelData.enemies)) {
			for (const enemy of this.data.currentLevelData.enemies) {
				if (!enemy.buffs) {
					enemy.buffs = new BuffManager(enemy, this.buffRegistry, this.eventBus);
					this.buffSystem.registerManager(enemy.buffs);
				}
			}
		}

        this.startTurn();
    }

    initializePlayerBodyParts(playerData) {
        // 1. Define standard 7 body parts
        const partNames = ['head', 'chest', 'abdomen', 'left_arm', 'right_arm', 'left_leg', 'right_leg'];
        let bodyParts = {};

        // Use defined bodyParts if available, deep copy to avoid mutation
        if (playerData.bodyParts) {
            bodyParts = JSON.parse(JSON.stringify(playerData.bodyParts));
        }

        // Ensure all parts exist and set defaults if missing
        partNames.forEach(name => {
            if (!bodyParts[name]) {
                bodyParts[name] = {
                    current: 0,
                    max: 0,
                    weakness: 1.0, 
                    status: 'NORMAL'
                };
                
                // Apply default weaknesses for generated parts
                if (name === 'head') bodyParts[name].weakness = 1.5;
                if (name === 'abdomen') bodyParts[name].weakness = 1.1;
            } else {
                 // Ensure fields
                 if (bodyParts[name].current === undefined) bodyParts[name].current = 0;
                 if (bodyParts[name].max === undefined) bodyParts[name].max = 0;
                 if (bodyParts[name].weakness === undefined) bodyParts[name].weakness = 1.0;
                 if (!bodyParts[name].status) bodyParts[name].status = 'NORMAL';
            }
        });

        // 2. Apply Equipment Buffs (Add on top of base values)
        if (playerData.equipment && this.data.gameConfig && this.data.gameConfig.items) {
            for (const [slot, itemId] of Object.entries(playerData.equipment)) {
                if (!itemId) continue;

                // Lookup item config
                const item = this.data.gameConfig.items[itemId];
                if (!item || !item.buffs) continue;

                // Process passive buffs (duration = -1)
                item.buffs.forEach(buff => {
                    if (buff.type === 'BUFF' && buff.effect === 'STAT_MOD' && buff.duration === -1) {
                        // Handle armor stats (e.g., "armor_head")
                        if (buff.stat && buff.stat.startsWith('armor_')) {
                            const partName = buff.stat.replace('armor_', '');
                            if (bodyParts[partName]) {
                                bodyParts[partName].max += buff.value;
                                bodyParts[partName].current += buff.value;
                            }
                        }
                        // Note: Other stats like attack/speed would be handled by a global stat manager,
                        // effectively modifying the player's runtime stats, not body parts.
                    }
                });
            }
        }
        
        return bodyParts;
    }

    resumeBattle() {
        const runtime = this.data.dataConfig.runtime;
        this.currentTurn = runtime.turn || 1;
        this.battlePhase = runtime.phase || 'PLANNING';

		// Ensure BuffManager exists for player after load
		if (this.data.playerData && !this.data.playerData.buffs) {
			this.data.playerData.buffs = new BuffManager(this.data.playerData, this.buffRegistry, this.eventBus);
			this.buffSystem.registerManager(this.data.playerData.buffs);
		}
        
        // 恢复队列
        this.playerSkillQueue = runtime.queues ? (runtime.queues.player || []) : [];
        this.enemySkillQueue = runtime.queues ? (runtime.queues.enemy || []) : [];

        this.fsm.changeState('BATTLE_LOOP');
        
        // Prepare player object with runtime body parts
        const playerWithRuntime = {
            ...this.data.playerData,
            bodyParts: (runtime.playerBattleState) ? runtime.playerBattleState.bodyParts : {}
        };

        this.eventBus.emit('BATTLE_START', { 
            player: playerWithRuntime, 
            level: this.data.currentLevelData 
        });
        
        console.log(`Resumed battle at Turn ${this.currentTurn}, Phase ${this.battlePhase}`);
        
        // 如果是在执行阶段恢复，可能需要继续执行或重新开始回合逻辑
        // 为了简单，如果是在执行阶段恢复，强制重置为规划阶段
        // 或者如果是结算后，只是恢复 UI 状态。
        
        this.emitBattleUpdate();
        this.eventBus.emit('BATTLE_LOG', { text: `Game Resumed. Turn ${this.currentTurn}.` });
    }

    resumeGame() {
        console.log('Resume Game requested.');
        if (this.fsm.currentState === 'MAIN_MENU') {
             if (this.data.dataConfig.runtime && this.data.dataConfig.runtime.levelData) {
                this.resumeBattle();
             } else {
                 console.warn('No saved battle to resume.');
             }
        } else if (this.fsm.currentState === 'BATTLE_LOOP' || this.fsm.currentState === 'BATTLE_PREPARE') {
            // Just close modal, handled by UI usually, but engine can emit event
            this.eventBus.emit('UI:CLOSE_MODAL');
        }
    }

    backToTitle() {
        console.log('Returning to title...');
        this.fsm.changeState('LOGIN');
        // Reset runtime data if needed, but keep global config?
        // For now, just switch state.
    }

    confirmSettlement() {
        if (this.fsm.currentState !== 'BATTLE_SETTLEMENT') return;
        console.log('Confirming settlement, returning to menu...');
        this.fsm.changeState('MAIN_MENU');
    }

    loadGame(slotId) {
        console.log(`Loading game (slot ${slotId})...`);
        if (this.data.loadGame(slotId)) {
            this.eventBus.emit('DATA_UPDATE', this.data.playerData);
            
            // Check if we should resume a battle
            if (this.data.dataConfig.runtime && this.data.dataConfig.runtime.levelData) {
                this.resumeBattle();
            } else {
                this.fsm.changeState('MAIN_MENU');
            }
        } else {
            this.eventBus.emit('BATTLE_LOG', { text: 'Failed to load game.' });
        }
    }

    saveGame(slotId) {
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
        
        // 生成敌人行动（模拟')
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

		// Turn end hooks (DoT / duration tick)
		if (this.fsm.currentState === 'BATTLE_LOOP') {
			this.eventBus.emit('TURN_END', { turn: this.currentTurn });
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

                // Combat Context (Buff pipeline)
				const context = {
					attacker: player,
					target: enemy,
					skillId: action.skillId,
					bodyPart: action.bodyPart,
					rawDamage: damage,
					damageDealt: 0,
					damageTaken: 0,
					tempModifiers: Object.create(null)
				};
				this.eventBus.emit('BATTLE_ATTACK_PRE', context);

                // New Damage Logic: Armor -> HP
                let actualDamage = context.rawDamage;
                let armorDamage = 0;
                let targetPart = action.bodyPart || 'chest'; // Default to chest
                
                if (enemy.bodyParts && enemy.bodyParts[targetPart]) {
                    const part = enemy.bodyParts[targetPart];
                    
                    // Apply weakness
                    if (part.weakness) {
                        actualDamage = Math.floor(actualDamage * part.weakness);
                    }

                    // Apply armor mitigation mult from buffs (破甲等写入 tempModifiers)
					let armorMitMult = 1.0;
					const tmp = context.tempModifiers && context.tempModifiers.armorMitigationMult;
					if (Array.isArray(tmp) && tmp.length > 0) {
						for (const m of tmp) {
							if (m.type === 'percent_current') {
								armorMitMult *= (1 + m.value);
							} else if (m.type === 'flat') {
								armorMitMult += m.value;
							}
						}
					}

                    // Reduce Armor first (current)
                    if (part.current > 0) {
                        // armorMitMult > 1 => armor更“软”，等效为放大对护甲的穿透
						const mitigated = Math.ceil(actualDamage * armorMitMult);
						if (part.current >= mitigated) {
							part.current -= mitigated;
							armorDamage = mitigated;
                            actualDamage = 0;
                        } else {
							armorDamage = part.current;
							actualDamage = Math.max(0, mitigated - part.current);
                            part.current = 0;
                            part.status = 'BROKEN';
                        }
                    }
                }

                // TakeDamagePre hooks (e.g. shield / damage taken mult)
				context.damageTaken = actualDamage;
				this.eventBus.emit('BATTLE_TAKE_DAMAGE_PRE', context);
				if (context.damageTakenMult) {
					context.damageTaken = Math.floor(context.damageTaken * context.damageTakenMult);
				}
				if (context.shieldPool) {
					const absorbed = Math.min(context.shieldPool, context.damageTaken);
					context.damageTaken -= absorbed;
					context.shieldPool -= absorbed;
				}

                // Remaining damage goes to HP
                actualDamage = context.damageTaken;
                if (actualDamage > 0) {
                    enemy.hp -= actualDamage;
                    if (enemy.hp < 0) enemy.hp = 0;
                }

				context.damageDealt = actualDamage;
				this.eventBus.emit('BATTLE_ATTACK_POST', context);

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

        // Resolve attacker
		const enemy = (this.data.currentLevelData && this.data.currentLevelData.enemies)
			? this.data.currentLevelData.enemies.find(e => e.id === action.sourceId)
			: null;

		// Combat Context (Buff pipeline)
		const context = {
			attacker: enemy,
			target: player,
			skillId: action.skillId,
			bodyPart: action.bodyPart,
			rawDamage: baseDamage,
			damageDealt: 0,
			damageTaken: 0,
			tempModifiers: Object.create(null)
		};
		this.eventBus.emit('BATTLE_ATTACK_PRE', context);

        // New Damage Logic for Player
        let actualDamage = context.rawDamage;
        let armorDamage = 0;
        let targetPart = action.bodyPart || 'chest'; // Default to chest
        
        // Access player battle state for body parts
        const runtime = this.data.dataConfig.runtime;
        const playerBattleState = runtime ? runtime.playerBattleState : null;

        if (playerBattleState && playerBattleState.bodyParts && playerBattleState.bodyParts[targetPart]) {
            const part = playerBattleState.bodyParts[targetPart];
            
            // Apply weakness
            if (part.weakness) {
                actualDamage = Math.floor(actualDamage * part.weakness);
            }

            // Apply armor mitigation mult from buffs
			let armorMitMult = 1.0;
			const tmp = context.tempModifiers && context.tempModifiers.armorMitigationMult;
			if (Array.isArray(tmp) && tmp.length > 0) {
				for (const m of tmp) {
					if (m.type === 'percent_current') {
						armorMitMult *= (1 + m.value);
					} else if (m.type === 'flat') {
						armorMitMult += m.value;
					}
				}
			}

            // Reduce Armor first (current)
            if (part.current > 0) {
                const mitigated = Math.ceil(actualDamage * armorMitMult);
                if (part.current >= mitigated) {
                    part.current -= mitigated;
                    armorDamage = mitigated;
                    actualDamage = 0;
                } else {
                    armorDamage = part.current;
                    actualDamage = Math.max(0, mitigated - part.current);
                    part.current = 0;
                    part.status = 'BROKEN';
                }
            }
        }

        // TakeDamagePre hooks (e.g. shield / damage taken mult)
		context.damageTaken = actualDamage;
		this.eventBus.emit('BATTLE_TAKE_DAMAGE_PRE', context);
		if (context.damageTakenMult) {
			context.damageTaken = Math.floor(context.damageTaken * context.damageTakenMult);
		}
		if (context.shieldPool) {
			const absorbed = Math.min(context.shieldPool, context.damageTaken);
			context.damageTaken -= absorbed;
			context.shieldPool -= absorbed;
		}

		actualDamage = context.damageTaken;
        if (actualDamage > 0) {
            player.stats.hp -= actualDamage;
            if (player.stats.hp < 0) player.stats.hp = 0;
        }

		context.damageDealt = actualDamage;
		this.eventBus.emit('BATTLE_ATTACK_POST', context);
        
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
        
        //  DataManager ???
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
        this.data.saveGame(); // ???

        this.fsm.changeState('BATTLE_SETTLEMENT', { victory: isVictory });
        this.eventBus.emit('BATTLE_END', { victory: isVictory });
    }

    resetTurn() {
         if (this.battlePhase !== 'PLANNING') {
             this.eventBus.emit('BATTLE_LOG', { text: `Cannot reset turn during ${this.battlePhase} phase.` });
             return;
         }
         this.playerSkillQueue = [];
         this.eventBus.emit('BATTLE_LOG', { text: `Turn actions reset.` });
         this.emitBattleUpdate();
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
        // Merge runtime bodyParts into player data for UI
        let playerPayload = this.data.playerData;
        if (this.data.dataConfig.runtime && this.data.dataConfig.runtime.playerBattleState) {
             playerPayload = {
                 ...this.data.playerData,
                 bodyParts: this.data.dataConfig.runtime.playerBattleState.bodyParts
             };
        }

        this.eventBus.emit('BATTLE_UPDATE', {
            player: playerPayload,
            enemies: this.data.currentLevelData ? this.data.currentLevelData.enemies : [],
            turn: this.currentTurn,
            phase: this.battlePhase,
            queue: this.playerSkillQueue
        });
    }
}

// 创建单例实例
const engineInstance = new CoreEngine();

// 挂载到 window 方便调试 (可选，但在本项目中为了兼容性保留)
window.Engine = engineInstance;

// 默认导出实例
export default engineInstance;

// 具名导出类 (用于测试或特殊需求)
export { CoreEngine };
