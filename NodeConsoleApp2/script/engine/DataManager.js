class DataManager {
    constructor() {
        this.playerData = null;
        this.currentLevelData = null;
        this.gameConfig = {}; // To store static configs like items, skills
    }

    // --- Persistence ---

    saveGame() {
        if (this.playerData) {
            const json = JSON.stringify(this.playerData);
            localStorage.setItem('save_game', json);
            console.log('Game saved.');
        }
    }

    loadGame() {
        const json = localStorage.getItem('save_game');
        if (json) {
            this.playerData = JSON.parse(json);
            
            // Migration: Ensure skills exist for old saves
            if (!this.playerData.skills) {
                this.playerData.skills = ['skill_slash', 'skill_heal', 'skill_fireball'];
            }
            
            // Migration: Ensure speed exists
            if (this.playerData.stats && this.playerData.stats.speed === undefined) {
                this.playerData.stats.speed = 10;
            }

            console.log('Game loaded.');
            return true;
        }
        return false;
    }

    createNewGame(username) {
        this.playerData = {
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
            progress: {
                unlockedLevels: ['level_1_1']
            }
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
