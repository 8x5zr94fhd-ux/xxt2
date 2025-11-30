// --- 1. 初始化设置 ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const GAME_WIDTH = canvas.width;
const GAME_HEIGHT = canvas.height;

// 游戏状态变量
let gameTime = 0; 
const GAME_DURATION = 60000;
const BOSS_TIME = 30000;
let gameState = 'Menu'; // 默认从主菜单开始

// 升级系统配置
const MAX_UPGRADE_LEVEL = 20;
const UPGRADE_COST = 1000; 
const BASE_SHOT_INTERVAL = 200; // 基础射击间隔 (毫秒)

// 玩家升级状态 (使用 localStorage 存储持久化数据)
let upgrades = {
    bulletRateLevel: parseInt(localStorage.getItem('bulletRateLevel') || 0),
    bulletSizeLevel: parseInt(localStorage.getItem('bulletSizeLevel') || 0)
};

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
let items = []; 
let boss = null; 
let bossBullets = []; 

let mouseX = player.x; 
let mouseY = player.y; 

let score = parseInt(localStorage.getItem('currentScore') || 0); // 分数持久化作为货币
let lastEnemyTime = 0; 
let lastShotTime = 0;
let currentShotInterval = BASE_SHOT_INTERVAL; // V3.1: 动态射击间隔

// 障碍物生成参数 (已强化)
const BASE_ENEMY_INTERVAL = 800;
const BASE_ENEMY_SPEED = 2; 

let gameOver = false; 
let gameStartTimestamp = 0; 

// 背景星星 (保持原样)
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

// 帮助函数：保存升级数据
function saveUpgrades() {
    localStorage.setItem('bulletRateLevel', upgrades.bulletRateLevel);
    localStorage.setItem('bulletSizeLevel', upgrades.bulletSizeLevel);
    localStorage.setItem('currentScore', score);
}

// 动态获取升级后的射击间隔 (V3.1 关键修复)
function getShotInterval() {
    // 基础间隔 200ms。每升一级，射击速度提升 1% (相当于间隔减少 1%)
    const rateFactor = 1 - (upgrades.bulletRateLevel * 0.01);
    // 确保使用 BASE_SHOT_INTERVAL 常量进行计算，避免循环引用
    return Math.max(50, BASE_SHOT_INTERVAL * rateFactor); 
}

// 动态获取升级后的子弹半径
function getBulletRadius() {
    // 基础半径 5。每升一级，大小提升 1%
    return 5 * (1 + upgrades.bulletSizeLevel * 0.01); 
}


// --- 2. 游戏对象绘制函数 (保持原样) ---

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
    ctx.save(); ctx.translate(boss.x, boss.y); ctx.fillStyle = boss.color; ctx.fillRect(-boss.width / 2, -boss.height / 2, boss.width, boss.height);
    ctx.strokeStyle = '#333'; ctx.lineWidth = 5; ctx.strokeRect(-boss.width / 2, -boss.height / 2, boss.width, boss.height); ctx.restore();
    const barX = GAME_WIDTH / 2 - 150; const barY = 80; const barWidth = 300; const barHeight = 25;
    ctx.fillStyle = '#ccc'; ctx.fillRect(barX, barY, barWidth, barHeight);
    const currentHealthWidth = (boss.health / boss.maxHealth) * barWidth;
    ctx.fillStyle = 'red'; ctx.fillRect(barX, barY, currentHealthWidth, barHeight);
    ctx.strokeStyle = 'black'; ctx.lineWidth = 2; ctx.strokeRect(barX, barY, barWidth, barHeight);
    ctx.font = '20px Arial'; ctx.fillStyle = 'black'; ctx.textAlign = 'center'; ctx.fillText(`BOSS HP: ${boss.health}/${boss.maxHealth}`, GAME_WIDTH / 2, barY + 18);
}

function drawBossBullet(bullet) {
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#FF0000'; ctx.shadowBlur = 10; ctx.shadowColor = '#FF0000'; ctx.fill(); ctx.shadowBlur = 0;
}

