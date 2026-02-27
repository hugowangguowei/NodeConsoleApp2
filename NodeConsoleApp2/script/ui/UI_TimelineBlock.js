export class UI_TimelineBlock {
    constructor(engine) {
        this.engine = engine;
        this.eventBus = engine.eventBus;

        this.dom = {
            root: document.querySelector('.timeline'),
            list: document.getElementById('timelineList'),
            empty: document.getElementById('timelineEmpty'),
            round: document.getElementById('timelineRoundLabel'),
            phase: document.getElementById('timelinePhaseLabel'),
            start: document.getElementById('timelineStartBtn'),
            pause: document.getElementById('timelinePauseBtn'),
            step: document.getElementById('timelineStepBtn'),
            speed: document.getElementById('timelineSpeedSelect'),
            logs: document.getElementById('timelineLogList')
        };

        this.speedMap = {
            '1x': 300,
            '2x': 150,
            '4x': 75
        };

        this.logs = [];
        this.selectedEntryId = null;
        this.showInlineLogs = false;

        if (!this.dom.root || !this.dom.list) {
            console.warn('[UI_TimelineBlock] Timeline root/list not found.');
            return;
        }

        if (this.dom.logs && !this.showInlineLogs) {
            this.dom.logs.style.display = 'none';
        }

        this.bindDOMEvents();
        this.bindEngineEvents();
        this.render();
    }

    bindDOMEvents() {
        if (this.dom.start) {
            this.dom.start.addEventListener('click', async () => {
                const delay = this._getSelectedDelay();
                const result = await this.engine.timeline.start({
                    stepDelayMs: delay,
                    canContinue: () => this.engine.fsm.currentState === 'BATTLE_LOOP'
                });

                if (!result.ok) {
                    this.eventBus.emit('BATTLE_LOG', { text: `时间轴启动失败：${result.reason}` });
                }
            });
        }

        if (this.dom.pause) {
            this.dom.pause.addEventListener('click', () => {
                this.engine.timeline.pause();
            });
        }

        if (this.dom.step) {
            this.dom.step.addEventListener('click', async () => {
                const phase = this.engine.timeline.phase;
                if (phase === 'READY' || phase === 'PAUSED') {
                    const res = await this.engine.timeline.step();
                    if (!res.ok) {
                        this.eventBus.emit('BATTLE_LOG', { text: `时间轴单步失败：${res.reason}` });
                    }
                }
            });
        }
    }

    bindEngineEvents() {
        const refresh = () => this.render();
        this.eventBus.on('TIMELINE_READY', refresh);
        this.eventBus.on('TIMELINE_START', refresh);
        this.eventBus.on('TIMELINE_PAUSE', refresh);
        this.eventBus.on('TIMELINE_RESUME', refresh);
        this.eventBus.on('TIMELINE_FINISHED', refresh);
        this.eventBus.on('TIMELINE_SNAPSHOT', refresh);

        this.eventBus.on('TIMELINE_ENTRY_END', (payload) => {
            const item = payload && payload.entry ? payload.entry : null;
            if (!item) return;
            const text = `[${item.side}] ${item.skillId} -> ${payload?.result ? 'DONE' : 'NO_RESULT'}`;
            this.logs.push(text);
            if (this.logs.length > 8) this.logs.shift();
            this.renderLogs();
        });

        this.eventBus.on('TIMELINE_ERROR', (payload) => {
            const message = payload?.message || 'Timeline error';
            this.logs.push(`[ERROR] ${message}`);
            if (this.logs.length > 8) this.logs.shift();
            this.renderLogs();
            this.eventBus.emit('BATTLE_LOG', { text: `时间轴错误：${message}` });
            console.error('[UI_TimelineBlock] TIMELINE_ERROR', payload);
        });
    }

    render() {
        const snapshot = this.engine.timeline.getSnapshot();
        const exists = Array.isArray(snapshot.entries) && snapshot.entries.some(e => e.entryId === this.selectedEntryId);
        if (!exists) this.selectedEntryId = null;
        this.renderHeader(snapshot);
        this.renderList(snapshot);
        this.renderControls(snapshot);
        this.renderLogs();
    }

    renderHeader(snapshot) {
        if (this.dom.round) this.dom.round.textContent = `回合 ${snapshot.roundId ?? '-'}`;
        if (this.dom.phase) this.dom.phase.textContent = snapshot.phase;
    }

    renderList(snapshot) {
        if (!this.dom.list) return;

        this.dom.list.innerHTML = '';

        const entries = Array.isArray(snapshot.entries) ? snapshot.entries : [];
        if (entries.length === 0) {
            if (this.dom.empty) this.dom.empty.style.display = '';
            return;
        }

        if (this.dom.empty) this.dom.empty.style.display = 'none';

        entries.forEach((entry, index) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'timeline-item';
            item.dataset.entryId = entry.entryId;
            item.dataset.executionState = entry.executionState;

            if (index === snapshot.currentIndex) item.classList.add('is-current');
            if (entry.executionState === 'DONE') item.classList.add('is-done');
            if (entry.executionState === 'ERROR') item.classList.add('is-error');
            if (entry.executionState === 'RUNNING') item.classList.add('is-running');
            if (this.selectedEntryId === entry.entryId) item.classList.add('is-selected');

            const actor = entry.side === 'self' ? '玩家' : '敌人';
            const sideBadge = document.createElement('span');
            sideBadge.className = `timeline-item-side ${entry.side === 'self' ? 'self' : 'enemy'}`;
            sideBadge.textContent = entry.side === 'self' ? '我方' : '敌方';

            const icon = document.createElement('span');
            icon.className = 'timeline-item-icon';
            icon.textContent = this._pickSkillGlyph(entry);

            const title = document.createElement('div');
            title.className = 'timeline-item-title';
            title.textContent = this._shortLabel(entry.meta?.label || entry.skillId);

            const sub = document.createElement('span');
            const speed = Number(entry.meta?.speed) || 0;
            sub.className = 'timeline-item-sub';
            sub.textContent = `速度 ${speed} · ${entry.executionState}`;

            item.title = `${actor} · ${entry.meta?.label || entry.skillId}\n状态: ${entry.executionState}`;

            item.appendChild(sideBadge);
            item.appendChild(icon);
            item.appendChild(title);
            item.appendChild(sub);

            item.addEventListener('click', () => {
                this.selectedEntryId = entry.entryId;
                const info = {
                    entryId: entry.entryId,
                    side: entry.side,
                    skillId: entry.skillId,
                    speed,
                    state: entry.executionState
                };
                console.log('[Timeline Entry]', info);
                this.eventBus.emit('BATTLE_LOG', { text: `时间轴条目：${entry.skillId} (${entry.executionState})` });
                this.render();
            });

            this.dom.list.appendChild(item);
        });
    }

    renderControls(snapshot) {
        const phase = snapshot.phase;
        const isReady = phase === 'READY';
        const isPlaying = phase === 'PLAYING';
        const isPaused = phase === 'PAUSED';

        if (this.dom.start) this.dom.start.disabled = !(isReady || isPaused);
        if (this.dom.pause) this.dom.pause.disabled = !isPlaying;
        if (this.dom.step) this.dom.step.disabled = !(isReady || isPaused);
    }

    renderLogs() {
        if (!Array.isArray(this.logs)) return;

        if (this.logs.length > 0) {
            const latest = this.logs[this.logs.length - 1];
            console.log('[TimelineLog]', latest);
        }

        if (this.showInlineLogs && this.dom.logs) {
            this.dom.logs.innerHTML = '';
            for (const line of this.logs) {
                const li = document.createElement('li');
                li.textContent = line;
                this.dom.logs.appendChild(li);
            }
        }
    }

    _getSelectedDelay() {
        const key = this.dom.speed && this.dom.speed.value ? this.dom.speed.value : '1x';
        return this.speedMap[key] ?? 300;
    }

    _shortLabel(label) {
        const text = String(label || '').trim();
        if (text.length <= 8) return text;
        return `${text.slice(0, 8)}…`;
    }

    _pickSkillGlyph(entry) {
        const text = String(entry?.meta?.label || entry?.skillId || '').toLowerCase();
        if (/heal|治疗|恢复|圣光/.test(text)) return '✨';
        if (/shield|guard|防御|护甲|减伤/.test(text)) return '🛡️';
        if (/fire|火|燃烧/.test(text)) return '🔥';
        if (/ice|冰|冻/.test(text)) return '🧊';
        if (/lightning|雷|电/.test(text)) return '⚡';
        return '⚔️';
    }
}
