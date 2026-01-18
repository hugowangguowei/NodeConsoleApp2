export default class BuffRegistry {
	constructor(definitions = {}) {
		this._raw = definitions;
	}

	setDefinitions(definitions = {}) {
		this._raw = definitions;
	}

	getDefinition(buffId) {
		const def = this._raw ? this._raw[buffId] : null;
		if (!def) return null;

		// aliasOf 支持：允许 buff 定义复用另一条定义
		if (def.aliasOf) {
			const aliased = this._raw[def.aliasOf];
			if (!aliased) return null;
			return { ...aliased, id: def.id, name: def.name || aliased.name, type: def.type || aliased.type, tags: def.tags || aliased.tags };
		}

		return def;
	}
}
