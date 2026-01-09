/**
 * @file UI_BattleRow.js
 * @description 战斗主体行 UI 组件，包含玩家状态 (PlayerHUD)、敌人状态 (EnemyHUD) 和战斗场景 (BattleScene)。
 * 负责监听战斗事件并更新界面显示。
 */

class BattleHUD {
    /**
     * @param {HTMLElement} element - HUD 容器元素 (.player-hud 或 .enemy-hud)
     */
    constructor(element) {
        this.dom = {
            root: element,
            name: element.querySelector('h2'),
            hpBar: element.querySelector('.bar.hp span'),
            hpText: element.querySelector('.hud-stat:nth-of-type(1) > span'), // 假设第一个 stats 是 HP
            apBar: element.querySelector('.bar.ap span'),
            apText: element.querySelector('.hud-stat:nth-of-type(2) > span'), // 假设第二个 stats 是 AP
            buffContainer: element.querySelector('.status-row:nth-child(1) .status-icons'), // 需根据实际 DOM 结构调整选择器
            debuffContainer: element.querySelector('.status-row:nth-child(2) .status-icons'),
            armorList: element.querySelector('.armor-list-wrapper')
        };
        
        // 更精确的查找方式，防止依赖顺序
        const statusRows = element.querySelectorAll('.status-row');
        statusRows.forEach(row => {
            const label = row.querySelector('.status-label').textContent.trim();
            if (label === 'BUFF') this.dom.buffContainer = row.querySelector('.status-icons');
            if (label === 'DEBUFF') this.dom.debuffContainer = row.querySelector('.status-icons');
        });

        // 查找包含 HP/AP 的具体的 hud-stat
        const stats = element.querySelectorAll('.hud-stat');
        stats.forEach(stat => {
            const text = stat.textContent;
            if (text.includes('HP')) {
                this.dom.hpText = stat.querySelector('span');
                this.dom.hpBar = stat.querySelector('.bar.hp span');
            }
            if (text.includes('行动力') || text.includes('AP')) {
                this.dom.apText = stat.querySelector('span');
                this.dom.apBar = stat.querySelector('.bar.ap span');
            }
        });
    }

    /**
     * 更新状态面板
     * @param {Object} data - 实体数据 { name, hp, maxHp, ap, maxAp, armor, buffs, ... }
     */
    update(data) {
        if (!data) return;

        // Normalize data access to handle both flat structure (Enemy) and nested stats (Player)
        const getStat = (prop) => {
            if (data[prop] !== undefined) return data[prop];
            if (data.stats && data.stats[prop] !== undefined) return data.stats[prop];
            return 0; // default
        };

        const hp = getStat('hp');
        const maxHp = getStat('maxHp');
        const ap = getStat('ap');
        const maxAp = getStat('maxAp');

        // 更新名称
        if (this.dom.name && data.name) {
            // 保留原有前缀 (如 "玩家：") 只更新名字部分，或者直接更新
            // 这里假设 data.name 是全名，或者根据 UI 设计不做处理
             const prefix = this.dom.root.classList.contains('player-hud') ? '玩家：' : '敌人：';
             this.dom.name.textContent = `${prefix}${data.name}`;
        }

        // 更新 HP
        if (this.dom.hpBar && maxHp > 0) {
            const hpPercent = Math.max(0, Math.min(100, (hp / maxHp) * 100));
            this.dom.hpBar.style.width = `${hpPercent}%`;
            this.dom.hpText.textContent = `HP ${hp} / ${maxHp}`;
        }

        // 更新 AP
        if (this.dom.apBar && maxAp > 0) {
            const apPercent = Math.max(0, Math.min(100, (ap / maxAp) * 100));
            this.dom.apBar.style.width = `${apPercent}%`;
            this.dom.apText.textContent = `行动力（AP） ${ap} / ${maxAp}`;
        }

        // 更新护甲
        // Compatible check for new bodyParts structure or legacy structures
        if (this.dom.armorList && (data.bodyParts || data.armor || (data.equipment && data.equipment.armor))) {
            this.updateArmor(data.bodyParts || data.armor || (data.equipment ? data.equipment.armor : null));
        }

        // 更新状态图标
        if (data.buffs || data.debuffs) { // 假设数据结构中有 buffs/debuffs 数组
            this.updateStatusIcons(data.buffs || [], this.dom.buffContainer, 'buff');
            this.updateStatusIcons(data.debuffs || [], this.dom.debuffContainer, 'debuff'); // 或者 neutral/debuff
        }
    }

