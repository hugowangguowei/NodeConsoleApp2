// Extracted from `test/skill_editor_test_v3.html`.
// Keep code structure as close as possible to avoid regressions.

/* eslint-disable */

export class SkillEditor {
    constructor() {
        // Constants
        this.GRID_SIZE = 100;
        this.NODE_SIZE = 72;
        this.NODE_HALF = this.NODE_SIZE / 2;
        this.CONNECTION_MARGIN = 12;
        this.ANCHOR_HYSTERESIS_PX = 14;
        this.CANVAS_WIDTH = 5000;
        this.CANVAS_HEIGHT = 5000;

        // State
        this.skills = []; // Array of skill objects (editor internal)
        this.buffDict = {}; // buffs.json map
        this.skillPackMeta = null; // skills_melee_v3.json meta
        this.skillPackSchemaVersion = null;
        this.defaultParts = ['head','chest','left_arm','right_arm','left_leg','right_leg'];
        this.enums = {
            rarities: ['Common','Uncommon','Rare','Epic','Legendary'],
            targetSubjects: ['SUBJECT_SELF','SUBJECT_ENEMY','SUBJECT_BOTH'],
            targetScopes: ['SCOPE_ENTITY','SCOPE_PART','SCOPE_MULTI_PARTS'],
            selectionModes: ['single','multiple','random_single','random_multiple'],
            effectTypes: ['DMG_HP','DMG_ARMOR','PIERCE','HEAL','ARMOR_ADD','AP_GAIN','SPEED','BUFF_APPLY','BUFF_REMOVE'],
            amountTypes: ['ABS','PCT_MAX','PCT_CURRENT','SCALING'],
            requirementSelfPartModes: ['ANY','ALL'],
            partOverrideModes: ['fixed','listed'],
            hitModes: ['normal','cannot_dodge','always_crit']
        };
        // Selection (single + multi)
        this.selectedNodeId = null; // backward compat: primary selected
        this.selectedNodeIds = new Set();
        this.primarySelectedNodeId = null;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.draggedNodeId = null;
        
        // Panning State
        this.pan = { x: 0, y: 0 };
        this.zoom = 1;
        this.isPanning = false;
        this.lastMousePos = { x: 0, y: 0 };
        
        // Connection State
        this.selectedConnection = null; // Store { source: id, target: id }
        this.isConnecting = false;
        this.connectionStartId = null;
        this.tempLine = null;

        // DOM Elements
        this.elTransformLayer = document.getElementById('canvas-transform-layer');
        this.elGridCanvas = document.getElementById('grid-layer');
        this.elNodeLayer = document.getElementById('node-layer');
        this.elSvgLayer = document.getElementById('connection-layer');
        this.elPropId = document.getElementById('prop-id');
        this.elPropName = document.getElementById('prop-name');
        this.elPropRarity = document.getElementById('prop-rarity');
        // legacy cost field removed (v3 only)
        this.elPropCost = null;
        this.elPropSpeed = document.getElementById('prop-speed');
        // legacy target fields removed (v3 only)
        this.elPropTargetType = null;
        this.elPropRequiredPart = null;
        this.elTargetPartsBtn = null;
        this.elTargetPartsDropdown = null;
        // legacy type/value/valueType removed (effects[] is the canonical representation)
        this.elPropType = null;
        this.elPropValue = null;
        this.elPropValueType = null;
        this.elPropDesc = document.getElementById('prop-desc');
        this.elPropEffects = document.getElementById('prop-effects');
        this.elEffectsEditor = document.getElementById('effects-editor');
        this.elEffectsList = document.getElementById('effects-list');
        this.elEffectsJsonWrap = document.getElementById('effects-json-wrap');
        this.elBtnAddEffect = document.getElementById('btn-add-effect');
        this.elBtnOpenEffectsJson = document.getElementById('btn-open-effects-json');
        this.elBtnApplyEffectsJson = document.getElementById('btn-apply-effects-json');
        this.elBtnCloseEffectsJson = document.getElementById('btn-close-effects-json');
        this.elBtnValidateEffects = document.getElementById('btn-validate-effects');
        this.elPrereqText = document.getElementById('prop-prerequisites');
        this.elMetaX = document.getElementById('meta-x');
        this.elMetaY = document.getElementById('meta-y');

        // v3 panel fields
        this.elTargetSubject = document.getElementById('prop-target-subject');
        this.elTargetScope = document.getElementById('prop-target-scope');
        this.elSelectionMode = document.getElementById('prop-target-mode');
        this.elSelectionSelectCount = document.getElementById('prop-target-selectCount');
        this.elCostsAp = document.getElementById('prop-costs-ap');
        this.elCostsPerTurnLimit = document.getElementById('prop-costs-perTurnLimit');
        this.elCostsPart = document.getElementById('prop-costs-part');
        this.elCostsSlotCost = document.getElementById('prop-costs-slotCost');
        this.elUnlock = document.getElementById('prop-unlock');
        this.elRequirements = document.getElementById('prop-requirements');
        this.elTags = document.getElementById('prop-tags');
        this.elTagMeta = document.getElementById('prop-tagMeta');
        this.elTagsEditor = document.getElementById('tags-editor');
        this.elTagsSearch = document.getElementById('tags-search');
        this.elErrUnlock = document.getElementById('err-unlock');
        this.elErrCosts = document.getElementById('err-costs');
        this.elErrReq = document.getElementById('err-req');
        this.elErrTags = document.getElementById('err-tags');

        this.elErrId = document.getElementById('err-id');
        this.elErrTarget = document.getElementById('err-target');
        this.elErrBuffs = document.getElementById('err-buffs');
        this.elErrEffects = document.getElementById('err-effects');
        this.elValidateSummary = document.getElementById('prop-validate-summary');
        this.elSummaryText = document.getElementById('prop-summary-text');
        this.elSummaryBadge = document.getElementById('prop-summary-badge');

        // Skill Drawer
        this.elSkillDrawer = document.getElementById('skill-drawer');
        this.elSkillDrawerHandle = document.getElementById('skill-drawer-handle');
        this.elSkillDrawerContent = document.getElementById('skill-drawer-content');
        this.elSkillSearchInput = document.getElementById('skill-search-input');

        // Initialize
        this.initGrid();
        this.attachEvents();

        this.initSkillDrawer();
        
        // Seed minimal nodes
        this.addSkillNode({
            id: 'skill_slash', name: '斩击', rarity: 'Common', costs: { ap: 2, perTurnLimit: 1 }, speed: 0,
            target: {
                subject: 'SUBJECT_ENEMY',
                scope: 'SCOPE_PART',
                selection: {
                    mode: 'single',
                    candidateParts: (this.defaultParts || []).slice(),
                    selectedParts: [],
                    selectCount: 1
                }
            },
            description: '基础的挥砍攻击。',
            prerequisites: [],
            buffRefs: { apply: [], applySelf: [], remove: [] },
            effects: [],
            editorMeta: { x: 100, y: 100 }
        });

        // Apply meta-driven UI defaults (even before loading pack)
        this.applyMetaToUI();

        // Tags editor (enumeration-driven)
        this.initTagsEditor();

        // v3 selection (candidateParts/selectedParts) dropdown interactions
        this.elCandidatePartsBtn = document.getElementById('candidatePartsBtn');
        this.elCandidatePartsDropdown = document.getElementById('candidatePartsDropdown');
        this.elCandidatePartsList = document.getElementById('candidatePartsList');
        this.elSelectedPartsBtn = document.getElementById('selectedPartsBtn');
        this.elSelectedPartsDropdown = document.getElementById('selectedPartsDropdown');
        this.elSelectedPartsList = document.getElementById('selectedPartsList');

        const bindDropdown = (btn, dropdown, listContainer, closeId, allId, noneId, onClose) => {
            if (!btn || !dropdown) return;
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropdown.style.display = (dropdown.style.display === 'none' || !dropdown.style.display) ? 'block' : 'none';
            });
            const closeBtn = document.getElementById(closeId);
            closeBtn?.addEventListener('click', (e) => {
                e.preventDefault();
                dropdown.style.display = 'none';
                onClose?.({ action: 'close' });
            });
            document.getElementById(allId)?.addEventListener('click', (e) => {
                e.preventDefault();
                const boxes = Array.from((listContainer || dropdown).querySelectorAll('input[type="checkbox"]'));
                boxes.forEach(b => b.checked = true);
                onClose?.({ action: 'all' });
            });
            document.getElementById(noneId)?.addEventListener('click', (e) => {
                e.preventDefault();
                const boxes = Array.from((listContainer || dropdown).querySelectorAll('input[type="checkbox"]'));
                boxes.forEach(b => b.checked = false);
                onClose?.({ action: 'none' });
            });

