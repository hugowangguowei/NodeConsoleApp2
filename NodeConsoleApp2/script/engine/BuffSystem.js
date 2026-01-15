import EventBus from './EventBus.js';
import DataManager from './DataManagerV2.js';

// --- Action Library ---
const ActionLibrary = {
    // 造成伤害
    "DAMAGE": (source, target, params, context) => {
        const val = resolveValue(params.value, source, target, context);
        const damage = Math.floor(val);
        
        if (target.stats && target.stats.hp !== undefined) {
            target.stats.hp = Math.max(0, target.stats.hp - damage);
        }
        EventBus.emit('BATTLE_LOG', { text: `${target.name || 'Target'} takes ${damage} damage from effect.` });
        EventBus.emit('DATA_UPDATE', target); // Simple update
    },
    
    // 治疗
    "heal": (source, target, params, context) => { // Lowercase alias support
        ActionLibrary.HEAL(source, target, params, context);
    },
    "HEAL": (source, target, params, context) => {
        const val = resolveValue(params.value, source, target, context);
        const heal = Math.floor(val);
        if (target.stats && target.stats.hp !== undefined) {
             target.stats.hp = Math.min(target.stats.maxHp, target.stats.hp + heal);
        }
        EventBus.emit('BATTLE_LOG', { text: `${target.name || 'Target'} recovers ${heal} HP.` });
        EventBus.emit('DATA_UPDATE', target);
    },
    
    // 跳过回合/眩晕
    "skipTurn": (source, target, params, context) => {
        ActionLibrary.SKIP_TURN(source, target, params, context);
    },
    "SKIP_TURN": (source, target, params, context) => {
        if (target.stats) {
            // Setting AP to 0 effectively skips turn or prevents actions
            target.stats.ap = 0;
            EventBus.emit('BATTLE_LOG', { text: `${target.name || 'Target'} is stunned and loses turn.` });
            EventBus.emit('DATA_UPDATE', target);
        }
    },
    
    // 施加Buff
    "applyBuff": (source, target, params, context) => {
        ActionLibrary.APPLY_BUFF(source, target, params, context);
    },
    "APPLY_BUFF": (source, target, params, context) => {
        if (target.buffManager) {
            target.buffManager.addBuff(params.buffId, source);
        }
    },

    // [新增] 修改上下文数值 (核心逻辑)
    // 用于 onAttackPre, onTakeDamage 等 Pipeline 节点修改 context
    "modifyContext": (source, target, params, context) => {
        ActionLibrary.MODIFY_CONTEXT(source, target, params, context);
    },
    "MODIFY_CONTEXT": (source, target, params, context) => {
        // params: { key: "armorPenetration", value: "0.3", mode: "set" | "add" | "mult" }
        if (!context) return;
        
        const key = params.key;
        if (context.hasOwnProperty(key)) {
            const val = resolveValue(params.value, source, target, context);
            const mode = params.mode || 'set';
            
            // 简单的数值修改逻辑
            if (mode === 'add') {
                context[key] += val;
            } else if (mode === 'mult') { // 乘算
                 context[key] *= val;
            } else { // set
                context[key] = val;
            }
            
            EventBus.emit('BATTLE_LOG', { text: `[Effect] ${key} adjusted to ${context[key]} by buff.` });
        }
    },

    // [新增] 移除 Buff 自身 (用于耗散型 Buff)
    "removeSelf": (source, target, params, context, buffInstance) => { 
        ActionLibrary.REMOVE_SELF(source, target, params, context, buffInstance);
    },
    "REMOVE_SELF": (source, target, params, context, buffInstance) => {
        if (target.buffManager && buffInstance) {
            target.buffManager.removeBuff(buffInstance.buffId);
            EventBus.emit('BATTLE_LOG', { text: `[Effect] Buff ${buffInstance.config.name} consumed.` });
        }
    },

    "damage": (source, target, params, context) => {
        ActionLibrary.DAMAGE(source, target, params, context);
    }
};

// --- Helper: Resolve Value ---
function resolveValue(expression, source, target, context) {
    if (typeof expression === 'number') return expression;
    if (!expression) return 0;
    if (typeof expression !== 'string') return 0;

    let safeExpr = expression;
    
    // Simplistic variable substitution for common patterns
    // Note: We use Function constructor which allows arbitrary code execution.
    // In a real local web game this is acceptable, but in strict environments this needs a parser.
    try {
        const func = new Function("source", "target", "context", "self", `
            const maxHp = (self && self.stats) ? self.stats.maxHp : 0;
            const hp = (self && self.stats) ? self.stats.hp : 0;
            return ${safeExpr};
        `);
        // We assume 'self' is the entity on which the effect is operating.
        // Usually 'target' of the action.
        return func(source, target, context, target); 
    } catch (e) {
        console.error(`Failed to resolve value: ${expression}`, e);
        return 0;
    }
}

