class BadmintonPairingSystem {
  constructor() {
    this.players = [];
    this.courts = [];
    this.waitingPlayers = [];
    this.pairingHistory = new Map(); // 記錄配對歷史
    this.courtCount = 3;
    this.editingCourt = null; // 正在編輯的場地
    this.editingPlayerId = null; // 正在編輯的球員ID

    this.initializeEventListeners();
    this.updateCourts();
    this.loadFromLocalStorage();
    this.displayLastUpdated();
  }

  initializeEventListeners() {
    // 新增人員
    document.getElementById("add-player").addEventListener("click", () => {
      this.addPlayer();
    });

    // Enter鍵新增人員
    document.getElementById("player-name").addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        this.addPlayer();
      }
    });

    // 更新場地數量
    document.getElementById("update-courts").addEventListener("click", () => {
      this.updateCourtCount();
    });

    // 自動配對
    document.getElementById("auto-pair").addEventListener("click", () => {
      this.autoPair();
    });

    // 手動開始所有空閒場地
    document.getElementById("manual-start").addEventListener("click", () => {
      this.startAllReadyCourts();
    });

    // 重置統計
    document.getElementById("reset-stats").addEventListener("click", () => {
      this.resetAllStats();
    });

    // 清空所有資料
    document.getElementById("clear-all-data").addEventListener("click", () => {
      this.clearAllData();
    });

    // 批次匯入
    document.getElementById("batch-import").addEventListener("click", () => {
      this.openBatchImport();
    });
  }

  addPlayer() {
    const nameInput = document.getElementById("player-name");
    const levelSelect = document.getElementById("player-level");

    const name = nameInput.value.trim();
    const level = parseInt(levelSelect.value);

    if (!name || !level) {
      alert("請輸入姓名和選擇等級");
      return;
    }

    // 檢查是否已存在相同姓名
    if (this.players.find((p) => p.name === name)) {
      alert("已存在相同姓名的人員");
      return;
    }

    const player = {
      id: Date.now(),
      name: name,
      level: level,
      isPlaying: false,
      isResting: false,
      courtId: null,
      gamesPlayed: 0, // 已打場次
      waitingRounds: 0, // 等待場次
    };

    this.players.push(player);
    this.waitingPlayers.push(player);

    // 清空輸入欄位
    nameInput.value = "";
    levelSelect.value = "";

    this.updateDisplay();
    this.saveToLocalStorage();
  }

  removePlayer(playerId) {
    // 檢查該球員是否正在比賽中
    const court = this.courts.find((c) =>
      c.pairs.some((pair) => pair.players.some((p) => p.id === playerId))
    );

    // 從所有列表中移除
    this.players = this.players.filter((p) => p.id !== playerId);
    this.waitingPlayers = this.waitingPlayers.filter((p) => p.id !== playerId);

    // 如果該人員正在場上，需要結束該場比賽，但不要把已移除的球員加回等待列表
    if (court) {
      this.endGameWithRemovedPlayer(court.id, playerId);
    }

    this.updateDisplay();
    this.saveToLocalStorage();
  }

  endGameWithRemovedPlayer(courtId, removedPlayerId) {
    const court = this.courts.find((c) => c.id === courtId);
    if (!court || !court.occupied) return;

    // 將人員移回等待列表，但排除已移除的球員
    court.pairs.forEach((pair) => {
      pair.players.forEach((player) => {
        if (player.id !== removedPlayerId) {
          player.isPlaying = false;
          player.courtId = null;
          player.gamesPlayed++; // 增加已打場次
          player.waitingRounds = 0; // 重置等待場次
          this.waitingPlayers.push(player);
        }
      });
    });

    // 重置場地
    court.occupied = false;
    court.pairs = [];
    court.startTime = null;

    this.updateDisplay();
    this.saveToLocalStorage();
  }

  updateCourtCount() {
    const newCount = parseInt(document.getElementById("court-count").value);
    if (newCount < 1 || newCount > 10) {
      alert("場地數量必須在1-10之間");
      return;
    }

    this.courtCount = newCount;
    this.updateCourts();
    this.saveToLocalStorage();
  }

  updateCourts() {
    // 保存現有場地的比賽狀態
    const existingGames = new Map();
    this.courts.forEach((court) => {
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
        startTime: null,
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
            const fourPlayers = [
              players[i],
              players[j],
              players[k],
              players[l],
            ];

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
        pair2: [p3, p4],
      },
      {
        pair1: [p1, p3],
        pair2: [p2, p4],
      },
      {
        pair1: [p1, p4],
        pair2: [p2, p3],
      },
    ];
  }

  evaluatePairing(pairing) {
    let score = 100; // 基礎分數

    // 評估等級差距
    const levelDiff1 = Math.abs(
      pairing.pair1[0].level - pairing.pair1[1].level
    );
    const levelDiff2 = Math.abs(
      pairing.pair2[0].level - pairing.pair2[1].level
    );

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

    // 隊伍間實力差距 - 越接近越好，加重懲罰
    const strengthDiff = Math.abs(team1Strength - team2Strength);
    let balanceScore = 60 - strengthDiff * 25; // 基礎60分，實力差距每0.1差2.5分

    // 額外檢查：避免明顯不平衡的情況
    // 例如：高+中 vs 低+低 這種情況
    const team1Levels = team1Players.map((p) => p.level).sort((a, b) => b - a);
    const team2Levels = team2Players.map((p) => p.level).sort((a, b) => b - a);

    // === 新增：避免「強強對弱弱」配對 ===
    // 根據四位選手的相對等級動態判斷強弱
    const allFourLevels = [...team1Levels, ...team2Levels].sort((a, b) => b - a); // [最強, 次強, 次弱, 最弱]
    const strongest = allFourLevels[0];
    const secondStrong = allFourLevels[1];
    const secondWeak = allFourLevels[2];
    const weakest = allFourLevels[3];

    // 動態判斷強弱：前兩名算強，後兩名算弱
    const team1_isBothStrong = team1Levels[0] >= secondStrong && team1Levels[1] >= secondStrong;
    const team1_isBothWeak = team1Levels[0] <= secondWeak && team1Levels[1] <= secondWeak;
    const team2_isBothStrong = team2Levels[0] >= secondStrong && team2Levels[1] >= secondStrong;
    const team2_isBothWeak = team2Levels[0] <= secondWeak && team2Levels[1] <= secondWeak;

    // 強強對弱弱的情況：重懲罰
    if ((team1_isBothStrong && team2_isBothWeak) || (team2_isBothStrong && team1_isBothWeak)) {
      balanceScore -= 80; // 重懲罰強強對弱弱
    }

    // 檢查最強vs最強，最弱vs最弱的差距
    const strongestDiff = Math.abs(team1Levels[0] - team2Levels[0]);
    const weakestDiff = Math.abs(team1Levels[1] - team2Levels[1]);

    // 如果強者或弱者差距太大，額外懲罰
    if (strongestDiff >= 2) {
      balanceScore -= strongestDiff * 8; // 強者差距懲罰
    }
    if (weakestDiff >= 2) {
      balanceScore -= weakestDiff * 8; // 弱者差距懲罰
    }

    // 額外獎勵：理想的強弱搭配
    const team1Balance = this.getTeamInternalBalance(team1Players);
    const team2Balance = this.getTeamInternalBalance(team2Players);

    // 如果兩隊都是強弱搭配（而不是強強對弱弱），給額外獎勵
    if (team1Balance > 0 && team2Balance > 0) {
      balanceScore += 15; // 強弱搭配獎勵
    }

    // 特別獎勵：雙方都是一強一弱的理想配對
    const team1_isStrongWeak = (team1Levels[0] >= secondStrong && team1Levels[1] <= secondWeak);
    const team2_isStrongWeak = (team2Levels[0] >= secondStrong && team2Levels[1] <= secondWeak);

    if (team1_isStrongWeak && team2_isStrongWeak) {
      balanceScore += 25; // 雙強弱搭配額外獎勵
    }

    return Math.max(balanceScore, -50); // 最低不低於-50分
  }

  calculateTeamStrength(players) {
    // 考慮強弱搭配的效果
    const levels = players.map((p) => p.level).sort((a, b) => b - a); // 從高到低
    const strongPlayer = levels[0];
    const weakPlayer = levels[1];

    // 改進的實力計算：
    // 1. 基礎實力是兩人平均
    // 2. 考慮配合效果：等級差距適中時有加成，差距太大時有懲罰
    const baseStrength = (strongPlayer + weakPlayer) / 2;
    const levelDiff = strongPlayer - weakPlayer;

    let teamStrength = baseStrength;

    if (levelDiff <= 1) {
      // 等級相近，配合良好
      teamStrength += 0.2;
    } else if (levelDiff <= 2) {
      // 理想的強弱搭配，強者可以帶動弱者
      teamStrength += 0.3;
    } else if (levelDiff <= 3) {
      // 可接受的搭配
      teamStrength += 0.1;
    } else {
      // 差距太大，協調困難
      teamStrength -= 0.2;
    }

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

    // 計算配對評分（用於調試）
    const pairing = { pair1: pairs[0].players, pair2: pairs[1].players };
    const balanceScore = this.evaluateTeamBalance(pairing);

    let balanceText = "";
    let balanceColor = "";

    if (strengthDiff <= 0.3) {
      balanceText = "非常平衡";
      balanceColor = "#28a745"; // 綠色
    } else if (strengthDiff <= 0.6) {
      balanceText = "平衡";
      balanceColor = "#28a745"; // 綠色
    } else if (strengthDiff <= 1.0) {
      balanceText = "稍有差距";
      balanceColor = "#ffc107"; // 黃色
    } else if (strengthDiff <= 1.5) {
      balanceText = "差距較大";
      balanceColor = "#fd7e14"; // 橙色
    } else {
      balanceText = "差距很大";
      balanceColor = "#dc3545"; // 紅色
    }

    return `<span style="color: ${balanceColor}; font-weight: bold;">${balanceText}</span> (差距: ${strengthDiff.toFixed(
      1
    )}, 評分: ${balanceScore.toFixed(0)})`;
  }

  getFairnessBonus(pairing) {
    let bonus = 0;
    const allPlayers = [...pairing.pair1, ...pairing.pair2];

    // 等待場次加分 - 等得越久加分越多
    const totalWaitingRounds = allPlayers.reduce(
      (sum, player) => sum + player.waitingRounds,
      0
    );
    bonus += totalWaitingRounds * 15; // 每等待1場加15分

    // 已打場次加分 - 打得越少加分越多
    const maxGamesPlayed = Math.max(
      ...this.players.map((p) => p.gamesPlayed),
      0
    );
    allPlayers.forEach((player) => {
      const gamesGap = maxGamesPlayed - player.gamesPlayed;
      bonus += gamesGap * 10; // 每少打1場加10分
    });

    return bonus;
  }

  getHistoryPenalty(pairing) {
    let penalty = 0;

    // 檢查每個配對是否之前配過
    const pairs = [pairing.pair1, pairing.pair2];

    pairs.forEach((pair) => {
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
    const availableCourts = this.courts.filter((c) => !c.occupied);
    if (availableCourts.length === 0) {
      alert("目前沒有空閒場地");
      return;
    }

    if (this.waitingPlayers.length < 4) {
      alert("等待人員不足4人，無法配對");
      return;
    }

    const pairing = this.findBestPairing(this.waitingPlayers);
    if (!pairing) {
      alert("無法找到合適的配對");
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
        name: "隊伍 A",
        players: pairing.pair1,
      },
      {
        name: "隊伍 B",
        players: pairing.pair2,
      },
    ];

    // 不更新人員狀態，保持在等待列表中

    this.updateDisplay();
    this.saveToLocalStorage();
  }

  recordPairingHistory(pairing) {
    const pairs = [pairing.pair1, pairing.pair2];

    pairs.forEach((pair) => {
      const key1 = `${pair[0].id}-${pair[1].id}`;

      this.pairingHistory.set(key1, (this.pairingHistory.get(key1) || 0) + 1);
    });
  }

  endGame(courtId) {
    const court = this.courts.find((c) => c.id === courtId);
    if (!court || !court.occupied) return;

    // 將人員移回等待列表 - 確保更新的是 this.players 中的實際物件
    court.pairs.forEach((pair) => {
      pair.players.forEach((player) => {
        // 找到 this.players 中對應的實際球員物件
        const actualPlayer = this.players.find((p) => p.id === player.id);
        if (actualPlayer) {
          actualPlayer.isPlaying = false;
          actualPlayer.courtId = null;
          actualPlayer.gamesPlayed++; // 增加已打場次
          actualPlayer.waitingRounds = 0; // 重置等待場次
          this.waitingPlayers.push(actualPlayer);
        }
      });
    });

    // 重置場地
    court.occupied = false;
    court.pairs = [];
    court.startTime = null;

    this.updateDisplay();
    this.saveToLocalStorage();
  }

  cancelStart(courtId) {
    const court = this.courts.find((c) => c.id === courtId);
    if (!court || !court.occupied) return;

    // 記錄取消的球員ID，避免重複調整等待場次
    const cancelledPlayerIds = new Set();

    // 將人員移回等待列表，但不增加已打場次（因為比賽沒有實際進行）
    court.pairs.forEach((pair) => {
      pair.players.forEach((player) => {
        const actualPlayer = this.players.find((p) => p.id === player.id);
        if (actualPlayer) {
          actualPlayer.isPlaying = false;
          actualPlayer.courtId = null;
          // 注意：不增加 gamesPlayed，因為比賽還沒實際進行
          this.waitingPlayers.push(actualPlayer);
          cancelledPlayerIds.add(actualPlayer.id);
        }
      });
    });

    // 恢復其他等待球員的等待場次（減少1，因為這場比賽被取消了）
    // 但不包括剛被取消的球員，因為他們的等待場次已經在開始比賽時被重置了
    this.waitingPlayers.forEach((player) => {
      if (!cancelledPlayerIds.has(player.id) && player.waitingRounds > 0) {
        player.waitingRounds--;
      }
    });

    // 移除配對歷史記錄（因為比賽沒有實際進行）
    this.removePairingHistory({
      pair1: court.pairs[0].players,
      pair2: court.pairs[1].players,
    });

    // 場地恢復到準備狀態，保留配對
    court.occupied = false;
    court.startTime = null;
    // 保留 court.pairs，讓使用者可以重新開始或編輯

    this.updateDisplay();
    this.saveToLocalStorage();
  }

  removePairingHistory(pairing) {
    const pairs = [pairing.pair1, pairing.pair2];

    pairs.forEach((pair) => {
      const key1 = `${pair[0].id}-${pair[1].id}`;
      const key2 = `${pair[1].id}-${pair[0].id}`;

      // 減少配對歷史計數，最小為0
      const count1 = this.pairingHistory.get(key1) || 0;
      const count2 = this.pairingHistory.get(key2) || 0;

      if (count1 > 0) {
        this.pairingHistory.set(key1, count1 - 1);
        if (this.pairingHistory.get(key1) === 0) {
          this.pairingHistory.delete(key1);
        }
      }

      if (count2 > 0) {
        this.pairingHistory.set(key2, count2 - 1);
        if (this.pairingHistory.get(key2) === 0) {
          this.pairingHistory.delete(key2);
        }
      }
    });
  }

  startAllReadyCourts() {
    const readyCourts = this.courts.filter(
      (c) => !c.occupied && c.pairs.length === 2
    );
    if (readyCourts.length === 0) {
      alert("沒有準備好的場地可以開始");
      return;
    }

    readyCourts.forEach((court) => {
      this.startCourt(court.id);
    });
  }

  startCourt(courtId) {
    const court = this.courts.find((c) => c.id === courtId);
    if (!court || court.occupied || court.pairs.length !== 2) return;

    // 檢查所有球員是否還在等待列表中
    const allPlayers = [...court.pairs[0].players, ...court.pairs[1].players];
    const unavailablePlayers = allPlayers.filter(
      (p) => !this.waitingPlayers.find((wp) => wp.id === p.id)
    );

    if (unavailablePlayers.length > 0) {
      alert(`有球員已不在等待列表中，請重新配對場地 ${courtId}`);
      this.clearCourt(courtId);
      return;
    }

    // 開始比賽
    court.occupied = true;
    court.startTime = new Date();

    // 更新人員狀態
    allPlayers.forEach((player) => {
      const actualPlayer = this.players.find((p) => p.id === player.id);
      if (actualPlayer) {
        actualPlayer.isPlaying = true;
        actualPlayer.courtId = courtId;
        this.waitingPlayers = this.waitingPlayers.filter(
          (p) => p.id !== player.id
        );
      }
    });

    // 增加其他等待中球員的等待場次
    this.waitingPlayers.forEach((player) => {
      player.waitingRounds++;
    });

    // 記錄配對歷史
    this.recordPairingHistory({
      pair1: court.pairs[0].players,
      pair2: court.pairs[1].players,
    });

    this.updateDisplay();
    this.saveToLocalStorage();
  }

  editCourt(courtId) {
    this.editingCourt = courtId;
    this.updateDisplay();
  }

  saveCourt(courtId) {
    const court = this.courts.find((c) => c.id === courtId);
    if (!court) return;

    // 收集選擇的球員
    const pair1Players = [];
    const pair2Players = [];

    for (let i = 0; i < 2; i++) {
      const select1 = document.getElementById(
        `court-${courtId}-pair1-player${i}`
      );
      const select2 = document.getElementById(
        `court-${courtId}-pair2-player${i}`
      );

      if (select1 && select1.value) {
        const player = this.waitingPlayers.find((p) => p.id == select1.value);
        if (player) pair1Players.push(player);
      }

      if (select2 && select2.value) {
        const player = this.waitingPlayers.find((p) => p.id == select2.value);
        if (player) pair2Players.push(player);
      }
    }

    // 檢查是否有重複選擇
    const allSelectedIds = [...pair1Players, ...pair2Players].map((p) => p.id);
    const uniqueIds = [...new Set(allSelectedIds)];

    if (allSelectedIds.length !== uniqueIds.length) {
      alert("不能重複選擇同一個球員");
      return;
    }

    // 檢查是否選滿4個人
    if (pair1Players.length !== 2 || pair2Players.length !== 2) {
      alert("每隊必須選擇2個球員");
      return;
    }

    // 更新場地配對
    court.pairs = [
      { name: "隊伍 A", players: pair1Players },
      { name: "隊伍 B", players: pair2Players },
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
    const court = this.courts.find((c) => c.id === courtId);
    if (!court || court.occupied) return;

    court.pairs = [];
    this.updateDisplay();
    this.saveToLocalStorage();
  }

  resetAllStats() {
    if (!confirm("確定要重置所有球員的統計資料嗎？此動作無法復原。")) {
      return;
    }

    this.players.forEach((player) => {
      player.gamesPlayed = 0;
      player.waitingRounds = 0;
    });

    this.waitingPlayers.forEach((player) => {
      player.gamesPlayed = 0;
      player.waitingRounds = 0;
    });

    this.updateDisplay();
    this.saveToLocalStorage();
    alert("所有統計資料已重置");
  }

  clearAllData() {
    if (
      !confirm(
        "確定要清空所有資料嗎？\n這將會刪除：\n- 所有球員資料\n- 場地配對\n- 統計記錄\n- 配對歷史\n\n此動作無法復原！"
      )
    ) {
      return;
    }

    // 清空 localStorage
    localStorage.removeItem("badmintonPairingSystem");

    // 重置所有系統狀態
    this.players = [];
    this.waitingPlayers = [];
    this.pairingHistory = new Map();
    this.editingCourt = null;

    // 重置場地但保持數量
    this.updateCourts();

    // 更新顯示
    this.updateDisplay();

    alert("所有資料已清空，系統已重置");
  }

  editPlayer(playerId) {
    const player = this.players.find((p) => p.id === playerId);
    if (!player || player.isPlaying) return;

    this.editingPlayerId = playerId;

    // 填入當前資料
    document.getElementById("edit-player-name").value = player.name;
    document.getElementById("edit-player-level").value = player.level;
    document.getElementById("edit-games-played").value = player.gamesPlayed;
    document.getElementById("edit-waiting-rounds").value = player.waitingRounds;

    // 顯示 dialog
    document.getElementById("edit-player-dialog").showModal();
  }

  saveEditPlayer() {
    if (!this.editingPlayerId) return;

    const player = this.players.find((p) => p.id === this.editingPlayerId);
    if (!player) return;

    // 取得新值，空白時預設為 0
    const newLevel = parseInt(
      document.getElementById("edit-player-level").value
    );
    const newGamesPlayed =
      parseInt(document.getElementById("edit-games-played").value) || 0;
    const newWaitingRounds =
      parseInt(document.getElementById("edit-waiting-rounds").value) || 0;

    // 驗證資料
    if (newLevel < 3 || newLevel > 12) {
      alert("等級必須在3-12之間");
      return;
    }

    if (newGamesPlayed < 0 || newWaitingRounds < 0) {
      alert("場次不能為負數");
      return;
    }

    // 更新球員資料
    player.level = newLevel;
    player.gamesPlayed = newGamesPlayed;
    player.waitingRounds = newWaitingRounds;

    // 如果球員在等待列表中，也要更新等待列表中的資料
    const waitingPlayer = this.waitingPlayers.find(
      (p) => p.id === this.editingPlayerId
    );
    if (waitingPlayer) {
      waitingPlayer.level = newLevel;
      waitingPlayer.gamesPlayed = newGamesPlayed;
      waitingPlayer.waitingRounds = newWaitingRounds;
    }

    this.cancelEditPlayer();
    this.updateDisplay();
    this.saveToLocalStorage();
  }

  cancelEditPlayer() {
    this.editingPlayerId = null;
    document.getElementById("edit-player-dialog").close();
  }

  toggleRest(playerId) {
    const player = this.players.find((p) => p.id === playerId);
    if (!player || player.isPlaying) return;

    if (player.isResting) {
      // 取消休息，回到等待狀態
      player.isResting = false;
      this.waitingPlayers.push(player);
    } else {
      // 開始休息，從等待列表移除
      player.isResting = true;
      this.waitingPlayers = this.waitingPlayers.filter(
        (p) => p.id !== playerId
      );
    }

    this.updateDisplay();
    this.saveToLocalStorage();
  }

  openBatchImport() {
    // 清空輸入欄位
    document.getElementById("json-file-input").value = "";
    document.getElementById("json-text-input").value = "";

    // 顯示 dialog
    document.getElementById("batch-import-dialog").showModal();
  }

  cancelBatchImport() {
    document.getElementById("batch-import-dialog").close();
  }

  processBatchImport() {
    const fileInput = document.getElementById("json-file-input");
    const textInput = document.getElementById("json-text-input");

    if (fileInput.files.length > 0) {
      // 處理檔案上傳
      this.processFileImport(fileInput.files[0]);
    } else if (textInput.value.trim()) {
      // 處理文字輸入
      this.processTextImport(textInput.value.trim());
    } else {
      alert("請選擇檔案或輸入 JSON 內容");
    }
  }

  processFileImport(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonData = JSON.parse(e.target.result);
        this.importPlayers(jsonData);
      } catch (error) {
        alert("檔案格式錯誤，請確認是有效的 JSON 格式");
      }
    };
    reader.readAsText(file);
  }

  processTextImport(text) {
    try {
      const jsonData = JSON.parse(text);
      this.importPlayers(jsonData);
    } catch (error) {
      alert("JSON 格式錯誤，請檢查格式是否正確");
    }
  }

  importPlayers(data) {
    if (!Array.isArray(data)) {
      alert("JSON 資料必須是陣列格式");
      return;
    }

    let imported = 0;
    let skipped = 0;
    let errors = [];
    const skippedNames = [];

    data.forEach((playerData, index) => {
      try {
        // 驗證資料格式
        if (!playerData.name || typeof playerData.name !== "string") {
          errors.push(`第 ${index + 1} 筆：缺少姓名或姓名格式錯誤`);
          return;
        }

        if (!playerData.level || typeof playerData.level !== "number") {
          errors.push(`第 ${index + 1} 筆：缺少等級或等級格式錯誤`);
          return;
        }

        if (playerData.level < 3 || playerData.level > 12) {
          errors.push(`第 ${index + 1} 筆：等級必須在 3-12 之間`);
          return;
        }

        // 檢查是否已存在相同姓名
        if (this.players.find((p) => p.name === playerData.name)) {
          skipped++;
          skippedNames.push(playerData.name);
          return;
        }

        // 建立新球員
        const player = {
          id: Date.now() + Math.random(), // 確保唯一性
          name: playerData.name,
          level: playerData.level,
          isPlaying: false,
          isResting: false,
          courtId: null,
          gamesPlayed: playerData.gamesPlayed || 0,
          waitingRounds: playerData.waitingRounds || 0,
        };

        this.players.push(player);
        this.waitingPlayers.push(player);
        imported++;
      } catch (error) {
        errors.push(`第 ${index + 1} 筆：處理錯誤`);
      }
    });

    // 顯示結果
    let message = `匯入完成！\n成功匯入：${imported} 人`;

    if (skipped > 0) {
      message += `\n忽略重複：${skipped} 人 (${skippedNames.join(", ")})`;
    }

    if (errors.length > 0) {
      message += `\n錯誤：${errors.length} 筆\n${errors.join("\n")}`;
    }

    alert(message);

    if (imported > 0) {
      this.updateDisplay();
      this.saveToLocalStorage();
    }

    this.cancelBatchImport();
  }

  displayLastUpdated() {
    const now = new Date();
    const currentYear = now.getFullYear();

    const currentYearElement = document.getElementById("current-year");
    if (currentYearElement) {
      currentYearElement.textContent = currentYear;
    }
  }

  updateDisplay() {
    this.updateWaitingList();
    this.updateAllPlayersList();
    this.updateCourtsDisplay();
  }

  updateWaitingList() {
    const container = document.getElementById("waiting-list");
    container.innerHTML = "";

    // 按照公平性排序顯示
    const sortedWaitingPlayers = [...this.waitingPlayers].sort((a, b) => {
      const priorityA =
        a.waitingRounds * 2 +
        (Math.max(...this.players.map((p) => p.gamesPlayed), 0) -
          a.gamesPlayed);
      const priorityB =
        b.waitingRounds * 2 +
        (Math.max(...this.players.map((p) => p.gamesPlayed), 0) -
          b.gamesPlayed);
      return priorityB - priorityA; // 高優先級在前
    });

    sortedWaitingPlayers.forEach((player) => {
      const div = document.createElement("div");
      div.className = "player-item";
      div.innerHTML = `
                <div class="player-info">
                    <span class="player-name">${player.name}</span>
                    <span class="player-level">Lv.${player.level}</span>
                    <span class="player-stats">已打:${player.gamesPlayed} 等待:${player.waitingRounds}</span>
                </div>
            `;
      container.appendChild(div);
    });
  }

  updateAllPlayersList() {
    const container = document.getElementById("all-players-list");
    container.innerHTML = "";

    this.players.forEach((player) => {
      const div = document.createElement("div");
      div.className = "player-item";

      let status = "";
      if (player.isPlaying) {
        status = `在場地 ${player.courtId}`;
      } else if (player.isResting) {
        status = "休息中";
      } else {
        status = "等待中";
      }

      const isPlaying = player.isPlaying;
      const isResting = player.isResting;

      let playerActionsHtml = "";
      if (isPlaying) {
        // 比賽中只顯示文字，不顯示按鈕
        playerActionsHtml = '<span class="playing-status">比賽中</span>';
      } else {
        // 等待中或休息中顯示操作按鈕
        const restButtonText = isResting ? "休息中" : "休息";
        playerActionsHtml = `
                    <button class="rest-btn" onclick="pairingSystem.toggleRest(${player.id})">${restButtonText}</button>
                    <button class="icon-btn edit-icon" onclick="pairingSystem.editPlayer(${player.id})"><i class="fas fa-edit"></i></button>
                    <button class="icon-btn remove-icon" onclick="pairingSystem.removePlayer(${player.id})"><i class="fas fa-trash"></i></button>
                `;
      }

      div.innerHTML = `
                <div class="player-info">
                    <span class="player-name">${player.name}</span>
                    <span class="player-level">Lv.${player.level}</span>
                    <span class="player-stats">已打:${
                      player.gamesPlayed
                    } 等待:${player.waitingRounds}</span>
                    ${
                      isPlaying
                        ? `<span style="font-size: 0.8rem; color: #666;">${status}</span>`
                        : ""
                    }
                </div>
                <div class="player-actions">
                    ${playerActionsHtml}
                </div>
            `;
      container.appendChild(div);
    });
  }

  updateCourtsDisplay() {
    const container = document.getElementById("courts-container");
    container.innerHTML = "";

    this.courts.forEach((court) => {
      const div = document.createElement("div");
      const isEditing = this.editingCourt === court.id;
      div.className = `court ${court.occupied ? "occupied" : ""} ${
        isEditing ? "court-edit-mode" : ""
      }`;

      if (court.occupied) {
        const duration = Math.floor((new Date() - court.startTime) / 1000 / 60);
        div.innerHTML = `
                    <div class="court-header">
                        <span>場地 ${court.id}</span>
                        <span>進行中 (${duration} 分鐘)</span>
                    </div>
                    <div class="court-content">
                        <div class="court-pairs">
                            ${court.pairs
                              .map(
                                (pair) => `
                                <div class="pair">
                                    <h4>${
                                      pair.name
                                    } <span class="team-strength">(實力: ${this.calculateTeamStrength(
                                  pair.players
                                ).toFixed(1)})</span></h4>
                                    <div class="pair-players">
                                        ${pair.players
                                          .map(
                                            (player) => `
                                            <div class="pair-player">
                                                <span>${player.name}</span>
                                                <span class="player-level">Lv.${player.level}</span>
                                            </div>
                                        `
                                          )
                                          .join("")}
                                    </div>
                                </div>
                            `
                              )
                              .join("")}
                            <div class="balance-info">
                                <span class="balance-score">平衡度: ${this.getBalanceDisplay(
                                  court.pairs
                                )}</span>
                            </div>
                        </div>
                        <div class="court-actions">
                            <button class="cancel-start-btn" onclick="pairingSystem.cancelStart(${
                              court.id
                            })">取消開始</button>
                            <button class="end-game-btn" onclick="pairingSystem.endGame(${
                              court.id
                            })">結束比賽</button>
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
                                    ${this.generatePlayerSelector(
                                      `court-${court.id}-pair1-player0`,
                                      court.pairs[0]?.players[0]?.id
                                    )}
                                    ${this.generatePlayerSelector(
                                      `court-${court.id}-pair1-player1`,
                                      court.pairs[0]?.players[1]?.id
                                    )}
                                </div>
                            </div>
                            <div class="pair">
                                <h4>隊伍 B</h4>
                                <div class="pair-players">
                                    ${this.generatePlayerSelector(
                                      `court-${court.id}-pair2-player0`,
                                      court.pairs[1]?.players[0]?.id
                                    )}
                                    ${this.generatePlayerSelector(
                                      `court-${court.id}-pair2-player1`,
                                      court.pairs[1]?.players[1]?.id
                                    )}
                                </div>
                            </div>
                        </div>
                        <div class="court-actions">
                            <button class="save-court-btn" onclick="pairingSystem.saveCourt(${
                              court.id
                            })">保存</button>
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
                            ${court.pairs
                              .map(
                                (pair) => `
                                <div class="pair">
                                    <h4>${
                                      pair.name
                                    } <span class="team-strength">(實力: ${this.calculateTeamStrength(
                                  pair.players
                                ).toFixed(1)})</span></h4>
                                    <div class="pair-players">
                                        ${pair.players
                                          .map(
                                            (player) => `
                                            <div class="pair-player">
                                                <span>${player.name}</span>
                                                <span class="player-level">Lv.${player.level}</span>
                                            </div>
                                        `
                                          )
                                          .join("")}
                                    </div>
                                </div>
                            `
                              )
                              .join("")}
                            <div class="balance-info">
                                <span class="balance-score">平衡度: ${this.getBalanceDisplay(
                                  court.pairs
                                )}</span>
                            </div>
                        </div>
                        <div class="court-actions">
                            <button class="start-court-btn" onclick="pairingSystem.startCourt(${
                              court.id
                            })">開始比賽</button>
                            <button class="edit-court-btn" onclick="pairingSystem.editCourt(${
                              court.id
                            })">編輯配對</button>
                            <button class="end-game-btn" onclick="pairingSystem.clearCourt(${
                              court.id
                            })">清空</button>
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
      const priorityA =
        a.waitingRounds * 2 +
        (Math.max(...this.players.map((p) => p.gamesPlayed), 0) -
          a.gamesPlayed);
      const priorityB =
        b.waitingRounds * 2 +
        (Math.max(...this.players.map((p) => p.gamesPlayed), 0) -
          b.gamesPlayed);
      return priorityB - priorityA; // 高優先級在前
    });

    sortedPlayers.forEach((player) => {
      const selected = player.id == selectedPlayerId ? "selected" : "";
      options.push(
        `<option value="${player.id}" ${selected}>${player.name} (Lv.${player.level}) [已打:${player.gamesPlayed} 等待:${player.waitingRounds}]</option>`
      );
    });

    return `<select id="${id}" class="player-selector">${options.join(
      ""
    )}</select>`;
  }

  updateButtonStates() {
    const autoPairBtn = document.getElementById("auto-pair");
    const manualStartBtn = document.getElementById("manual-start");

    const hasAvailableCourts = this.courts.some(
      (c) => !c.occupied && c.pairs.length === 0
    );
    const hasEnoughPlayers = this.waitingPlayers.length >= 4;
    const hasReadyCourts = this.courts.some(
      (c) => !c.occupied && c.pairs.length === 2
    );

    // 自動配對按鈕
    autoPairBtn.disabled = !hasAvailableCourts || !hasEnoughPlayers;

    if (!hasAvailableCourts) {
      autoPairBtn.textContent = "無空閒場地";
    } else if (!hasEnoughPlayers) {
      autoPairBtn.textContent = `需要更多人員 (${this.waitingPlayers.length}/4)`;
    } else {
      autoPairBtn.textContent = "自動配對";
    }

    // 手動開始按鈕
    manualStartBtn.disabled = !hasReadyCourts;

    if (!hasReadyCourts) {
      manualStartBtn.textContent = "無準備好的場地";
    } else {
      const readyCount = this.courts.filter(
        (c) => !c.occupied && c.pairs.length === 2
      ).length;
      manualStartBtn.textContent = `開始比賽 (${readyCount}個場地)`;
    }
  }

  saveToLocalStorage() {
    const data = {
      players: this.players,
      courts: this.courts,
      waitingPlayers: this.waitingPlayers,
      pairingHistory: Array.from(this.pairingHistory.entries()),
      courtCount: this.courtCount,
    };

    // 確保不保存編輯狀態
    this.editingCourt = null;
    localStorage.setItem("badmintonPairingSystem", JSON.stringify(data));
  }

  loadFromLocalStorage() {
    const data = localStorage.getItem("badmintonPairingSystem");
    if (data) {
      try {
        const parsed = JSON.parse(data);
        this.players = parsed.players || [];
        this.waitingPlayers = parsed.waitingPlayers || [];
        this.pairingHistory = new Map(parsed.pairingHistory || []);
        this.courtCount = parsed.courtCount || 3;

        // 確保所有球員都有新的統計欄位
        this.players.forEach((player) => {
          if (player.gamesPlayed === undefined) player.gamesPlayed = 0;
          if (player.waitingRounds === undefined) player.waitingRounds = 0;
          if (player.isResting === undefined) player.isResting = false;
        });

        this.waitingPlayers.forEach((player) => {
          if (player.gamesPlayed === undefined) player.gamesPlayed = 0;
          if (player.waitingRounds === undefined) player.waitingRounds = 0;
          if (player.isResting === undefined) player.isResting = false;
        });

        // 更新場地數量輸入欄位
        document.getElementById("court-count").value = this.courtCount;

        // 恢復場地狀態
        if (parsed.courts) {
          // 轉換startTime字串回Date物件
          parsed.courts.forEach((court) => {
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
        console.error("載入資料失敗:", e);
      }
    }
  }
}

// 初始化系統
let pairingSystem;
document.addEventListener("DOMContentLoaded", () => {
  pairingSystem = new BadmintonPairingSystem();
});
