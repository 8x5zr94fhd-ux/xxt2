// --- 1. 初始化设置 ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const GAME_WIDTH = canvas.width;
const GAME_HEIGHT = canvas.height;

// 游戏状态变量
let gameTime = 0; 
const GAME_DURATION = 60000; // 游戏总时长 60 秒
let gameState = 'Menu'; 

// 升级和道具系统配置
const MAX_UPGRADE_LEVEL = 20;
const UPGRADE_COST = 1000; 
const BASE_SHOT_INTERVAL = 200; 
const ITEM_COST = 2000; 

// 玩家升级状态 (持久化)
let upgrades = {
    bulletRateLevel: parseInt(localStorage.getItem('bulletRateLevel') || 0),
    bulletSizeLevel: parseInt(localStorage.getItem('bulletSizeLevel') || 0)
};

// 玩家道具库存 (持久化)
let inventory = JSON.parse(localStorage.getItem('inventory') || '{}');
const ITEM_TYPES = ['Triple', 'Spread', 'Homing', 'Speed', 'Wingman', 'ClearScreen'];
ITEM_TYPES.forEach(type => {
    if (inventory[type] === undefined) {
        inventory[type] = 0;
    }
});

// 玩家对象
let player = {
    x: GAME_WIDTH / 2, 
    y: GAME_HEIGHT - 100, 
    width: 60, 
    height: 70,
    color: '#87CEEB',
    baseSpeed: 5, 
    speed: 5, 
    health: 100, 
    maxHealth: 100,
    hasWingman: false
};

let powerUp = { type: 'Normal', duration: 0, endTime: 0 };
let bullets = []; 
let enemies = []; 
let enemyBullets = []; 
let items = []; 
let boss = null; 
let bossBullets = []; 

let mouseX = player.x; 
let mouseY = player.y; 

let score = parseInt(localStorage.getItem('currentScore') || 0); 
let lastShotTime = 0;
let currentShotInterval = BASE_SHOT_INTERVAL; 

const ENEMY_HEALTH = 3; 

let gameOver = false; 
let gameStartTimestamp = 0; 
// V5.4 修复: 移除冗余的 currentBossPhase 变量，直接从 Boss 对象中获取。

// --- 背景星星 (保持不变) ---
let stars = [];
for (let i = 0; i < 50; i++) {
    stars.push({
        x: Math.random() * GAME_WIDTH,
        y: Math.random() * GAME_HEIGHT,
        radius: Math.random() * 1.5,
        speed: Math.random() * 0.5 + 0.1, 
        color: `rgba(255, 255, 255, ${Math.random() * 0.5 + 0.5})`
    });
}
function drawStars() {
    stars.forEach(star => {
        star.y += star.speed;
        if (star.y > GAME_HEIGHT) {
            star.y = 0;
            star.x = Math.random() * GAME_WIDTH;
        }
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = star.color;
        ctx.fill();
    });
}

function saveUpgrades() {
    localStorage.setItem('bulletRateLevel', upgrades.bulletRateLevel);
    localStorage.setItem('bulletSizeLevel', upgrades.bulletSizeLevel);
    localStorage.setItem('currentScore', score);
    localStorage.setItem('inventory', JSON.stringify(inventory));
}
function getShotInterval() {
    const rateFactor = 1 - (upgrades.bulletRateLevel * 0.01);
    return Math.max(50, BASE_SHOT_INTERVAL * rateFactor); 
}
function getBulletRadius() {
    return 5 * (1 + upgrades.bulletSizeLevel * 0.01); 
}


// --- 2. 游戏对象绘制
function drawSinglePlane(x, y, rotation, bodyColor, wingColor) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); 
    const width = player.width; const height = player.height; const darkShade = '#5f9ea0';    
    ctx.beginPath();
    ctx.moveTo(0, -height / 2); ctx.lineTo(-width * 0.1, height * 0.4); ctx.lineTo(width * 0.1, height * 0.4); ctx.lineTo(0, height / 2); ctx.closePath();
    ctx.fillStyle = bodyColor; ctx.fill(); ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-width * 0.5, height * 0.2); ctx.lineTo(width * 0.5, height * 0.2); ctx.lineTo(0, height * 0.4); ctx.closePath();
    ctx.fillStyle = wingColor; ctx.fill(); ctx.stroke();
    ctx.fillStyle = darkShade; ctx.fillRect(-width * 0.05, height * 0.4, width * 0.1, height * 0.2);
    ctx.restore(); 
}

