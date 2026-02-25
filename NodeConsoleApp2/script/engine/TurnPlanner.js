export default class TurnPlanner {
	constructor({ getSlotLayout, getPlayerId, getSkillConfig, getCurrentAp, getUsedAp }) {
		this._getSlotLayout = getSlotLayout;
		this._getPlayerId = getPlayerId;
		this._getSkillConfig = getSkillConfig;
		this._getCurrentAp = getCurrentAp;
		this._getUsedAp = getUsedAp;
		this.reset();
	}

	reset() {
		this.assigned = Object.create(null); // slotKey -> actionId
		this.actionsById = Object.create(null); // actionId -> action
		this.order = []; // actionId[]
		this.skillCounts = Object.create(null); // skillId -> count
		this._nextId = 1;
	}

	makeSlotKey(side, part, index) {
		return `${side}:${part}:${index}`;
	}

	parseSlotKey(slotKey) {
		if (typeof slotKey !== 'string') return null;
		const m = slotKey.match(/^(self|enemy):([^:]+):(\d+)$/);
		if (!m) return null;
		return { side: m[1], part: m[2], index: Number(m[3]) };
	}

	_validateSlotKey(slotKey) {
		const parsed = this.parseSlotKey(slotKey);
		if (!parsed) return { ok: false, reason: 'Invalid slotKey format.' };
		const layout = this._getSlotLayout ? this._getSlotLayout() : null;
		if (!layout || !layout.slotCounts) return { ok: false, reason: 'Slot layout not available.' };
		const cap = Number(layout.slotCounts?.[parsed.part]?.[parsed.side] ?? 0);
		if (!Number.isFinite(cap) || cap <= 0) return { ok: false, reason: `No slot capacity for ${parsed.side}:${parsed.part}.` };
		if (parsed.index < 0 || parsed.index >= cap) return { ok: false, reason: `Slot index out of range for ${parsed.side}:${parsed.part} (cap ${cap}).` };
		return { ok: true, parsed };
	}

	_getSkillMaxPlacements(skillConfig) {
		const n = Number(skillConfig?.placement?.maxSlots);
		if (!Number.isFinite(n) || n <= 0) return 1;
		return Math.floor(n);
	}

	_getActionCountForSkill(skillId) {
		return Number(this.skillCounts?.[skillId] ?? 0) || 0;
	}

	_findLastActionIdForSkill(skillId) {
		for (let i = this.order.length - 1; i >= 0; i--) {
			const id = this.order[i];
			const a = this.actionsById[id];
			if (a && a.skillId === skillId) return id;
		}
		return null;
	}

	_assignInternal(slotKey, action) {
		const actionId = `a_${this._nextId++}`;
		action.actionId = actionId;
		action.slotKey = slotKey;
		this.actionsById[actionId] = action;
		this.assigned[slotKey] = actionId;
		this.order.push(actionId);
		this.skillCounts[action.skillId] = this._getActionCountForSkill(action.skillId) + 1;
		return actionId;
	}

	unassign(slotKey) {
		const v = this._validateSlotKey(slotKey);
		if (!v.ok) return { ok: false, reason: v.reason };
		const actionId = this.assigned[slotKey];
		if (!actionId) return { ok: true, removed: false };
		const action = this.actionsById[actionId];
		delete this.assigned[slotKey];
		delete this.actionsById[actionId];
		this.order = this.order.filter(id => id !== actionId);
		if (action && action.skillId) {
			this.skillCounts[action.skillId] = Math.max(0, this._getActionCountForSkill(action.skillId) - 1);
		}
		return { ok: true, removed: true, actionId };
	}

	assign({ slotKey, skillId, targetId, bodyPart, cost, speed, replaceIfAlreadyPlaced }) {
		const v = this._validateSlotKey(slotKey);
		if (!v.ok) return { ok: false, reason: v.reason };
		if (this.assigned[slotKey]) return { ok: false, reason: 'Slot already occupied.' };
		const skillCfg = this._getSkillConfig ? this._getSkillConfig(skillId) : null;
		if (!skillCfg) return { ok: false, reason: `Unknown skill: ${skillId}` };

		const maxPlacements = this._getSkillMaxPlacements(skillCfg);
		const placed = this._getActionCountForSkill(skillId);
		if (placed >= maxPlacements) return { ok: false, reason: `Reached max placements for skill (${maxPlacements}).` };

		const currentAp = this._getCurrentAp ? this._getCurrentAp() : null;
		const usedAp = this._getUsedAp ? this._getUsedAp() : 0;
		if (typeof currentAp === 'number' && typeof cost === 'number' && currentAp < usedAp + cost) {
			return { ok: false, reason: 'Not enough AP.' };
		}

		if (replaceIfAlreadyPlaced && maxPlacements === 1) {
			const prevId = this._findLastActionIdForSkill(skillId);
			if (prevId) {
				const prevAction = this.actionsById[prevId];
				if (prevAction && prevAction.slotKey) this.unassign(prevAction.slotKey);
			}
		}

		const action = {
			source: 'PLAYER',
			sourceId: this._getPlayerId ? this._getPlayerId() : null,
			skillId,
			targetId,
			bodyPart,
			cost,
			speed,
			meta: { side: v.parsed.side, part: v.parsed.part, slotIndex: v.parsed.index }
		};

		const actionId = this._assignInternal(slotKey, action);
		return { ok: true, actionId };
	}

	getPlannedActions() {
		return this.order.map(id => this.actionsById[id]).filter(Boolean);
	}
}
