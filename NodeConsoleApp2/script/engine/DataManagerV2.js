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

    _normalizeSkills(skills, playerTemplate) {
        // Desired schema: { skillTreeId, skillPoints, learned: string[] }
        if (skills && typeof skills === 'object' && !Array.isArray(skills)) {
            const learned = Array.isArray(skills.learned) ? skills.learned : [];
            return {
                skillTreeId: skills.skillTreeId ?? null,
                skillPoints: Number.isFinite(skills.skillPoints) ? skills.skillPoints : 0,
                learned: [...learned]
            };
        }

        // Legacy schema: string[]
        if (Array.isArray(skills)) {
            const tpl = (playerTemplate && typeof playerTemplate.skills === 'object' && !Array.isArray(playerTemplate.skills))
                ? playerTemplate.skills
                : null;
            return {
                skillTreeId: tpl?.skillTreeId ?? null,
                skillPoints: Number.isFinite(tpl?.skillPoints) ? tpl.skillPoints : 0,
                learned: [...skills]
            };
        }

        // Missing
        const tpl = (playerTemplate && typeof playerTemplate.skills === 'object' && !Array.isArray(playerTemplate.skills))
            ? playerTemplate.skills
            : null;
        return {
            skillTreeId: tpl?.skillTreeId ?? null,
            skillPoints: Number.isFinite(tpl?.skillPoints) ? tpl.skillPoints : 0,
            learned: Array.isArray(tpl?.learned) ? [...tpl.learned] : []
        };
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
                const playerTemplate = (this.gameConfig && this.gameConfig.player && this.gameConfig.player.default)
                    ? this.gameConfig.player.default
                    : null;
                
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

                // Migration/Normalization: skills schema (object) + backward compatibility
                if (this.playerData) {
                    this.playerData.skills = this._normalizeSkills(this.playerData.skills, playerTemplate);
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
                equipment: { weapon: null, head: null, chest: null, abdomen: null, arm: null, leg: null },
                inventory: []
            };

        this.dataConfig.global = {
            player: {
                id: `player_${Date.now()}`,
                name: username,
                stats: { ...playerTemplate.stats },
                skills: this._normalizeSkills(playerTemplate.skills, playerTemplate),
                bodyParts: playerTemplate.bodyParts ? JSON.parse(JSON.stringify(playerTemplate.bodyParts)) : undefined,
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
            // Try to fetch JSON files via data sources config
            // Note: This requires the app to be served via HTTP/HTTPS. 
            // If running from file://, this will likely fail and fall back to mock data.
            const configUrl = (typeof window !== 'undefined' && window.DATA_CONFIG_URL)
                ? window.DATA_CONFIG_URL
                : '../assets/data/config.json';

            const configResponse = await fetch(configUrl);
            if (!configResponse.ok) {
                throw new Error(`HTTP error ${configResponse.status} loading ${configUrl}`);
            }

            const dataSources = await configResponse.json();
            const basePath = dataSources.basePath || '';
            const sources = dataSources.sources || {};

            const fetchConfig = async (sourceKey) => {
                const filename = sources[sourceKey];
                if (!filename) {
                    throw new Error(`Missing source path for ${sourceKey}`);
                }
                const url = basePath ? `${basePath}${filename}` : filename;
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status} loading ${url}`);
                }
                return await response.json();
            };

            // Load player first so we can decide which skill tree to load
            const [player, items, enemies, levels, buffs] = await Promise.all([
                fetchConfig('player'),
                fetchConfig('items'),
                fetchConfig('enemies'),
                fetchConfig('levels'),
                fetchConfig('buffs')
            ]);

            const skillTreeId = player && player.default && player.default.skills && typeof player.default.skills === 'object'
                ? player.default.skills.skillTreeId
                : null;
            const skillsByTree = sources.skillsByTree || {};
            const skillsPath = (skillTreeId && skillsByTree && skillsByTree[skillTreeId])
                ? skillsByTree[skillTreeId]
                : sources.skills;

            if (!skillsPath) {
                throw new Error('Missing skills source path (sources.skills or sources.skillsByTree[skillTreeId]).');
            }

            const skillsUrl = basePath ? `${basePath}${skillsPath}` : skillsPath;
            const skillsResp = await fetch(skillsUrl);
            if (!skillsResp.ok) {
                throw new Error(`HTTP error ${skillsResp.status} loading ${skillsUrl}`);
            }
            const skills = await skillsResp.json();

            if (!skills || !Array.isArray(skills.skills)) {
                throw new Error('Skills data must provide a skills array (skills_melee_v4_5.json format).');
            }

            const skillsMap = Object.create(null);
            skills.skills.forEach(skill => {
                if (skill && skill.id) {
                    skillsMap[skill.id] = skill;
                }
            });
            
            // Validate basic structure
            if (!skills || !items || !enemies || !levels || !player || !buffs) {
                 throw new Error("One or more config files are empty or invalid.");
            }

            this.gameConfig = {
                skills: skillsMap,
                items,
                enemies,
                levels,
                player,
                buffs
            };

            if (player && Array.isArray(player.default?.skills)) {
                const missing = player.default.skills.filter(id => !skillsMap[id]);
                if (missing.length > 0) {
                    console.warn('[DataManager] Missing skills in skills data:', missing);
                }
            }
            
            console.log("? [DataManager] Configs successfully loaded from JSON files.", this.gameConfig);
        } catch (e) {
            console.warn("?? [DataManager] Failed to load JSON configs. Reason:", e.message);
            console.log("?? [DataManager] Falling back to internal MOCK data.");
            this.loadMockConfigs();
        }
    }

    loadMockConfigs() {
        this.gameConfig = {
            player: {
                default: {
                    stats: { hp: 100, maxHp: 100, ap: 4, maxAp: 6, speed: 10 },
                    skills: ['skill_slash', 'skill_heal', 'skill_fireball'],
                    equipment: { weapon: null, head: null, chest: null, abdomen: null, arm: null, leg: null },
                    inventory: []
                }
            },
            buffs: {
                buff_poison: {
                    id: 'buff_poison',
                    name: '中毒',
                    type: 'debuff',
                    tags: ['poison', 'dot'],
                    lifecycle: { duration: 3, maxStacks: 5, stackStrategy: 'refresh', removeOnBattleEnd: true },
                    effects: [{ trigger: 'onTurnEnd', action: 'damage', value: 'maxHp * 0.05', valueType: 'formula', target: 'self' }]
                }
            },
            skills: {
                'skill_slash': { id: 'skill_slash', name: '斩击', cost: 2, type: 'DAMAGE', value: 20, "speed": 0 },
                'skill_heal': { id: 'skill_heal', name: '治疗', cost: 3, type: 'HEAL', value: 30, "speed": -2 },
                'skill_fireball': { id: 'skill_fireball', name: '火球术', cost: 4, type: 'DAMAGE', value: 40, "speed": -5 },
                'skill_bite': { id: 'skill_bite', name: '撕咬', cost: 2, type: 'DAMAGE', value: 15, "speed": 2 }
            },
            items: {
                'wp_sword_01': { id: 'wp_sword_01', name: '铁剑', type: 'WEAPON', value: 10 }
            },
            enemies: {
                'goblin_01': {
                    id: 'goblin_01',
                    name: '哥布林战士',
                    stats: { hp: 50, maxHp: 50, speed: 8, ap: 3 },
                    skills: ['skill_bite'],
                    bodyParts: {
                        head: { max: 0, weakness: 1.5 },
                        chest: { max: 2, weakness: 1.0 }
                    }
                }
            },
            levels: {
                'level_1_1': { 
                    id: 'level_1_1', 
                    name: '幽暗森林边缘', 
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
                        for (let partKey in enemyInstance.bodyParts) {
                            const partData = enemyInstance.bodyParts[partKey];
                            // Initialize current from max (Data Design V2)
                            const maxVal = (partData.max !== undefined) ? partData.max : (partData.maxArmor || 0);
                            
                            partData.max = maxVal;
                            partData.current = maxVal;
                            partData.status = 'NORMAL';
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

    /**
     * 获取所有关卡列表
     * @returns {Array} 关卡对象数组
     */
    getLevels() {
        if (!this.gameConfig || !this.gameConfig.levels) {
            return [];
        }
        return Object.values(this.gameConfig.levels);
    }
}

export default new DataManager();