// --- Buff Manager ---
export class BuffManager {
    constructor(owner) {
        this.owner = owner;
        this.buffs = []; 
        this.baseStats = null; 
    }
    
    init() {
        if (this.owner && this.owner.stats) {
             // Snapshot base stats. 
             // Ideally this should happen before any equipment buffs if EQUIPMENT is not BuffSystem managed yet.
             // But CoreEngine applies equipment buffs to bodyParts. Global stats might be base.
             this.baseStats = JSON.parse(JSON.stringify(this.owner.stats));
        }
    }

    addBuff(buffId, source) {
        if (!DataManager.gameConfig || !DataManager.gameConfig.buffs) return;
        const config = DataManager.gameConfig.buffs[buffId];
        if (!config) {
            console.warn(`Buff config not found: ${buffId}`);
            return;
        }

        const existing = this.buffs.find(b => b.buffId === buffId);
        
        if (existing) {
            const strategy = config.lifecycle.stackStrategy;
            if (strategy === 'refresh') {
                existing.duration = config.lifecycle.duration;
                existing.stacks = Math.min(existing.stacks + 1, config.lifecycle.maxStacks);
            } else if (strategy === 'replace') {
                existing.duration = config.lifecycle.duration;
                existing.stacks = 1;
            } else if (strategy === 'independent') {
                this.buffs.push(this._createBuff(config, source));
            } else if (strategy === 'extend') {
                existing.duration += config.lifecycle.duration;
            }
        } else {
            this.buffs.push(this._createBuff(config, source));
        }
        
        this.recalculateStats();
        EventBus.emit('BUFF_UPDATE', { targetId: this.owner.id, buffs: this.buffs });
        
        // Immediate trigger if any (not standard, but useful for instant effects)
    }

    _createBuff(config, source) {
        return {
            buffId: config.id,
            config: config,
            duration: config.lifecycle.duration,
            stacks: 1,
            source: source
        };
    }

    removeBuff(buffId) {
        const idx = this.buffs.findIndex(b => b.buffId === buffId);
        if (idx > -1) {
            this.buffs.splice(idx, 1);
            this.recalculateStats();
            EventBus.emit('BUFF_UPDATE', { targetId: this.owner.id, buffs: this.buffs });
        }
    }

    tick() {
        let changed = false;
        
        // Update durations
        for (let i = this.buffs.length - 1; i >= 0; i--) {
            const buff = this.buffs[i];
            // Duration -1 means permanent
            if (buff.duration > 0) {
                buff.duration--;
                if (buff.duration === 0) {
                    this.buffs.splice(i, 1);
                    changed = true;
                    // EventBus.emit('BATTLE_LOG', { text: `${buff.config.name} on ${this.owner.name} expired.` });
                }
            }
        }
        
        if (changed) {
            this.recalculateStats();
            EventBus.emit('BUFF_UPDATE', { targetId: this.owner.id, buffs: this.buffs });
        }
    }

    recalculateStats() {
        if (!this.baseStats || !this.owner.stats) return;
        
        const statsToCheck = ['maxHp', 'atk', 'def', 'speed', 'critRate', 'hitRate', 'dodgeRate', 'maxAp'];
        
        statsToCheck.forEach(statKey => {
            // Note: If baseStats doesn't have the key, init it to 0
            let baseVal = this.baseStats[statKey] || 0;
            let percentSum = 0;
            let flatSum = 0;
            
            this.buffs.forEach(buff => {
                if (buff.config.statModifiers && buff.config.statModifiers[statKey]) {
                    const mod = buff.config.statModifiers[statKey];
                    if (mod.type === 'flat') flatSum += (mod.value * buff.stacks);
                    if (mod.type === 'percent') percentSum += (mod.value * buff.stacks);
                }
            });
            
            const p = percentSum / 100.0;
            const finalVal = (baseVal + flatSum) * (1 + p);
            
            this.owner.stats[statKey] = finalVal;
        });
        
        // Cap HP/AP if current exceeds new max
        if (this.owner.stats.hp > this.owner.stats.maxHp) this.owner.stats.hp = this.owner.stats.maxHp;
        if (this.owner.stats.ap > this.owner.stats.maxAp) this.owner.stats.ap = this.owner.stats.maxAp;
    }
    
