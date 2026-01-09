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
        
        this.btnSortCost = document.querySelector('.sort-btn[data-sort="cost"]');
        this.btnSortTarget = document.querySelector('.sort-btn[data-sort="target"]');
        this.btnSortDefault = document.querySelector('.sort-btn[data-sort="default"]');

        this.detailName = document.getElementById('detailName');
        this.detailMeta = document.getElementById('detailMeta');
        this.detailEffect = document.getElementById('detailEffect');
        this.detailTarget = document.getElementById('detailTarget');
        this.detailTip = document.getElementById('detailTip');
        this.detailTags = document.getElementById('detailTags');

        // -- State --
        this.selectedSkill = null; // Object or ID
        this.cachedSkills = [];    // Loaded from DataManager

        // -- Bind --
        this.bindEvents();
        this.bindEngineEvents();

        console.log('UI_SkillPanel initialized.');
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

        // Sorting
        if (this.btnSortCost) this.btnSortCost.addEventListener('click', () => this.sortSkills('cost'));
        if (this.btnSortTarget) this.btnSortTarget.addEventListener('click', () => this.sortSkills('target'));
        if (this.btnSortDefault) this.btnSortDefault.addEventListener('click', () => this.renderSkillPool()); // Default order
    }

    bindEngineEvents() {
        this.eventBus.on('BATTLE_START', this.onBattleStart.bind(this));
        this.eventBus.on('BATTLE_UPDATE', this.onBattleUpdate.bind(this));
        this.eventBus.on('TURN_START', this.onTurnStart.bind(this));
        // If engine emits specific event for AP change
        this.eventBus.on('PLAYER_STATS_UPDATED', this.updateSkillAvailability.bind(this));
    }

    // --- Event Handlers ---

    onBattleStart(data) {
        // data.player, data.level(enemy)
        const skillIds = data.player.skills || [];
        // Use engine.data to fetch configs
        this.cachedSkills = skillIds.map(id => this.engine.data.getSkillConfig(id)).filter(s => s);
        
        // Initialize Matrix Rows (Missing Parts Logic)
        this.initMatrixRows(data.level.enemies[0]); // Assume single enemy focus for MVP
        
        this.renderSkillPool();
        this.clearMatrix();
        this.selectedSkill = null;
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

        const part = slotElement.dataset.part;
        const targetType = slotElement.dataset.targetType; // 'self' or 'enemy'
        
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

        // Call Engine Input
        this.engine.input.addSkillToQueue(this.selectedSkill.id, finalTargetId, part);
        
        // Visual feedback handled by BATTLE_UPDATE event re-rendering matrix
    }

    onFilledSlotClick(slotElement) {
        // The slot should store the queue index it represents
        const index = parseInt(slotElement.dataset.queueIndex);
        if (isNaN(index)) return;

        this.engine.input.removeSkillFromQueue(index);
    }

    // --- Render Logic ---

    // Configure Rows based on enemy anatomy
    initMatrixRows(enemyData) {
        if (!this.matrixContainer) return;
        const rows = this.matrixContainer.querySelectorAll('.matrix-row');
        
        // Data Design keys: head, chest, abdomen, left_arm, right_arm, left_leg, right_leg
        
        rows.forEach(row => {
            const part = row.dataset.rowPart;
            if (part === 'global') return; // Always valid

            // Check Enemy
            const hasEnemyPart = enemyData.bodyParts && enemyData.bodyParts[part] && (enemyData.bodyParts[part].max > 0 || enemyData.bodyParts[part].maxHp > 0); 
            // Note: Some enemies might have part but 0 armor max, but still hit-able? 
            // Usually if part exists in bodyParts, it is valid. 
            // Data Design says: "For slimes.. max set to 0, UI should hide."
            // So if max is 0, we consider it missing/hidden? Or just unarmored?
            // Let's assume max > 0 means armor exists, but part always exists structurally unless explicitly null?
            // Actually Data Design says: "UI Layer should identify and hide that part".
            // Let's check if max > 0 logic is desired, or if we need a separate flag.
            // For now, let's treat `max > 0` as "visible part".
            
            const isVisible = enemyData.bodyParts && enemyData.bodyParts[part] && enemyData.bodyParts[part].max > 0;

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
            btn.className = `skill-icon-button type-${skill.type.toLowerCase()}`; // e.g., type-offense
            if (this.selectedSkill && this.selectedSkill.id === skill.id) btn.classList.add('active');
            
            btn.dataset.id = skill.id;
            // Store data for tooltip/sorting
            btn.dataset.cost = skill.cost;
            btn.dataset.target = skill.targetType; // SINGLE, AOE, SELF...

            btn.textContent = skill.icon || 'Skill';
            
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

            if (skill.cost > remainingAP) {
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
            // Note: We need to respect index order of queue? 
            // In the "First Available" logic, we just find the first .slot-placeholder that is NOT .filled
            const emptySlot = Array.from(zone.querySelectorAll('.slot-placeholder')).find(el => !el.classList.contains('filled'));
            
            if (emptySlot) {
                this.fillSlot(emptySlot, action, index);
            }
        });
    }

    fillSlot(slotEl, action, queueIndex) {
        slotEl.classList.add('filled');
        slotEl.dataset.queueIndex = queueIndex;
        // Find skill icon
        const skill = this.cachedSkills.find(s => s.id === action.skillId);
        slotEl.textContent = skill ? (skill.icon || 'S') : '?';
        slotEl.classList.add(skill ? `type-${skill.type.toLowerCase()}` : 'type-neutral');
    }

    clearMatrixSlots() {
        const slots = this.matrixContainer.querySelectorAll('.slot-placeholder');
        slots.forEach(s => {
            s.classList.remove('filled', 'type-offense', 'type-defense', 'type-neutral', 'type-magic');
            s.textContent = '';
            delete s.dataset.queueIndex;
        });
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
        // Logic Alignment with Data:
        // Skills have 'type' (DAMAGE, HEAL, BUFF) and 'targetType' (SINGLE_PART, GLOBAL, AOE)
        
        let targetZones = [];
        // Determine Friendly vs Hostile based on Type
        // Simply: HEAL/BUFF/DEFENSE -> Friendly (Self Zone)
        // DAMAGE/DEBUFF/OFFENSE -> Hostile (Enemy Zone)
        const isFriendly = ['HEAL', 'BUFF', 'DEFENSE', 'SUPPORT'].includes(s.type);
        const targetZoneClass = isFriendly ? 'self-zone' : 'enemy-zone';
        
        const isGlobal = (s.targetType === 'GLOBAL' || s.targetType === 'AOE');

        const rows = this.matrixContainer.querySelectorAll('.matrix-row');
        rows.forEach(row => {
            const rowPart = row.dataset.rowPart;
            
            // If Global Skill -> Only highlight Global Row
            if (isGlobal) {
                if (rowPart !== 'global') return;
            } else {
                // If Part Skill -> Skip Global Row
                if (rowPart === 'global') return;
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
        if (this.detailMeta) this.detailMeta.textContent = `${skill.type} · AP ${skill.cost}`;
        if (this.detailEffect) this.detailEffect.innerHTML = `<strong>效果</strong>：${skill.description || '无'}`;
        // ... tags ...
    }
}