function drawItem(item) {
    ctx.save(); ctx.translate(item.x, item.y); ctx.rotate(item.rotation);
    ctx.beginPath(); ctx.arc(0, 0, item.radius, 0, Math.PI * 2); ctx.fillStyle = item.color; ctx.fill();
    ctx.font = 'bold 16px Arial'; ctx.fillStyle = 'black'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(item.text, 0, 2);
    ctx.restore();
}

function drawBullet(bullet) {
    const radius = getBulletRadius(); 
    ctx.beginPath(); ctx.arc(bullet.x, bullet.y, radius, 0, Math.PI * 2); 
    ctx.fillStyle = '#FFD700'; ctx.shadowBlur = 15; ctx.shadowColor = '#FFD700'; ctx.fill(); ctx.shadowBlur = 0; 
}

function drawEnemy(enemy) {
    const radius = enemy.width / 2;
    ctx.save(); ctx.translate(enemy.x, enemy.y); ctx.rotate(enemy.rotation); 
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fillStyle = '#000000'; 
    ctx.shadowBlur = 10; ctx.shadowColor = '#333333'; ctx.fill(); ctx.strokeStyle = '#333333'; ctx.lineWidth = 2; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(-radius * 0.3, -radius * 0.3, radius * 0.2, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'; ctx.fill();
    ctx.restore();
}

function drawUpgradeIndicators() {
    const barX = GAME_WIDTH - 180; const barY = 75; const dotRadius = 4; const dotSpacing = 8;
    ctx.font = '16px Arial'; ctx.fillStyle = '#32CD32'; ctx.textAlign = 'right';
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

function drawText() {
    ctx.font = '24px Arial'; ctx.fillStyle = 'black'; ctx.textAlign = 'left';
    ctx.fillText('分数: ' + score, 20, 40);
    ctx.fillText('生命: ' + player.health + '/' + player.maxHealth, GAME_WIDTH - 180, 40);

    if (gameState === 'Playing' || gameState === 'BossFight') {
        const timeRemaining = Math.max(0, Math.ceil((GAME_DURATION - gameTime) / 1000));
        ctx.font = 'bold 28px Arial';
        ctx.fillStyle = (timeRemaining <= 10 && timeRemaining > 0) ? 'red' : 'black';
        ctx.textAlign = 'center';
        ctx.fillText(`时间: ${timeRemaining}`, GAME_WIDTH / 2, 40);
    }

    ctx.font = '24px Arial';
    if (powerUp.type !== 'Normal' && powerUp.type !== 'Wingman') {
        ctx.fillStyle = powerUp.type === 'Speed' ? '#32CD32' : '#FFC0CB';
        const remaining = Math.max(0, Math.ceil((powerUp.endTime - Date.now()) / 1000));
        ctx.textAlign = 'left'; ctx.fillText(`${powerUp.type} (${remaining}s)`, 20, 70);
    } else if (player.hasWingman) {
        ctx.fillStyle = '#DAA520'; ctx.textAlign = 'left'; ctx.fillText(`Wingman Active`, 20, 70);
    }
    
    if (gameOver) {
        ctx.font = '48px Arial'; ctx.fillStyle = 'red'; ctx.textAlign = 'center'; 
        ctx.fillText('游戏结束！', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30);
        ctx.font = '28px Arial'; ctx.fillStyle = 'black';
        ctx.fillText('点击屏幕返回菜单', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20);
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


// --- 3. 游戏逻辑函数 ---

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
        const A_halfW = objA.width / 2 * 0.8; const A_halfH = objA.height / 2 * 0.8;
        const B_halfW = objB.width / 2; const B_halfH = objB.height / 2;
        return objA.x + A_halfW > objB.x - B_halfW &&
               objA.x - A_halfW < objB.x + B_halfW &&
               objA.y + A_halfH > objB.y - B_halfH &&
               objA.y - A_halfH < objB.y + B_halfH;
    }
}

function spawnObject(currentTime) {
    if (gameState !== 'Playing' || gameOver) { return; }
    const timeSinceStart = currentTime - gameStartTimestamp;
    const difficultyFactor = 1 + (timeSinceStart / BOSS_TIME) * 1.5; 
    const currentEnemyInterval = BASE_ENEMY_INTERVAL / difficultyFactor;
    const currentEnemySpeed = BASE_ENEMY_SPEED * difficultyFactor;

    if (currentTime - lastEnemyTime > currentEnemyInterval || lastEnemyTime === 0) {
        const randomX = Math.random() * (GAME_WIDTH - 80) + 40; 
        const isItem = Math.random() < 0.01; 

        if (isItem) {
            const itemType = Math.floor(Math.random() * 5); 
            let color, text, type;
            if (itemType === 0) { color = '#FFC0CB'; text = 'T'; type = 'Triple'; }
            else if (itemType === 1) { color = '#8A2BE2'; text = 'S'; type = 'Spread'; }
            else if (itemType === 2) { color = '#7CFC00'; text = 'C'; type = 'ClearScreen'; } 
            else if (itemType === 3) { color = '#DAA520'; text = 'W'; type = 'Wingman'; } 
            else { color = '#FF4500'; text = 'H'; type = 'Homing'; } 

            items.push({ x: randomX, y: -30, radius: 15, speed: 1.5, color: color, text: text, type: type, width: 30, height: 30 });
        } else {
            enemies.push({ x: randomX, y: -50, width: 40, height: 40, color: '#000000', speed: currentEnemySpeed, rotation: Math.random() * 0.1 - 0.05 });
        }
        lastEnemyTime = currentTime; 
    }
}

function applyPowerUp(type) {
    const duration = 8000;
    if (type === 'ClearScreen') { enemies = []; bossBullets = []; return; }
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

function shoot() {
    if (gameOver) return; if (player.health <= 0) return; 

    const bulletRadius = getBulletRadius();
    const spawnY = player.y - player.height / 2;
    const spawnX = player.x;
    const bulletSpeed = 10;
    
    let homingTarget = null;
    if (powerUp.type === 'Homing') {
        if (boss) { homingTarget = boss; } 
        else if (enemies.length > 0) {
            homingTarget = enemies.reduce((closest, current) => {
                const dist1 = Math.hypot(spawnX - closest.x, spawnY - closest.y);
                const dist2 = Math.hypot(spawnX - current.x, spawnY - current.y);
                return dist2 < dist1 ? current : closest;
            }, enemies[0]);
        }
    }

    const fireBullet = (x, y, isWingman = false) => {
        bullets.push({ x: x, y: y, radius: bulletRadius, speed: bulletSpeed, isHoming: powerUp.type === 'Homing', target: homingTarget, isWingman: isWingman });
    };

    if (powerUp.type === 'Spread') {
        for (let angle = -30; angle <= 30; angle += 15) { 
            const angleRad = angle * Math.PI / 180;
            bullets.push({ x: spawnX, y: spawnY, radius: bulletRadius, angle: angleRad, speed: bulletSpeed });
        }
    } else if (powerUp.type === 'Triple') {
        fireBullet(spawnX, spawnY); fireBullet(spawnX - 15, spawnY + 10); fireBullet(spawnX + 15, spawnY + 10); 
    } else {
        fireBullet(spawnX, spawnY);
    }
    
    if (player.hasWingman && powerUp.type !== 'Spread' && powerUp.type !== 'Triple') {
         fireBullet(player.x - 60, player.y + 10, true); 
         fireBullet(player.x + 60, player.y + 10, true); 
    }
}

// --- 4. Boss 逻辑 (保持原样) ---
const BOSS_MOVE_SPEED = 2;
let lastBossShotTime = 0;
const BOSS_SHOT_INTERVAL = 800; 

function Boss() {
    this.x = GAME_WIDTH / 2; this.y = -100; this.width = 150; this.height = 150;
    this.color = '#B22222'; this.maxHealth = 200; this.health = 200;
    this.isVulnerable = false; this.bossTimeStart = Date.now(); this.baseBulletSpeed = 3;

    this.intro = function() {
        if (this.y < 150) { this.y += 3; } else { gameState = 'BossFight'; this.isVulnerable = true; }
    }

    this.update = function(currentTime) {
        if (!this.isVulnerable) return;
        this.x += BOSS_MOVE_SPEED * Math.sin(currentTime / 1500);
        if (currentTime - lastBossShotTime > BOSS_SHOT_INTERVAL) {
            this.fire(); lastBossShotTime = currentTime;
        }
    }

    this.fire = function() {
        const bossTimeElapsed = Date.now() - this.bossTimeStart;
        const speedFactor = 1 + bossTimeElapsed / 45000; 
        const currentSpeed = this.baseBulletSpeed * speedFactor;

        for (let angleOffset = -0.3; angleOffset <= 0.3; angleOffset += 0.3) { 
            const targetAngle = Math.atan2(player.y - this.y, player.x - this.x);
            const finalAngle = targetAngle + angleOffset; 
            bossBullets.push({ x: this.x + Math.cos(finalAngle) * 50, y: this.y + Math.sin(finalAngle) * 50, radius: 8, speed: currentSpeed, angle: finalAngle, damage: 20 });
        }
    }
}

function startBossBattle() {
    gameState = 'BossIntro'; enemies = []; items = []; boss = new Boss();
}


// --- 5. 菜单和升级界面逻辑 (保持原样) ---

function drawButton(x, y, w, h, text, color) {
    ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#333'; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'white'; ctx.font = '30px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2);
}

function drawMenu() {
    ctx.font = '48px Arial'; ctx.fillStyle = 'black'; ctx.textAlign = 'center';
    ctx.fillText('星际躲避战', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 150);
    drawButton(GAME_WIDTH / 2 - 150, GAME_HEIGHT / 2 - 50, 300, 70, '开始游戏', '#32CD32');
    drawButton(GAME_WIDTH / 2 - 150, GAME_HEIGHT / 2 + 50, 300, 70, '升级装备', '#1E90FF');
    ctx.font = '24px Arial'; ctx.fillStyle = 'black';
    ctx.fillText(`当前分数 (货币): ${score}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 160);
}

function drawUpgradeScreen() {
    ctx.font = '40px Arial'; ctx.fillStyle = 'black'; ctx.textAlign = 'center'; ctx.fillText('装备升级中心', GAME_WIDTH / 2, 80);
    ctx.font = '24px Arial'; ctx.fillText(`当前分数 (货币): ${score} (1000分 = 1点)`, GAME_WIDTH / 2, 130);

    const btnW = 300; const btnH = 60; const btnX = GAME_WIDTH / 2 - 150; let y = 200;
    
    // --- 1. 射速升级 ---
    ctx.textAlign = 'left'; ctx.fillStyle = 'black';
    ctx.fillText(`射速 (Lv.${upgrades.bulletRateLevel}/${MAX_UPGRADE_LEVEL})`, btnX, y);
    ctx.fillText(`效果: 提高 ${upgrades.bulletRateLevel}% 射速`, btnX, y + 25);
    if (upgrades.bulletRateLevel < MAX_UPGRADE_LEVEL) {
        drawButton(btnX, y + 30, btnW, btnH, 
            score >= UPGRADE_COST ? `升级 (1000 分)` : '分数不足', 
            score >= UPGRADE_COST ? '#32CD32' : '#808080');
    } else { drawButton(btnX, y + 30, btnW, btnH, '已满级', '#FF4500'); }
    
    y += 150;
    
    // --- 2. 子弹大小升级 ---
    ctx.textAlign = 'left'; ctx.fillStyle = 'black';
    ctx.fillText(`子弹大小 (Lv.${upgrades.bulletSizeLevel}/${MAX_UPGRADE_LEVEL})`, btnX, y);
    ctx.fillText(`效果: 增大 ${upgrades.bulletSizeLevel}% 大小`, btnX, y + 25);
    if (upgrades.bulletSizeLevel < MAX_UPGRADE_LEVEL) {
        drawButton(btnX, y + 30, btnW, btnH, 
            score >= UPGRADE_COST ? `升级 (1000 分)` : '分数不足', 
            score >= UPGRADE_COST ? '#32CD32' : '#808080');
    } else { drawButton(btnX, y + 30, btnW, btnH, '已满级', '#FF4500'); }

    drawButton(GAME_WIDTH / 2 - 100, GAME_HEIGHT - 80, 200, 50, '返回菜单', '#FFA500');
}


// --- 6. 游戏核心循环 ---

function update(currentTime) {
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    drawStars();

    if (gameState === 'Menu') {
        drawMenu();
    } else if (gameState === 'Upgrade') {
        drawUpgradeScreen();
    } else { 
        if (gameOver) {
            drawPlayer(); if (boss) drawBoss(); drawText(); 
            requestAnimationFrame(update);
            return;
        }

        // V3.1 修复: 每次更新时计算射击间隔
        gameTime = Date.now() - gameStartTimestamp;
        currentShotInterval = getShotInterval();
        
        if (gameTime >= GAME_DURATION) { gameOver = true; saveUpgrades(); }

        checkPowerUpStatus();
        
        // 1. 状态机逻辑
        if (gameState === 'Playing') {
            spawnObject(currentTime);
            if (gameTime >= BOSS_TIME) { startBossBattle(); }
        } else if (gameState === 'BossIntro') {
            boss.intro();
        } else if (gameState === 'BossFight') {
            boss.update(currentTime);
        }
        
        // 2. 自动射击
        if (gameState !== 'BossIntro' && gameTime - lastShotTime > currentShotInterval) {
            shoot();
            lastShotTime = gameTime;
        }

        // 4. 更新玩家位置
        player.x = mouseX;
        player.y = mouseY;

        // 5. 更新子弹和对象位置
        bullets = bullets.filter(bullet => {
            if (bullet.isHoming && bullet.target) {
                const target = bullet.target; const angle = Math.atan2(target.y - bullet.y, target.x - bullet.x);
                bullet.x += Math.cos(angle) * bullet.speed; bullet.y += Math.sin(angle) * bullet.speed;
            } else if (bullet.angle !== undefined) {
                bullet.x += Math.sin(bullet.angle) * bullet.speed; bullet.y -= Math.cos(bullet.angle) * bullet.speed;
            } else { bullet.y -= bullet.speed; }
            return bullet.y > -bullet.radius && bullet.x > -bullet.radius && bullet.x < GAME_WIDTH + bullet.radius; 
        });

        bossBullets = bossBullets.filter(bullet => {
            bullet.x += Math.cos(bullet.angle) * bullet.speed; bullet.y += Math.sin(bullet.angle) * bullet.speed;
            const playerCollisionObj = { x: player.x, y: player.y, width: player.width * 0.8, height: player.height * 0.8 };
            const bossBulletCollisionObj = { x: bullet.x, y: bullet.y, radius: bullet.radius };
            if (checkCollision(bossBulletCollisionObj, playerCollisionObj)) {
                player.health -= bullet.damage;
                if (player.health <= 0) { gameOver = true; player.health = 0; player.hasWingman = false; }
                return false; 
            }
            return bullet.y < GAME_HEIGHT + bullet.radius && bullet.y > -bullet.radius && bullet.x > -bullet.radius && bullet.x < GAME_WIDTH + bullet.radius; 
        });
        
        enemies = enemies.filter(enemy => {
            enemy.y += enemy.speed; enemy.rotation += 0.01; 
            const playerCollisionObj = { x: player.x, y: player.y, width: player.width * 0.8, height: player.height * 0.8 };
            if (checkCollision(playerCollisionObj, enemy)) {
                player.health -= 20; 
                if (player.health <= 0) { gameOver = true; player.health = 0; player.hasWingman = false; }
                return false;
            }
            return enemy.y < GAME_HEIGHT + enemy.height; 
        });

        items = items.filter(item => {
            item.y += item.speed; item.rotation += 0.05; 
            const playerCollisionObj = { x: player.x, y: player.y, width: player.width * 0.8, height: player.height * 0.8 };
            const itemCollisionObj = { x: item.x, y: item.y, radius: item.radius };
            if (checkCollision(itemCollisionObj, playerCollisionObj)) { applyPowerUp(item.type); return false; }
            return item.y < GAME_HEIGHT + item.height;
        });


        // 6. 碰撞检测：子弹击中敌人/Boss
        for (let i = 0; i < bullets.length; i++) {
            let bulletHit = false;
            const bulletCollisionObj = { x: bullets[i].x, y: bullets[i].y, radius: bullets[i].radius };

            if (boss && boss.isVulnerable && checkCollision(bulletCollisionObj, boss)) {
                score += 1; boss.health -= 1; bulletHit = true;
                if (boss.health <= 0) { gameOver = true; saveUpgrades(); }
            }
            
            for (let j = 0; j < enemies.length; j++) {
                if (checkCollision(bulletCollisionObj, enemies[j])) {
                    score += 10; enemies.splice(j, 1); bulletHit = true; break; 
                }
            }

            if (bulletHit) { bullets.splice(i, 1); i--; }
        }


        // 7. 绘制所有对象
        items.forEach(drawItem); 
        drawPlayer();
        bullets.forEach(drawBullet);
        enemies.forEach(drawEnemy);
        bossBullets.forEach(drawBossBullet);
        if (boss) drawBoss();
        
        drawText(); 
        drawHealthBar(); 
    }

    requestAnimationFrame(update);
}

// --- 7. 游戏状态和重置 ---

function resetGame() {
    player.health = player.maxHealth;
    player.hasWingman = false;
    bullets = [];
    enemies = [];
    items = [];
    boss = null;
    bossBullets = [];
    gameOver = false;
    lastEnemyTime = 0; // 确保计时器重置，立即开始生成
    gameStartTimestamp = Date.now(); // 启动计时
    // V3.1 修复: 确保玩家位置重置
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

    if (gameState === 'Menu') {
        const btnX = GAME_WIDTH / 2 - 150;
        // 开始游戏按钮
        if (checkClick(btnX, GAME_HEIGHT / 2 - 50, 300, 70)) {
            resetGame();
            gameState = 'Playing';
        }
        // 升级装备按钮
        else if (checkClick(btnX, GAME_HEIGHT / 2 + 50, 300, 70)) {
            gameState = 'Upgrade';
        }
    } else if (gameState === 'Upgrade') {
        const btnW = 300;
        const btnX = GAME_WIDTH / 2 - 150;
        
        // 射速升级按钮 (Y=230)
        if (checkClick(btnX, 230, btnW, 60)) {
            if (upgrades.bulletRateLevel < MAX_UPGRADE_LEVEL && score >= UPGRADE_COST) {
                score -= UPGRADE_COST;
                upgrades.bulletRateLevel++;
                saveUpgrades();
            }
        }
        // 子弹大小升级按钮 (Y=380)
        else if (checkClick(btnX, 380, btnW, 60)) {
            if (upgrades.bulletSizeLevel < MAX_UPGRADE_LEVEL && score >= UPGRADE_COST) {
                score -= UPGRADE_COST;
                upgrades.bulletSizeLevel++;
                saveUpgrades();
            }
        }
        // 返回菜单按钮
        else if (checkClick(GAME_WIDTH / 2 - 100, GAME_HEIGHT - 80, 200, 50)) {
            gameState = 'Menu';
        }
    } else if (gameOver) {
        // 游戏结束，点击返回菜单
        gameState = 'Menu';
        gameOver = false; 
    }
}

// 确保在 playing 状态下使用 handleInput 进行移动
canvas.addEventListener('mousemove', (e) => { 
    if (gameState !== 'Menu' && gameState !== 'Upgrade') handleInput(e); 
}); 
canvas.addEventListener('touchmove', (e) => { 
    if (gameState !== 'Menu' && gameState !== 'Upgrade') handleInput(e); 
}); 
canvas.addEventListener('touchstart', (e) => { 
    if (gameState !== 'Menu' && gameState !== 'Upgrade') handleInput(e); 
}); 

// 菜单和游戏结束状态下使用 mousedown/click/tap 处理按钮
canvas.addEventListener('mousedown', handleMenuClick); 
canvas.addEventListener('touchstart', handleMenuClick); 


// --- 9. 启动游戏 ---
update();
