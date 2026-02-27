export default class TimelineManager {
    constructor({ eventBus, executeEntry }) {
        this.eventBus = eventBus;
        this.executeEntry = executeEntry;
        this.reset();
    }

    reset() {
        this.roundId = null;
        this.phase = 'IDLE';
        this.currentIndex = -1;
        this.entries = [];
        this._isPlaying = false;
        this._lastError = null;
    }

    getSnapshot() {
        return {
            phase: this.phase,
            roundId: this.roundId,
            currentIndex: this.currentIndex,
            entries: this.entries.map(e => ({
                entryId: e.entryId,
                side: e.side,
                actorId: e.actorId,
                skillId: e.skillId,
                time: e.time,
                priority: e.priority,
                executionState: e.execution.state,
                meta: e.meta
            })),
            error: this._lastError
                ? { message: this._lastError.message, details: this._lastError.details }
                : undefined
        };
    }

    loadRoundActions({ roundId, selfPlans, enemyPlans, rules }) {
        if (!Array.isArray(selfPlans)) {
            return this._fail('Invalid round actions: selfPlans must be an array.', { selfPlansType: typeof selfPlans });
        }
        if (!Array.isArray(enemyPlans)) {
            return this._fail('Invalid round actions: enemyPlans must be an array.', { enemyPlansType: typeof enemyPlans });
        }

        const entries = [];
        let idx = 0;

        for (const action of selfPlans) {
            const built = this._buildEntry(action, 'self', idx++);
            if (!built.ok) return this._fail(built.reason, built.details);
            entries.push(built.entry);
        }

        for (const action of enemyPlans) {
            const built = this._buildEntry(action, 'enemy', idx++);
            if (!built.ok) return this._fail(built.reason, built.details);
            entries.push(built.entry);
        }

        this.roundId = roundId;
        this.entries = this._sortEntries(entries, rules || {});
        this.currentIndex = -1;
        this.phase = 'READY';
        this._isPlaying = false;
        this._lastError = null;

        this.eventBus.emit('TIMELINE_READY', { roundId: this.roundId, count: this.entries.length });
        this.eventBus.emit('TIMELINE_SNAPSHOT', this.getSnapshot());
        return { ok: true, count: this.entries.length };
    }

    async start({ stepDelayMs = 300, canContinue } = {}) {
        if (this.phase !== 'READY' && this.phase !== 'PAUSED') {
            return this._fail(`Cannot start timeline in phase ${this.phase}.`, { phase: this.phase });
        }

        this.phase = 'PLAYING';
        this._isPlaying = true;
        this.eventBus.emit('TIMELINE_START', { roundId: this.roundId });
        this.eventBus.emit('TIMELINE_SNAPSHOT', this.getSnapshot());

        while (this._isPlaying && this.currentIndex + 1 < this.entries.length) {
            if (typeof canContinue === 'function' && !canContinue()) {
                this.stop();
                return { ok: false, reason: 'Timeline stopped by host state guard.' };
            }

            const stepRes = await this.step();
            if (!stepRes.ok) return stepRes;

            if (this.currentIndex + 1 < this.entries.length && stepDelayMs > 0) {
                await new Promise(resolve => setTimeout(resolve, stepDelayMs));
            }
        }

        if (this.phase === 'PLAYING') {
            this.phase = 'FINISHED';
            this._isPlaying = false;
            this.eventBus.emit('TIMELINE_FINISHED', { roundId: this.roundId, count: this.entries.length });
            this.eventBus.emit('TIMELINE_SNAPSHOT', this.getSnapshot());
        }

        return { ok: true };
    }

    pause() {
        if (this.phase !== 'PLAYING') return;
        this.phase = 'PAUSED';
        this._isPlaying = false;
        this.eventBus.emit('TIMELINE_PAUSE', { roundId: this.roundId });
        this.eventBus.emit('TIMELINE_SNAPSHOT', this.getSnapshot());
    }

    async resume({ stepDelayMs = 300, canContinue } = {}) {
        if (this.phase !== 'PAUSED') {
            return this._fail(`Cannot resume timeline in phase ${this.phase}.`, { phase: this.phase });
        }
        return this.start({ stepDelayMs, canContinue });
    }

    stop() {
        this._isPlaying = false;
        if (this.phase === 'PLAYING' || this.phase === 'PAUSED' || this.phase === 'READY') {
            this.phase = 'FINISHED';
            this.eventBus.emit('TIMELINE_SNAPSHOT', this.getSnapshot());
        }
    }

    async step() {
        if (this.phase !== 'PLAYING' && this.phase !== 'READY' && this.phase !== 'PAUSED') {
            return this._fail(`Cannot step timeline in phase ${this.phase}.`, { phase: this.phase });
        }

        const nextIndex = this.currentIndex + 1;
        if (nextIndex >= this.entries.length) {
            this.phase = 'FINISHED';
            this.eventBus.emit('TIMELINE_FINISHED', { roundId: this.roundId, count: this.entries.length });
            this.eventBus.emit('TIMELINE_SNAPSHOT', this.getSnapshot());
            return { ok: true, done: true };
        }

        this.currentIndex = nextIndex;
        const entry = this.entries[this.currentIndex];
        entry.execution.state = 'RUNNING';

        this.eventBus.emit('TIMELINE_ENTRY_START', { entry: this._toEntryEvent(entry), index: this.currentIndex });
        this.eventBus.emit('TIMELINE_SNAPSHOT', this.getSnapshot());

        try {
            const result = await this.executeEntry(entry);
            entry.execution.state = 'DONE';
            entry.execution.result = result;
            this.eventBus.emit('TIMELINE_ENTRY_END', {
                entry: this._toEntryEvent(entry),
                index: this.currentIndex,
                result
            });
            this.eventBus.emit('TIMELINE_SNAPSHOT', this.getSnapshot());
            return { ok: true };
        } catch (error) {
            entry.execution.state = 'ERROR';
            entry.execution.error = error?.message || 'Unknown timeline execution error.';
            return this._fail(entry.execution.error, { entryId: entry.entryId, error });
        }
    }

    _toEntryEvent(entry) {
        return {
            entryId: entry.entryId,
            roundId: entry.roundId,
            side: entry.side,
            actorId: entry.actorId,
            skillId: entry.skillId,
            time: entry.time,
            priority: entry.priority,
            sourceAction: entry.sourceAction,
            execution: { ...entry.execution },
            meta: entry.meta
        };
    }

    _buildEntry(action, side, stableIndex) {
        if (!action || typeof action !== 'object') {
            return { ok: false, reason: 'Invalid action: action must be an object.', details: { action } };
        }
        if (!action.skillId) {
            return { ok: false, reason: 'Invalid action: missing skillId.', details: { action } };
        }

        const speed = Number(action.speed);
        const hasTime = Number.isFinite(Number(action.time));
        const time = hasTime ? Number(action.time) : -1 * (Number.isFinite(speed) ? speed : 0);
        const priority = Number.isFinite(Number(action.priority)) ? Number(action.priority) : 0;

        const actorId = action.sourceId || (side === 'self' ? 'player' : 'enemy');

        return {
            ok: true,
            entry: {
                entryId: `te_${this.roundId || 'round'}_${stableIndex + 1}`,
                roundId: this.roundId,
                side,
                actorId,
                skillId: action.skillId,
                time,
                priority,
                stableIndex,
                sourceAction: { ...action },
                execution: {
                    state: 'PENDING'
                },
                meta: {
                    label: action.skillName || action.skillId,
                    speed: Number.isFinite(speed) ? speed : 0
                }
            }
        };
    }

    _sortEntries(entries, rules) {
        const tieBreak = String(rules?.tieBreak || '').toLowerCase();
        const sidePriority = String(rules?.sidePriority || '').toLowerCase();

        const sideRank = (side) => {
            if (tieBreak === 'alternate') {
                return side === 'self' ? 0 : 1;
            }
            if (sidePriority === 'self' || tieBreak === 'selffirst') {
                return side === 'self' ? 0 : 1;
            }
            if (sidePriority === 'enemy' || tieBreak === 'enemyfirst') {
                return side === 'enemy' ? 0 : 1;
            }
            return 0;
        };

        return [...entries].sort((a, b) => {
            if (a.time !== b.time) return a.time - b.time;
            if (a.priority !== b.priority) return b.priority - a.priority;
            const sr = sideRank(a.side) - sideRank(b.side);
            if (sr !== 0) return sr;
            return a.stableIndex - b.stableIndex;
        });
    }

    _fail(message, details) {
        this.phase = 'ERROR';
        this._isPlaying = false;
        this._lastError = { message, details };
        this.eventBus.emit('TIMELINE_ERROR', { message, details });
        this.eventBus.emit('TIMELINE_SNAPSHOT', this.getSnapshot());
        return { ok: false, reason: message, details };
    }
}
