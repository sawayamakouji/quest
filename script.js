console.log("ゲームスクリプトが読み込まれました。");

// --- グローバル変数 ---
let monsterMaster = [];
let autoAttackTimer = null;
let dotTimer = null;
const animationTypes = ['animation-float', 'animation-pulse', 'animation-sway'];

const messageTemplates = {
    playerAttack: ["ゆうしゃ のこうげき！", "ゆうしゃ のいちげき！", "ゆうしゃ はきりかかった！"],
    criticalHit: "かいしんのいちげき！",
    damage: "{name} に {damage} のダメージ！",
    monsterFirstAttack: "{name} はようすをうかがっている...<br>{name} のこうげき！",
    playerDamage: "ゆうしゃ は {damage} のダメージをうけた！",
    commandPrompt: "<br>コマンド？"
};

const gameState = {
    player: {},
    monster: {},
    isBattleOver: false,
    monstersDefeated: 0
};

// --- DOM要素を取得 ---
let gameContainer;
let statusWindow;
let messageP;
let monsterImage;
let fightButton;
let runButton;
let skillButton;
let itemButton; // 追加
let defenseButton; // 追加
let statusButton;

let overlay;
let overlayTitle;
let overlayMessage;
let overlayButton;

// --- データ読み込み ---
async function loadGameData() {
    try {
        const response = await fetch('monsters.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        monsterMaster = await response.json();
    } catch (error) {
        console.error("モンスターデータの読み込みに失敗しました:", error);
        alert("エラー: モンスターデータを読み込めませんでした。コンソールを確認してください。");
    }
}

// --- タイプライター関数 ---
const TYPEWRITER_SPEED = 50;
function typeMessage(message, { append = false } = {}) {
    return new Promise(resolve => {
        if (!append) messageP.innerHTML = '';
        let i = 0;
        function type() {
            if (i < message.length) {
                if (message.substring(i, i + 4) === '<br>') {
                    messageP.innerHTML += '<br>';
                    i += 4;
                } else {
                    messageP.innerHTML += message[i];
                    i++;
                }
                setTimeout(type, TYPEWRITER_SPEED);
            } else {
                resolve();
            }
        }
        type();
    });
}

// --- ゲーム開始/リスタート ---
async function startGame() {
    overlay.classList.add('hidden');
    gameState.isBattleOver = false;
    gameState.monstersDefeated = 0;
    gameState.player = { name: "ゆうしゃ", hp: 30, maxHp: 100, attack: 12, defense: 5, agility: 7, luck: 5, intelligence: 5, spirit: 5 };
    updateStatusWindow();
    startNextBattle();
}

// --- 次の戦闘を開始 ---
async function startNextBattle() {
    if (monsterMaster.length === 0) return; // データがなければ何もしない

    setCommandsActive(false);
    gameState.isBattleOver = false;
    
    const selectedMonster = { ...monsterMaster[Math.floor(Math.random() * monsterMaster.length)] };
    gameState.monster = selectedMonster;
    
    // モンスター画像の表示をリセットし、待機アニメーションを適用
    monsterImage.style.visibility = 'hidden'; // まず非表示にする
    monsterImage.style.opacity = '0'; // 透明にする
    monsterImage.classList.remove(...animationTypes, 'fade-out-animation');
    if (gameState.monster.animationType) {
        monsterImage.classList.add(`animation-${gameState.monster.animationType}`);
    }

    const img = new Image();
    img.src = gameState.monster.imageUrl;
    await new Promise(resolve => {
        img.onload = resolve;
        img.onerror = () => {
            console.error("画像の読み込みに失敗しました:", gameState.monster.imageUrl);
            resolve();
        };
    });

    monsterImage.src = gameState.monster.imageUrl;
    monsterImage.style.visibility = 'visible'; // 新しい画像を設定してから表示する
    monsterImage.style.opacity = '1'; // 透明度を戻す
    
    updateStatusWindow();
    await typeMessage(`${gameState.monster.name} があらわれた！`);
    if (gameState.player.agility >= gameState.monster.agility) {
        await typeMessage(messageTemplates.commandPrompt, { append: true });
        setCommandsActive(true);
    } else {
        await typeMessage(messageTemplates.monsterFirstAttack.replace(/{name}/g, gameState.monster.name));
        await monsterAttack();
    }
}

// --- 表示を更新する関数 ---
function updateStatusWindow() {
    statusWindow.innerHTML = `<p>${gameState.player.name}</p><p>HP: ${gameState.player.hp}</p>`;
}

function setCommandsActive(isActive) {
    fightButton.disabled = !isActive;
    runButton.disabled = !isActive;
    skillButton.disabled = !isActive;
    itemButton.disabled = !isActive; // 追加
    defenseButton.disabled = !isActive; // 追加
    statusButton.disabled = !isActive;

    if (isActive) {
        // タイマーを開始
        autoAttackTimer = setTimeout(async () => {
            playerAttack();
        }, 3000); // 3秒後に自動で攻撃

        // 1秒ごとに「。」を表示するタイマーを開始
        let dotCount = 0;
        dotTimer = setInterval(() => {
            if (dotCount < 3) { // 最大3つまで「。」を表示
                messageP.innerHTML += "。";
                dotCount++;
            } else {
                clearInterval(dotTimer); // 3つ表示したらタイマーを停止
            }
        }, 1000); // 1秒ごとに実行
    } else {
        // タイマーをクリア
        clearTimeout(autoAttackTimer);
        clearInterval(dotTimer); // 「。」表示タイマーもクリア
    }
}

// --- 戦闘ロジック ---
function calculateDamage(attacker, defender) {
    const baseDamage = attacker.attack - (defender.defense || 0) / 2;
    const randomFactor = (Math.random() - 0.5) * (attacker.attack / 4);
    const finalDamage = Math.round(Math.max(1, baseDamage + randomFactor));
    return finalDamage;
}

async function playerAttack() {
    if (gameState.isBattleOver) return;
    setCommandsActive(false);
    if (gameState.monster.animationType) {
        monsterImage.classList.remove(`animation-${gameState.monster.animationType}`);
    }

    let message = getRandomMessage(messageTemplates.playerAttack);
    let damage;
    const isCritical = Math.random() < (0.05 + (gameState.player.luck || 0) / 100);

    if (isCritical) {
        damage = gameState.player.attack * 2;
        message += `<br>${messageTemplates.criticalHit}`;
    } else {
        damage = calculateDamage(gameState.player, gameState.monster);
    }
    
    await typeMessage(message);
    
    monsterImage.classList.add('monster-hit-animation');
    monsterImage.addEventListener('animationend', () => monsterImage.classList.remove('monster-hit-animation'), { once: true });

    gameState.monster.hp = Math.max(0, gameState.monster.hp - damage);
    await sleep(600);
    await typeMessage(messageTemplates.damage.replace('{name}', gameState.monster.name).replace('{damage}', damage), { append: true });

    if (gameState.monster.hp === 0) { 
        await victory(); 
    } else { 
        if (gameState.monster.animationType) {
            monsterImage.classList.add(`animation-${gameState.monster.animationType}`);
        }
        await monsterAttack(); 
    }
}

async function monsterAttack() {
    if (gameState.isBattleOver) return;
    const damage = calculateDamage(gameState.monster, gameState.player);
    await typeMessage(`${gameState.monster.name} のこうげき！`);

    gameContainer.classList.add('shake-animation');
    gameContainer.addEventListener('animationend', () => gameContainer.classList.remove('shake-animation'), { once: true });

    gameState.player.hp = Math.max(0, gameState.player.hp - damage);
    await sleep(300);
    updateStatusWindow();
    await typeMessage(messageTemplates.playerDamage.replace('{damage}', damage), { append: true });

    if (gameState.player.hp === 0) { await defeat(); } else {
        await typeMessage(messageTemplates.commandPrompt, { append: true });
        setCommandsActive(true);
    }
}

async function victory() {
    gameState.isBattleOver = true;
    if (gameState.monster.animationType) {
        monsterImage.classList.remove(`animation-${gameState.monster.animationType}`);
    }
    monsterImage.style.visibility = 'hidden'; // 画像を非表示にする
    monsterImage.style.opacity = '0'; // 透明にする
    monsterImage.classList.add('fade-out-animation');
    await typeMessage(`${gameState.monster.name} をやっつけた！`);
    await sleep(1000);
    gameState.monstersDefeated++; // 倒したモンスター数をカウント
    startNextBattle(); // 次の戦闘へ
}

async function defeat() {
    gameState.isBattleOver = true;
    if (gameState.monster.animationType) {
        monsterImage.classList.remove(`animation-${gameState.monster.animationType}`);
    }
    monsterImage.style.visibility = 'hidden'; // 画像を非表示にする
    monsterImage.style.opacity = '0'; // 透明にする
    await typeMessage("ゆうしゃ はたおれてしまった...");
    await sleep(1000);
    showOverlay("ゲームオーバー", `倒したモンスター数: ${gameState.monstersDefeated}匹`, "もう一度挑戦する", startGame);
}

async function tryToRun() {
    if (gameState.isBattleOver) return;
    setCommandsActive(false);
    await typeMessage("ゆうしゃ はにげだした！");
    await sleep(1000);
    if (Math.random() < 0.5) {
        await typeMessage("うまくにげきれた！");
        gameState.isBattleOver = true;
        showOverlay("帰還成功！", `倒したモンスター数: ${gameState.monstersDefeated}匹`, "町に戻る", startGame);
    } else {
        await typeMessage("しかし まわりこまれてしまった！");
        await sleep(1000);
        await monsterAttack();
    }
}

// --- ゲーム終了処理 ---
function showOverlay(title, message, buttonText, buttonAction) {
    overlayTitle.textContent = title;
    overlayMessage.innerHTML = message;
    overlayButton.textContent = buttonText;
    overlayButton.onclick = buttonAction;
    overlay.classList.remove('hidden');
}

function hideOverlay() {
    overlay.classList.add('hidden');
}

// --- ヘルパー関数 ---
function getRandomMessage(messages) { return messages[Math.floor(Math.random() * messages.length)]; }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// --- イベントリスナー ---
// DOMContentLoaded内で設定

// --- ゲーム開始 ---
// DOMContentLoaded内で呼び出し

document.addEventListener('DOMContentLoaded', () => {
    // DOM要素を取得
    gameContainer = document.getElementById('game-container');
    statusWindow = document.getElementById('status-window');
    messageP = document.querySelector('#message-window p');
    monsterImage = document.getElementById('monster-image');
    fightButton = document.getElementById('fight-button');
    runButton = document.getElementById('run-button');
    skillButton = document.getElementById('skill-button');
    itemButton = document.getElementById('item-button'); // 追加
    defenseButton = document.getElementById('defense-button'); // 追加
    statusButton = document.getElementById('status-button');

    overlay = document.getElementById('overlay');
    overlayTitle = document.getElementById('overlay-title');
    overlayMessage = document.getElementById('overlay-message');
    overlayButton = document.getElementById('overlay-button');

    // イベントリスナーを設定
    fightButton.addEventListener('click', () => {  playerAttack(); });
    runButton.addEventListener('click', () => {  tryToRun(); });
    skillButton.addEventListener('click', () => {  typeMessage("とくぎはまだ使えない！", { append: true }); });
    itemButton.addEventListener('click', () => {  typeMessage("どうぐはまだ使えない！", { append: true }); });
    defenseButton.addEventListener('click', () => {  typeMessage("ぼうぎょ！", { append: true }); });
    statusButton.addEventListener('click', () => {  showPlayerStats(); });

    // ゲーム開始
    loadGameData().then(() => {
        showOverlay("ドラゴンクエスト風バトル", "準備はいいか？", "冒険に出る", startGame);
    });
});

// --- 勇者のステータス表示 ---
async function showPlayerStats() {
    setCommandsActive(false);
    const detailedStatsString = `HP: ${gameState.player.hp}/${gameState.player.maxHp}<br>` +
                                `攻撃: ${gameState.player.attack}<br>` +
                                `防御: ${gameState.player.defense}<br>` +
                                `素早さ: ${gameState.player.agility}<br>` +
                                `運: ${gameState.player.luck}<br>` +
                                `賢さ: ${gameState.player.intelligence}<br>` +
                                `精神力: ${gameState.player.spirit}`;

    showOverlay("ゆうしゃのステータス", detailedStatsString, "閉じる", hideOverlayAndResumeGame);
}

async function hideOverlayAndResumeGame() {
    hideOverlay();
    setCommandsActive(true);
}


