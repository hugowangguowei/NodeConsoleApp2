import EventBus from '../engine/EventBus.js';

/**
 * UI_SkillPanel
 * Manages the interaction for Skill Selection, Action Queue Planning, and Detail View.
 * Follows the "Skill -> Slot" interaction pattern designed in UI_design.md 4.6.
 */
export default class UI_SkillPanel {
    constructor(engine) {
        this.engine = engine;
        // Fix: Ensure eventBus property is available or use this.engine.eventBus
        this.eventBus = engine.eventBus; 
        
        // -- DOM Query --
        this.root = document.querySelector('.skill-panel');
        if (!this.root) {
            console.warn('UI_SkillPanel: Root element .skill-panel not found.');
            return;
        }

        this.poolContainer = this.root.querySelector('.skill-grid-view');
        this.matrixContainer = this.root.querySelector('.action-matrix-container');
        // Detail panel might be inside or outside, assuming structure based on design
        this.detailPanel = document.querySelector('.skill-detail-column'); // Wrapper
        
        this.detailName = document.getElementById('detailName');
        this.detailMeta = document.getElementById('detailMeta');
        this.detailEffect = document.getElementById('detailEffect');
        this.detailTarget = document.getElementById('detailTarget');
        this.detailCosts = document.getElementById('detailCosts');
        this.detailRequirements = document.getElementById('detailRequirements');
        this.detailBuffs = document.getElementById('detailBuffs');
        this.detailTip = document.getElementById('detailTip');
        this.detailTags = document.getElementById('detailTags');

        // -- State --
        this.selectedSkill = null; // Object or ID
        this.cachedSkills = [];    // Loaded from DataManager

        // Deterministic icon cache (avoid icon changing across re-renders)
        this._skillIconCache = new Map();

        // Edit mode: prevents accidental modification of already-placed slots while a skill is armed.
        // When enabled, clicking filled slots will remove that slot assignment instead of being locked.
        this.isEditMode = false;

        // Slot placement interaction state
        // SINGLE: keep selection after placement; replace previous placement for same skill+targetType+part
        // Clicking filled slot cancels (removes) that placement.
        this.placementRules = {
            singleKeepSelection: true,
            singleReplace: true,
            clickFilledToCancel: true,
            disallowOverwriteOtherSkill: true
        };

        // -- Bind --
        this.bindEvents();
        this.bindEngineEvents();
        this.bindGlobalDismiss();

        this._ensureEditModeToggle();

        console.log('UI_SkillPanel initialized.');
    }

    _getSkillSlotLabel(skill) {
        if (!skill) return '?';
        const name = String(skill.name || '').trim();
        if (!name) return '?';

        // Prefer 2-char abbreviation for readability; fallback to 1.
        // Chinese: first 2 chars; Latin: first 2 letters uppercased.
        const latin = name.match(/[A-Za-z0-9]+/g);
        if (latin && latin.length) {
            const token = latin[0];
            return token.slice(0, 2).toUpperCase();
        }

        return name.length >= 2 ? name.slice(0, 2) : name.slice(0, 1);
    }

