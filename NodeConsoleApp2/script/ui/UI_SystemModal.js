/**
 * @file UI_SystemModal.js
 * @description 系统模态窗口 UI 组件，负责主菜单、关卡选择、存档读档等界面的显示与交互。
 * 遵循 UI_design.md 中的接口规范与代码规范。
 */

export class UI_SystemModal {
    /**
     * 构造函数
     */
    constructor() {
        // DOM 元素缓存
        this.dom = {
            backdrop: null,
            panel: null,
            title: null,
            body: null,
            footer: null,
            closeBtn: null,
            menuBtn: null
        };

        // 当前视图状态
        this.currentView = null;

        // 引擎引用 (仅用于发送指令和监听事件)
        this.engine = null;
    }

    /**
     * 初始化组件
     * @param {Object} engine - 游戏引擎实例，需包含 eventBus, input 和 dataManager(可选，用于同步获取数据)
     */
    init(engine) {
        this.engine = engine;
        this.bindDOM();
        this.bindEvents();

        // 初始隐藏
        this.hide();
    }

    /**
     * 绑定 DOM 元素
     * @private
     */
    bindDOM() {
        this.dom.backdrop = document.getElementById('systemModal');
        this.dom.title = document.getElementById('modalTitle');
        this.dom.body = document.getElementById('modalBody');
        this.dom.footer = document.getElementById('modalFooter');
        this.dom.closeBtn = document.getElementById('modalCloseBtn');
        this.dom.menuBtn = document.getElementById('systemMenuBtn');

        // 绑定关闭按钮事件
        if (this.dom.closeBtn) {
            this.dom.closeBtn.addEventListener('click', () => this.handleClose());
        }

        // 绑定菜单按钮事件
        if (this.dom.menuBtn) {
            this.dom.menuBtn.addEventListener('click', () => this.openMainMenu());
        }
    }

    /**
     * 绑定引擎事件
     * @private
     */
    bindEvents() {
        if (!this.engine || !this.engine.eventBus) return;

        // 监听状态变更
        this.engine.eventBus.on('STATE_CHANGED', this.handleStateChange.bind(this));

        // 监听数据更新 (如存档列表更新)
        this.engine.eventBus.on('DATA_UPDATE', this.handleDataUpdate.bind(this));

        // 监听 UI 请求打开模态框
        this.engine.eventBus.on('UI:OPEN_MODAL', this.handleOpenModal.bind(this));
    }

    /**
     * 处理状态变更事件
     * @param {Object} stateData - { from, to }
     */
    handleStateChange(stateData) {
        const { to } = stateData;

        if (to === 'LEVEL_SELECT') {
            this.renderLevelSelect();
            this.show();
        } else if (to === 'BATTLE_LOOP' || to === 'BATTLE_PREPARE') {
            this.hide();
        } else if (to === 'LOGIN') {
            // 可以在这里处理返回标题后的逻辑，比如关闭模态框
            this.hide();
        }
    }

    /**
     * 处理数据更新事件
     * @param {Object} updateData - { type, data }
     */
    handleDataUpdate(updateData) {
        const { type, data } = updateData;

        // 如果当前正在显示存档/读档界面，且收到了存档列表更新
        if (this.currentView === 'SAVE_LOAD' && type === 'SAVE_LIST') {
            this.renderSaveLoad(data);
        }
    }

    /**
     * 处理打开模态框请求
     * @param {Object} request - { view }
     */
    handleOpenModal(request) {
        const { view } = request;
        if (view === 'SETTINGS') {
            this.renderSettings();
            this.show();
        }
    }

    /**
     * 处理关闭操作
     */
    handleClose() {
        // 如果在主菜单或设置界面，关闭通常意味着“继续游戏”
        if (this.currentView === 'MAIN_MENU' || this.currentView === 'SETTINGS') {
            if (this.engine.input && this.engine.input.resumeGame) {
                this.engine.input.resumeGame();
            }
        }
        this.hide();
    }

    /**
     * 显示模态框
     */
    show() {
        if (this.dom.backdrop) {
            this.dom.backdrop.classList.add('visible');
        }
    }

    /**
     * 隐藏模态框
     */
    hide() {
        if (this.dom.backdrop) {
            this.dom.backdrop.classList.remove('visible');
        }
        this.currentView = null;
    }

    /**
     * 打开主菜单
     */
    openMainMenu() {
        this.renderMainMenu();
        this.show();
    }

    /**
     * 渲染主菜单视图
     */
    renderMainMenu() {
        this.currentView = 'MAIN_MENU';
        this.setTitle('游戏菜单');
        this.clearContent();

        const menu = document.createElement('div');
        menu.className = 'menu-list';

        const items = [
            { label: '继续游戏', action: () => this.handleClose() },
            { label: '关卡选择', action: () => this.renderLevelSelect() },
            { label: '存档 / 读档', action: () => this.renderSaveLoad() },
            { label: '设置', action: () => this.renderSettings() },
            { label: '返回标题', action: () => {
                if (this.engine.input && this.engine.input.backToTitle) {
                    this.engine.input.backToTitle();
                }
            }}
        ];

        items.forEach(item => {
            const btn = document.createElement('button');
            btn.className = 'menu-btn';
            btn.textContent = item.label;
            btn.onclick = item.action;
            menu.appendChild(btn);
        });

        this.dom.body.appendChild(menu);
        this.clearFooter(); // 主菜单通常不需要 Footer 按钮
    }

