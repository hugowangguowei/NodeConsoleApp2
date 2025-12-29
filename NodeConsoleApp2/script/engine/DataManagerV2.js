class DataManager {
    constructor() {
        this.dataConfig = {
            version: "1.0.0",
            timestamp: 0,
            global: null,
            runtime: null,
            settings: {
                audio: { bgmVolume: 0.8, sfxVolume: 1.0 },
                display: { showDamageNumbers: true }
            }
        };
        this.gameConfig = {}; // To store static configs like items, skills
        this._currentLevelConfig = null; // Runtime cache for current level static config
    }

    get playerData() {
        return this.dataConfig.global ? this.dataConfig.global.player : null;
    }

    get currentLevelData() {
        return this._currentLevelConfig;
    }

    set currentLevelData(val) {
        this._currentLevelConfig = val;
    }

    // --- Persistence ---

    saveGame() {
        if (this.dataConfig.global) {
            this.dataConfig.timestamp = Date.now();
            const json = JSON.stringify(this.dataConfig);
            localStorage.setItem('save_game', json);
            console.log('Game saved.');
        }
    }

    loadGame() {
        const json = localStorage.getItem('save_game');
        if (json) {
            try {
                const parsed = JSON.parse(json);
                
                // Check if it's the new format or legacy format
                if (parsed.version && parsed.global) {
                    this.dataConfig = parsed;
                } else {
                    // Migration: Legacy save was just the player object
                    console.log("Migrating legacy save...");
                    this.dataConfig.global = {
                        player: parsed,
                        progress: { unlockedLevels: ['level_1_1'], completedQuests: [], flags: {} }
                    };
                    this.dataConfig.runtime = { currentScene: "MAIN_MENU", battleState: null };
                }

                // Migration: Ensure skills exist for old saves (legacy logic)
                if (this.playerData && !this.playerData.skills) {
                    this.playerData.skills = ['skill_slash', 'skill_heal', 'skill_fireball'];
                }
                
                // Migration: Ensure speed exists (legacy logic)
                if (this.playerData && this.playerData.stats && this.playerData.stats.speed === undefined) {
                    this.playerData.stats.speed = 10;
                }

                console.log('Game loaded.');
                return true;
            } catch (e) {
                console.error("Failed to load save game:", e);
                return false;
            }
        }
        return false;
    }

    createNewGame(username) {
        this.dataConfig.global = {
            player: {
                id: `player_${Date.now()}`,
                name: username,
                stats: {
                    hp: 100,
                    maxHp: 100,
                    ap: 4,
                    maxAp: 6,
                    speed: 10
                },
                skills: ['skill_slash', 'skill_heal', 'skill_fireball'],
                equipment: {
                    weapon: null,
                    armor: { head: null, chest: null }
                },
                inventory: [],
            },
            progress: {
                unlockedLevels: ['level_1_1'],
                completedQuests: [],
                flags: {}
            }
        };

        this.dataConfig.runtime = {
            currentScene: "MAIN_MENU",
            battleState: null
        };

        this.saveGame();
        console.log('New game created.');
        return this.playerData;
    }

    // --- Asset Loading (Mock) ---

    async loadConfigs() {
        // In a real app, fetch JSON files here.
        // For now, we mock some data.
        this.gameConfig = {
            skills: {
                'skill_slash': { id: 'skill_slash', name: 'Slash', cost: 2, type: 'DAMAGE', value: 20, speed: 0 },
                'skill_heal': { id: 'skill_heal', name: 'Heal', cost: 3, type: 'HEAL', value: 30, speed: -2 },
                'skill_fireball': { id: 'skill_fireball', name: 'Fireball', cost: 4, type: 'DAMAGE', value: 40, speed: -5 },
                'skill_bite': { id: 'skill_bite', name: 'Bite', cost: 2, type: 'DAMAGE', value: 15, speed: 2 }
            },
            items: {
                'wp_sword_01': { id: 'wp_sword_01', name: 'Iron Sword', type: 'WEAPON', value: 10 }
            },
            levels: {
                'level_1_1': { 
                    id: 'level_1_1', 
                    name: 'Forest Edge', 
                    enemies: [{ id: 'goblin_01', hp: 50, speed: 8, skills: ['skill_bite'] }] 
                }
            }
        };
        return Promise.resolve();
    }

    getSkillConfig(skillId) {
        return this.gameConfig.skills ? this.gameConfig.skills[skillId] : null;
    }

    getLevelConfig(levelId) {
        return this.gameConfig.levels[levelId];
    }
}

export default new DataManager();
