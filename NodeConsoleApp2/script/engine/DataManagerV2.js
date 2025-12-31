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
            // Sync runtime data before saving
            if (!this.dataConfig.runtime) {
                this.dataConfig.runtime = {};
            }
            
            // Save current level state (including enemies HP)
            if (this._currentLevelConfig) {
                this.dataConfig.runtime.levelData = this._currentLevelConfig;
            } else {
                delete this.dataConfig.runtime.levelData;
            }

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
                    
                    // Restore runtime level data
                    if (this.dataConfig.runtime && this.dataConfig.runtime.levelData) {
                        this._currentLevelConfig = this.dataConfig.runtime.levelData;
                    }
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
        // Use loaded player config or fallback to hardcoded default
        const playerTemplate = (this.gameConfig && this.gameConfig.player && this.gameConfig.player.default) 
            ? this.gameConfig.player.default 
            : {
                stats: { hp: 100, maxHp: 100, ap: 4, maxAp: 6, speed: 10 },
                skills: ['skill_slash', 'skill_heal', 'skill_fireball'],
                equipment: { weapon: null, armor: { head: null, chest: null } },
                inventory: []
            };

        this.dataConfig.global = {
            player: {
                id: `player_${Date.now()}`,
                name: username,
                stats: { ...playerTemplate.stats },
                skills: [...playerTemplate.skills],
                equipment: JSON.parse(JSON.stringify(playerTemplate.equipment)),
                inventory: [...playerTemplate.inventory],
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

    // --- Asset Loading ---

    async loadConfigs() {
        try {
            // Try to fetch JSON files
            // Note: This requires the app to be served via HTTP/HTTPS. 
            // If running from file://, this will likely fail and fall back to mock data.
            const basePath = '../assets/data/'; 
            
            const [skills, items, enemies, levels, player] = await Promise.all([
                fetch(basePath + 'skills.json').then(r => r.json()),
                fetch(basePath + 'items.json').then(r => r.json()),
                fetch(basePath + 'enemies.json').then(r => r.json()),
                fetch(basePath + 'levels.json').then(r => r.json()),
                fetch(basePath + 'player.json').then(r => r.json())
            ]);

            this.gameConfig = {
                skills,
                items,
                enemies,
                levels,
                player
            };
            
            console.log("Configs loaded from JSON:", this.gameConfig);
        } catch (e) {
            console.warn("Failed to load JSON configs (likely due to file:// protocol), falling back to mock data.", e);
            this.loadMockConfigs();
        }
    }

    loadMockConfigs() {
        this.gameConfig = {
            player: {
                default: {
                    stats: { hp: 100, maxHp: 100, ap: 4, maxAp: 6, speed: 10 },
                    skills: ['skill_slash', 'skill_heal', 'skill_fireball'],
                    equipment: { weapon: null, armor: { head: null, chest: null } },
                    inventory: []
                }
            },
            skills: {
                'skill_slash': { id: 'skill_slash', name: 'Õ¶»÷', cost: 2, type: 'DAMAGE', value: 20, "speed": 0 },
                'skill_heal': { id: 'skill_heal', name: 'ÖÎÁÆ', cost: 3, type: 'HEAL', value: 30, "speed": -2 },
                'skill_fireball': { id: 'skill_fireball', name: '»ðÇòÊõ', cost: 4, type: 'DAMAGE', value: 40, "speed": -5 },
                'skill_bite': { id: 'skill_bite', name: 'ËºÒ§', cost: 2, type: 'DAMAGE', value: 15, "speed": 2 }
            },
            items: {
                'wp_sword_01': { id: 'wp_sword_01', name: 'Ìú½£', type: 'WEAPON', value: 10 }
            },
            enemies: {
                'goblin_01': {
                    id: 'goblin_01',
                    name: '¸ç²¼ÁÖÕ½Ê¿',
                    stats: { hp: 50, maxHp: 50, speed: 8, ap: 3 },
                    skills: ['skill_bite'],
                    bodyParts: {
                        head: { maxHp: 20, armor: 0, weakness: 1.5 },
                        body: { maxHp: 30, armor: 2, weakness: 1.0 }
                    }
                }
            },
            levels: {
                'level_1_1': { 
                    id: 'level_1_1', 
                    name: 'ÓÄ°µÉ­ÁÖ±ßÔµ', 
                    waves: [
                        { enemies: [{ templateId: 'goblin_01', position: 1 }] }
                    ]
                }
            }
        };
    }

    getSkillConfig(skillId) {
        return this.gameConfig.skills ? this.gameConfig.skills[skillId] : null;
    }

    // Instantiate a level from config, creating runtime enemy instances
    instantiateLevel(levelId) {
        const levelConfig = this.gameConfig.levels[levelId];
        if (!levelConfig) return null;

        // Deep copy basic level info
        const runtimeLevel = {
            id: levelConfig.id,
            name: levelConfig.name,
            enemies: []
        };

        // Instantiate enemies from the first wave (simple support for now)
        if (levelConfig.waves && levelConfig.waves.length > 0) {
            const wave = levelConfig.waves[0];
            wave.enemies.forEach((enemyRef, index) => {
                const template = this.gameConfig.enemies[enemyRef.templateId];
                if (template) {
                    const enemyInstance = JSON.parse(JSON.stringify(template)); // Deep copy template
                    enemyInstance.instanceId = `${template.id}_${index}_${Date.now()}`; // Unique ID
                    enemyInstance.id = enemyInstance.instanceId; // Map instanceId to id for compatibility
                    
                    // Initialize Runtime Stats
                    enemyInstance.hp = template.stats.hp;
                    enemyInstance.maxHp = template.stats.maxHp;
                    enemyInstance.speed = template.stats.speed;
                    
                    // Initialize Body Parts Runtime State
                    if (enemyInstance.bodyParts) {
                        for (let part in enemyInstance.bodyParts) {
                            enemyInstance.bodyParts[part].hp = enemyInstance.bodyParts[part].maxHp;
                            enemyInstance.bodyParts[part].status = 'NORMAL';
                            // Ensure armor is set if not in template (default 0)
                            if (enemyInstance.bodyParts[part].armor === undefined) enemyInstance.bodyParts[part].armor = 0;
                        }
                    }
                    
                    runtimeLevel.enemies.push(enemyInstance);
                }
            });
        } else if (levelConfig.enemies) {
             // Legacy support for direct definition (if any)
             runtimeLevel.enemies = JSON.parse(JSON.stringify(levelConfig.enemies));
        }

        return runtimeLevel;
    }

    getLevelConfig(levelId) {
        return this.gameConfig.levels[levelId];
    }
}

export default new DataManager();