function drawPlayer() {
    drawSinglePlane(player.x, player.y, 0, player.color, '#ADD8E6');
    if (player.hasWingman) {
        drawSinglePlane(player.x - 60, player.y + 10, 0, '#DAA520', '#FFD700'); 
        drawSinglePlane(player.x + 60, player.y + 10, 0, '#DAA520', '#FFD700'); 
    }
}

function drawBoss() {
    if (!boss) return;
    
    // 绘制 Boss 本体
    ctx.save(); ctx.translate(boss.x, boss.y); ctx.fillStyle = boss.color; ctx.fillRect(-boss.width / 2, -boss.height / 2, boss.width, boss.height);
    ctx.strokeStyle = '#333'; ctx.lineWidth = 5; ctx.strokeRect(-boss.width / 2, -boss.height / 2, boss.width, boss.height); ctx.restore();
    
    // 绘制 Boss 血条
    const barX = GAME_WIDTH / 2 - 150; const barY = 80; const barWidth = 300; const barHeight = 25;
    ctx.fillStyle = '#ccc'; ctx.fillRect(barX, barY, barWidth, barHeight);
    const currentHealthWidth = (boss.health / boss.maxHealth) * barWidth;
    ctx.fillStyle = 'red'; ctx.fillRect(barX, barY, currentHealthWidth, barHeight);
    ctx.strokeStyle = 'black'; ctx.lineWidth = 2; ctx.strokeRect(barX, barY, barWidth, barHeight);
    
    // V5.4 修复: 确保阶段显示逻辑是正确的
    const phaseText = boss.isVulnerable ? `阶段 ${boss.currentPhase}/6` : '入场中...';
    
    ctx.font = '20px "Microsoft YaHei", Arial'; 
    ctx.fillStyle = 'black'; 
    ctx.textAlign = 'center'; 
    ctx.fillText(`BOSS HP: ${Math.max(0, boss.health)}/${boss.maxHealth} (${phaseText})`, GAME_WIDTH / 2, barY + 18);
}

function drawBossBullet(bullet) {
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#FF0000'; ctx.shadowBlur = 10; ctx.shadowColor = '#FF0000'; ctx.fill(); ctx.shadowBlur = 0;
}

function drawBullet(bullet) {
    const radius = getBulletRadius(); 
    ctx.beginPath(); ctx.arc(bullet.x, bullet.y, radius, 0, Math.PI * 2); 
    ctx.fillStyle = '#FFD700'; ctx.shadowBlur = 15; ctx.shadowColor = '#FFD700'; ctx.fill(); ctx.shadowBlur = 0; 
}

