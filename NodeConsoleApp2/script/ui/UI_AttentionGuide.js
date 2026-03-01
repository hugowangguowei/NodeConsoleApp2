export class UI_AttentionGuide {
    constructor(engine) {
        this.engine = engine;
        this.eventBus = engine?.eventBus;
        this.root = document.body;
        this.badge = document.getElementById('uiAttentionBadge');
        this.isSkillArmed = false;

        if (!this.root) {
            throw new Error('[UI_AttentionGuide] document.body not found.');
        }
        if (!this.eventBus) {
            throw new Error('[UI_AttentionGuide] engine.eventBus is required.');
        }
        if (!this.badge) {
            throw new Error('[UI_AttentionGuide] #uiAttentionBadge not found.');
        }

        this.bindEvents();
        this.render();
    }

    bindEvents() {
        const refresh = () => this.render();
        this.eventBus.on('BATTLE_START', refresh);
        this.eventBus.on('BATTLE_UPDATE', refresh);
        this.eventBus.on('TURN_START', refresh);
        this.eventBus.on('TIMELINE_READY', refresh);
        this.eventBus.on('TIMELINE_START', refresh);
        this.eventBus.on('TIMELINE_PAUSE', refresh);
        this.eventBus.on('TIMELINE_RESUME', refresh);
        this.eventBus.on('TIMELINE_FINISHED', refresh);

        this.eventBus.on('UI:SKILL_ARMED_CHANGED', (payload) => {
            this.isSkillArmed = !!(payload && payload.isArmed);
            this.render();
        });
    }

    render() {
        const battlePhase = String(this.engine?.battlePhase || 'IDLE').toLowerCase();
        this.root.dataset.uiPhase = battlePhase;
        this.root.dataset.uiSkillArmed = this.isSkillArmed ? '1' : '0';

        const timelinePhase = String(this.engine?.timeline?.phase || 'IDLE').toLowerCase();
        this.root.dataset.uiTimelinePhase = timelinePhase;

        const phaseLabelMap = {
            idle: 'IDLE',
            planning: 'PLANNING',
            execution: 'EXECUTION'
        };
        const focusLabel = battlePhase === 'planning'
            ? (this.isSkillArmed ? '技能槽位选择' : '技能规划')
            : (battlePhase === 'execution' ? '时间轴执行' : '等待流程开始');

        this.badge.textContent = `阶段：${phaseLabelMap[battlePhase] || battlePhase.toUpperCase()} · 焦点：${focusLabel}`;
    }
}