    updateArmor(armorData) {
        if (!armorData) return;
        // 清空或更新现有列表。为了性能最好是复用，这里简化为重新渲染文本/进度
        // 假设 DOM 结构是 .armor-row -> .armor-name, .armor-bar, .armor-value
        // 并且 DOM 里的顺序与 armorData 的 keys 对应，或者通过 data-part 绑定
        // 这里采用遍历 DOM 的方式
        const rows = this.dom.armorList.querySelectorAll('.armor-row');
        rows.forEach(row => {
            // Priority: data-key attribute (new standard) > text content matching (legacy fallback)
            let key = row.dataset.key;
            
            if (!key) {
                const nameEl = row.querySelector('.armor-name');
                const partName = nameEl ? nameEl.textContent.trim() : null;
                if (partName === '头部') key = 'head';
                else if (partName === '胸部') key = 'chest';
                else if (partName === '腹部') key = 'abdomen'; // 或 stomach
                else if (partName === '左臂') key = 'left_arm';
                else if (partName === '右臂') key = 'right_arm';
                else if (partName === '左腿') key = 'left_leg';
                else if (partName === '右腿') key = 'right_leg';
            }

            if (key && armorData[key]) {
                const item = armorData[key];
                // Support both { current, max } and { armor, maxArmor } and { durability, maxDurability }
                const current = (item.current !== undefined) ? item.current : (item.armor || item.durability || 0);
                // Note: item.max might be 0, which is valid for unarmored parts
                const max = (item.max !== undefined) ? item.max : (item.maxArmor || item.maxDurability || 0);
                
                const valEl = row.querySelector('.armor-value');
                if (valEl) valEl.textContent = `${current} / ${max}`;

                const barEl = row.querySelector('.armor-bar span');
                if (barEl) {
                    const pct = max > 0 ? (current / max) * 100 : 0;
                    barEl.style.width = `${pct}%`;
                }
            }
        });
    }

    updateStatusIcons(statusList, container, typeClass) {
        if (!container) return;
        container.innerHTML = ''; // 简单清空重绘
        
        if (statusList.length === 0) {
            // 可选：显示“无状态”占位
            return;
        }

        statusList.forEach(status => {
            const icon = document.createElement('div');
            icon.className = `status-icon ${typeClass}`;
            icon.dataset.name = status.name;
            icon.dataset.desc = status.description;
            // 如果有图标 URL，设置 background-image
            if (status.icon) {
                icon.style.backgroundImage = `url(${status.icon})`;
            }
            container.appendChild(icon);
        });
    }
}

class BattleScene {
    constructor(element) {
        this.dom = {
            root: element,
            background: element.querySelector('.stage-background'),
            playerContainer: element.querySelector('.fighter.player-character'),
            enemyContainer: element.querySelector('.fighter.enemy-character'),
            fxLayer: element.querySelector('.fx-layer')
        };
    }

    /**
     * 更新场景元素
     * @param {Object} playerSpriteData 
     * @param {Object} enemySpriteData 
     * @param {String} backgroundUrl 
     */
    update(playerSpriteData, enemySpriteData, backgroundUrl) {
       // 更新背景
       if (backgroundUrl && this.dom.background) {
           // this.dom.background.style.backgroundImage = `url(${backgroundUrl})`; 
           // 实际可能需操纵内部 img 或 div
       }

       // 更新角色立绘 (略，需具体实现 Sprite 渲染逻辑)
    }