function drawUpgradeIndicators() {
    const barX = GAME_WIDTH - 180; const barY = 75; const dotRadius = 4; const dotSpacing = 8;
    ctx.font = '16px "Microsoft YaHei", Arial'; ctx.fillStyle = '#32CD32'; ctx.textAlign = 'right';
    ctx.fillText(`速率 Lv.${upgrades.bulletRateLevel}`, barX - 10, barY + 5);

    for (let i = 0; i < upgrades.bulletRateLevel; i++) {
        ctx.beginPath(); ctx.arc(barX + i * dotSpacing, barY + 5, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#32CD32'; ctx.fill();
    }
    
    ctx.fillText(`大小 Lv.${upgrades.bulletSizeLevel}`, barX - 10, barY + 25);
    for (let i = 0; i < upgrades.bulletSizeLevel; i++) {
        ctx.beginPath(); ctx.arc(barX + i * dotSpacing, barY + 25, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#FFC0CB'; ctx.fill();
    }
    ctx.textAlign = 'left';
}

function drawHealthBar() {
    const barX = GAME_WIDTH - 180; const barY = 50; const barWidth = 150; const barHeight = 20;
    ctx.fillStyle = '#ccc'; ctx.fillRect(barX, barY, barWidth, barHeight);
    const currentHealthWidth = (player.health / player.maxHealth) * barWidth;
    ctx.fillStyle = player.health < 30 ? '#ff4500' : 'red';
    ctx.fillRect(barX, barY, currentHealthWidth, barHeight);
    ctx.strokeStyle = 'black'; ctx.lineWidth = 2; ctx.strokeRect(barX, barY, barWidth, barHeight);
    drawUpgradeIndicators();
}

function drawText() {
    ctx.font = '24px "Microsoft YaHei", Arial'; 
    ctx.fillStyle = 'black'; 
    ctx.textAlign = 'left';
    ctx.fillText('分数: ' + score, 20, 40);
    ctx.fillText('生命: ' + player.health + '/' + player.maxHealth, GAME_WIDTH - 180, 40);

    if (gameState === 'BossFight' || gameState === 'BossIntro') {
        const timeRemaining = Math.max(0, Math.ceil((GAME_DURATION - gameTime) / 1000));
        ctx.font = 'bold 28px "Microsoft YaHei", Arial';
        ctx.fillStyle = (timeRemaining <= 10 && timeRemaining > 0) ? 'red' : 'black';
        ctx.textAlign = 'center';
        ctx.fillText(`剩余时间: ${timeRemaining} 秒`, GAME_WIDTH / 2, 40);
    }

    ctx.font = '24px "Microsoft YaHei", Arial';
    if (powerUp.type !== 'Normal' && powerUp.type !== 'Wingman') {
        ctx.fillStyle = powerUp.type === 'Speed' ? '#32CD32' : '#FFC0CB';
        const remaining = Math.max(0, Math.ceil((powerUp.endTime - Date.now()) / 1000));
        ctx.textAlign = 'left'; ctx.fillText(`${powerUp.type} (${remaining}s)`, 20, 70);
    } else if (player.hasWingman) {
        ctx.fillStyle = '#DAA520'; ctx.textAlign = 'left'; ctx.fillText(`僚机已激活`, 20, 70);
    }
    
    if (gameOver) {
        ctx.font = '48px "Microsoft YaHei", Arial'; ctx.fillStyle = 'red'; ctx.textAlign = 'center'; 
        ctx.fillText('挑战结束！', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30);
        ctx.font = '28px "Microsoft YaHei", Arial'; ctx.fillStyle = 'black';
        ctx.fillText('点击屏幕返回菜单', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20);
    }
    ctx.textAlign = 'left'; 
}


// --- 3. 道具和菜单 (保持不变) ---

const ITEM_BUTTONS = [
    { type: 'Triple', text: 'x3', color: '#FFC0CB', x: 20, y: GAME_HEIGHT - 60, radius: 25 },
    { type: 'Spread', text: 'S', color: '#8A2BE2', x: 80, y: GAME_HEIGHT - 60, radius: 25 },
    { type: 'Homing', text: 'H', color: '#FF4500', x: 140, y: GAME_HEIGHT - 60, radius: 25 },
    { type: 'ClearScreen', text: 'C', color: '#7CFC00', x: 200, y: GAME_HEIGHT - 60, radius: 25 },
    { type: 'Wingman', text: 'W', color: '#DAA520', x: 260, y: GAME_HEIGHT - 60, radius: 25 }
];

function drawItemButtons() {
    ITEM_BUTTONS.forEach(btn => {
        const count = inventory[btn.type] || 0;
        ctx.beginPath();
        ctx.arc(btn.x, btn.y, btn.radius, 0, Math.PI * 2);
        
        if (count > 0 || (btn.type === 'Wingman' && player.hasWingman)) {
            ctx.fillStyle = btn.color;
            ctx.shadowBlur = 10;
            ctx.shadowColor = btn.color;
        } else {
            ctx.fillStyle = '#808080'; 
            ctx.shadowBlur = 0;
        }
        
        ctx.fill();
        ctx.shadowBlur = 0;
        
        ctx.font = 'bold 18px Arial';
        ctx.fillStyle = 'black';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(btn.text, btn.x, btn.y);
        
        ctx.font = '14px Arial';
        ctx.fillStyle = 'white';
        ctx.fillText(count, btn.x + 15, btn.y + 15);
    });
}

function applyPowerUp(type) {
    const duration = 8000;
    if (type === 'ClearScreen') { bossBullets = []; return; } 
    
    if (type === 'Wingman') { player.hasWingman = true; return; }
    
    player.speed = player.baseSpeed; 
    powerUp.type = type; powerUp.duration = duration; powerUp.endTime = Date.now() + duration;
    if (type === 'Speed') { player.speed *= 1.5; }
}

function checkPowerUpStatus() {
    if (powerUp.type !== 'Normal' && Date.now() > powerUp.endTime) {
        powerUp.type = 'Normal'; powerUp.duration = 0; player.speed = player.baseSpeed; 
    }
}

function activateItem(type) {
    if (type === 'Wingman' && player.hasWingman) return;
    if (inventory[type] <= 0) return;
    
    applyPowerUp(type);
    
    inventory[type]--;
    saveUpgrades();
}

function drawButton(x, y, w, h, text, color) {
    ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#333'; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'white'; ctx.font = '28px "Microsoft YaHei", Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2);
}

function drawMenu() {
    ctx.font = '48px "Microsoft YaHei", Arial'; ctx.fillStyle = 'black'; ctx.textAlign = 'center';
    ctx.fillText('星际躲避战', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 150);
    drawButton(GAME_WIDTH / 2 - 150, GAME_HEIGHT / 2 - 50, 300, 70, '开始 Boss 挑战', '#32CD32');
    drawButton(GAME_WIDTH / 2 - 150, GAME_HEIGHT / 2 + 50, 300, 70, '升级装备', '#1E90FF');
    ctx.font = '24px "Microsoft YaHei", Arial'; ctx.fillStyle = 'black';
    ctx.fillText(`当前分数 (货币): ${score}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 160);
}

function drawUpgradeScreen() {
    ctx.font = '40px "Microsoft YaHei", Arial'; ctx.fillStyle = 'black'; ctx.textAlign = 'center'; ctx.fillText('装备升级中心', GAME_WIDTH / 2, 80);
    ctx.font = '24px "Microsoft YaHei", Arial'; ctx.fillText(`当前分数 (货币): ${score} (1000分 = 1点)`, GAME_WIDTH / 2, 130);

    const btnW = 300; const btnH = 60; const btnX = GAME_WIDTH / 2 - 150; let y = 200;
    
    // --- 1. 射速升级 ---
    ctx.textAlign = 'left'; ctx.fillStyle = 'black';
    ctx.fillText(`射速 (等级 ${upgrades.bulletRateLevel}/${MAX_UPGRADE_LEVEL})`, btnX, y);
    ctx.fillText(`效果: 提高 ${upgrades.bulletRateLevel}% 射速`, btnX, y + 25);
    if (upgrades.bulletRateLevel < MAX_UPGRADE_LEVEL) {
        drawButton(btnX, y + 30, btnW, btnH, 
            score >= UPGRADE_COST ? `升级 (1000 分)` : '分数不足', 
            score >= UPGRADE_COST ? '#32CD32' : '#808080');
    } else { drawButton(btnX, y + 30, btnW, btnH, '已满级', '#FF4500'); }
    
    y += 150;
    
    // --- 2. 子弹大小升级 ---
    ctx.textAlign = 'left'; ctx.fillStyle = 'black';
    ctx.fillText(`子弹大小 (等级 ${upgrades.bulletSizeLevel}/${MAX_UPGRADE_LEVEL})`, btnX, y);
    ctx.fillText(`效果: 增大 ${upgrades.bulletSizeLevel}% 大小`, btnX, y + 25);
    if (upgrades.bulletSizeLevel < MAX_UPGRADE_LEVEL) {
        drawButton(btnX, y + 30, btnW, btnH, 
            score >= UPGRADE_COST ? `升级 (1000 分)` : '分数不足', 
            score >= UPGRADE_COST ? '#32CD32' : '#808080');
    } else { drawButton(btnX, y + 30, btnW, btnH, '已满级', '#FF4500'); }

    y += 150;
    
    // --- 3. 道具商店入口 ---
    drawButton(btnX, y + 30, btnW, btnH, '进入道具商店', '#FFA500');


    // 返回菜单按钮
    drawButton(GAME_WIDTH / 2 - 100, GAME_HEIGHT - 80, 200, 50, '返回菜单', '#1E90FF');
}

function drawShopScreen() {
    ctx.font = '40px "Microsoft YaHei", Arial'; ctx.fillStyle = 'black'; ctx.textAlign = 'center'; ctx.fillText('道具商店 (1点 = 1000分)', GAME_WIDTH / 2, 80);
    ctx.font = '24px "Microsoft YaHei", Arial'; ctx.fillText(`当前分数 (货币): ${score}`, GAME_WIDTH / 2, 130);

    const btnW = 300; const btnH = 60; const btnX = GAME_WIDTH / 2 - 150; 
    let y = 180;
    
    const shopItems = [
        { type: 'Triple', text: '三向射击 (8秒)', cost: ITEM_COST, desc: '射出三颗子弹' },
        { type: 'Spread', text: '扇形射击 (8秒)', cost: ITEM_COST, desc: '大范围扇形攻击' },
        { type: 'Homing', text: '追踪导弹 (8秒)', cost: ITEM_COST, desc: '子弹自动追踪目标' },
        { type: 'Speed', text: '加速 (8秒)', cost: ITEM_COST, desc: '提高移动速度' },
        { type: 'Wingman', text: '僚机', cost: ITEM_COST * 2, desc: '永久僚机 (直到死亡)' },
        { type: 'ClearScreen', text: '清屏', cost: ITEM_COST * 3, desc: '清除所有子弹和敌机' }
    ];
    
    shopItems.forEach(item => {
        ctx.textAlign = 'left'; ctx.fillStyle = 'black';
        ctx.fillText(`${item.text} - 库存: ${inventory[item.type]}`, btnX, y);
        ctx.font = '16px "Microsoft YaHei", Arial';
        ctx.fillText(item.desc, btnX, y + 20);
        
        const currentCost = item.cost;
        drawButton(btnX, y + 30, btnW, btnH, 
            score >= currentCost ? `购买 (${currentCost} 分)` : `分数不足 (${currentCost})`, 
            score >= currentCost ? '#FFA500' : '#808080');
        
        y += 100;
    });

    // 返回按钮
    drawButton(GAME_WIDTH / 2 - 100, GAME_HEIGHT - 50, 200, 50, '返回升级菜单', '#1E90FF');
}

function handleShopClick(clickX, clickY) {
    const btnW = 300; const btnH = 60; const btnX = GAME_WIDTH / 2 - 150; 
    let y = 180;

    const checkClick = (x, y, w, h) => clickX >= x && clickX <= x + w && clickY >= y && clickY <= y + h;
    
    const shopItems = [
        { type: 'Triple', cost: ITEM_COST },
        { type: 'Spread', cost: ITEM_COST },
        { type: 'Homing', cost: ITEM_COST },
        { type: 'Speed', cost: ITEM_COST },
        { type: 'Wingman', cost: ITEM_COST * 2 },
        { type: 'ClearScreen', cost: ITEM_COST * 3 }
    ];

    shopItems.forEach(item => {
        if (checkClick(btnX, y + 30, btnW, btnH)) {
            if (score >= item.cost) {
                score -= item.cost;
                inventory[item.type]++;
                saveUpgrades();
            }
        }
        y += 100;
    });

    if (checkClick(GAME_WIDTH / 2 - 100, GAME_HEIGHT - 50, 200, 50)) {
        gameState = 'Upgrade';
    }
}


// --- 4. 碰撞和射击工具函数 ---

function checkCollision(objA, objB) {
    const isCircle = objA.radius !== undefined;
    if (isCircle) {
        let testX = objA.x; let testY = objA.y;
        if (objA.x < objB.x - objB.width / 2) testX = objB.x - objB.width / 2;
        else if (objA.x > objB.x + objB.width / 2) testX = objB.x + objB.width / 2;
        if (objA.y < objB.y - objB.height / 2) testY = objB.y - objB.height / 2;
        else if (objA.y > objB.y + objB.height / 2) testY = objB.y + objB.height / 2;
        let distX = objA.x - testX; let distY = objA.y - testY;
        let distance = Math.sqrt((distX * distX) + (distY * distY));
        return distance <= objA.radius; 
    } else {
        // 矩形碰撞 (用于玩家 vs Boss)
        const A_halfW = objA.width / 2 * 0.8; const A_halfH = objA.height / 2 * 0.8;
        const B_halfW = objB.width / 2; const B_halfH = objB.height / 2;
        return objA.x + A_halfW > objB.x - B_halfW &&
               objA.x - A_halfW < objB.x + B_halfW &&
               objA.y + A_halfH > objB.y - B_halfH &&
               objA.y - A_halfH < objB.y + B_halfH;
    }
}

function shoot() {
    if (gameOver) return; if (player.health <= 0) return; 

    const bulletRadius = getBulletRadius();
    const spawnY = player.y - player.height / 2;
    const spawnX = player.x;
    const bulletSpeed = 10;
    
    let homingTarget = null;
    if (powerUp.type === 'Homing') {
        if (boss) { homingTarget = boss; } 
    }

    const fireBullet = (x, y, isWingman = false, angleRad = 0) => {
        bullets.push({ 
            x: x, 
            y: y, 
            radius: bulletRadius, 
            speed: bulletSpeed, 
            isHoming: powerUp.type === 'Homing', 
            target: homingTarget, 
            isWingman: isWingman, 
            angle: angleRad 
        });
    };

    if (powerUp.type === 'Spread') {
        // Spread 射击：扇形，角度范围 -30 到 30 度
        for (let angle = -30; angle <= 30; angle += 15) { 
            const angleRad = angle * Math.PI / 180;
            fireBullet(spawnX, spawnY, false, angleRad);
        }
    } else if (powerUp.type === 'Triple') {
        // Triple 射击：三颗子弹，中央，左侧，右侧
        fireBullet(spawnX, spawnY); 
        fireBullet(spawnX - 15, spawnY + 10); 
        fireBullet(spawnX + 15, spawnY + 10); 
    } else {
        // 普通或追踪射击
        fireBullet(spawnX, spawnY);
    }
    
    // 僚机射击
    if (player.hasWingman && powerUp.type !== 'Spread' && powerUp.type !== 'Triple') {
         fireBullet(player.x - 60, player.y + 10, true); 
         fireBullet(player.x + 60, player.y + 10, true); 
    }
}


// --- 5. Boss 逻辑 (核心重构和稳定化) ---

function Boss() {
    this.x = GAME_WIDTH / 2; this.y = -100; 
    this.width = 150; this.height = 150;
    this.color = '#B22222';
    this.maxHealth = 2000; this.health = 2000; 
    this.isVulnerable = false; // 只有入场后才可受伤
    this.bossTimeStart = Date.now(); // 记录 Boss 战开始时间
    this.lastShotTime = 0; // 上次射击时间
    this.baseInterval = 800; // 基础射击间隔 (毫秒)
    this.currentPhase = 1;

    this.intro = function() {
        // Boss 从顶部滑入
        if (this.y < 150) { this.y += 3; } else { 
            gameState = 'BossFight'; 
            this.isVulnerable = true; 
            this.lastShotTime = Date.now(); // 确保 Boss 开始攻击
        }
    }

    this.getDifficultyParams = function(elapsedTime) {
        const phaseDuration = 10000; // 每个阶段 10 秒
        // 阶段 1: 0-10s, 阶段 2: 10-20s, ... 阶段 6: 50-60s
        const phaseIndex = Math.floor(elapsedTime / phaseDuration); 
        this.currentPhase = phaseIndex + 1; // 1 到 6
        
        // 射击间隔乘数 (每阶段减少 10%)
        let intervalMultiplier = Math.max(0.5, 1 - 0.1 * phaseIndex); 
        // 子弹速度乘数 (每阶段增加 10%)
        let speedMultiplier = 1 + 0.1 * phaseIndex;
        
        return {
            interval: this.baseInterval * intervalMultiplier,
            speed: 3 * speedMultiplier,
            shots: 1 + Math.floor(elapsedTime / 15000) // 0s: 1, 15s: 2, 30s: 3, 45s: 4
        };
    }

    this.update = function(currentTime) {
        if (!this.isVulnerable) return;

        const elapsedTime = currentTime - this.bossTimeStart;
        const params = this.getDifficultyParams(elapsedTime);
        
        this.x += 2 * Math.sin(currentTime / 1500); // Boss 左右小幅移动
        
        // V5.4 修复: 确保 Boss 射击逻辑正确触发
        if (currentTime - this.lastShotTime > params.interval) {
            this.fire(elapsedTime, params.speed, params.shots);
            this.lastShotTime = currentTime;
        }
    }

    this.fire = function(elapsedTime, currentSpeed, numTrackingShots) {
        
        if (elapsedTime >= 50000) {
            // 阶段 6: 360 度全屏散弹
            const numBullets = 20; 
            for (let i = 0; i < numBullets; i++) {
                const angle = (i * 360 / numBullets) * Math.PI / 180;
                bossBullets.push({
                    x: this.x, y: this.y + 75, 
                    radius: 8, speed: currentSpeed * 1.2, angle: angle, damage: 15
                });
            }
        } else {
            // 阶段 1-5: 扇形追踪射击 (数量随时间增加)
            const angleSpread = 0.6; // 0.6 弧度 ≈ 34 度
            const angleStep = numTrackingShots > 1 ? angleSpread / (numTrackingShots - 1) : 0;
            const targetAngle = Math.atan2(player.y - this.y, player.x - this.x);

            for (let i = 0; i < numTrackingShots; i++) {
                const angleOffset = -angleSpread / 2 + i * angleStep;
                const finalAngle = targetAngle + angleOffset; 
                
                bossBullets.push({
                    x: this.x + Math.cos(finalAngle) * 50, // 从 Boss 前端发射
                    y: this.y + Math.sin(finalAngle) * 50 + 75, 
                    radius: 6, speed: currentSpeed, angle: finalAngle, damage: 10
                });
            }
        }
    }
}

function startBossBattle() {
    boss = new Boss();
}


// --- 6. 游戏核心循环 ---

function update(currentTime) {
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    drawStars();

    if (gameState === 'Menu') {
        drawMenu();
    } else if (gameState === 'Upgrade') {
        drawUpgradeScreen();
    } else if (gameState === 'Shop') {
        drawShopScreen();
    } else { 
        if (gameOver) {
            drawPlayer(); if (boss) drawBoss(); drawText(); 
            requestAnimationFrame(update);
            return;
        }

        gameTime = Date.now() - gameStartTimestamp;
        currentShotInterval = getShotInterval();
        
        // 游戏结束判断：时间到或 Boss 被击败
        if (gameTime >= GAME_DURATION) { 
            gameOver = true; 
            if (boss) score += boss.health * 10; 
            saveUpgrades(); 
        }
        if (boss && boss.health <= 0) { 
            gameOver = true; 
            score += 5000; 
            saveUpgrades();
        }

        checkPowerUpStatus();
        
        // 1. 状态机逻辑
        if (gameState === 'BossIntro') {
            if (boss) boss.intro(); 
        } else if (gameState === 'BossFight') {
            if (boss) boss.update(currentTime);
        }
        
        // 2. 自动射击
        if (gameState !== 'BossIntro' && gameTime - lastShotTime > currentShotInterval) {
            shoot();
            lastShotTime = gameTime;
        }

        // 3. 更新玩家位置
        player.x = mouseX;
        player.y = mouseY;

        // 4. 更新子弹和对象位置
        bullets = bullets.filter(bullet => {
            if (bullet.isHoming && bullet.target) {
                // Homing 逻辑
                const target = bullet.target; 
                const angle = Math.atan2(target.y - bullet.y, target.x - bullet.x);
                bullet.x += Math.cos(angle) * bullet.speed; 
                bullet.y += Math.sin(angle) * bullet.speed;
            } else if (bullet.angle !== undefined && bullet.angle !== 0) {
                // Spread 逻辑
                bullet.x += Math.sin(bullet.angle) * bullet.speed; 
                bullet.y -= Math.cos(bullet.angle) * bullet.speed;
            } else { 
                // Normal/Triple 逻辑
                bullet.y -= bullet.speed; 
            }
            return bullet.y > -bullet.radius && bullet.x > -bullet.radius && bullet.x < GAME_WIDTH + bullet.radius; 
        });

        // Boss 子弹更新和碰撞
        bossBullets = bossBullets.filter(bullet => {
            // Boss 子弹移动逻辑
            bullet.x += Math.cos(bullet.angle) * bullet.speed; 
            bullet.y += Math.sin(bullet.angle) * bullet.speed;
            
            // 碰撞检测
            const playerCollisionObj = { x: player.x, y: player.y, width: player.width * 0.8, height: player.height * 0.8 };
            const bossBulletCollisionObj = { x: bullet.x, y: bullet.y, radius: bullet.radius };
            if (checkCollision(bossBulletCollisionObj, playerCollisionObj)) {
                if (!player.hasWingman) { 
                    player.health -= bullet.damage;
                    if (player.health <= 0) { gameOver = true; player.health = 0; player.hasWingman = false; saveUpgrades(); }
                }
                return false; // Boss 子弹消失
            }
            // 边界检查
            return bullet.y < GAME_HEIGHT + bullet.radius && bullet.y > -bullet.radius && bullet.x > -bullet.radius && bullet.x < GAME_WIDTH + bullet.radius; 
        });
        
        // 5. 碰撞检测：子弹击中 Boss
        bullets = bullets.filter(bullet => {
            const bulletCollisionObj = { x: bullet.x, y: bullet.y, radius: bullet.radius };
            
            if (boss && boss.isVulnerable && checkCollision(bulletCollisionObj, boss)) {
                score += 1; 
                boss.health -= 1; 
                return false; 
            }
            return true; 
        });


        // 6. 绘制所有对象
        drawPlayer();
        bullets.forEach(drawBullet);
        bossBullets.forEach(drawBossBullet);
        if (boss) drawBoss();
        
        drawText(); 
        drawHealthBar(); 
        drawItemButtons(); 
    }

    requestAnimationFrame(update);
}


// --- 7. 游戏状态和重置 ---

function resetGame() {
    // V5.4 修正: 确保重置时 Boss 阶段也重置
    player.health = player.maxHealth;
    player.hasWingman = false;
    bullets = [];
    enemies = [];
    enemyBullets = [];
    boss = null;
    bossBullets = [];
    gameOver = false;
    lastShotTime = 0;
    gameTime = 0; 
    gameStartTimestamp = Date.now(); 
    mouseX = GAME_WIDTH / 2;
    mouseY = GAME_HEIGHT - 100;
}


// --- 8. 输入控制和状态切换 ---

function handleInput(e) {
    if (e.touches && e.touches.length > 0) {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.touches[0].clientX - rect.left;
        mouseY = e.touches[0].clientY - rect.top;
    } else {
        mouseX = e.offsetX; 
        mouseY = e.offsetY; 
    }
    e.preventDefault();
}

function handleMenuClick(e) {
    let clickX, clickY;
    if (e.touches && e.touches.length > 0) {
        const rect = canvas.getBoundingClientRect();
        clickX = e.touches[0].clientX - rect.left;
        clickY = e.touches[0].clientY - rect.top;
    } else {
        clickX = e.offsetX; 
        clickY = e.offsetY; 
    }

    const checkClick = (x, y, w, h) => clickX >= x && clickX <= x + w && clickY >= y && clickY <= y + h;
    const checkCircleClick = (x, y, r) => Math.hypot(clickX - x, clickY - y) <= r;

    if (gameState === 'Menu') {
        const btnX = GAME_WIDTH / 2 - 150;
        // 开始 Boss 挑战按钮
        if (checkClick(btnX, GAME_HEIGHT / 2 - 50, 300, 70)) {
            resetGame();
            startBossBattle(); 
            gameState = 'BossIntro'; 
        }
        // 升级装备按钮
        else if (checkClick(btnX, GAME_HEIGHT / 2 + 50, 300, 70)) {
            gameState = 'Upgrade';
        }
    } else if (gameState === 'Upgrade') {
        const btnX = GAME_WIDTH / 2 - 150;
        const btnW = 300;
        const btnH = 60;
        let y = 200; 

        // 1. 射速升级按钮
        if (checkClick(btnX, y + 30, btnW, btnH)) { 
            const MAX_UPGRADE_LEVEL = 20; const UPGRADE_COST = 1000;
            if (upgrades.bulletRateLevel < MAX_UPGRADE_LEVEL && score >= UPGRADE_COST) {
                score -= UPGRADE_COST; upgrades.bulletRateLevel++; saveUpgrades();
            }
        }
        
        y += 150; 

        // 2. 子弹大小升级按钮
        if (checkClick(btnX, y + 30, btnW, btnH)) { 
            const MAX_UPGRADE_LEVEL = 20; const UPGRADE_COST = 1000;
            if (upgrades.bulletSizeLevel < MAX_UPGRADE_LEVEL && score >= UPGRADE_COST) {
                score -= UPGRADE_COST; upgrades.bulletSizeLevel++; saveUpgrades();
            }
        }

        y += 150; 
        
        // 3. 道具商店入口按钮
        if (checkClick(btnX, y + 30, btnW, btnH)) { 
            gameState = 'Shop';
            return;
        }

        // 4. 返回菜单按钮
        if (checkClick(GAME_WIDTH / 2 - 100, GAME_HEIGHT - 80, 200, 50)) {
            gameState = 'Menu';
        }
    } else if (gameState === 'Shop') {
        handleShopClick(clickX, clickY);
    } else if (gameState === 'BossFight' || gameState === 'BossIntro') {
        // 检查道具按钮点击
        ITEM_BUTTONS.forEach(btn => {
            if (checkCircleClick(btn.x, btn.y, btn.radius)) {
                activateItem(btn.type);
            }
        });
    } else if (gameOver) {
        gameState = 'Menu';
        gameOver = false; 
    }
}

canvas.addEventListener('mousemove', (e) => { 
    if (gameState !== 'Menu' && gameState !== 'Upgrade' && gameState !== 'Shop') handleInput(e); 
}); 
canvas.addEventListener('touchmove', (e) => { 
    if (gameState !== 'Menu' && gameState !== 'Upgrade' && gameState !== 'Shop') handleInput(e); 
}); 
canvas.addEventListener('touchstart', (e) => { 
    if (gameState !== 'Menu' && gameState !== 'Upgrade' && gameState !== 'Shop') handleInput(e); 
}); 

canvas.addEventListener('mousedown', handleMenuClick); 
canvas.addEventListener('touchstart', handleMenuClick); 


// --- 9. 启动游戏 ---
update();
