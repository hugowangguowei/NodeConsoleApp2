export default class Buff {
	constructor(definition, options = {}) {
		if (!definition || !definition.id) {
			throw new Error('Buff definition must have an id');
		}

		this.definition = definition;
		this.id = definition.id;
		this.instanceId = options.instanceId || `${definition.id}::${Date.now()}::${Math.random().toString(16).slice(2)}`;
		this.ownerId = options.ownerId || null;

		const lc = definition.lifecycle || {};
		this.duration = (options.duration !== undefined) ? options.duration : (lc.duration !== undefined ? lc.duration : 0);
		this.remaining = this.duration;

		this.stacks = options.stacks || 1;
		this.maxStacks = (options.maxStacks !== undefined) ? options.maxStacks : (lc.maxStacks !== undefined ? lc.maxStacks : 1);
		this.stackStrategy = options.stackStrategy || lc.stackStrategy || 'refresh';

		this.tags = Array.isArray(definition.tags) ? definition.tags.slice() : [];

		this._triggerCounts = Object.create(null);
	}

	isExpired() {
		return this.remaining === 0;
	}

	isPermanent() {
		return this.duration === -1;
	}

	tick() {
		if (this.isPermanent()) return;
		if (this.remaining > 0) this.remaining -= 1;
	}

	recordTrigger(triggerKey) {
		this._triggerCounts[triggerKey] = (this._triggerCounts[triggerKey] || 0) + 1;
	}

	getTriggerCount(triggerKey) {
		return this._triggerCounts[triggerKey] || 0;
	}
}
