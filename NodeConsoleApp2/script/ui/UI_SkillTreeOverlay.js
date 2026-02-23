/**
 * @file UI_SkillTreeOverlay.js
 * @description SkillTree Overlay host (方案B). Owns overlay container show/hide.
 */

import { UI_SkillTreeModal } from './UI_SkillTreeModal.js';

export class UI_SkillTreeOverlay {
	constructor() {
		this.engine = null;
		this.view = null;
		this.dom = {
			backdrop: null,
			panel: null,
			body: null,
			closeBtn: null,
		};

		this._onKeyDown = this._onKeyDown.bind(this);
	}

	init(engine) {
		this.engine = engine;
		this._bindDOM();
		this._bindEvents();
		this.hide();
	}

	_bindDOM() {
		this.dom.backdrop = document.getElementById('skillTreeOverlay');
		this.dom.panel = this.dom.backdrop ? this.dom.backdrop.querySelector('.overlay-panel') : null;
		this.dom.body = document.getElementById('skillTreeBody');
		this.dom.closeBtn = document.getElementById('skillTreeCloseBtn');

		if (this.dom.closeBtn) {
			this.dom.closeBtn.addEventListener('click', () => this.hide());
		}

		// Optional: click backdrop to close
		if (this.dom.backdrop) {
			this.dom.backdrop.addEventListener('mousedown', (e) => {
				if (e.target === this.dom.backdrop) {
					this.hide();
				}
			});
		}
	}

	_bindEvents() {
		if (!this.engine || !this.engine.eventBus) return;
		this.engine.eventBus.on('UI:OPEN_SKILL_TREE', (payload) => this.show(payload));
		this.engine.eventBus.on('UI:CLOSE_SKILL_TREE', () => this.hide());
		this.engine.eventBus.on('DATA_UPDATE', () => {
			if (this.isVisible()) this._refresh();
		});
	}

	isVisible() {
		return !!(this.dom.backdrop && this.dom.backdrop.classList.contains('visible'));
	}

	show(payload = {}) {
		if (!this.dom.backdrop || !this.dom.body) return;

		if (!this.view) {
			this.view = new UI_SkillTreeModal();
			this.view.init(this.engine);
		}

		this.dom.body.innerHTML = '';
		this.view.mountTo(this.dom.body, {
			title: '技能树',
			onClose: () => this.hide(),
		});

		this.dom.backdrop.classList.add('visible');
		this.dom.backdrop.setAttribute('aria-hidden', 'false');
		document.addEventListener('keydown', this._onKeyDown);

		// Optional focus skill
		if (payload && payload.focusSkillId) {
			// current implementation doesn't expose a public focus API
		}
	}

	hide() {
		if (!this.dom.backdrop) return;
		this.dom.backdrop.classList.remove('visible');
		this.dom.backdrop.setAttribute('aria-hidden', 'true');
		document.removeEventListener('keydown', this._onKeyDown);
	}

	_refresh() {
		// Re-mount to recompute derived states (cheap for MVP)
		if (!this.dom.body || !this.view) return;
		this.dom.body.innerHTML = '';
		this.view.mountTo(this.dom.body, {
			title: '技能树',
			onClose: () => this.hide(),
		});
	}

	_onKeyDown(e) {
		if (e.key === 'Escape') {
			this.hide();
		}
	}
}
