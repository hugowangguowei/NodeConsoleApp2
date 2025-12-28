
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
            items: {
                'wp_sword_01': { id: 'wp_sword_01', name: 'Iron Sword', type: 'WEAPON', value: 10 }
            },
            levels: {
                'level_1_1': { 
                    id: 'level_1_1', 
                    name: 'Forest Edge', 
                    enemies: [{ id: 'goblin_01', hp: 50, speed: 8 }] 
                }
            }
        };
        return Promise.resolve();
    }

    getLevelConfig(levelId) {
        return this.gameConfig.levels[levelId];
    }
}

export default new DataManager();