    /**
     * 渲染关卡选择视图
     */
    renderLevelSelect() {
        this.currentView = 'LEVEL_SELECT';
        this.setTitle('选择关卡');
        this.clearContent();

        // 获取关卡数据 (假设 DataManager 有同步接口，或者通过 Engine 获取)
        let levels = [];
        if (this.engine.dataManager && this.engine.dataManager.getLevels) {
            levels = this.engine.dataManager.getLevels();
        } else {
            // Fallback / Mock data
             levels = [
                { id: '1-1', name: '森林边缘', desc: 'Lv.1 - 史莱姆' },
                { id: '1-2', name: '幽暗密林', desc: 'Lv.3 - 狼群' }
            ];
        }

        const grid = document.createElement('div');
        grid.className = 'level-grid';

        levels.forEach(lvl => {
            const card = document.createElement('div');
            card.className = 'level-card';
            // 假设 lvl 对象结构符合 UI 需求
            card.innerHTML = `<h4>${lvl.id}</h4><p>${lvl.name}</p><p>${lvl.desc || ''}</p>`;
            card.onclick = () => {
                if (this.engine.input && this.engine.input.selectLevel) {
                    this.engine.input.selectLevel(lvl.id);
                }
                // 注意：不需要手动 hide，因为 selectLevel 会触发 STATE_CHANGED -> BATTLE_PREPARE，从而触发 hide
            };
            grid.appendChild(card);
        });

        this.dom.body.appendChild(grid);

        // Footer: 返回按钮
        this.renderFooterBackBtn(() => this.openMainMenu());
    }

    /**
     * 渲染存档/读档视图
     * @param {Array} [saveList] - 可选的存档列表数据，若不传则尝试获取
     */
    renderSaveLoad(saveList) {
        this.currentView = 'SAVE_LOAD';
        this.setTitle('存档 / 读档');
        this.clearContent();

        const slots = saveList || (this.engine.dataManager && this.engine.dataManager.getSaveList ? this.engine.dataManager.getSaveList() : [
            { id: 1, date: '空', level: '-', hp: '-' },
            { id: 2, date: '空', level: '-', hp: '-' },
            { id: 3, date: '空', level: '-', hp: '-' }
        ]);

        slots.forEach(slot => {
            const el = document.createElement('div');
            el.className = 'save-slot';

            const info = document.createElement('div');
            info.className = 'save-slot-info';
            info.innerHTML = `<h4>存档位 ${slot.id}</h4><div class="save-slot-meta">${slot.date} | 关卡: ${slot.level}</div>`;

            const actions = document.createElement('div');
            actions.className = 'slot-actions';

            const saveBtn = document.createElement('button');
            saveBtn.className = 'btn-primary';
            saveBtn.textContent = '保存';
            saveBtn.onclick = () => {
                if (this.engine.input && this.engine.input.saveGame) {
                    this.engine.input.saveGame(slot.id);
                }
                // 保存后通常会触发 DATA_UPDATE，从而刷新列表
            };

            const loadBtn = document.createElement('button');
            loadBtn.className = 'btn-primary';
            loadBtn.textContent = '读取';
            loadBtn.disabled = slot.date === '空';
            loadBtn.onclick = () => {
                if (this.engine.input && this.engine.input.loadGame) {
                    this.engine.input.loadGame(slot.id);
                }
                this.hide();
            };

            actions.appendChild(saveBtn);
            actions.appendChild(loadBtn);

            el.appendChild(info);
            el.appendChild(actions);
            this.dom.body.appendChild(el);
        });

        this.renderFooterBackBtn(() => this.openMainMenu());
    }

    /**
     * 渲染设置视图
     */
    renderSettings() {
        this.currentView = 'SETTINGS';
        this.setTitle('设置');
        this.clearContent();
        
        this.dom.body.innerHTML = '<p style="text-align:center; color:#888;">设置功能开发中...</p>';
        
        this.renderFooterBackBtn(() => this.openMainMenu());
    }

    // --- Helper Methods ---

    setTitle(text) {
        if (this.dom.title) this.dom.title.textContent = text;
    }

    clearContent() {
        if (this.dom.body) this.dom.body.innerHTML = '';
    }

    clearFooter() {
        if (this.dom.footer) this.dom.footer.innerHTML = '';
    }

    renderFooterBackBtn(callback) {
        this.clearFooter();
        if (!this.dom.footer) return;

        const backBtn = document.createElement('button');
        backBtn.className = 'btn-primary';
        backBtn.textContent = '返回';
        backBtn.onclick = callback;
        this.dom.footer.appendChild(backBtn);
    }
}