            window.addEventListener('mousedown', (e) => {
                if (dropdown.style.display !== 'block') return;
                const inside = dropdown.contains(e.target) || btn.contains(e.target);
                if (!inside) {
                    dropdown.style.display = 'none';
                    onClose?.({ action: 'close' });
                }
            });

            dropdown.addEventListener('change', () => onClose?.({ action: 'change' }));
        };

        bindDropdown(this.elCandidatePartsBtn, this.elCandidatePartsDropdown, this.elCandidatePartsList, 'candidatePartsClose', 'candidatePartsAll', 'candidatePartsNone', (_evt) => {
            this.commitSelectionPartsFromUI?.();
            this.updateCandidatePartsBtnText?.();
            this.updateSummary?.();
        });
        bindDropdown(this.elSelectedPartsBtn, this.elSelectedPartsDropdown, this.elSelectedPartsList, 'selectedPartsClose', 'selectedPartsAll', 'selectedPartsNone', (_evt) => {
            this.commitSelectionPartsFromUI?.();
            this.updateSelectedPartsBtnText?.();
            this.updateSummary?.();
        });

        // Ensure parts checkboxes exist even before loading a pack
        this.renderPartsCheckboxesFromMeta();

        // Default collapsed
        this.toggleSkillDrawer(false);

        // First render
        this.renderSkillLibrary();
        this.renderNodes();
        this.updateSummary();
    }

    initTagsEditor() {
        if (this.elTagsSearch) {
            this.elTagsSearch.addEventListener('input', () => this.renderTagsEditor());
        }

        // If user edits JSON directly, keep checkbox UI in sync.
        this.elTags?.addEventListener('input', () => {
            this.renderTagsEditor();
        });

        // Delegated checkbox change
        if (!this._tagsDelegated && this.elTagsEditor) {
            this._tagsDelegated = true;
            this.elTagsEditor.addEventListener('change', (e) => {
                const cb = e.target.closest('input[type="checkbox"][data-tag]');
                if (!cb) return;
                this.commitTagsFromUI();
            });
        }
    }

    getTagEnums() {
        const tags = this.skillPackMeta?.enums?.tags;
        if (tags && typeof tags === 'object' && !Array.isArray(tags)) return tags;
        const fallback = this.enums?.tags;
        if (fallback && typeof fallback === 'object' && !Array.isArray(fallback)) return fallback;
        return null;
    }

    getTagFilter() {
        return (this.elTagsSearch?.value || '').trim().toLowerCase();
    }

    getTagsFromTextarea() {
        try {
            const parsed = JSON.parse(this.elTags?.value || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    setTagsToTextarea(tags) {
        if (!this.elTags) return;
        const clean = Array.from(new Set((Array.isArray(tags) ? tags : []).filter(Boolean)));
        this.elTags.value = JSON.stringify(clean, null, 2);
    }

    renderTagsEditor() {
        if (!this.elTagsEditor) return;
        const enums = this.getTagEnums();
        if (!enums) {
            this.elTagsEditor.innerHTML = '<div class="small" style="color:#888;">(no tags enum in meta)</div>';
            return;
        }

        const selected = new Set(this.getTagsFromTextarea());
        const q = this.getTagFilter();

        const escapeHtml = (s) => String(s ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');

        const renderGroup = (key, values) => {
            const list = Array.isArray(values) ? values : [];
            const items = list
                .filter(v => {
                    if (!q) return true;
                    return String(v).toLowerCase().includes(q) || String(key).toLowerCase().includes(q);
                })
                .map(v => {
                    const checked = selected.has(v) ? 'checked' : '';
                    return `
                        <label class="tag-chip" title="${escapeHtml(key)}">
                            <input type="checkbox" data-tag="${escapeHtml(v)}" ${checked} />
                            <span>${escapeHtml(v)}</span>
                        </label>
                    `;
                })
                .join('');
            if (!items) return '';
            return `
                <div class="tag-group" data-tag-group="${escapeHtml(key)}">
                    <div class="small" style="font-weight:700; margin:8px 0 6px;">${escapeHtml(key)}</div>
                    <div class="tag-chip-wrap">${items}</div>
                </div>
            `;
        };

        const blocks = Object.keys(enums)
            .sort((a, b) => a.localeCompare(b))
            .map(k => renderGroup(k, enums[k]))
            .filter(Boolean)
            .join('');

        this.elTagsEditor.innerHTML = blocks || '<div class="small" style="color:#888;">(no tags matched)</div>';
    }

    commitTagsFromUI() {
        if (!this.elTagsEditor) return;
        const tags = Array.from(this.elTagsEditor.querySelectorAll('input[type="checkbox"][data-tag]'))
            .filter(cb => cb.checked)
            .map(cb => cb.getAttribute('data-tag'))
            .filter(Boolean);
        this.setTagsToTextarea(tags);
        this.saveCurrentNode();
    }

    tagsSelectAllFiltered() {
        if (!this.elTagsEditor) return;
        const q = this.getTagFilter();
        Array.from(this.elTagsEditor.querySelectorAll('input[type="checkbox"][data-tag]')).forEach(cb => {
            const v = (cb.getAttribute('data-tag') || '').toLowerCase();
            if (!q || v.includes(q)) cb.checked = true;
        });
        this.commitTagsFromUI();
    }

    tagsSelectNoneFiltered() {
        if (!this.elTagsEditor) return;
        const q = this.getTagFilter();
        Array.from(this.elTagsEditor.querySelectorAll('input[type="checkbox"][data-tag]')).forEach(cb => {
            const v = (cb.getAttribute('data-tag') || '').toLowerCase();
            if (!q || v.includes(q)) cb.checked = false;
        });
        this.commitTagsFromUI();
    }

    initGrid() {
        if (!this.elGridCanvas) return;
        const ctx = this.elGridCanvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;

        for (let x = 0; x <= this.CANVAS_WIDTH; x += this.GRID_SIZE) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.CANVAS_HEIGHT);
            ctx.stroke();
        }
        for (let y = 0; y <= this.CANVAS_HEIGHT; y += this.GRID_SIZE) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.CANVAS_WIDTH, y);
            ctx.stroke();
        }

        // Draw thick boundary for the grid workspace
        ctx.save();
        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 6;
        ctx.strokeRect(0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);
        ctx.restore();
    }

    updateTransform() {
        if (!this.elTransformLayer) return;
        this.elTransformLayer.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoom})`;
    }

    attachEvents() {
        const wrapper = document.getElementById('canvas-wrapper');
        if (!wrapper) return;

        wrapper.addEventListener('mousedown', (e) => {
            if (e.target === wrapper || e.target.id === 'connection-layer' || e.target.id === 'node-layer') {
                this.isPanning = true;
                this.lastMousePos = { x: e.clientX, y: e.clientY };
                wrapper.style.cursor = 'grabbing';
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isPanning) return;
            const dx = e.clientX - this.lastMousePos.x;
            const dy = e.clientY - this.lastMousePos.y;
            this.pan.x += dx;
            this.pan.y += dy;
            this.lastMousePos = { x: e.clientX, y: e.clientY };
            this.updateTransform();
        });

        window.addEventListener('mouseup', () => {
            if (!this.isPanning) return;
            this.isPanning = false;
            wrapper.style.cursor = 'grab';
        });

        wrapper.addEventListener('wheel', (e) => {
            e.preventDefault();
            const scaleAmount = 0.1;
            this.zoom += (e.deltaY < 0 ? scaleAmount : -scaleAmount);
            if (this.zoom < 0.2) this.zoom = 0.2;
            if (this.zoom > 3) this.zoom = 3;
            this.updateTransform();
        }, { passive: false });
    }

    initSkillDrawer() {
        if (this.elSkillDrawerHandle) {
            this.elSkillDrawerHandle.addEventListener('click', () => this.toggleSkillDrawer());
        }
        if (this.elSkillSearchInput) {
            this.elSkillSearchInput.addEventListener('input', () => this.renderSkillLibrary());
            this.elSkillSearchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.elSkillSearchInput.value = '';
                    this.renderSkillLibrary();
                    this.toggleSkillDrawer(false);
                }
            });
        }
    }

    toggleSkillDrawer(forceOpen) {
        if (!this.elSkillDrawer) return;
        const wantOpen = typeof forceOpen === 'boolean' ? forceOpen : !this.elSkillDrawer.classList.contains('open');
        if (wantOpen) this.elSkillDrawer.classList.add('open');
        else this.elSkillDrawer.classList.remove('open');
    }

    renderSkillLibrary() {
        if (!this.elSkillDrawerContent) return;
        const q = (this.elSkillSearchInput?.value || '').trim().toLowerCase();
        const list = this.skills
            .slice()
            .sort((a, b) => (a.name || '').localeCompare((b.name || ''), 'zh-CN'))
            .filter(s => {
                if (!q) return true;
                return (s.name || '').toLowerCase().includes(q) || (s.id || '').toLowerCase().includes(q);
            });

        this.elSkillDrawerContent.innerHTML = '';
        list.forEach(skill => {
            const el = document.createElement('div');
            el.className = 'skill-list-item';
            el.dataset.id = skill.id;
            el.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                    <div style="font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${skill.name || '(unnamed)'}</div>
                </div>
                <div class="meta">${skill.id || ''}</div>
            `;
            el.addEventListener('click', () => {
                this.setPrimarySelection(skill.id);
                const unplaced = !skill.editorMeta || typeof skill.editorMeta.x !== 'number' || typeof skill.editorMeta.y !== 'number';
                if (!unplaced) {
                    const wrapper = document.getElementById('canvas-wrapper');
                    const rect = wrapper.getBoundingClientRect();
                    const centerX = rect.width / 2;
                    const centerY = rect.height / 2;
                    this.pan.x = centerX - (skill.editorMeta.x + this.NODE_HALF) * this.zoom;
                    this.pan.y = centerY - (skill.editorMeta.y + this.NODE_HALF) * this.zoom;
                    this.updateTransform();
                }
                this.renderNodes();
                this.loadProperties(skill);
            });
            this.elSkillDrawerContent.appendChild(el);
        });
    }

    addSkillNode(skill = {}) {
        if (!skill.editorMeta) skill.editorMeta = { x: 14, y: 14 };
        this.skills.push(skill);
        this.renderNodes();
        this.renderSkillLibrary();
    }

    renderNodes() {
        if (!this.elNodeLayer) return;
        this.elNodeLayer.innerHTML = '';
        this.skills.forEach(skill => {
            const el = document.createElement('div');
            el.className = `skill-node rarity-${(skill.rarity || 'common').toLowerCase()}`;
            if ((this.selectedNodeIds && this.selectedNodeIds.has(skill.id)) || this.selectedNodeId === skill.id) {
                el.classList.add('selected');
            }
            const x = skill.editorMeta?.x ?? 0;
            const y = skill.editorMeta?.y ?? 0;
            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
            el.dataset.id = skill.id;
            el.innerHTML = `
                <div>${skill.name || ''}</div>
                <div style="font-size:10px; color:#666">AP: ${skill.costs?.ap ?? 0}</div>
                <div class="node-anchor anchor-top" data-dir="top"></div>
                <div class="node-anchor anchor-right" data-dir="right"></div>
                <div class="node-anchor anchor-bottom" data-dir="bottom"></div>
                <div class="node-anchor anchor-left" data-dir="left"></div>
            `;
            el.addEventListener('mousedown', (e) => this.onNodeMouseDown(e, skill));
            this.elNodeLayer.appendChild(el);
        });

        this.renderConnections();
    }

    // ---- Migrated core editor logic (adapted from v2 extraction) ----

    snapToGrid(pos) {
        const col = Math.round((pos.x - 14) / this.GRID_SIZE);
        const row = Math.round((pos.y - 14) / this.GRID_SIZE);
        pos.x = col * this.GRID_SIZE + 14;
        pos.y = row * this.GRID_SIZE + 14;
    }

    clearSelection() {
        this.selectedNodeIds?.clear();
        this.primarySelectedNodeId = null;
        this.selectedNodeId = null;
    }

    setPrimarySelection(id, { keepOthers = false } = {}) {
        if (!id) return;
        if (!keepOthers) this.selectedNodeIds.clear();
        this.selectedNodeIds.add(id);
        this.primarySelectedNodeId = id;
        this.selectedNodeId = id;
    }

    toggleSelection(id) {
        if (!id) return;
        if (this.selectedNodeIds.has(id)) {
            this.selectedNodeIds.delete(id);
            if (this.primarySelectedNodeId === id) {
                const next = this.selectedNodeIds.values().next();
                const newPrimary = next && !next.done ? next.value : null;
                this.primarySelectedNodeId = newPrimary;
                this.selectedNodeId = newPrimary;
            }
        } else {
            this.selectedNodeIds.add(id);
            this.primarySelectedNodeId = id;
            this.selectedNodeId = id;
        }
        if (!this.primarySelectedNodeId) this.selectedNodeId = null;
    }

    attachEvents() {
        const wrapper = document.getElementById('canvas-wrapper');
        if (!wrapper) return;

        wrapper.addEventListener('mousedown', (e) => {
            if (e.target === wrapper || e.target.id === 'connection-layer' || e.target.id === 'node-layer') {
                this.isPanning = true;
                this.selectedConnection = null;
                this.clearSelection();
                this.renderNodes();
                this.renderConnections();
                this.loadProperties(null);

                this.lastMousePos = { x: e.clientX, y: e.clientY };
                wrapper.style.cursor = 'grabbing';
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isConnecting) {
                this.updateConnectionDrag(e);
            } else if (this.isDragging && this.draggedNodeId) {
                const node = this.getSkillById(this.draggedNodeId);
                if (node) {
                    const dx = (e.clientX - this.lastMousePos.x) / this.zoom;
                    const dy = (e.clientY - this.lastMousePos.y) / this.zoom;
                    if (this.selectedNodeIds && this.selectedNodeIds.size > 0 && this.selectedNodeIds.has(this.draggedNodeId)) {
                        this.skills.forEach(s => {
                            if (this.selectedNodeIds.has(s.id) && s.editorMeta) {
                                s.editorMeta.x += dx;
                                s.editorMeta.y += dy;
                            }
                        });
                    } else {
                        node.editorMeta.x += dx;
                        node.editorMeta.y += dy;
                    }
                    this.lastMousePos = { x: e.clientX, y: e.clientY };
                    this.renderNodes();
                }
            } else if (this.isPanning) {
                const dx = e.clientX - this.lastMousePos.x;
                const dy = e.clientY - this.lastMousePos.y;
                this.pan.x += dx;
                this.pan.y += dy;
                this.lastMousePos = { x: e.clientX, y: e.clientY };
                this.updateTransform();
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (this.isConnecting) {
                this.endConnectionDrag(e);
            }
            if (this.isDragging) {
                if (this.selectedNodeIds && this.selectedNodeIds.size > 0 && this.draggedNodeId && this.selectedNodeIds.has(this.draggedNodeId)) {
                    this.skills.forEach(s => {
                        if (this.selectedNodeIds.has(s.id) && s.editorMeta) this.snapToGrid(s.editorMeta);
                    });
                    this.renderNodes();
                } else {
                    const node = this.getSkillById(this.draggedNodeId);
                    if (node) {
                        this.snapToGrid(node.editorMeta);
                        this.renderNodes();
                    }
                }
                this.isDragging = false;
                this.draggedNodeId = null;
            }
            if (this.isPanning) {
                this.isPanning = false;
                wrapper.style.cursor = 'grab';
            }
        });

        wrapper.addEventListener('wheel', (e) => {
            e.preventDefault();
            const scaleAmount = 0.1;
            this.zoom += (e.deltaY < 0 ? scaleAmount : -scaleAmount);
            if (this.zoom < 0.2) this.zoom = 0.2;
            if (this.zoom > 3) this.zoom = 3;
            this.updateTransform();
        }, { passive: false });

        // Property Inputs: save on blur / Enter (exclude JSON textareas)
        // NOTE: keep auto-save for atomic fields; JSON areas remain explicit-save.
        const autoSaveInputs = [
            this.elPropName,
            this.elPropSpeed,
            this.elPropDesc,
            // costs
            this.elCostsAp,
            this.elCostsPerTurnLimit,
            this.elCostsSlotCost,
        ].filter(Boolean);
        autoSaveInputs.forEach((el) => {
            el.addEventListener('blur', () => this.saveCurrentNode());
            if (el.tagName && el.tagName.toLowerCase() === 'textarea') return;
            el.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    this.saveCurrentNode();
                }
            });
        });

        this.elPropRarity?.addEventListener('change', () => this.saveCurrentNode());
        this.elTargetSubject?.addEventListener('change', () => this.saveCurrentNode());
        this.elTargetScope?.addEventListener('change', () => this.saveCurrentNode());
        this.elSelectionMode?.addEventListener('change', () => this.saveCurrentNode());

        // Select fields should save on change
        this.elCostsPart?.addEventListener('change', () => this.saveCurrentNode());

        window.addEventListener('keydown', (e) => {
            const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
            const isEditable = tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable);
            if (isEditable) return;
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (this.selectedConnection) this.deleteSelectedConnection();
                else if (this.selectedNodeIds && this.selectedNodeIds.size > 0) this.deleteSelectedNodes();
            }
        });
    }

    deleteSelectedNodes() {
        if (!this.selectedNodeIds || this.selectedNodeIds.size === 0) return;
        const ids = Array.from(this.selectedNodeIds);
        if (!confirm(`确认删除 ${ids.length} 个技能？`)) return;
        ids.forEach(id => {
            const idx = this.skills.findIndex(s => s.id === id);
            if (idx >= 0) this.skills.splice(idx, 1);
        });
        this.skills.forEach(s => {
            if (Array.isArray(s.prerequisites)) s.prerequisites = s.prerequisites.filter(p => !this.selectedNodeIds.has(p));
        });
        this.clearSelection();
        this.renderNodes();
        this.renderSkillLibrary();
        this.loadProperties(null);
    }

    onNodeMouseDown(e, skill) {
        e.stopPropagation();
        if (e.ctrlKey) {
            if (this.selectedNodeIds.has(skill.id)) this.setPrimarySelection(skill.id, { keepOthers: true });
            else this.toggleSelection(skill.id);
        } else {
            this.setPrimarySelection(skill.id);
        }
        this.selectedConnection = null;

        if (this.primarySelectedNodeId && this.selectedNodeIds.size === 1) this.loadProperties(skill);
        else this.loadProperties(null);

        this.renderNodes();
        this.renderConnections();

        if (e.target.classList.contains('node-anchor')) {
            this.startConnectionDrag(skill.id, e);
        } else {
            if (!this.selectedNodeIds.has(skill.id)) {
                this.setPrimarySelection(skill.id);
                this.renderNodes();
            }
            this.isDragging = true;
            this.draggedNodeId = skill.id;
            this.lastMousePos = { x: e.clientX, y: e.clientY };
        }
    }

    // Connections
    renderConnections() {
        if (!this.elSvgLayer) return;
        const defs = this.elSvgLayer.querySelector('defs')?.outerHTML || '';
        this.elSvgLayer.innerHTML = defs;
        this.elTempLineGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.elSvgLayer.appendChild(this.elTempLineGroup);

        this.skills.forEach(skill => {
            const parents = Array.isArray(skill.prerequisites) ? skill.prerequisites : [];
            parents.forEach(parentId => {
                const target = this.getSkillById(parentId);
                if (target) this.drawConnection(target, skill);
            });
        });
    }

    getLayerPos(clientX, clientY) {
        const rect = document.getElementById('canvas-wrapper').getBoundingClientRect();
        return { x: (clientX - rect.left - this.pan.x) / this.zoom, y: (clientY - rect.top - this.pan.y) / this.zoom };
    }

    snapToGridLine(v) {
        return Math.round(v / this.GRID_SIZE) * this.GRID_SIZE;
    }

    getAdaptiveAnchors(sourceNode, targetNode) {
        const s = sourceNode.editorMeta || { x: 0, y: 0 };
        const t = targetNode.editorMeta || { x: 0, y: 0 };
        const sCenterY = s.y + this.NODE_HALF;
        const tCenterY = t.y + this.NODE_HALF;
        const key = `${sourceNode.id}->${targetNode.id}`;
        const prev = this._edgeAnchorCache?.get(key);
        const dy = sCenterY - tCenterY;
        let verticalDir;
        if (prev && Math.abs(dy) < this.ANCHOR_HYSTERESIS_PX) verticalDir = prev;
        else verticalDir = (sCenterY <= tCenterY) ? 'down' : 'up';
        if (!this._edgeAnchorCache) this._edgeAnchorCache = new Map();
        this._edgeAnchorCache.set(key, verticalDir);
        if (verticalDir === 'down') {
            return [
                { x: s.x + this.NODE_HALF, y: s.y + this.NODE_SIZE, dir: 'bottom' },
                { x: t.x + this.NODE_HALF, y: t.y, dir: 'top' },
            ];
        }
        return [
            { x: s.x + this.NODE_HALF, y: s.y, dir: 'top' },
            { x: t.x + this.NODE_HALF, y: t.y + this.NODE_SIZE, dir: 'bottom' },
        ];
    }

    drawConnection(sourceNode, targetNode) {
        const [start, end] = this.getAdaptiveAnchors(sourceNode, targetNode);
        const margin = this.CONNECTION_MARGIN;
        const leaveY = start.dir === 'bottom' ? start.y + margin : start.y - margin;
        const enterY = end.dir === 'top' ? end.y - margin : end.y + margin;
        let midY = (leaveY + enterY) / 2;
        midY = this.snapToGridLine(midY);
        const points = [
            [start.x, start.y],
            [start.x, leaveY],
            [end.x, midY],
            [end.x, enterY],
            [end.x, end.y],
        ];
        const pathStr = points.map(p => `${p[0]},${p[1]}`).join(' ');
        const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        polyline.setAttribute('points', pathStr);
        polyline.setAttribute('class', 'connection-line');
        polyline.setAttribute('marker-end', 'url(#arrowhead)');
        if (this.selectedConnection && this.selectedConnection.source === sourceNode.id && this.selectedConnection.target === targetNode.id) {
            polyline.setAttribute('stroke', '#ff0000');
            polyline.setAttribute('stroke-width', '4');
        }
        polyline.addEventListener('click', (ev) => {
            ev.stopPropagation();
            this.selectedConnection = { source: sourceNode.id, target: targetNode.id };
            this.clearSelection();
            this.renderNodes();
            this.renderConnections();
        });
        this.elSvgLayer.appendChild(polyline);
    }

    startConnectionDrag(nodeId, e) {
        this.isConnecting = true;
        this.connectionStartId = nodeId;
        this.tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        this.tempLine.setAttribute('stroke', '#ff9900');
        this.tempLine.setAttribute('stroke-width', '2');
        this.tempLine.setAttribute('stroke-dasharray', '5,5');
        this.tempLine.setAttribute('marker-end', 'url(#arrowhead)');
        const startPos = this.getLayerPos(e.clientX, e.clientY);
        this.tempLine.setAttribute('x1', startPos.x);
        this.tempLine.setAttribute('y1', startPos.y);
        this.tempLine.setAttribute('x2', startPos.x);
        this.tempLine.setAttribute('y2', startPos.y);
        this.elTempLineGroup?.appendChild(this.tempLine);
    }

    updateConnectionDrag(e) {
        if (!this.tempLine) return;
        const currPos = this.getLayerPos(e.clientX, e.clientY);
        this.tempLine.setAttribute('x2', currPos.x);
        this.tempLine.setAttribute('y2', currPos.y);
    }

    endConnectionDrag(e) {
        this.isConnecting = false;
        if (this.tempLine) {
            this.tempLine.remove();
            this.tempLine = null;
        }
        let targetEl = e.target;
        while (targetEl && !targetEl.classList?.contains('skill-node') && targetEl !== document.body) {
            targetEl = targetEl.parentElement;
        }
        if (targetEl && targetEl.classList.contains('skill-node')) {
            const targetId = targetEl.dataset.id;
            if (targetId && targetId !== this.connectionStartId) {
                this.createConnection(this.connectionStartId, targetId);
            }
        }
        this.connectionStartId = null;
    }

    createConnection(sourceId, targetId) {
        const targetSkill = this.getSkillById(targetId);
        if (!targetSkill) return;
        if (!Array.isArray(targetSkill.prerequisites)) targetSkill.prerequisites = [];
        if (targetSkill.prerequisites.includes(sourceId)) return;
        targetSkill.prerequisites.push(sourceId);
        this.renderNodes();
    }

    deleteSelectedConnection() {
        if (!this.selectedConnection) return;
        const { source, target } = this.selectedConnection;
        const targetSkill = this.getSkillById(target);
        if (targetSkill && Array.isArray(targetSkill.prerequisites)) {
            targetSkill.prerequisites = targetSkill.prerequisites.filter(pid => pid !== source);
        }
        this.selectedConnection = null;
        this.renderConnections();
    }

    // Actions
    createNewSkill() {
        const newId = 'skill_' + Date.now();
        const vX = (-this.pan.x + 200) / this.zoom;
        const vY = (-this.pan.y + 200) / this.zoom;
        this.addSkillNode({
            id: newId,
            name: '新技能',
            rarity: 'Common',
            costs: { ap: 1, perTurnLimit: 1 },
            speed: 0,
            target: {
                subject: 'SUBJECT_ENEMY',
                scope: 'SCOPE_PART',
                selection: { mode: 'single', candidateParts: (this.defaultParts || []).slice(), selectedParts: [], selectCount: 1 }
            },
            prerequisites: [],
            buffRefs: { apply: [], applySelf: [], remove: [] },
            effects: [],
            editorMeta: { x: vX, y: vY }
        });
    }

    clearCanvas() {
        if (!confirm('确认清空所有内容？')) return;
        this.skills = [];
        this.clearSelection();
        this.renderNodes();
        this.renderSkillLibrary();
        this.loadProperties(null);
    }

    autoLayout() {
        alert('自动布局功能尚未实现。');
    }

    duplicateCurrentNode() {
        if (!this.selectedNodeId) return;
        const src = this.getSkillById(this.selectedNodeId);
        if (!src) return;
        const copy = JSON.parse(JSON.stringify(src));
        copy.id = `${src.id}_copy_${Date.now()}`;
        copy.name = `${src.name || 'Skill'} (Copy)`;
        copy.prerequisites = Array.isArray(src.prerequisites) ? [...src.prerequisites] : [];
        copy.editorMeta = { x: (src.editorMeta?.x ?? 14) + 100, y: (src.editorMeta?.y ?? 14) + 0 };
        this.addSkillNode(copy);
    }

    deleteCurrentNode() {
        if (!this.selectedNodeId) return;
        if (!confirm('确认删除技能 ' + this.selectedNodeId + '?')) return;
        this.skills = this.skills.filter(s => s.id !== this.selectedNodeId);
        this.skills.forEach(s => {
            if (Array.isArray(s.prerequisites)) s.prerequisites = s.prerequisites.filter(pid => pid !== this.selectedNodeId);
        });
        this.clearSelection();
        this.renderNodes();
        this.renderSkillLibrary();
        this.loadProperties(null);
    }

    // Pack meta
    setSkillPackMeta(meta, schemaVersion) {
        if (meta && typeof meta === 'object') {
            this.skillPackMeta = meta;
            if (Array.isArray(meta.defaultParts) && meta.defaultParts.length) this.defaultParts = meta.defaultParts.slice();
            if (meta.enums && typeof meta.enums === 'object') {
                // Merge enums carefully to keep nested objects (e.g. enums.tags)
                const existing = (this.enums && typeof this.enums === 'object') ? this.enums : {};
                const incoming = meta.enums;
                const merged = { ...existing, ...incoming };
                if (incoming.tags && typeof incoming.tags === 'object' && !Array.isArray(incoming.tags)) {
                    merged.tags = {
                        ...(existing.tags && typeof existing.tags === 'object' && !Array.isArray(existing.tags) ? existing.tags : {}),
                        ...incoming.tags,
                    };
                }
                this.enums = merged;
            }

            // Ensure meta.enums exists so callers can use this.skillPackMeta.enums.tags safely.
            if (!this.skillPackMeta.enums || typeof this.skillPackMeta.enums !== 'object') {
                this.skillPackMeta.enums = {};
            }
            if (!this.skillPackMeta.enums.tags && this.enums?.tags) {
                this.skillPackMeta.enums.tags = this.enums.tags;
            }
        }
        if (schemaVersion) this.skillPackSchemaVersion = schemaVersion;
        this.applyMetaToUI();
        this.renderPartsCheckboxesFromMeta();
        this.renderTagsEditor();
    }

    renderPartsCheckboxesFromMeta() {
        const parts = Array.isArray(this.defaultParts) ? this.defaultParts : [];
        const render = (container) => {
            if (!container) return;
            container.innerHTML = parts.map(p => `<label style="display:flex; gap:8px; align-items:center; margin:4px 0;"><input type="checkbox" value="${p}"> <span>${p}</span></label>`).join('');
        };
        render(this.elCandidatePartsList);
        render(this.elSelectedPartsList);
        this.updateCandidatePartsBtnText();
        this.updateSelectedPartsBtnText();
    }

    normalizeImportedSkills(newSkills) {
        newSkills.forEach((skill, index) => {
            if (skill.preRequisite && !skill.prerequisites) {
                skill.prerequisites = [skill.preRequisite];
                delete skill.preRequisite;
            }
            if (skill.preRequisites && !skill.prerequisites) {
                skill.prerequisites = skill.preRequisites;
                delete skill.preRequisites;
            }
            if (!Array.isArray(skill.prerequisites)) skill.prerequisites = [];
            if (!skill.buffRefs) skill.buffRefs = { apply: [], applySelf: [], remove: [] };
            if (!skill.buffRefs.apply) skill.buffRefs.apply = [];
            if (!skill.buffRefs.applySelf) skill.buffRefs.applySelf = [];
            if (!skill.buffRefs.remove) skill.buffRefs.remove = [];
            if (!Array.isArray(skill.effects)) skill.effects = [];
            if (!skill.editorMeta) {
                const col = index % 10;
                const row = Math.floor(index / 10);
                skill.editorMeta = { x: col * this.GRID_SIZE + 14, y: row * this.GRID_SIZE + 14 };
            } else {
                this.snapToGrid(skill.editorMeta);
            }
            if (!skill.costs) skill.costs = { ap: 0, perTurnLimit: 1 };
            if (!skill.target) {
                skill.target = { subject: 'SUBJECT_ENEMY', scope: 'SCOPE_PART', selection: { mode: 'single', candidateParts: (this.defaultParts || []).slice(), selectedParts: [], selectCount: 1 } };
            }
            if (!skill.target.selection) {
                skill.target.selection = { mode: 'single', candidateParts: (this.defaultParts || []).slice(), selectedParts: [], selectCount: 1 };
            }
        });
    }

    async loadProjectData() {
        try {
            const [skillsResp, buffsResp] = await Promise.all([
                fetch('../assets/data/skills_melee_v3.json'),
                fetch('../assets/data/buffs.json')
            ]);
            const skillsData = await skillsResp.json();
            const buffsData = await buffsResp.json();
            this.buffDict = buffsData || {};
            if (!skillsData || typeof skillsData !== 'object' || !Array.isArray(skillsData.skills)) {
                throw new Error('skills 数据格式不合法：必须是 v3 pack { meta, skills: [] }');
            }
            this.setSkillPackMeta(skillsData.meta || null, skillsData.$schemaVersion || null);
            const newSkills = [];
            skillsData.skills.forEach((sk) => {
                if (!sk || typeof sk !== 'object') return;
                if (!sk.id) return;
                newSkills.push(JSON.parse(JSON.stringify(sk)));
            });
            this.normalizeImportedSkills(newSkills);
            this.skills = newSkills;
            this.clearSelection();
            this.renderNodes();
            this.renderSkillLibrary();
            this.pan = { x: 0, y: 0 };
            this.zoom = 1;
            this.updateTransform();
            this.loadProperties(null);
            alert(`Loaded skills: ${this.skills.length}, buffs: ${Object.keys(this.buffDict).length}`);
        } catch (e) {
            console.error(e);
            alert('Load Project Data failed: ' + (e.message || String(e)));
        }
    }

    importJsonFile(input) {
        const file = input?.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                const newSkills = [];
                if (Array.isArray(data)) {
                    data.forEach(s => newSkills.push(s));
                } else if (data && typeof data === 'object' && Array.isArray(data.skills)) {
                    this.setSkillPackMeta(data.meta || null, data.$schemaVersion || null);
                    data.skills.forEach((sk) => {
                        if (!sk || typeof sk !== 'object') return;
                        if (!sk.id) return;
                        newSkills.push(JSON.parse(JSON.stringify(sk)));
                    });
                } else if (typeof data === 'object' && data !== null) {
                    Object.keys(data).forEach(k => {
                        const s = data[k];
                        if (!s.id) s.id = k;
                        newSkills.push(s);
                    });
                } else {
                    throw new Error('未知 JSON 格式');
                }
                this.normalizeImportedSkills(newSkills);
                if (confirm(`解析成功：${newSkills.length} skills。覆盖当前画布？`)) {
                    this.skills = newSkills;
                    this.clearSelection();
                    this.renderNodes();
                    this.renderSkillLibrary();
                    this.loadProperties(null);
                }
            } catch (err) {
                console.error(err);
                alert('导入失败: ' + (err.message || String(err)));
            }
            input.value = '';
        };
        reader.readAsText(file);
    }

    exportJson(includeEditorMeta = true) {
        const skillsV3 = this.skills.map(s => {
            const clone = JSON.parse(JSON.stringify(s));
            if (!includeEditorMeta) delete clone.editorMeta;
            return clone;
        });
        const pack = {
            $schemaVersion: this.skillPackSchemaVersion || 'skills_melee_v3',
            meta: this.skillPackMeta || {
                title: 'Skills Export',
                source: 'skill_editor_test_v3',
                notes: ['exported by skill_editor_test_v3.html'],
                defaultParts: (this.defaultParts || []).slice(),
                enums: this.enums
            },
            skills: skillsV3
        };
        const jsonStr = JSON.stringify(pack, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = includeEditorMeta ? 'skills_melee_v3_export.dev.json' : 'skills_melee_v3_export.runtime.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    setError(el, msg) {
        if (!el) return;
        if (!msg) {
            el.style.display = 'none';
            el.textContent = '';
        } else {
            el.style.display = 'block';
            el.textContent = msg;
        }
    }

    loadProperties(skill) {
        if (!skill) {
            const count = this.selectedNodeIds ? this.selectedNodeIds.size : 0;
            document.getElementById('btn-save').disabled = true;
            document.getElementById('btn-dup').disabled = count !== 1;
            document.getElementById('btn-del').disabled = count === 0;
            document.getElementById('btn-add-apply').disabled = true;
            document.getElementById('btn-add-applySelf').disabled = true;
            document.getElementById('btn-add-remove').disabled = true;
            if (this.elBtnAddEffect) this.elBtnAddEffect.disabled = true;
            if (this.elBtnOpenEffectsJson) this.elBtnOpenEffectsJson.disabled = true;
            if (this.elBtnApplyEffectsJson) this.elBtnApplyEffectsJson.disabled = true;
            if (this.elBtnCloseEffectsJson) this.elBtnCloseEffectsJson.disabled = true;
            if (this.elBtnValidateEffects) this.elBtnValidateEffects.disabled = true;
            const btnSaveEffects = document.getElementById('btn-save-effects');
            if (btnSaveEffects) btnSaveEffects.disabled = true;

            this.elPropId.value = '';
            this.elPropName.value = '';
            this.elPropSpeed.value = '';
            this.elPropDesc.value = '';
            if (this.elPropEffects) this.elPropEffects.value = '[]';
            if (this.elEffectsList) this.elEffectsList.innerHTML = '<span style="color:#888;">(no effects)</span>';
            this.elPrereqText.textContent = '—';
            this.elMetaX.value = '';
            this.elMetaY.value = '';

            if (count > 1) {
                this.elValidateSummary.textContent = `Multi-select: ${count} nodes`;
                this.elSummaryText.textContent = '多选模式：属性面板只读。可拖拽成组移动，或按 Delete 批量删除。';
                this.elSummaryBadge.textContent = `${count}`;
            } else {
                this.elValidateSummary.textContent = 'No selection';
                this.elSummaryText.textContent = 'Select a node to edit...';
                this.elSummaryBadge.textContent = '—';
            }

            this.setError(this.elErrId, null);
            this.setError(this.elErrTarget, null);
            this.setError(this.elErrBuffs, null);
            this.setError(this.elErrEffects, null);
            this.setError(this.elErrTags, null);
            return;
        }

        document.getElementById('btn-save').disabled = false;
        document.getElementById('btn-del').disabled = false;
        document.getElementById('btn-dup').disabled = false;
        document.getElementById('btn-add-apply').disabled = false;
        document.getElementById('btn-add-applySelf').disabled = false;
        document.getElementById('btn-add-remove').disabled = false;
        if (this.elBtnAddEffect) this.elBtnAddEffect.disabled = false;
        if (this.elBtnOpenEffectsJson) this.elBtnOpenEffectsJson.disabled = false;
        if (this.elBtnApplyEffectsJson) this.elBtnApplyEffectsJson.disabled = false;
        if (this.elBtnCloseEffectsJson) this.elBtnCloseEffectsJson.disabled = false;
        if (this.elBtnValidateEffects) this.elBtnValidateEffects.disabled = false;
        const btnSaveEffects = document.getElementById('btn-save-effects');
        if (btnSaveEffects) btnSaveEffects.disabled = false;

        this.elPropId.value = skill.id || '';
        this.elPropName.value = skill.name || '';
        this.elPropRarity.value = skill.rarity || 'Common';
        this.elPropSpeed.value = skill.speed ?? 0;

        if (this.elCostsAp) this.elCostsAp.value = String(skill.costs?.ap ?? 0);
        if (this.elCostsPerTurnLimit) this.elCostsPerTurnLimit.value = String(skill.costs?.perTurnLimit ?? 1);
        if (this.elCostsPart) this.elCostsPart.value = skill.costs?.partSlot?.part || '';
        if (this.elCostsSlotCost) this.elCostsSlotCost.value = String(skill.costs?.partSlot?.slotCost ?? 0);

        const target = (skill.target && typeof skill.target === 'object') ? skill.target : null;
        const selection = target?.selection && typeof target.selection === 'object' ? target.selection : null;
        if (this.elTargetSubject) this.elTargetSubject.value = target?.subject || 'SUBJECT_ENEMY';
        if (this.elTargetScope) this.elTargetScope.value = target?.scope || 'SCOPE_PART';
        if (this.elSelectionMode) this.elSelectionMode.value = selection?.mode || 'single';
        if (this.elSelectionSelectCount) this.elSelectionSelectCount.value = (selection && typeof selection.selectCount === 'number') ? String(selection.selectCount) : '';

        const setCheckedByValues = (container, values) => {
            if (!container) return;
            const set = new Set(Array.isArray(values) ? values : []);
            Array.from(container.querySelectorAll('input[type="checkbox"]')).forEach(cb => {
                cb.checked = set.has(cb.value);
            });
        };
        setCheckedByValues(this.elCandidatePartsList, selection?.candidateParts || (this.defaultParts || []));
        setCheckedByValues(this.elSelectedPartsList, selection?.selectedParts || []);
        this.updateCandidatePartsBtnText?.();
        this.updateSelectedPartsBtnText?.();

        this.elPropDesc.value = skill.description || '';
        if (this.elPropEffects) this.elPropEffects.value = JSON.stringify(skill.effects || [], null, 2);
        this.elPrereqText.textContent = (skill.prerequisites || []).join(', ') || '—';
        this.elMetaX.value = skill.editorMeta?.x ?? '';
        this.elMetaY.value = skill.editorMeta?.y ?? '';

        // JSON fields (v3)
        if (this.elUnlock) this.elUnlock.value = JSON.stringify(skill.unlock || {}, null, 2);
        if (this.elRequirements) this.elRequirements.value = JSON.stringify(skill.requirements || {}, null, 2);
        if (this.elTags) this.elTags.value = JSON.stringify(Array.isArray(skill.tags) ? skill.tags : [], null, 2);
        if (this.elTagMeta) this.elTagMeta.value = JSON.stringify((skill.tagMeta && typeof skill.tagMeta === 'object' && !Array.isArray(skill.tagMeta)) ? skill.tagMeta : {}, null, 2);

        this.renderTagsEditor();

        this.renderBuffRefTables();
        this.renderEffectsList();
        this.updateSummary();
    }

    saveCurrentNode() {
        if (!this.selectedNodeId) return;
        const skill = this.getSkillById(this.selectedNodeId);
        if (!skill) return;

        this.setError(this.elErrTarget, null);
        this.setError(this.elErrCosts, null);
        this.setError(this.elErrReq, null);
        this.setError(this.elErrUnlock, null);
        this.setError(this.elErrTags, null);

        const subject = (this.elTargetSubject?.value || '').trim();
        const scope = (this.elTargetScope?.value || '').trim();
        const mode = (this.elSelectionMode?.value || '').trim();
        const selectCountStr = (this.elSelectionSelectCount?.value || '').trim();
        const selectCount = selectCountStr === '' ? NaN : Number(selectCountStr);
        const subjectOk = subject && (this.enums?.targetSubjects || []).includes(subject);
        const scopeOk = scope && (this.enums?.targetScopes || []).includes(scope);
        const modeOk = mode && (this.enums?.selectionModes || []).includes(mode);
        if (!subjectOk || !scopeOk || !modeOk) {
            this.setError(this.elErrTarget, 'target(subject/scope/selection.mode) 不合法');
            this.updateSummary();
            return;
        }

        skill.name = (this.elPropName.value || '').trim();
        skill.rarity = this.elPropRarity.value;
        skill.speed = Number(this.elPropSpeed.value || 0);
        skill.description = this.elPropDesc.value || '';

        const apCost = Number(this.elCostsAp?.value ?? 0);
        if (!skill.costs || typeof skill.costs !== 'object') skill.costs = {};
        skill.costs.ap = Number.isNaN(apCost) ? 0 : apCost;
        const perTurnLimit = Number(this.elCostsPerTurnLimit?.value ?? 1);
        if (!Number.isNaN(perTurnLimit) && perTurnLimit > 0) skill.costs.perTurnLimit = perTurnLimit;

        const part = (this.elCostsPart?.value || '').trim();
        const slotCost = Number(this.elCostsSlotCost?.value ?? 0);
        if (part) {
            if (!skill.costs.partSlot || typeof skill.costs.partSlot !== 'object') skill.costs.partSlot = {};
            skill.costs.partSlot.part = part;
            if (!Number.isNaN(slotCost) && slotCost >= 0) skill.costs.partSlot.slotCost = slotCost;
        } else if (skill.costs.partSlot) {
            delete skill.costs.partSlot;
        }

        if (!skill.target || typeof skill.target !== 'object') {
            skill.target = { subject, scope, selection: { mode: 'single', candidateParts: (this.defaultParts || []).slice(), selectedParts: [], selectCount: 1 } };
        }
        if (!skill.target.selection || typeof skill.target.selection !== 'object') {
            skill.target.selection = { mode: 'single', candidateParts: (this.defaultParts || []).slice(), selectedParts: [], selectCount: 1 };
        }
        skill.target.subject = subject;
        skill.target.scope = scope;
        skill.target.selection.mode = mode;
        if (!Number.isNaN(selectCount) && selectCount > 0) skill.target.selection.selectCount = selectCount;

        this.commitSelectionPartsFromUI();
        if (!Array.isArray(skill.target.selection.candidateParts)) skill.target.selection.candidateParts = (this.defaultParts || []).slice();
        if (!Array.isArray(skill.target.selection.selectedParts)) skill.target.selection.selectedParts = [];
        if (!skill.target.selection.selectCount) {
            skill.target.selection.selectCount = Math.max(1, skill.target.selection.selectedParts.length || 1);
        }

        // tags / tagMeta
        try {
            const parsedTags = JSON.parse(this.elTags?.value || '[]');
            if (!Array.isArray(parsedTags)) throw new Error('tags 必须是数组');
            skill.tags = parsedTags;
        } catch (e) {
            this.setError(this.elErrTags, e.message || String(e));
            this.updateSummary();
            return;
        }
        try {
            const parsedTagMeta = JSON.parse(this.elTagMeta?.value || '{}');
            if (!parsedTagMeta || typeof parsedTagMeta !== 'object' || Array.isArray(parsedTagMeta)) throw new Error('tagMeta 必须是对象');
            skill.tagMeta = parsedTagMeta;
        } catch (e) {
            this.setError(this.elErrTags, e.message || String(e));
            this.updateSummary();
            return;
        }

        // unlock / requirements
        try {
            const parsedUnlock = JSON.parse(this.elUnlock?.value || '{}');
            if (!parsedUnlock || typeof parsedUnlock !== 'object' || Array.isArray(parsedUnlock)) throw new Error('unlock 必须是对象');
            skill.unlock = parsedUnlock;
        } catch (e) {
            this.setError(this.elErrUnlock, e.message || String(e));
            this.updateSummary();
            return;
        }
        try {
            const parsedReq = JSON.parse(this.elRequirements?.value || '{}');
            if (!parsedReq || typeof parsedReq !== 'object' || Array.isArray(parsedReq)) throw new Error('requirements 必须是对象');
            skill.requirements = parsedReq;
        } catch (e) {
            this.setError(this.elErrReq, e.message || String(e));
            this.updateSummary();
            return;
        }

        this.elMetaX.value = skill.editorMeta?.x ?? '';
        this.elMetaY.value = skill.editorMeta?.y ?? '';

        this.renderNodes();
        this.renderSkillLibrary();
        this.updateSummary();
    }

    openEffectsJsonSync() {
        if (this.elEffectsJsonWrap) this.elEffectsJsonWrap.style.display = 'block';
    }

    closeEffectsJsonSync() {
        if (this.elEffectsJsonWrap) this.elEffectsJsonWrap.style.display = 'none';
    }

    validateEffectsFromForm() {
        this.setError(this.elErrEffects, null);
        let parsed;
        try {
            parsed = JSON.parse(this.elPropEffects?.value || '[]');
            if (!Array.isArray(parsed)) throw new Error('effects 必须是数组');
        } catch (e) {
            this.setError(this.elErrEffects, e.message || String(e));
            return false;
        }
        // minimal
        const errs = [];
        parsed.forEach((eff, i) => {
            if (!eff || typeof eff !== 'object' || Array.isArray(eff)) errs.push(`effects[${i}] 必须是对象`);
            else if (!eff.effectType) errs.push(`effects[${i}] 缺少 effectType`);
        });
        if (errs.length) {
            this.setError(this.elErrEffects, errs.join('\n'));
            return false;
        }
        return true;
    }

    applyEffectsJsonToForm() {
        // For current MVP, JSON textarea is the form.
        this.validateEffectsFromForm();
    }

    saveEffectsFromForm() {
        if (!this.selectedNodeId) return;
        const skill = this.getSkillById(this.selectedNodeId);
        if (!skill) return;
        if (!this.validateEffectsFromForm()) return;
        try {
            const effects = JSON.parse(this.elPropEffects?.value || '[]');
            skill.effects = effects;
        } catch (e) {
            this.setError(this.elErrEffects, e.message || String(e));
            return;
        }
        this.closeEffectsJsonSync();
        this.renderEffectsList();
        this.updateSummary();
    }

    addEffectRow() {
        if (!this.selectedNodeId) return;
        const skill = this.getSkillById(this.selectedNodeId);
        if (!skill) return;
        if (!Array.isArray(skill.effects)) skill.effects = [];
        skill.effects.push({ effectType: (this.enums.effectTypes && this.enums.effectTypes[0]) || 'DMG_HP', amountType: 'ABS', amount: 0 });
        if (this.elPropEffects) this.elPropEffects.value = JSON.stringify(skill.effects, null, 2);

        this.renderEffectsList();
        this.updateSummary?.();
    }

    renderEffectsList() {
        if (!this.elEffectsList) return;
        const skill = this.selectedNodeId ? this.getSkillById(this.selectedNodeId) : null;
        if (!skill || !Array.isArray(skill.effects)) {
            this.elEffectsList.innerHTML = '<span style="color:#888;">(no effects)</span>';
            return;
        }
        if (skill.effects.length === 0) {
            this.elEffectsList.innerHTML = '<span style="color:#888;">(no effects)</span>';
            return;
        }

        const opt = (values, current, placeholder = '') => {
            const list = Array.isArray(values) ? values : [];
            const head = placeholder ? [`<option value="">${placeholder}</option>`] : [];
            return head.concat(list.map(v => `<option value="${v}" ${v === current ? 'selected' : ''}>${v}</option>`)).join('');
        };

        const escapeHtml = (s) => String(s ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');

        this.elEffectsList.innerHTML = skill.effects.map((eff, idx) => {
            const effectType = eff?.effectType || '';
            const amountType = eff?.amountType || '';
            const amount = (typeof eff?.amount === 'number' || typeof eff?.amount === 'string') ? eff.amount : '';
            const note = eff?.note || '';
            return `
                <div class="effect-row" data-index="${idx}">
                    <div class="effect-row-head">
                        <div class="small" style="font-weight:800;">#${idx}</div>
                        <button class="btn btn-sm btn-danger" type="button" data-action="del">Del</button>
                    </div>
                    <div class="effect-grid">
                        <div class="small">effectType</div>
                        <select class="select" data-field="effectType">${opt(this.enums?.effectTypes, effectType, '(select)')}</select>

                        <div class="small">amountType</div>
                        <select class="select" data-field="amountType">${opt(this.enums?.amountTypes, amountType, '(select)')}</select>

                        <div class="small">amount</div>
                        <input class="input" data-field="amount" type="number" value="${escapeHtml(amount)}" />

                        <div class="small">note</div>
                        <input class="input" data-field="note" type="text" value="${escapeHtml(note)}" placeholder="(optional)" />
                    </div>
                </div>
            `;
        }).join('');

        if (!this._effectsDelegated) {
            this._effectsDelegated = true;
            const container = this.elEffectsList;
            container.addEventListener('change', (e) => {
                const row = e.target.closest('.effect-row');
                if (!row) return;
                const index = Number(row.dataset.index);
                const field = e.target.dataset.field;
                if (!field) return;
                const sk = this.getSkillById(this.selectedNodeId);
                if (!sk || !Array.isArray(sk.effects) || !sk.effects[index]) return;

                let v = e.target.value;
                if (field === 'amount') v = v === '' ? undefined : Number(v);
                sk.effects[index][field] = v;

                if (this.elPropEffects) this.elPropEffects.value = JSON.stringify(sk.effects, null, 2);
                this.updateSummary();
            });

            container.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-action="del"]');
                if (!btn) return;
                const row = e.target.closest('.effect-row');
                if (!row) return;
                const index = Number(row.dataset.index);
                const sk = this.getSkillById(this.selectedNodeId);
                if (!sk || !Array.isArray(sk.effects)) return;
                sk.effects.splice(index, 1);
                if (this.elPropEffects) this.elPropEffects.value = JSON.stringify(sk.effects, null, 2);
                this.renderEffectsList();
                this.updateSummary();
            });
        }
    }

    renderBuffRefTables() {
        const skill = this.selectedNodeId ? this.getSkillById(this.selectedNodeId) : null;
        const tables = {
            apply: document.querySelector('#table-apply tbody'),
            applySelf: document.querySelector('#table-applySelf tbody'),
            remove: document.querySelector('#table-remove tbody'),
        };
        Object.values(tables).forEach(t => { if (t) t.innerHTML = ''; });
        if (!skill) return;
        const renderBuffIdSelect = (value) => {
            const buffIds = Object.keys(this.buffDict || {});
            if (buffIds.length === 0) return `<input class="input" data-field="buffId" value="${value || ''}" placeholder="buffId"/>`;
            const options = ['<option value="">(select)</option>'].concat(buffIds.map(id => `<option value="${id}" ${id===value?'selected':''}>${id}</option>`));
            return `<select class="select" data-field="buffId">${options.join('')}</select>`;
        };
        const renderRow = (kind, row, index) => {
            if (kind === 'remove') {
                return `
                    <tr data-kind="${kind}" data-index="${index}">
                        <td>${renderBuffIdSelect(row.buffId)}</td>
                        <td>
                            <select class="select" data-field="target">
                                <option value="self" ${(row.target||'self')==='self'?'selected':''}>self</option>
                                <option value="enemy" ${(row.target||'self')==='enemy'?'selected':''}>enemy</option>
                            </select>
                        </td>
                        <td><button class="btn btn-sm btn-danger" data-action="del">Del</button></td>
                    </tr>
                `;
            }
            return `
                <tr data-kind="${kind}" data-index="${index}">
                    <td>${renderBuffIdSelect(row.buffId)}</td>
                    <td>
                        <select class="select" data-field="target">
                            <option value="enemy" ${(row.target||'enemy')==='enemy'?'selected':''}>enemy</option>
                            <option value="self" ${(row.target||'enemy')==='self'?'selected':''}>self</option>
                        </select>
                    </td>
                    <td><input class="input" data-field="chance" type="number" step="0.01" value="${row.chance ?? 1}"/></td>
                    <td><input class="input" data-field="duration" type="number" value="${row.duration ?? ''}"/></td>
                    <td><input class="input" data-field="stacks" type="number" value="${row.stacks ?? ''}"/></td>
                    <td><button class="btn btn-sm btn-danger" data-action="del">Del</button></td>
                </tr>
            `;
        };
        ['apply','applySelf','remove'].forEach(kind => {
            const arr = skill.buffRefs?.[kind] || [];
            arr.forEach((row, idx) => {
                tables[kind].insertAdjacentHTML('beforeend', renderRow(kind, row, idx));
            });
        });
        const container = document.getElementById('properties-panel');
        if (!this._buffRefDelegated) {
            this._buffRefDelegated = true;
            container.addEventListener('change', (e) => {
                const tr = e.target.closest('tr[data-kind]');
                if (!tr) return;
                const kind = tr.dataset.kind;
                const index = Number(tr.dataset.index);
                const field = e.target.dataset.field;
                if (!field) return;
                const sk = this.getSkillById(this.selectedNodeId);
                if (!sk) return;
                const row = sk.buffRefs[kind][index];
                let v = e.target.value;
                if (field === 'chance' || field === 'duration' || field === 'stacks') v = v === '' ? undefined : Number(v);
                row[field] = v;
                this.updateSummary();
            });
            container.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-action="del"]');
                if (!btn) return;
                const tr = e.target.closest('tr[data-kind]');
                if (!tr) return;
                const kind = tr.dataset.kind;
                const index = Number(tr.dataset.index);
                const sk = this.getSkillById(this.selectedNodeId);
                if (!sk) return;
                sk.buffRefs[kind].splice(index, 1);
                this.renderBuffRefTables();
                this.updateSummary();
            });
        }
    }

    addBuffRefRow(kind) {
        if (!this.selectedNodeId) return;
        const sk = this.getSkillById(this.selectedNodeId);
        if (!sk) return;
        if (!sk.buffRefs) sk.buffRefs = { apply: [], applySelf: [], remove: [] };
        if (!Array.isArray(sk.buffRefs[kind])) sk.buffRefs[kind] = [];
        if (kind === 'remove') sk.buffRefs[kind].push({ buffId: '', target: 'self' });
        else sk.buffRefs[kind].push({ buffId: '', target: kind === 'applySelf' ? 'self' : 'enemy', chance: 1.0 });
        this.renderBuffRefTables();
        this.updateSummary();
    }

    getSkillById(id) {
        return this.skills.find(s => s.id === id);
    }

    applyMetaToUI() {
        if (this.elPropRarity && Array.isArray(this.enums?.rarities)) {
            this.elPropRarity.innerHTML = this.enums.rarities.map(r => `<option value="${r}">${r}</option>`).join('');
        }
        if (this.elTargetSubject && Array.isArray(this.enums?.targetSubjects)) {
            this.elTargetSubject.innerHTML = this.enums.targetSubjects.map(v => `<option value="${v}">${v}</option>`).join('');
        }
        if (this.elTargetScope && Array.isArray(this.enums?.targetScopes)) {
            this.elTargetScope.innerHTML = this.enums.targetScopes.map(v => `<option value="${v}">${v}</option>`).join('');
        }
        if (this.elSelectionMode && Array.isArray(this.enums?.selectionModes)) {
            this.elSelectionMode.innerHTML = this.enums.selectionModes.map(v => `<option value="${v}">${v}</option>`).join('');
        }
        if (this.elCostsPart && Array.isArray(this.defaultParts)) {
            const opts = ['<option value="">(none)</option>'].concat(this.defaultParts.map(p => `<option value="${p}">${p}</option>`));
            this.elCostsPart.innerHTML = opts.join('');
        }
    }

    updateSummary() {
        if (!this.elValidateSummary || !this.elSummaryText || !this.elSummaryBadge) return;
        const skill = this.selectedNodeId ? this.getSkillById(this.selectedNodeId) : null;
        if (!skill) {
            this.elValidateSummary.textContent = 'No selection';
            this.elSummaryText.textContent = 'Select a node to edit...';
            this.elSummaryBadge.textContent = '—';
            return;
        }
        this.elValidateSummary.textContent = 'OK';
        this.elSummaryBadge.textContent = 'OK';
        this.elSummaryText.textContent = `${skill.id} / ${skill.name || ''}`;
    }

    commitSelectionPartsFromUI() {
        if (!this.selectedNodeId) return;
        const skill = this.getSkillById(this.selectedNodeId);
        if (!skill || !skill.target || !skill.target.selection) return;
        const getChecked = (container) => {
            if (!container) return [];
            return Array.from(container.querySelectorAll('input[type="checkbox"]')).filter(cb => cb.checked).map(cb => cb.value);
        };
        skill.target.selection.candidateParts = getChecked(this.elCandidatePartsList);
        skill.target.selection.selectedParts = getChecked(this.elSelectedPartsList);
    }

    updateCandidatePartsBtnText() {
        if (!this.elCandidatePartsBtn) return;
        const parts = Array.from(this.elCandidatePartsList?.querySelectorAll('input[type="checkbox"]') || [])
            .filter(cb => cb.checked)
            .map(cb => cb.value);
        this.elCandidatePartsBtn.textContent = parts.length ? parts.join(', ') : '(none)';
    }

    updateSelectedPartsBtnText() {
        if (!this.elSelectedPartsBtn) return;
        const parts = Array.from(this.elSelectedPartsList?.querySelectorAll('input[type="checkbox"]') || [])
            .filter(cb => cb.checked)
            .map(cb => cb.value);
        this.elSelectedPartsBtn.textContent = parts.length ? parts.join(', ') : '(none)';
    }

    // The rest of methods are appended during extraction.
}