    _pickSkillIcon(skill) {
        if (!skill) return '⚔️';

        const id = skill.id || '';
        if (id && this._skillIconCache.has(id)) return this._skillIconCache.get(id);

        const name = String(skill.name || '').toLowerCase();
        const desc = String(skill.description || skill.desc || '').toLowerCase();
        const tags = Array.isArray(skill.tags) ? skill.tags.map(t => String(t).toLowerCase()) : [];
        const typeLabel = String(this.getSkillTypeLabel(skill) || '').toLowerCase();

        const hay = [name, desc, typeLabel, ...tags].join(' ');

        const rules = [
            { re: /(he(al|al))|治疗|恢复|regen|revive|复活|药/, icon: '✨' },
            { re: /(shield|block|guard|defen)|护盾|格挡|防御|减伤|免伤/, icon: '🛡️' },
            { re: /(taunt|provoke)|嘲讽/, icon: '📢' },
            { re: /(stun|daze)|眩晕|击晕/, icon: '💫' },
            { re: /(bleed)|流血/, icon: '🩸' },
            { re: /(poison)|中毒|毒/, icon: '☠️' },
            { re: /(burn|fire)|燃烧|火/, icon: '🔥' },
            { re: /(ice|frost|freeze)|冰|冻结|霜/, icon: '🧊' },
            { re: /(thunder|lightning|electric)|雷|电/, icon: '⚡' },
            { re: /(wind)|风/, icon: '🌪️' },
            { re: /(earth|stone)|土|岩/, icon: '🪨' },
            { re: /(holy|light)|圣|光/, icon: '🌟' },
            { re: /(shadow|dark)|暗|影/, icon: '🌑' },
            { re: /(stealth|hide)|潜行|隐身/, icon: '🥷' },
            { re: /(buff)|增益|强化|提升/, icon: '📈' },
            { re: /(debuff)|减益|削弱|降低/, icon: '📉' },
            { re: /(summon)|召唤/, icon: '🧙' },
            { re: /(bow|arrow)|弓|箭/, icon: '🏹' },
            { re: /(gun)|枪|弹/, icon: '🔫' },
            { re: /(dagger|knife)|匕首|短刀|刀/, icon: '🗡️' },
            { re: /(sword|slash)|剑|斩|劈|砍/, icon: '⚔️' },
            { re: /(axe)|斧/, icon: '🪓' },
            { re: /(hammer|mace)|锤|槌/, icon: '🔨' },
            { re: /(spear|lance)|枪|矛|戟/, icon: '🔱' },
            { re: /(punch|fist)|拳|掌/, icon: '👊' },
            { re: /(kick)|踢|腿法/, icon: '🦵' },
            { re: /(dash|step|move|retreat)|冲刺|突进|位移|后撤|闪避/, icon: '💨' },
            { re: /(focus|aim)|专注|瞄准/, icon: '🎯' }
        ];

        let icon = null;
        for (const r of rules) {
            if (r.re.test(hay)) {
                icon = r.icon;
                break;
            }
        }

        if (!icon) {
            if (typeLabel.includes('def')) icon = '🛡️';
            else if (typeLabel.includes('sup') || typeLabel.includes('heal')) icon = '✨';
            else icon = '⚔️';
        }

        if (id) this._skillIconCache.set(id, icon);
        return icon;
    }

    _ensureEditModeToggle() {
        const bar = this.root ? this.root.querySelector('.skill-sort-bar') : null;
        if (!bar) return;

        let btn = bar.querySelector('#btnToggleEditMode');
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'sort-btn';
            btn.id = 'btnToggleEditMode';
            bar.appendChild(btn);
        }

        const render = () => {
            btn.textContent = this.isEditMode ? '编辑模式：开' : '编辑模式：关';
            btn.classList.toggle('active', this.isEditMode);
        };