    playEffect(effectName, targetArgs) {
        // 在 fxLayer 播放特效
        console.log(`[BattleScene] Playing effect: ${effectName}`);
    }

    showDamageText(text, positionArgs) {
        if (!this.dom.fxLayer) return;
        const el = document.createElement('div');
        el.className = 'damage-text pop-up-anim'; // 假设有对应 CSS 动画
        el.textContent = text;
        // 设置位置...
        this.dom.fxLayer.appendChild(el);
        
        // 动画结束后移除
        setTimeout(() => el.remove(), 1000);
    }
}

export class UI_BattleRow {
    constructor() {
        this.dom = {
            root: null,
            playerHud: null,
            enemyHud: null,
            scene: null
        };
        
        this.components = {
            playerDiff: null,
            enemyDiff: null,
            sceneDiff: null
        };

        this.engine = null;
    }

    /**
     * 输出日志
     * @param {string} msg 
     * @param  {...any} args 
     */
    log(msg, ...args) {
        console.log(`[UI_BattleRow] ${msg}`, ...args);
    }

    /**
     * 初始化
     * @param {Object} engine 
     */
    init(engine) {
        this.engine = engine;
        this.bindDOM();
        this.bindEvents();
        this.log('Initialized.');
    }

    bindDOM() {
        this.dom.root = document.querySelector('.battle-row');
        if (!this.dom.root) {
            console.error('[UI_BattleRow] .battle-row element not found!');
            return;
        }

        const playerEl = this.dom.root.querySelector('.player-hud');
        if (playerEl) {
            this.components.playerDiff = new BattleHUD(playerEl);
        }

        const enemyEl = this.dom.root.querySelector('.enemy-hud');
        if (enemyEl) {
            this.components.enemyDiff = new BattleHUD(enemyEl);
        }

        const sceneEl = this.dom.root.querySelector('.battle-scene');
        if (sceneEl) {
            this.components.sceneDiff = new BattleScene(sceneEl);
        }
    }

    bindEvents() {
        if (!this.engine || !this.engine.eventBus) return;
        
        // 监听战斗开始
        this.engine.eventBus.on('BATTLE_START', this.onBattleStart, this);
        // 监听战斗更新
        this.engine.eventBus.on('BATTLE_UPDATE', this.onBattleUpdate, this);
        // 监听战斗日志/特效
        this.engine.eventBus.on('BATTLE_LOG', this.onBattleLog, this);
        // 监听回合开始
        this.engine.eventBus.on('TURN_START', this.onTurnStart, this);
    }

    onBattleStart(data) {
        this.log('Battle Started', data);
        if (data.player && this.components.playerDiff) {
            this.components.playerDiff.update(data.player);
        }
        
        // Handle BATTLE_START payload which uses { level: ... } instead of { enemies: ... }
        const enemies = data.enemies || (data.level ? data.level.enemies : []);
        
        if (enemies && enemies.length > 0 && this.components.enemyDiff) {
            //目前仅显示第一个敌人
            this.components.enemyDiff.update(enemies[0]);
        }
        // 初始化场景...
    }

    onBattleUpdate(data) {
        // data 结构预期: { player: {...}, enemies: [...], ... }
        if (data.player && this.components.playerDiff) {
            this.components.playerDiff.update(data.player);
        }
        if (data.enemies && data.enemies.length > 0 && this.components.enemyDiff) {
            // 简单处理：始终更新第一个敌人，或者根据 data.selectedTargetId 查找
            this.components.enemyDiff.update(data.enemies[0]);
        }
    }

    onBattleLog(data) {
        // data: { text, action, result, target }
        if (data.result && data.result.damage && this.components.sceneDiff) {
            // 显示伤害飘字
            this.components.sceneDiff.showDamageText(data.result.damage);
        }
    }

    onTurnStart(data) {
        // 回合开始特效
    }
}
