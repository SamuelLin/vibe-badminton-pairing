class BadmintonPairingSystem {
    constructor() {
        this.players = [];
        this.courts = [];
        this.waitingPlayers = [];
        this.pairingHistory = new Map(); // 記錄配對歷史
        this.courtCount = 4;
        this.editingCourt = null; // 正在編輯的場地
        
        this.initializeEventListeners();
        this.updateCourts();
        this.loadFromLocalStorage();
    }

    initializeEventListeners() {
        // 新增人員
        document.getElementById('add-player').addEventListener('click', () => {
            this.addPlayer();
        });

        // Enter鍵新增人員
        document.getElementById('player-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addPlayer();
            }
        });

        // 更新場地數量
        document.getElementById('update-courts').addEventListener('click', () => {
            this.updateCourtCount();
        });

        // 自動配對
        document.getElementById('auto-pair').addEventListener('click', () => {
            this.autoPair();
        });

        // 手動開始所有空閒場地
        document.getElementById('manual-start').addEventListener('click', () => {
            this.startAllReadyCourts();
        });

        // 重置統計
        document.getElementById('reset-stats').addEventListener('click', () => {
            this.resetAllStats();
        });

        // 清空所有資料
        document.getElementById('clear-all-data').addEventListener('click', () => {
            this.clearAllData();
        });
    }

    addPlayer() {
        const nameInput = document.getElementById('player-name');
        const levelSelect = document.getElementById('player-level');
        
        const name = nameInput.value.trim();
        const level = parseInt(levelSelect.value);
        
        if (!name || !level) {
            alert('請輸入姓名和選擇等級');
            return;
        }

        // 檢查是否已存在相同姓名
        if (this.players.find(p => p.name === name)) {
            alert('已存在相同姓名的人員');
            return;
        }

        const player = {
            id: Date.now(),
            name: name,
            level: level,
            isPlaying: false,
            courtId: null,
            gamesPlayed: 0,        // 已打場次
            waitingRounds: 0       // 等待場次
        };

        this.players.push(player);
        this.waitingPlayers.push(player);
        
        // 清空輸入欄位
        nameInput.value = '';
        levelSelect.value = '';
        
        this.updateDisplay();
        this.saveToLocalStorage();
    }

    removePlayer(playerId) {
        // 從所有列表中移除
        this.players = this.players.filter(p => p.id !== playerId);
        this.waitingPlayers = this.waitingPlayers.filter(p => p.id !== playerId);
        
        // 如果該人員正在場上，需要結束該場比賽
        const court = this.courts.find(c => 
            c.pairs.some(pair => 
                pair.players.some(p => p.id === playerId)
            )
        );
        
        if (court) {
            this.endGame(court.id);
        }
        
        this.updateDisplay();
        this.saveToLocalStorage();
    }

    updateCourtCount() {
        const newCount = parseInt(document.getElementById('court-count').value);
        if (newCount < 1 || newCount > 10) {
            alert('場地數量必須在1-10之間');
            return;
        }
        
        this.courtCount = newCount;
        this.updateCourts();
        this.saveToLocalStorage();
    }

    updateCourts() {
        // 保存現有場地的比賽狀態
        const existingGames = new Map();
        this.courts.forEach(court => {
            if (court.occupied) {
                existingGames.set(court.id, court);
            }
        });

        // 重新建立場地
        this.courts = [];
        for (let i = 1; i <= this.courtCount; i++) {
            const court = {
                id: i,
                occupied: false,
                pairs: [],
                startTime: null
            };
            
            // 恢復現有比賽
            if (existingGames.has(i)) {
                const existingCourt = existingGames.get(i);
                court.occupied = existingCourt.occupied;
                court.pairs = existingCourt.pairs;
                court.startTime = existingCourt.startTime;
            }
            
            this.courts.push(court);
        }
        
        this.updateDisplay();
    }

    // 配對算法 - 核心邏輯
    findBestPairing(availablePlayers) {
        if (availablePlayers.length < 4) {
            return null;
        }

        let bestPairing = null;
        let bestScore = -1;

        // 嘗試所有可能的配對組合
        const combinations = this.generatePairCombinations(availablePlayers);
        
        for (const combination of combinations) {
            const score = this.evaluatePairing(combination);
            if (score > bestScore) {
                bestScore = score;
                bestPairing = combination;
            }
        }

        return bestPairing;
    }

    generatePairCombinations(players) {
        const combinations = [];
        
        // 選擇4個人員的所有組合
        for (let i = 0; i < players.length - 3; i++) {
            for (let j = i + 1; j < players.length - 2; j++) {
                for (let k = j + 1; k < players.length - 1; k++) {
                    for (let l = k + 1; l < players.length; l++) {
                        const fourPlayers = [players[i], players[j], players[k], players[l]];
                        
                        // 生成這4個人的所有配對方式
                        const pairings = this.generatePairingsForFour(fourPlayers);
                        combinations.push(...pairings);
                    }
                }
            }
        }
        
        return combinations;
    }

    generatePairingsForFour(fourPlayers) {
        const [p1, p2, p3, p4] = fourPlayers;
        
        return [
            {
                pair1: [p1, p2],
                pair2: [p3, p4]
            },
            {
                pair1: [p1, p3],
                pair2: [p2, p4]
            },
            {
                pair1: [p1, p4],
                pair2: [p2, p3]
            }
        ];
    }

    evaluatePairing(pairing) {
        let score = 100; // 基礎分數
        
        // 評估等級差距
        const levelDiff1 = Math.abs(pairing.pair1[0].level - pairing.pair1[1].level);
        const levelDiff2 = Math.abs(pairing.pair2[0].level - pairing.pair2[1].level);
        
        // 隊內等級差距懲罰 - 減少懲罰，因為有時候需要強弱搭配
        score -= (levelDiff1 + levelDiff2) * 3;
        
        // 隊伍間實力平衡評估 - 這是最重要的
        const teamBalance = this.evaluateTeamBalance(pairing);
        score += teamBalance;
        
        // 檢查配對歷史 - 避免重複配對
        const historyPenalty = this.getHistoryPenalty(pairing);
        score -= historyPenalty;
        
        // 公平性評估 - 優先安排等待久和打得少的球員
        const fairnessBonus = this.getFairnessBonus(pairing);
        score += fairnessBonus;
        
        return score;
    }

    evaluateTeamBalance(pairing) {
        const team1Players = pairing.pair1;
        const team2Players = pairing.pair2;
        
        // 計算各隊的實力指標
        const team1Strength = this.calculateTeamStrength(team1Players);
        const team2Strength = this.calculateTeamStrength(team2Players);
        
        // 隊伍間實力差距 - 越接近越好
        const strengthDiff = Math.abs(team1Strength - team2Strength);
        let balanceScore = 50 - (strengthDiff * 10); // 基礎50分，實力差距每0.1差1分
        
        // 額外獎勵：理想的強弱搭配
        const team1Balance = this.getTeamInternalBalance(team1Players);
        const team2Balance = this.getTeamInternalBalance(team2Players);
        
        // 如果兩隊都是強弱搭配（而不是強強對弱弱），給額外獎勵
        if (team1Balance > 0 && team2Balance > 0) {
            balanceScore += 15; // 強弱搭配獎勵
        }
        
        return Math.max(balanceScore, -30); // 最低不低於-30分
    }

    calculateTeamStrength(players) {
        // 考慮強弱搭配的效果
        const levels = players.map(p => p.level).sort((a, b) => b - a); // 從高到低
        const strongPlayer = levels[0];
        const weakPlayer = levels[1];
        
        // 強弱搭配的實力計算：強者帶弱者，但弱者會拖累強者
        // 公式：(強者實力 * 0.8 + 弱者實力 * 1.2) / 2
        // 這樣強者影響較大，但弱者的影響也不能忽視
        const teamStrength = (strongPlayer * 0.8 + weakPlayer * 1.2) / 2;
        
        return teamStrength;
    }

    getTeamInternalBalance(players) {
        // 評估隊內的強弱搭配程度
        const levelDiff = Math.abs(players[0].level - players[1].level);
        
        // 理想的等級差距是1-3級，給予獎勵
        if (levelDiff >= 1 && levelDiff <= 3) {
            return 1; // 好的強弱搭配
        } else if (levelDiff === 0) {
            return 0; // 同等級，中性
        } else {
            return -1; // 差距太大，不好的搭配
        }
    }

    getBalanceDisplay(pairs) {
        if (!pairs || pairs.length !== 2) return "未知";
        
        const team1Strength = this.calculateTeamStrength(pairs[0].players);
        const team2Strength = this.calculateTeamStrength(pairs[1].players);
        const strengthDiff = Math.abs(team1Strength - team2Strength);
        
        let balanceText = "";
        let balanceColor = "";
        
        if (strengthDiff <= 0.5) {
            balanceText = "非常平衡";
            balanceColor = "#28a745"; // 綠色
        } else if (strengthDiff <= 1.0) {
            balanceText = "平衡";
            balanceColor = "#28a745"; // 綠色
        } else if (strengthDiff <= 1.5) {
            balanceText = "稍有差距";
            balanceColor = "#ffc107"; // 黃色
        } else if (strengthDiff <= 2.0) {
            balanceText = "差距較大";
            balanceColor = "#fd7e14"; // 橙色
        } else {
            balanceText = "差距很大";
            balanceColor = "#dc3545"; // 紅色
        }
        
        return `<span style="color: ${balanceColor}; font-weight: bold;">${balanceText}</span> (差距: ${strengthDiff.toFixed(1)})`;
    }

    getFairnessBonus(pairing) {
        let bonus = 0;
        const allPlayers = [...pairing.pair1, ...pairing.pair2];
        
        // 等待場次加分 - 等得越久加分越多
        const totalWaitingRounds = allPlayers.reduce((sum, player) => sum + player.waitingRounds, 0);
        bonus += totalWaitingRounds * 15; // 每等待1場加15分
        
        // 已打場次加分 - 打得越少加分越多
        const maxGamesPlayed = Math.max(...this.players.map(p => p.gamesPlayed), 0);
        allPlayers.forEach(player => {
            const gamesGap = maxGamesPlayed - player.gamesPlayed;
            bonus += gamesGap * 10; // 每少打1場加10分
        });
        
        return bonus;
    }

    getHistoryPenalty(pairing) {
        let penalty = 0;
        
        // 檢查每個配對是否之前配過
        const pairs = [pairing.pair1, pairing.pair2];
        
        pairs.forEach(pair => {
            const key1 = `${pair[0].id}-${pair[1].id}`;
            const key2 = `${pair[1].id}-${pair[0].id}`;
            
            const count1 = this.pairingHistory.get(key1) || 0;
            const count2 = this.pairingHistory.get(key2) || 0;
            const totalCount = count1 + count2;
            
            // 每次重複配對增加懲罰
            penalty += totalCount * 20;
        });
        
        return penalty;
    }

    autoPair() {
        const availableCourts = this.courts.filter(c => !c.occupied);
        if (availableCourts.length === 0) {
            alert('目前沒有空閒場地');
            return;
        }

        if (this.waitingPlayers.length < 4) {
            alert('等待人員不足4人，無法配對');
            return;
        }

        const pairing = this.findBestPairing(this.waitingPlayers);
        if (!pairing) {
            alert('無法找到合適的配對');
            return;
        }

        // 分配到第一個空閒場地
        const court = availableCourts[0];
        this.assignPairingToCourt(court, pairing);
    }

    assignPairingToCourt(court, pairing) {
        // 只設置配對，不開始比賽
        court.pairs = [
            {
                name: '隊伍 A',
                players: pairing.pair1
            },
            {
                name: '隊伍 B', 
                players: pairing.pair2
            }
        ];

        // 不更新人員狀態，保持在等待列表中
        
        this.updateDisplay();
        this.saveToLocalStorage();
    }

    recordPairingHistory(pairing) {
        const pairs = [pairing.pair1, pairing.pair2];
        
        pairs.forEach(pair => {
            const key1 = `${pair[0].id}-${pair[1].id}`;
            const key2 = `${pair[1].id}-${pair[0].id}`;
            
            this.pairingHistory.set(key1, (this.pairingHistory.get(key1) || 0) + 1);
        });
    }

    endGame(courtId) {
        const court = this.courts.find(c => c.id === courtId);
        if (!court || !court.occupied) return;

        // 將人員移回等待列表
        court.pairs.forEach(pair => {
            pair.players.forEach(player => {
                player.isPlaying = false;
                player.courtId = null;
                player.gamesPlayed++; // 增加已打場次
                player.waitingRounds = 0; // 重置等待場次
                this.waitingPlayers.push(player);
            });
        });

        // 重置場地
        court.occupied = false;
        court.pairs = [];
        court.startTime = null;

        this.updateDisplay();
        this.saveToLocalStorage();
    }

    startAllReadyCourts() {
        const readyCourts = this.courts.filter(c => !c.occupied && c.pairs.length === 2);
        if (readyCourts.length === 0) {
            alert('沒有準備好的場地可以開始');
            return;
        }

        readyCourts.forEach(court => {
            this.startCourt(court.id);
        });
    }

    startCourt(courtId) {
        const court = this.courts.find(c => c.id === courtId);
        if (!court || court.occupied || court.pairs.length !== 2) return;

        // 檢查所有球員是否還在等待列表中
        const allPlayers = [...court.pairs[0].players, ...court.pairs[1].players];
        const unavailablePlayers = allPlayers.filter(p => !this.waitingPlayers.find(wp => wp.id === p.id));
        
        if (unavailablePlayers.length > 0) {
            alert(`有球員已不在等待列表中，請重新配對場地 ${courtId}`);
            this.clearCourt(courtId);
            return;
        }

        // 開始比賽
        court.occupied = true;
        court.startTime = new Date();

        // 更新人員狀態
        allPlayers.forEach(player => {
            const actualPlayer = this.players.find(p => p.id === player.id);
            if (actualPlayer) {
                actualPlayer.isPlaying = true;
                actualPlayer.courtId = courtId;
                this.waitingPlayers = this.waitingPlayers.filter(p => p.id !== player.id);
            }
        });

        // 增加其他等待中球員的等待場次
        this.waitingPlayers.forEach(player => {
            player.waitingRounds++;
        });

        // 記錄配對歷史
        this.recordPairingHistory({
            pair1: court.pairs[0].players,
            pair2: court.pairs[1].players
        });

        this.updateDisplay();
        this.saveToLocalStorage();
    }

    editCourt(courtId) {
        this.editingCourt = courtId;
        this.updateDisplay();
    }

    saveCourt(courtId) {
        const court = this.courts.find(c => c.id === courtId);
        if (!court) return;

        // 收集選擇的球員
        const pair1Players = [];
        const pair2Players = [];

        for (let i = 0; i < 2; i++) {
            const select1 = document.getElementById(`court-${courtId}-pair1-player${i}`);
            const select2 = document.getElementById(`court-${courtId}-pair2-player${i}`);
            
            if (select1 && select1.value) {
                const player = this.waitingPlayers.find(p => p.id == select1.value);
                if (player) pair1Players.push(player);
            }
            
            if (select2 && select2.value) {
                const player = this.waitingPlayers.find(p => p.id == select2.value);
                if (player) pair2Players.push(player);
            }
        }

        // 檢查是否有重複選擇
        const allSelectedIds = [...pair1Players, ...pair2Players].map(p => p.id);
        const uniqueIds = [...new Set(allSelectedIds)];
        
        if (allSelectedIds.length !== uniqueIds.length) {
            alert('不能重複選擇同一個球員');
            return;
        }

        // 檢查是否選滿4個人
        if (pair1Players.length !== 2 || pair2Players.length !== 2) {
            alert('每隊必須選擇2個球員');
            return;
        }

        // 更新場地配對
        court.pairs = [
            { name: '隊伍 A', players: pair1Players },
            { name: '隊伍 B', players: pair2Players }
        ];

        this.editingCourt = null;
        this.updateDisplay();
        this.saveToLocalStorage();
    }

    cancelEdit() {
        this.editingCourt = null;
        this.updateDisplay();
    }

    clearCourt(courtId) {
        const court = this.courts.find(c => c.id === courtId);
        if (!court || court.occupied) return;

        court.pairs = [];
        this.updateDisplay();
        this.saveToLocalStorage();
    }

    resetAllStats() {
        if (!confirm('確定要重置所有球員的統計資料嗎？此動作無法復原。')) {
            return;
        }

        this.players.forEach(player => {
            player.gamesPlayed = 0;
            player.waitingRounds = 0;
        });

        this.waitingPlayers.forEach(player => {
            player.gamesPlayed = 0;
            player.waitingRounds = 0;
        });

        this.updateDisplay();
        this.saveToLocalStorage();
        alert('所有統計資料已重置');
    }

    clearAllData() {
        if (!confirm('確定要清空所有資料嗎？\n這將會刪除：\n- 所有球員資料\n- 場地配對\n- 統計記錄\n- 配對歷史\n\n此動作無法復原！')) {
            return;
        }

        // 清空 localStorage
        localStorage.removeItem('badmintonPairingSystem');

        // 重置所有系統狀態
        this.players = [];
        this.waitingPlayers = [];
        this.pairingHistory = new Map();
        this.editingCourt = null;
        
        // 重置場地但保持數量
        this.updateCourts();
        
        // 更新顯示
        this.updateDisplay();
        
        alert('所有資料已清空，系統已重置');
    }

    updateDisplay() {
        this.updateWaitingList();
        this.updateAllPlayersList();
        this.updateCourtsDisplay();
    }

    updateWaitingList() {
        const container = document.getElementById('waiting-list');
        container.innerHTML = '';

        // 按照公平性排序顯示
        const sortedWaitingPlayers = [...this.waitingPlayers].sort((a, b) => {
            const priorityA = a.waitingRounds * 2 + (Math.max(...this.players.map(p => p.gamesPlayed), 0) - a.gamesPlayed);
            const priorityB = b.waitingRounds * 2 + (Math.max(...this.players.map(p => p.gamesPlayed), 0) - b.gamesPlayed);
            return priorityB - priorityA; // 高優先級在前
        });

        sortedWaitingPlayers.forEach(player => {
            const div = document.createElement('div');
            div.className = 'player-item';
            div.innerHTML = `
                <div class="player-info">
                    <span class="player-name">${player.name}</span>
                    <span class="player-level">Lv.${player.level}</span>
                    <span class="player-stats">已打:${player.gamesPlayed} 等待:${player.waitingRounds}</span>
                </div>
                <div class="player-actions">
                    <button class="remove-btn" onclick="pairingSystem.removePlayer(${player.id})">移除</button>
                </div>
            `;
            container.appendChild(div);
        });
    }

    updateAllPlayersList() {
        const container = document.getElementById('all-players-list');
        container.innerHTML = '';

        this.players.forEach(player => {
            const div = document.createElement('div');
            div.className = 'player-item';
            const status = player.isPlaying ? `在場地 ${player.courtId}` : '等待中';
            div.innerHTML = `
                <div class="player-info">
                    <span class="player-name">${player.name}</span>
                    <span class="player-level">Lv.${player.level}</span>
                    <span class="player-stats">已打:${player.gamesPlayed} 等待:${player.waitingRounds}</span>
                    <span style="font-size: 0.8rem; color: #666;">${status}</span>
                </div>
                <div class="player-actions">
                    <button class="remove-btn" onclick="pairingSystem.removePlayer(${player.id})">移除</button>
                </div>
            `;
            container.appendChild(div);
        });
    }

    updateCourtsDisplay() {
        const container = document.getElementById('courts-container');
        container.innerHTML = '';

        this.courts.forEach(court => {
            const div = document.createElement('div');
            const isEditing = this.editingCourt === court.id;
            div.className = `court ${court.occupied ? 'occupied' : ''} ${isEditing ? 'court-edit-mode' : ''}`;
            
            if (court.occupied) {
                const duration = Math.floor((new Date() - court.startTime) / 1000 / 60);
                div.innerHTML = `
                    <div class="court-header">
                        <span>場地 ${court.id}</span>
                        <span>進行中 (${duration} 分鐘)</span>
                    </div>
                    <div class="court-content">
                        <div class="court-pairs">
                            ${court.pairs.map(pair => `
                                <div class="pair">
                                    <h4>${pair.name} <span class="team-strength">(實力: ${this.calculateTeamStrength(pair.players).toFixed(1)})</span></h4>
                                    <div class="pair-players">
                                        ${pair.players.map(player => `
                                            <div class="pair-player">
                                                <span>${player.name}</span>
                                                <span class="player-level">Lv.${player.level}</span>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            `).join('')}
                            <div class="balance-info">
                                <span class="balance-score">平衡度: ${this.getBalanceDisplay(court.pairs)}</span>
                            </div>
                        </div>
                        <div class="court-actions">
                            <button class="end-game-btn" onclick="pairingSystem.endGame(${court.id})">結束比賽</button>
                        </div>
                    </div>
                `;
            } else if (isEditing) {
                div.innerHTML = `
                    <div class="court-header">
                        <span>場地 ${court.id}</span>
                        <span>編輯模式</span>
                    </div>
                    <div class="court-content">
                        <div class="court-pairs">
                            <div class="pair">
                                <h4>隊伍 A</h4>
                                <div class="pair-players">
                                    ${this.generatePlayerSelector(`court-${court.id}-pair1-player0`, court.pairs[0]?.players[0]?.id)}
                                    ${this.generatePlayerSelector(`court-${court.id}-pair1-player1`, court.pairs[0]?.players[1]?.id)}
                                </div>
                            </div>
                            <div class="pair">
                                <h4>隊伍 B</h4>
                                <div class="pair-players">
                                    ${this.generatePlayerSelector(`court-${court.id}-pair2-player0`, court.pairs[1]?.players[0]?.id)}
                                    ${this.generatePlayerSelector(`court-${court.id}-pair2-player1`, court.pairs[1]?.players[1]?.id)}
                                </div>
                            </div>
                        </div>
                        <div class="court-actions">
                            <button class="save-court-btn" onclick="pairingSystem.saveCourt(${court.id})">保存</button>
                            <button class="cancel-edit-btn" onclick="pairingSystem.cancelEdit()">取消</button>
                        </div>
                    </div>
                `;
            } else if (court.pairs.length === 2) {
                div.innerHTML = `
                    <div class="court-header">
                        <span>場地 ${court.id}</span>
                        <span>準備中</span>
                    </div>
                    <div class="court-content">
                        <div class="court-pairs">
                            ${court.pairs.map(pair => `
                                <div class="pair">
                                    <h4>${pair.name} <span class="team-strength">(實力: ${this.calculateTeamStrength(pair.players).toFixed(1)})</span></h4>
                                    <div class="pair-players">
                                        ${pair.players.map(player => `
                                            <div class="pair-player">
                                                <span>${player.name}</span>
                                                <span class="player-level">Lv.${player.level}</span>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            `).join('')}
                            <div class="balance-info">
                                <span class="balance-score">平衡度: ${this.getBalanceDisplay(court.pairs)}</span>
                            </div>
                        </div>
                        <div class="court-actions">
                            <button class="start-court-btn" onclick="pairingSystem.startCourt(${court.id})">開始比賽</button>
                            <button class="edit-court-btn" onclick="pairingSystem.editCourt(${court.id})">編輯配對</button>
                            <button class="end-game-btn" onclick="pairingSystem.clearCourt(${court.id})">清空</button>
                        </div>
                    </div>
                `;
            } else {
                div.innerHTML = `
                    <div class="court-header">
                        <span>場地 ${court.id}</span>
                        <span>空閒中</span>
                    </div>
                    <div class="court-content">
                        <div class="empty-court">場地空閒</div>
                        <div class="court-actions">
                            <button class="edit-court-btn" onclick="pairingSystem.editCourt(${court.id})">手動配對</button>
                        </div>
                    </div>
                `;
            }
            
            container.appendChild(div);
        });

        // 更新按鈕狀態
        this.updateButtonStates();
    }

    generatePlayerSelector(id, selectedPlayerId = null) {
        const options = ['<option value="">選擇球員</option>'];
        
        // 按照公平性排序 - 等待久和打得少的在前面
        const sortedPlayers = [...this.waitingPlayers].sort((a, b) => {
            const priorityA = a.waitingRounds * 2 + (Math.max(...this.players.map(p => p.gamesPlayed), 0) - a.gamesPlayed);
            const priorityB = b.waitingRounds * 2 + (Math.max(...this.players.map(p => p.gamesPlayed), 0) - b.gamesPlayed);
            return priorityB - priorityA; // 高優先級在前
        });
        
        sortedPlayers.forEach(player => {
            const selected = player.id == selectedPlayerId ? 'selected' : '';
            options.push(`<option value="${player.id}" ${selected}>${player.name} (Lv.${player.level}) [已打:${player.gamesPlayed} 等待:${player.waitingRounds}]</option>`);
        });
        
        return `<select id="${id}" class="player-selector">${options.join('')}</select>`;
    }

    updateButtonStates() {
        const autoPairBtn = document.getElementById('auto-pair');
        const manualStartBtn = document.getElementById('manual-start');
        
        const hasAvailableCourts = this.courts.some(c => !c.occupied && c.pairs.length === 0);
        const hasEnoughPlayers = this.waitingPlayers.length >= 4;
        const hasReadyCourts = this.courts.some(c => !c.occupied && c.pairs.length === 2);
        
        // 自動配對按鈕
        autoPairBtn.disabled = !hasAvailableCourts || !hasEnoughPlayers;
        
        if (!hasAvailableCourts) {
            autoPairBtn.textContent = '無空閒場地';
        } else if (!hasEnoughPlayers) {
            autoPairBtn.textContent = `需要更多人員 (${this.waitingPlayers.length}/4)`;
        } else {
            autoPairBtn.textContent = '自動配對';
        }

        // 手動開始按鈕
        manualStartBtn.disabled = !hasReadyCourts;
        
        if (!hasReadyCourts) {
            manualStartBtn.textContent = '無準備好的場地';
        } else {
            const readyCount = this.courts.filter(c => !c.occupied && c.pairs.length === 2).length;
            manualStartBtn.textContent = `開始比賽 (${readyCount}個場地)`;
        }
    }

    saveToLocalStorage() {
        const data = {
            players: this.players,
            courts: this.courts,
            waitingPlayers: this.waitingPlayers,
            pairingHistory: Array.from(this.pairingHistory.entries()),
            courtCount: this.courtCount
        };
        
        // 確保不保存編輯狀態
        this.editingCourt = null;
        localStorage.setItem('badmintonPairingSystem', JSON.stringify(data));
    }

    loadFromLocalStorage() {
        const data = localStorage.getItem('badmintonPairingSystem');
        if (data) {
            try {
                const parsed = JSON.parse(data);
                this.players = parsed.players || [];
                this.waitingPlayers = parsed.waitingPlayers || [];
                this.pairingHistory = new Map(parsed.pairingHistory || []);
                this.courtCount = parsed.courtCount || 4;
                
                // 確保所有球員都有新的統計欄位
                this.players.forEach(player => {
                    if (player.gamesPlayed === undefined) player.gamesPlayed = 0;
                    if (player.waitingRounds === undefined) player.waitingRounds = 0;
                });
                
                this.waitingPlayers.forEach(player => {
                    if (player.gamesPlayed === undefined) player.gamesPlayed = 0;
                    if (player.waitingRounds === undefined) player.waitingRounds = 0;
                });
                
                // 更新場地數量輸入欄位
                document.getElementById('court-count').value = this.courtCount;
                
                // 恢復場地狀態
                if (parsed.courts) {
                    // 轉換startTime字串回Date物件
                    parsed.courts.forEach(court => {
                        if (court.startTime) {
                            court.startTime = new Date(court.startTime);
                        }
                    });
                    this.courts = parsed.courts;
                } else {
                    this.updateCourts();
                }
                
                this.updateDisplay();
            } catch (e) {
                console.error('載入資料失敗:', e);
            }
        }
    }
}

// 初始化系統
let pairingSystem;
document.addEventListener('DOMContentLoaded', () => {
    pairingSystem = new BadmintonPairingSystem();
}); 