        render();
        btn.addEventListener('click', () => {
            this.isEditMode = !this.isEditMode;
            render();
        });
    }

    bindGlobalDismiss() {
        // Click-on-blank dismiss: if a skill is currently selected (armed), clicking anywhere
        // outside actionable UI (skill buttons / slots / overlays) will exit selection.
        // Use capture phase so we can observe the click even if inner handlers stop propagation.
        document.addEventListener('click', (e) => {
            if (!this.selectedSkill) return;
            const target = e.target;
            if (!target) return;

            // Do not dismiss when interacting with skill buttons or slots
            if (target.closest('.skill-icon-button')) return;
            if (target.closest('.slot-placeholder')) return;

            // Do not dismiss when interacting with overlays/modals (e.g. skill tree)
            if (target.closest('.overlay-backdrop') || target.closest('.overlay-panel')) return;
            if (target.closest('.modal-backdrop') || target.closest('.modal-panel')) return;

            this._clearSkillSelection();
        }, true);
    }

    _clearSkillSelection() {
        if (this.poolContainer) {
            const btn = this.poolContainer.querySelector('.skill-icon-button.active');
            if (btn) btn.classList.remove('active');
        }
        this.selectedSkill = null;
        this.clearHighlights();
    }

    bindEvents() {
        // Skill Pool Click Delegation
        if (this.poolContainer) {
            this.poolContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.skill-icon-button');
                if (btn && !btn.disabled && !btn.classList.contains('disabled')) {
                    this.onSkillClick(btn);
                }
            });

            // Hover for details
            this.poolContainer.addEventListener('mouseover', (e) => {
                const btn = e.target.closest('.skill-icon-button');
                if (btn) this.showDetail(btn.dataset.id); 
            });
            this.poolContainer.addEventListener('mouseout', () => {
                // Revert to selected skill detail or empty
                if (this.selectedSkill) {
                    this.showDetail(this.selectedSkill.id);
                } else {
                    // Maybe clear? Keep last? For now keep last.
                }
            });
        }

        // Matrix Click Delegation
        if (this.matrixContainer) {
            this.matrixContainer.addEventListener('click', (e) => {
                const slot = e.target.closest('.slot-placeholder');
                if (slot) {
                    // Check if it's a filled slot (action removal) or empty slot (action add)
                    if (slot.classList.contains('filled')) {
                        this.onFilledSlotClick(slot);
                    } else {
                        this.onEmptySlotClick(slot);
                    }
                }
            });

            // Hover logic for queued items
             this.matrixContainer.addEventListener('mouseover', (e) => {
                const slot = e.target.closest('.slot-placeholder.filled');
                if (slot) {
                     // Could show prediction details here
                }
            });
        }

    }

    bindEngineEvents() {
        this.eventBus.on('BATTLE_START', this.onBattleStart.bind(this));
        this.eventBus.on('BATTLE_UPDATE', this.onBattleUpdate.bind(this));
        this.eventBus.on('TURN_START', this.onTurnStart.bind(this));
        // If engine emits specific event for AP change
        this.eventBus.on('PLAYER_STATS_UPDATED', this.updateSkillAvailability.bind(this));
        this.eventBus.on('DATA_UPDATE', this.onDataUpdate.bind(this));
    }

    // --- Event Handlers ---

    onBattleStart(data) {
        // data.player, data.level(enemy)
        const skills = data.player.skills;
        const skillIds = Array.isArray(skills) ? skills : (Array.isArray(skills?.learned) ? skills.learned : []);
        // Use engine.data to fetch configs
        this.cachedSkills = skillIds.map(id => this.engine.data.getSkillConfig(id)).filter(s => s);
        
        // Initialize Matrix Rows (Missing Parts Logic)
        this.buildMatrixFromBattleRules();
        this.initMatrixRows(data.level.enemies[0]); // Assume single enemy focus for MVP
        
        this.renderSkillPool();
        this.clearMatrix();
        this.selectedSkill = null;
    }

    _getSlotSpecFromElement(slotElement) {
        if (!slotElement) return null;
        const part = slotElement.dataset.part;
        const targetType = slotElement.dataset.targetType;
        const slotIndex = Number(slotElement.dataset.slotIndex);
        if (!part || !targetType || !Number.isFinite(slotIndex)) return null;
        return { part, targetType, slotIndex };
    }

    buildMatrixFromBattleRules() {
        if (!this.matrixContainer) return;

        const layout = this.engine?.data?.dataConfig?.runtime?.battleRules?.slotLayout
            || this.engine?.data?.gameConfig?.slotLayouts?.layouts?.[(this.engine?.data?.dataConfig?.battleRules?.slotLayoutId) || 'default_v1']
            || null;

        const rows = Array.isArray(layout?.rows) ? layout.rows : null;
        const slotCounts = layout?.slotCounts && typeof layout.slotCounts === 'object' ? layout.slotCounts : null;
        if (!rows || !slotCounts) return;

        const makeZoneSlots = (zoneEl, part, targetType, count) => {
            zoneEl.innerHTML = '';
            for (let i = 0; i < count; i++) {
                const slot = document.createElement('div');
                slot.className = 'slot-placeholder';
                slot.dataset.part = part;
                slot.dataset.targetType = targetType;
                slot.dataset.slotIndex = String(i);
                zoneEl.appendChild(slot);
            }
        };

        const maxSelf = Math.max(0, ...rows.map(p => Number(slotCounts?.[p]?.self ?? 0) || 0));
        const maxEnemy = Math.max(0, ...rows.map(p => Number(slotCounts?.[p]?.enemy ?? 0) || 0));

        this.matrixContainer.style.setProperty('--matrix-self-max', String(maxSelf));
        this.matrixContainer.style.setProperty('--matrix-enemy-max', String(maxEnemy));

        this.matrixContainer.innerHTML = '';
        rows.forEach(part => {
            const row = document.createElement('div');
            row.className = 'matrix-row';
            row.dataset.rowPart = part;

            const selfZone = document.createElement('div');
            selfZone.className = 'matrix-zone self-zone';
            const enemyZone = document.createElement('div');
            enemyZone.className = 'matrix-zone enemy-zone';

            const label = document.createElement('div');
            label.className = 'matrix-label';
            label.textContent = this.formatPartLabel(part);

            const selfCount = Number(slotCounts?.[part]?.self ?? 0) || 0;
            const enemyCount = Number(slotCounts?.[part]?.enemy ?? 0) || 0;
            makeZoneSlots(selfZone, part, 'self', selfCount);
            makeZoneSlots(enemyZone, part, 'enemy', enemyCount);

            row.appendChild(selfZone);
            row.appendChild(label);
            row.appendChild(enemyZone);
            this.matrixContainer.appendChild(row);
        });
    }

    formatPartLabel(part) {
        const map = {
            head: '头部',
            chest: '胸部',
            abdomen: '腹部',
            arm: '手部',
            leg: '腿部',
            global: '通用'
        };
        return map[part] || part;
    }

    onTurnStart() {
        this.selectedSkill = null;
        this.clearHighlights();
        // Matrix cleared via Engine BATTLE_UPDATE usually, but let's be safe
        this.updateSkillAvailability();
    }

    onBattleUpdate(data) {
        // Refresh Queue Visualization based on engine state
        // Engine might pass 'queues' in data, or we access engine instance
        const playerQueue = this.engine.playerSkillQueue || [];
        this.renderMatrixQueue(playerQueue);
        this.updateSkillAvailability();
    }

    onDataUpdate(payload) {
        const type = payload && typeof payload === 'object' ? payload.type : null;
        if (type && type !== 'PLAYER_SKILLS') return;

        const player = this.engine?.data?.playerData;
        if (!player || !player.skills) return;

        this.refreshSkillsFromPlayer(player);
        this.renderSkillPool();
    }

    refreshSkillsFromPlayer(player) {
        const skills = player?.skills;
        const skillIds = Array.isArray(skills) ? skills : (Array.isArray(skills?.learned) ? skills.learned : []);
        this.cachedSkills = skillIds.map(id => this.engine.data.getSkillConfig(id)).filter(s => s);

        if (this.selectedSkill && !this.cachedSkills.find(s => s.id === this.selectedSkill.id)) {
            this.selectedSkill = null;
            this.clearHighlights();
        }
    }

    onSkillClick(btn) {
        const skillId = btn.dataset.id;
        
        // Toggle Selection
        if (this.selectedSkill && this.selectedSkill.id === skillId) {
            this.selectedSkill = null;
            btn.classList.remove('active');
            this.clearHighlights();
        } else {
            // Deselect previous
            if (this.selectedSkill) {
                const prevBtn = this.poolContainer.querySelector(`.skill-icon-button[data-id="${this.selectedSkill.id}"]`);
                if (prevBtn) prevBtn.classList.remove('active');
            }
            
            this.selectedSkill = this.cachedSkills.find(s => s.id === skillId);
            btn.classList.add('active');
            
            this.showDetail(skillId);
            this.highlightValidSlots();
        }
    }

    onEmptySlotClick(slotElement) {
        if (!this.selectedSkill) return;
        if (!slotElement.classList.contains('highlight-valid')) return; // Only allow mapped slots

        const spec = this._getSlotSpecFromElement(slotElement);
        if (!spec) return;

        const { part, targetType, slotIndex } = spec;
        
        // Resolve Target ID
        // Simplified Logic: 
        // If targetType == 'self', targetId = player.id
        // If targetType == 'enemy', targetId = currentSelectedEnemy.id
        
        const playerId = this.engine.data.playerData.id;
        // Assume first enemy for MVP or get from Selection Manager
        const enemyId = this.engine.data.currentLevelData && this.engine.data.currentLevelData.enemies[0] ? this.engine.data.currentLevelData.enemies[0].id : null; 

        if (!enemyId && targetType === 'enemy') {
            console.warn('No enemy found.');
            return;
        }


        const finalTargetId = (targetType === 'self') ? playerId : enemyId;

        const slotKey = this._makeSlotKey(part, targetType, slotIndex);
        // slotKey-based planning (engine enforces: single replace / cannot overwrite / max placements)
        if (this.engine?.input?.assignSkillToSlot) {
            this.engine.input.assignSkillToSlot({
                slotKey,
                skillId: this.selectedSkill.id,
                targetId: finalTargetId,
                bodyPart: part,
                replaceIfAlreadyPlaced: true
            });
        } else {
            // Fallback (legacy)
            this.engine.input.addSkillToQueue(this.selectedSkill.id, finalTargetId, part);
        }
        
        // Visual feedback handled by BATTLE_UPDATE event re-rendering matrix
    }

    onFilledSlotClick(slotElement) {
        // Option B: existing placements are locked while a skill is armed, to avoid accidental edits.
        // Editing/removal requires explicitly enabling Edit Mode.
        if (this.selectedSkill && !this.isEditMode) {
            this.eventBus?.emit?.('BATTLE_LOG', { text: '已占用槽位已锁定（选择了技能时）。如需修改，请先开启“编辑模式”。' });
            return;
        }

        if (!this.placementRules.clickFilledToCancel) return;

        const spec = this._getSlotSpecFromElement(slotElement);
        if (!spec) return;
        const slotKey = this._makeSlotKey(spec.part, spec.targetType, spec.slotIndex);

        if (this.engine?.input?.unassignSlot) {
            this.engine.input.unassignSlot(slotKey);
        } else {
            // Legacy fallback
            const index = parseInt(slotElement.dataset.queueIndex);
            if (isNaN(index)) return;
            this.engine.input.removeSkillFromQueue(index);
        }
    }

    // --- Render Logic ---

    // Configure Rows based on enemy anatomy
    initMatrixRows(enemyData) {
        if (!this.matrixContainer) return;
        const rows = this.matrixContainer.querySelectorAll('.matrix-row');

        rows.forEach(row => {
            const part = row.dataset.rowPart;
            if (part === 'global') return; // Always valid

            const partData = enemyData.bodyParts && enemyData.bodyParts[part] ? enemyData.bodyParts[part] : null;
            const maxVal = partData ? (partData.max !== undefined ? partData.max : (partData.maxArmor || 0)) : 0;
            const isVisible = maxVal > 0;

            // We only disable the Enemy Zone if part is missing
            const enemyZone = row.querySelector('.enemy-zone');
            if (enemyZone) {
                if (!isVisible) {
                    row.classList.add('enemy-part-missing'); 
                    this.disableZone(enemyZone);
                } else {
                    row.classList.remove('enemy-part-missing');
                    this.enableZone(enemyZone);
                }
            }
        });
    }
    
    disableZone(zoneEl) {
        zoneEl.classList.add('disabled-zone');
        // Clear slots
    }
    enableZone(zoneEl) {
        zoneEl.classList.remove('disabled-zone');
    }

    renderSkillPool() {
        if (!this.poolContainer) return;
        this.poolContainer.innerHTML = '';

        this.cachedSkills.forEach(skill => {
            const btn = document.createElement('button');
            const skillType = this.getSkillTypeLabel(skill);

            // Add rarity class if available, default to common
            const rarityClass = skill.rarity ? `rarity-${skill.rarity.toLowerCase()}` : 'rarity-common';

            btn.className = `skill-icon-button ${rarityClass} type-${skillType.toLowerCase()}`;
            if (this.selectedSkill && this.selectedSkill.id === skill.id) btn.classList.add('active');

            btn.dataset.id = skill.id;
            // Store data for tooltip/sorting
            btn.dataset.cost = this.getSkillApCost(skill);
            btn.dataset.target = this.formatTargetLabel(skill);

            // Create AP Badge
            const badgeAp = document.createElement('span');
            badgeAp.className = 'skill-badge-ap';
            badgeAp.textContent = this.getSkillApCost(skill);

            // Create Center Icon
            const iconCenter = document.createElement('span');
            iconCenter.className = 'skill-icon-center';
            iconCenter.textContent = skill.icon || this._pickSkillIcon(skill);

            // Create Name Bar
            const nameBar = document.createElement('span');
            nameBar.className = 'skill-name-bar';
            nameBar.textContent = skill.name || '未知技能';

            btn.appendChild(badgeAp);
            btn.appendChild(iconCenter);
            btn.appendChild(nameBar);

            this.poolContainer.appendChild(btn);
        });

        this.updateSkillAvailability();
    }

    // Gray out skills if AP not enough
    updateSkillAvailability() {
        const currentAP = this.engine.data.playerData.stats.ap; // This AP usually resets each turn
        // Wait, engine logic: AP is deducted when executing? 
        // CoreEngine line 343: checks AP against (currentQueueCost + skillCost).
        
        // Calculate used AP in queue
        const usedAP = (this.engine.playerSkillQueue || []).reduce((sum, item) => sum + item.cost, 0);
        const remainingAP = currentAP - usedAP;

        const btns = this.poolContainer.querySelectorAll('.skill-icon-button');
        btns.forEach(btn => {
            const skill = this.cachedSkills.find(s => s.id === btn.dataset.id);
            if (!skill) return;

            if (this.getSkillApCost(skill) > remainingAP) {
                btn.classList.add('disabled');
                btn.disabled = true;
            } else {
                btn.classList.remove('disabled');
                btn.disabled = false;
            }
        });
    }

    sortSkills(criteria) {
        // Simplistic sort re-render
        if (criteria === 'cost') {
            this.cachedSkills.sort((a, b) => a.cost - b.cost);
        } else if (criteria === 'target') {
            this.cachedSkills.sort((a, b) => a.targetType.localeCompare(b.targetType));
        }
        this.renderSkillPool();
    }

    // Fill Matrix from Queue
    renderMatrixQueue(queue) {
        this.clearMatrixSlots(); // Just clear content, keep structure

        // Re-populate
        queue.forEach((action, index) => {
            // Find first available slot for this part & target
            // action: { skillId, bodyPart, targetId ... }
            const isSelf = (action.targetId === this.engine.data.playerData.id);
            const targetTypeStr = isSelf ? 'self' : 'enemy';
            
            const row = this.matrixContainer.querySelector(`.matrix-row[data-row-part="${action.bodyPart}"]`);
            if (!row) {
                console.warn(`Row not found for part: ${action.bodyPart}`);
                return;
            }

            const zone = row.querySelector(`.matrix-zone.${targetTypeStr}-zone`);
            if (!zone) return;

            // Find first empty placeholder
            const emptySlot = Array.from(zone.querySelectorAll('.slot-placeholder')).find(el => !el.classList.contains('filled'));
            
            if (emptySlot) {
                this.fillSlot(emptySlot, action, index);
            }
        });
    }

    fillSlot(slotEl, action, queueIndex) {
        slotEl.classList.add('filled');
        slotEl.dataset.queueIndex = queueIndex;

        const isSelf = (action.targetId === this.engine.data.playerData.id);
        const targetTypeStr = isSelf ? 'self' : 'enemy';
        slotEl.dataset.occupiedSkillId = action.skillId;
        slotEl.dataset.occupiedTargetType = targetTypeStr;
        slotEl.dataset.occupiedPart = action.bodyPart;
        slotEl.dataset.occupiedSlotKey = this._makeSlotKey(action.bodyPart, targetTypeStr, Number(slotEl.dataset.slotIndex));

        // Find skill icon
        const skill = this.cachedSkills.find(s => s.id === action.skillId);
        const skillType = (skill && typeof skill.type === 'string') ? skill.type.toLowerCase() : null;
        slotEl.textContent = skill ? (skill.icon || this._getSkillSlotLabel(skill)) : '?';
        if (skill?.name) slotEl.title = skill.name;
        slotEl.classList.add(skillType ? `type-${skillType}` : 'type-neutral');
    }

    clearMatrixSlots() {
        const slots = this.matrixContainer.querySelectorAll('.slot-placeholder');
        slots.forEach(s => {
            s.classList.remove('filled', 'type-offense', 'type-defense', 'type-neutral', 'type-magic');
            s.textContent = '';
            delete s.dataset.queueIndex;
            delete s.dataset.occupiedSkillId;
            delete s.dataset.occupiedTargetType;
            delete s.dataset.occupiedPart;
            delete s.dataset.occupiedSlotKey;
        });
    }

    _makeSlotKey(part, targetType, slotIndex) {
        return `${targetType}:${part}:${slotIndex}`;
    }
    
    clearMatrix() {
        this.clearMatrixSlots();
        // Also resets disabled states if logic requires
    }

    // --- Interaction Feedback ---

    highlightValidSlots() {
        this.clearHighlights();
        if (!this.selectedSkill) return;

        const s = this.selectedSkill;
        const targetInfo = this.getSkillTarget(s);
        const isFriendly = targetInfo.subject === 'SUBJECT_SELF';
        const targetZoneClass = isFriendly ? 'self-zone' : 'enemy-zone';
        const isGlobal = targetInfo.scope === 'SCOPE_ENTITY' || targetInfo.scope === 'SCOPE_MULTI_PARTS';
        const fixedPart = targetInfo.selection && targetInfo.selection.part ? targetInfo.selection.part : null;

        const rows = this.matrixContainer.querySelectorAll('.matrix-row');
        rows.forEach(row => {
            const rowPart = row.dataset.rowPart;
            
            // If Global Skill -> Only highlight Global Row
            if (isGlobal) {
                if (rowPart !== 'global') return;
            } else {
                // If Part Skill -> Skip Global Row
                if (rowPart === 'global') return;
                if (fixedPart && rowPart !== fixedPart) return;
            }

            // Check if row is disabled (Missing Part)
            if (row.classList.contains('enemy-part-missing')) {
                // If it's a Hostile skill targeting a missing part -> Skip
                if (!isFriendly) return;
                // If Friendly skill (e.g. Heal own head), usually OK unless Player missing head?
                // For MVP assume Player Parts always exist.
            }

            const zone = row.querySelector(`.${targetZoneClass}`);
            if (!zone || zone.classList.contains('disabled-zone')) return;
                
            // Highlight empty slots
            const emptySlots = Array.from(zone.querySelectorAll('.slot-placeholder:not(.filled)'));
            emptySlots.forEach(slot => slot.classList.add('highlight-valid'));
        });
    }

    clearHighlights() {
        const slots = this.matrixContainer.querySelectorAll('.slot-placeholder');
        slots.forEach(s => s.classList.remove('highlight-valid'));
    }

    showDetail(skillId) {
        const skill = this.cachedSkills.find(s => s.id === skillId);
        if (!skill) return;

        if (this.detailName) this.detailName.textContent = skill.name;
        if (this.detailMeta) this.detailMeta.textContent = `${this.getSkillTypeLabel(skill)} · AP ${this.getSkillApCost(skill)}`;
        if (this.detailEffect) this.detailEffect.innerHTML = `<strong>效果</strong>：${skill.description || '无'}`;
        if (this.detailTarget) this.detailTarget.innerHTML = `<strong>范围</strong>：${this.formatTargetText(skill)}`;
        if (this.detailCosts) this.detailCosts.innerHTML = `<strong>消耗</strong>：${this.formatCostText(skill)}`;
        if (this.detailRequirements) this.detailRequirements.innerHTML = `<strong>条件</strong>：${this.formatRequirementText(skill)}`;
        if (this.detailBuffs) this.detailBuffs.innerHTML = `<strong>Buff</strong>：${this.formatBuffRefsText(skill)}`;
    }

    getSkillTypeLabel(skill) {
        if (skill && skill.type) return skill.type;
        const tags = Array.isArray(skill?.tags) ? skill.tags : [];
        if (tags.includes('HEAL')) return 'HEAL';
        if (tags.includes('DMG_HP') || tags.includes('DMG_ARMOR') || tags.includes('PIERCE')) return 'DAMAGE';
        if (tags.includes('ARMOR_ADD')) return 'DEFENSE';
        if (tags.includes('BUFF_APPLY') || tags.includes('BUFF_REMOVE')) return 'BUFF';
        return 'SKILL';
    }

    getSkillApCost(skill) {
        if (skill.costs && skill.costs.ap !== undefined) return skill.costs.ap;
        if (skill.cost !== undefined) return skill.cost;
        return 0;
    }

    getSkillTarget(skill) {
        if (skill.target) {
            return {
                subject: skill.target.subject || 'SUBJECT_ENEMY',
                scope: skill.target.scope || 'SCOPE_PART',
                selection: skill.target.selection || {}
            };
        }

        const targetType = skill.targetType;
        if (targetType === 'SELF') return { subject: 'SUBJECT_SELF', scope: 'SCOPE_ENTITY', selection: {} };
        if (targetType === 'SELF_PARTS') return { subject: 'SUBJECT_SELF', scope: 'SCOPE_MULTI_PARTS', selection: { mode: 'SELECT_ALL_PARTS' } };
        if (targetType === 'GLOBAL' || targetType === 'AOE' || targetType === 'ALL_ENEMIES') {
            return { subject: 'SUBJECT_ENEMY', scope: 'SCOPE_MULTI_PARTS', selection: { mode: 'SELECT_ALL_PARTS' } };
        }
        if (targetType === 'RANDOM_PART') {
            return { subject: 'SUBJECT_ENEMY', scope: 'SCOPE_PART', selection: { mode: 'SELECT_RANDOM_PART' } };
        }
        if (targetType === 'SINGLE_PART') {
            return { subject: 'SUBJECT_ENEMY', scope: 'SCOPE_PART', selection: { mode: 'SELECT_FIXED_PART' } };
        }
        return { subject: 'SUBJECT_ENEMY', scope: 'SCOPE_PART', selection: {} };
    }

    formatTargetLabel(skill) {
        const target = this.getSkillTarget(skill);
        const subject = target.subject === 'SUBJECT_SELF' ? 'SELF' : 'ENEMY';
        const scope = target.scope === 'SCOPE_ENTITY' ? 'ENTITY' : (target.scope === 'SCOPE_MULTI_PARTS' ? 'ALL_PARTS' : 'PART');
        return `${subject}_${scope}`;
    }

    formatTargetText(skill) {
        const target = this.getSkillTarget(skill);
        const subject = target.subject === 'SUBJECT_SELF' ? '自身' : '敌方';
        const scopeMap = {
            SCOPE_ENTITY: '本体',
            SCOPE_PART: '部位',
            SCOPE_MULTI_PARTS: '多部位'
        };
        const selectionMode = target.selection && target.selection.mode ? target.selection.mode : '';
        const part = target.selection && target.selection.part ? `（${target.selection.part}）` : '';
        return `${subject} · ${scopeMap[target.scope] || target.scope} ${selectionMode}${part}`.trim();
    }

    formatCostText(skill) {
        const parts = [];
        parts.push(`AP ${this.getSkillApCost(skill)}`);
        if (skill.costs && skill.costs.partSlot) {
            const partSlot = skill.costs.partSlot;
            parts.push(`${partSlot.part || '-'} x${partSlot.slotCost || 1}`);
        }
        return parts.join(' / ');
    }

    formatRequirementText(skill) {
        if (!skill.requirements) return '-';
        return JSON.stringify(skill.requirements);
    }

    formatBuffRefsText(skill) {
        if (!skill.buffRefs) return '-';
        const parts = [];
        if (skill.buffRefs.apply && skill.buffRefs.apply.length) {
            parts.push(`施加:${skill.buffRefs.apply.map(b => b.buffId).join(',')}`);
        }
        if (skill.buffRefs.applySelf && skill.buffRefs.applySelf.length) {
            parts.push(`自施:${skill.buffRefs.applySelf.map(b => b.buffId).join(',')}`);
        }
        if (skill.buffRefs.remove && skill.buffRefs.remove.length) {
            parts.push(`移除:${skill.buffRefs.remove.map(b => b.buffId).join(',')}`);
        }
        return parts.join(' | ') || '-';
    }
}