    getBuffs() {
        return this.buffs;
    }
}

// --- Buff System ---
class BuffSystem {
    constructor() {
        this.managers = new Map(); // targetId -> BuffManager
        
        // Bind methods
        this.onBattleStart = this.onBattleStart.bind(this);
        this.onTurnStart = this.onTurnStart.bind(this);
        this.onTurnEnd = this.onTurnEnd.bind(this);
        
        // Basic Event Listeners
        EventBus.on('BATTLE_START', this.onBattleStart);
        EventBus.on('TURN_START', this.onTurnStart);
        EventBus.on('TURN_END', this.onTurnEnd);
        
        // Pipeline Listeners
        EventBus.on('BATTLE_ATTACK_PRE', this.onAttackPre.bind(this));
        EventBus.on('BATTLE_TAKE_DAMAGE', this.onTakeDamage.bind(this));
        EventBus.on('BATTLE_DEATH_CHECK', this.onDeathCheck.bind(this));
        
        // Note: Additional hooks like ATTACK_POST need an event from CoreEngine or Logic
        // For now we assume CoreEngine or BattleLogic will emit 'EVENT_ACTION_EXECUTED' or similar.
        // We add a generic ACTION_EXECUTED listener if defined in future.
        EventBus.on('ACTION_EXECUTED', this.onActionExecuted.bind(this));
    }
    
    onBattleStart(data) {
        // Clearing old managers
        this.managers.clear();

        const { player, level } = data;
        
        if (player) this.register(player);
        if (level && level.enemies) {
            level.enemies.forEach(e => this.register(e));
        }
        console.log('BuffSystem: Battle Started. Managers initialized.');
    }
    
    register(entity) {
        if (!entity.id) return;
        const mgr = new BuffManager(entity);
        mgr.init(); // snapshot stats
        entity.buffManager = mgr; 
        this.managers.set(entity.id, mgr);
    }
    
    onTurnStart(data) {
        // trigger: onTurnStart
        this.managers.forEach(mgr => {
             this.processTriggers(mgr, 'onTurnStart');
        });
    }

    onTurnEnd(data) {
        // trigger: onTurnEnd
        this.managers.forEach(mgr => {
             this.processTriggers(mgr, 'onTurnEnd');
             mgr.tick(); // Process duration / lifecycle
        });
    }
    
    // --- Pipeline Handlers ---
    
    onAttackPre(context) {
        // Context: { source, target, skill, damageMultiplier, armorPenetration ... }
        if (context.source && context.source.buffManager) {
            this.processTriggers(context.source.buffManager, 'onAttackPre', context);
        }
    }

    onTakeDamage(context) {
        // Context: { source, target, finalDamage, ... }
        if (context.target && context.target.buffManager) {
            this.processTriggers(context.target.buffManager, 'onTakeDamage', context);
        }
    }

    onDeathCheck(context) {
        // Context: { target, cancelDeath }
        if (context.target && context.target.buffManager) {
            this.processTriggers(context.target.buffManager, 'onDeath', context);
        }
    }

    onActionExecuted(data) {
        // data: { action: 'ATTACK', source, target, result }
        // We can map this to 'onAttackPost', 'onDefendPost' etc.
        if (data.action === 'ATTACK') {
            const context = {
                damageDealt: data.result ? data.result.damage : 0,
                attacker: data.source,
                defender: data.target
            };
            
            if (data.source && data.source.buffManager) {
                this.processTriggers(data.source.buffManager, 'onAttackPost', context);
            }
            if (data.target && data.target.buffManager) {
                this.processTriggers(data.target.buffManager, 'onDefendPost', context);
            }
        }
    }
    
    processTriggers(manager, triggerName, context = {}) {
        const buffs = manager.getBuffs();
        // 使用倒序或拷贝数组，以防在遍历时 buff 被移除导致跳过元素
        [...buffs].forEach(buff => {
            if (buff.config.effects) {
                buff.config.effects.forEach(effect => {
                    if (effect.trigger === triggerName) {
                        const actionFunc = ActionLibrary[effect.action];
                        if (actionFunc) {
                            let target = manager.owner; // Default 'self'
                            if (effect.target === 'attacker' && context.attacker) {
                                target = context.attacker;
                            }
                            // 'target' in 'onAttackPost' might mean the defender from the perspective of the attacker?
                            // This depends on context.
                            
                            if (target) {
                                // [修改] 传入 buff 实例 (第五个参数)
                                actionFunc(buff.source, target, effect, context, buff);
                            }
                        }
                    }
                });
            }
        });
    }
}

export default new BuffSystem();
