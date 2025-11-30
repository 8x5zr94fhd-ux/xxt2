// --- 1. 初始化设置 ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const GAME_WIDTH = canvas.width;
const GAME_HEIGHT = canvas.height;

// 游戏状态变量
let gameTime = 0; 
const GAME_DURATION = 60000;
const BOSS_TIME = 30000;
let gameState = 'Menu'; 

// 升级和道具系统配置
const MAX_UPGRADE_LEVEL = 20;
const UPGRADE_COST = 1000; 
const BASE_SHOT_INTERVAL = 200; 
const ITEM_COST = 2000; // 每个道具购买成本

// 玩家升级状态 (持久化)
let upgrades = {
    bulletRateLevel: parseInt(localStorage.getItem('bulletRateLevel') || 0),
    bulletSizeLevel: parseInt(localStorage.getItem('bulletSizeLevel') || 0)
};

// 玩家道具库存 (持久化)
let inventory = JSON.parse(localStorage.getItem('inventory') || '{}');
const ITEM_TYPES = ['Triple', 'Spread', 'Homing', 'Speed', 'Wingman', 'ClearScreen'];
// 初始化库存，确保每个道具都有初始值
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
let enemyBullets = []; // 新增敌机子弹数组
let items = []; // 游戏内掉落的道具已移除，此数组用于处理碰撞/清理
let boss = null; 
let bossBullets = []; 

let mouseX = player.x; 
let mouseY = player.y; 

let score = parseInt(localStorage.getItem('currentScore') || 0); 
let lastEnemyTime = 0; 
let lastShotTime = 0;
let currentShotInterval = BASE_SHOT_INTERVAL; 

// 障碍物生成参数
const BASE_ENEMY_INTERVAL = 1000; // 敌机生成速度略慢
const BASE_ENEMY_SPEED = 1.5; 
const ENEMY_HEALTH = 3; // 敌机血量 (2-3次击中)

let gameOver = false; 
let gameStartTimestamp = 0; 

// 存储和加载函数
function saveUpgrades() {
    localStorage.setItem('bulletRateLevel', upgrades.bulletRateLevel);
    localStorage.setItem('bulletSizeLevel', upgrades.bulletSizeLevel);
    localStorage.setItem('currentScore', score);
    localStorage.setItem('inventory', JSON.stringify(inventory));
}

// 动态获取升级后的射击间隔
function getShotInterval() {
    const rateFactor = 1 - (upgrades.bulletRateLevel * 0.01);
    return Math.max(50, BASE_SHOT_INTERVAL * rateFactor); 
}

// 动态获取升级后的子弹半径
function getBulletRadius() {
    return 5 * (1 + upgrades.bulletSizeLevel * 0.01); 
}


// --- 2. 游戏对象绘制函数 (绘制敌机血条) ---

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

// 绘制敌机 (现在是带血量的敌机)
function drawEnemy(enemy) {
    const radius = enemy.width / 2;
    ctx.save(); 
    ctx.translate(enemy.x, enemy.y); 
    ctx.rotate(enemy.rotation); 
    
    // 绘制黑色敌机
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fillStyle = '#000000'; 
    ctx.shadowBlur = 10; ctx.shadowColor = '#333333'; ctx.fill(); 
    ctx.strokeStyle = '#333333'; ctx.lineWidth = 2; ctx.stroke(); ctx.shadowBlur = 0;
    
    // 绘制敌机血条 (位于敌机上方)
    const barWidth = 30;
    const barHeight = 4;
    const currentHealthWidth = (enemy.health / ENEMY_HEALTH) * barWidth;
    
    ctx.fillStyle = '#FF0000'; // 红色背景
    ctx.fillRect(-barWidth / 2, -radius - 10, barWidth, barHeight);
    ctx.fillStyle = '#00FF00'; // 绿色血量
    ctx.fillRect(-barWidth / 2, -radius - 10, currentHealthWidth, barHeight);

    ctx.restore();
}

// 绘制敌机子弹
function drawEnemyBullet(bullet) {
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#FF0000'; 
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#FF0000';
    ctx.fill();
    ctx.shadowBlur = 0;
}


// --- 3. 道具释放按钮和菜单重构 ---

// 道具按钮配置
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
        
        // 按钮颜色和状态
        if (count > 0 || (btn.type === 'Wingman' && player.hasWingman)) {
            ctx.fillStyle = btn.color;
            ctx.shadowBlur = 10;
            ctx.shadowColor = btn.color;
        } else {
            ctx.fillStyle = '#808080'; // 灰色
            ctx.shadowBlur = 0;
        }
        
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // 文本
        ctx.font = 'bold 18px Arial';
        ctx.fillStyle = 'black';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(btn.text, btn.x, btn.y);
        
        // 数量
        ctx.font = '14px Arial';
        ctx.fillStyle = 'white';
        ctx.fillText(count, btn.x + 15, btn.y + 15);
    });
}

function activateItem(type) {
    if (inventory[type] <= 0) return;
    
    // 特殊道具：立即生效
    if (type === 'ClearScreen') {
        enemies = [];
        enemyBullets = [];
        bossBullets = [];
        inventory[type]--;
        saveUpgrades();
        return;
    }
    
    // 持久型道具：检查是否已激活
    if (type === 'Wingman' && player.hasWingman) return;
    
    // 激活效果
    applyPowerUp(type);
    
    // 消耗道具
    inventory[type]--;
    saveUpgrades();
}

// 道具商店绘制
function drawShopScreen() {
    ctx.font = '40px Arial'; ctx.fillStyle = 'black'; ctx.textAlign = 'center'; ctx.fillText('道具商店 (1点 = 1000分)', GAME_WIDTH / 2, 80);
    ctx.font = '24px Arial'; ctx.fillText(`当前分数 (货币): ${score}`, GAME_WIDTH / 2, 130);

    const btnW = 300; const btnH = 60; const btnX = GAME_WIDTH / 2 - 150; 
    let y = 180;
    
    const shopItems = [
        { type: 'Triple', text: '三向射击 (8s)', cost: ITEM_COST, desc: '射出三颗子弹' },
        { type: 'Spread', text: '扇形射击 (8s)', cost: ITEM_COST, desc: '大范围扇形攻击' },
        { type: 'Homing', text: '追踪导弹 (8s)', cost: ITEM_COST, desc: '子弹自动追踪最近目标' },
        { type: 'Speed', text: '加速 (8s)', cost: ITEM_COST, desc: '提高移动速度' },
        { type: 'Wingman', text: '僚机', cost: ITEM_COST * 2, desc: '永久僚机 (直到死亡)' } // Wingman更贵
    ];
    
    shopItems.forEach(item => {
        ctx.textAlign = 'left'; ctx.fillStyle = 'black';
        ctx.fillText(`${item.text} - 库存: ${inventory[item.type]}`, btnX, y);
        ctx.font = '16px Arial';
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
        { type: 'Wingman', cost: ITEM_COST * 2 }
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

    // 返回按钮
    if (checkClick(GAME_WIDTH / 2 - 100, GAME_HEIGHT - 50, 200, 50)) {
        gameState = 'Upgrade';
    }
}


// --- 4. 敌机生成和行为 (核心修改) ---

let lastEnemyShotTime = 0;
const ENEMY_SHOT_INTERVAL = 1500; // 敌机每 1.5 秒射击一次

function spawnObject(currentTime) {
    if (gameOver) return;
    
    // 持续生成敌机，直到游戏结束（60秒）
    const timeSinceStart = currentTime - gameStartTimestamp;
    const difficultyFactor = 1 + (timeSinceStart / 60000) * 2; // 60秒内难度翻倍
    const currentEnemyInterval = BASE_ENEMY_INTERVAL / difficultyFactor;
    const currentEnemySpeed = BASE_ENEMY_SPEED * difficultyFactor;

    if (currentTime - lastEnemyTime > currentEnemyInterval) {
        const randomX = Math.random() * (GAME_WIDTH - 80) + 40; 
        
        // 敌机 (黑色敌机，带血量)
        enemies.push({
            x: randomX, y: -50, width: 40, height: 40,
            speed: currentEnemySpeed, rotation: Math.random() * 0.1 - 0.05,
            health: ENEMY_HEALTH, maxHealth: ENEMY_HEALTH
        });
        lastEnemyTime = currentTime; 
    }
    
    // 敌机射击逻辑
    if (currentTime - lastEnemyShotTime > ENEMY_SHOT_INTERVAL) {
        enemies.forEach(enemy => {
            // 敌机子弹射向玩家
            const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
            enemyBullets.push({
                x: enemy.x, y: enemy.y + enemy.height / 2, 
                radius: 5, speed: 4, angle: angle, damage: 10
            });
        });
        lastEnemyShotTime = currentTime;
    }
}


// --- 5. Boss 逻辑 (三阶段增强) ---

let currentBossPhase = 1;

function Boss() {
    this.x = GAME_WIDTH / 2; this.y = -100; 
    this.width = 150; this.height = 150;
    this.color = '#B22222';
    this.maxHealth = 200; this.health = 200;
    this.isVulnerable = false; 
    this.bossTimeStart = Date.now();
    this.baseBulletSpeed = 3;
    this.lastShotTime = 0;

    this.intro = function() {
        if (this.y < 150) { this.y += 3; } else { gameState = 'BossFight'; this.isVulnerable = true; }
    }

    this.getShotInterval = function(elapsedTime) {
        const baseInterval = 800;
        // 阶段 1: 0-10s (800ms)
        if (elapsedTime < 10000) return baseInterval; 
        // 阶段 2: 10-20s (提升 30%)
        if (elapsedTime < 20000) { currentBossPhase = 2; return baseInterval * 0.7; }
        // 阶段 3: 20-30s (再提升 30% = 50% 总提升)
        currentBossPhase = 3; 
        return baseInterval * 0.5;
    }
    
    this.getBulletSpeed = function(elapsedTime) {
        const baseSpeed = 3;
        if (elapsedTime < 10000) return baseSpeed; 
        if (elapsedTime < 20000) return baseSpeed * 1.3;
        return baseSpeed * 1.5;
    }

    this.update = function(currentTime) {
        if (!this.isVulnerable) return;

        const elapsedTime = currentTime - this.bossTimeStart;
        const currentInterval = this.getShotInterval(elapsedTime);
        
        this.x += 2 * Math.sin(currentTime / 1500); // Boss 移动
        
        if (currentTime - this.lastShotTime > currentInterval) {
            this.fire(elapsedTime);
            this.lastShotTime = currentTime;
        }
    }

    this.fire = function(elapsedTime) {
        const currentSpeed = this.getBulletSpeed(elapsedTime);

        if (elapsedTime >= 20000) {
            // 阶段 3: 全屏圆形散弹
            const numBullets = 20; 
            for (let i = 0; i < numBullets; i++) {
                const angle = (i * 360 / numBullets) * Math.PI / 180;
                bossBullets.push({
                    x: this.x, y: this.y + 75, // 从Boss中心发射
                    radius: 10, speed: currentSpeed * 1.5, angle: angle, damage: 20
                });
            }
        } else {
            // 阶段 1 & 2: 追踪射击
            for (let angleOffset = -0.3; angleOffset <= 0.3; angleOffset += 0.3) { 
                const targetAngle = Math.atan2(player.y - this.y, player.x - this.x);
                const finalAngle = targetAngle + angleOffset; 
                bossBullets.push({
                    x: this.x + Math.cos(finalAngle) * 50, y: this.y + Math.sin(finalAngle) * 50, 
                    radius: 8, speed: currentSpeed, angle: finalAngle, damage: 20
                });
            }
        }
    }
}

function startBossBattle() {
    gameState = 'BossIntro'; 
    enemies = []; 
    enemyBullets = [];
    currentBossPhase = 1;
    boss = new Boss();
}


// --- 6. 游戏核心循环 (更新碰撞逻辑) ---

function update(currentTime) {
    // ... (Drawing stars, menu, upgrade screens) ...
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
        
        // V4.0: 60秒后游戏结束
        if (gameTime >= GAME_DURATION) { gameOver = true; saveUpgrades(); }

        checkPowerUpStatus();
        
        // 1. 状态机逻辑
        if (gameState === 'Playing') {
            spawnObject(currentTime);
            // V4.0: 移除 30秒 Boss 逻辑，Boss 仅在游戏时间结束时出现 (可选: 如果需要Boss战，请在 Playing 状态中添加计时判断)
            // *为了实现60秒敌机，我暂时移除了30秒强制Boss战的逻辑*
            // *如果您想要Boss战，我们可能需要增加总时长或在 30 秒后切换到 Boss 状态*
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

        // 3. 更新玩家位置
        player.x = mouseX;
        player.y = mouseY;

        // 4. 更新子弹和对象位置
        // ... (Player bullet update remains the same) ...
        bullets = bullets.filter(bullet => {
             // ... bullet movement logic ...
            if (bullet.isHoming && bullet.target) {
                const target = bullet.target; const angle = Math.atan2(target.y - bullet.y, target.x - bullet.x);
                bullet.x += Math.cos(angle) * bullet.speed; bullet.y += Math.sin(angle) * bullet.speed;
            } else if (bullet.angle !== undefined) {
                bullet.x += Math.sin(bullet.angle) * bullet.speed; bullet.y -= Math.cos(bullet.angle) * bullet.speed;
            } else { bullet.y -= bullet.speed; }
            return bullet.y > -bullet.radius && bullet.x > -bullet.radius && bullet.x < GAME_WIDTH + bullet.radius; 
        });

        // V4.0: 敌机子弹更新和碰撞
        enemyBullets = enemyBullets.filter(bullet => {
            bullet.x += Math.cos(bullet.angle) * bullet.speed; bullet.y += Math.sin(bullet.angle) * bullet.speed;
            const playerCollisionObj = { x: player.x, y: player.y, width: player.width * 0.8, height: player.height * 0.8 };
            const enemyBulletCollisionObj = { x: bullet.x, y: bullet.y, radius: bullet.radius };
            if (checkCollision(enemyBulletCollisionObj, playerCollisionObj)) {
                player.health -= 5; // 敌机子弹伤害
                if (player.health <= 0) { gameOver = true; player.health = 0; player.hasWingman = false; saveUpgrades(); }
                return false; 
            }
            return bullet.y < GAME_HEIGHT + bullet.radius && bullet.y > -bullet.radius && bullet.x > -bullet.radius && bullet.x < GAME_WIDTH + bullet.radius; 
        });

        // Boss 子弹更新和碰撞 (保持原样)
        bossBullets = bossBullets.filter(bullet => {
            bullet.x += Math.cos(bullet.angle) * bullet.speed; bullet.y += Math.sin(bullet.angle) * bullet.speed;
            const playerCollisionObj = { x: player.x, y: player.y, width: player.width * 0.8, height: player.height * 0.8 };
            const bossBulletCollisionObj = { x: bullet.x, y: bullet.y, radius: bullet.radius };
            if (checkCollision(bossBulletCollisionObj, playerCollisionObj)) {
                player.health -= bullet.damage;
                if (player.health <= 0) { gameOver = true; player.health = 0; player.hasWingman = false; saveUpgrades(); }
                return false; 
            }
            return bullet.y < GAME_HEIGHT + bullet.radius && bullet.y > -bullet.radius && bullet.x > -bullet.radius && bullet.x < GAME_WIDTH + bullet.radius; 
        });
        
        // 敌机更新和碰撞
        enemies = enemies.filter(enemy => {
            enemy.y += enemy.speed; enemy.rotation += 0.01; 
            const playerCollisionObj = { x: player.x, y: player.y, width: player.width * 0.8, height: player.height * 0.8 };
            if (checkCollision(playerCollisionObj, enemy)) {
                player.health -= 20; 
                if (player.health <= 0) { gameOver = true; player.health = 0; player.hasWingman = false; saveUpgrades(); }
                return false;
            }
            return enemy.y < GAME_HEIGHT + enemy.height; 
        });

        // 5. 碰撞检测：子弹击中敌人/Boss
        for (let i = 0; i < bullets.length; i++) {
            let bulletHit = false;
            const bulletCollisionObj = { x: bullets[i].x, y: bullets[i].y, radius: bullets[i].radius };

            // 子弹打 Boss
            if (boss && boss.isVulnerable && checkCollision(bulletCollisionObj, boss)) {
                score += 1; boss.health -= 1; bulletHit = true;
                if (boss.health <= 0) { gameOver = true; score += 5000; saveUpgrades(); } // 额外 Boss 奖励
            }
            
            // 子弹打敌机
            for (let j = 0; j < enemies.length; j++) {
                if (checkCollision(bulletCollisionObj, enemies[j])) {
                    enemies[j].health -= 1;
                    bulletHit = true; 
                    
                    if (enemies[j].health <= 0) {
                        score += 50; // 基础得分
                        score += 100; // 额外爆炸奖励
                        enemies.splice(j, 1); 
                        j--;
                    }
                    break; 
                }
            }

            if (bulletHit) { bullets.splice(i, 1); i--; }
        }


        // 6. 绘制所有对象
        drawPlayer();
        bullets.forEach(drawBullet);
        enemies.forEach(drawEnemy);
        enemyBullets.forEach(drawEnemyBullet); // 绘制敌机子弹
        bossBullets.forEach(drawBossBullet);
        if (boss) drawBoss();
        
        drawText(); 
        drawHealthBar(); 
        drawItemButtons(); // 绘制道具释放按钮
    }

    requestAnimationFrame(update);
}


// --- 7. 游戏状态和重置 ---

function resetGame() {
    player.health = player.maxHealth;
    player.hasWingman = false;
    bullets = [];
    enemies = [];
    enemyBullets = [];
    boss = null;
    bossBullets = [];
    gameOver = false;
    lastEnemyTime = 0; 
    lastEnemyShotTime = 0;
    gameStartTimestamp = Date.now(); 
    mouseX = GAME_WIDTH / 2;
    mouseY = GAME_HEIGHT - 100;
}


// --- 8. 输入控制和状态切换 ---

function handleInput(e) {
    // ... (Mouse/Touch movement handling) ...
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
        const btnX = GAME_WIDTH / 2 - 150;
        // 升级子菜单
        if (checkClick(btnX, 230, 300, 60)) { /* Rate Upgrade Click */ }
        else if (checkClick(btnX, 380, 300, 60)) { /* Size Upgrade Click */ }
        
        // 新增道具商店按钮
        if (checkClick(btnX, 500, 300, 60)) { // 假设升级菜单上新增一个按钮
             gameState = 'Shop';
             return;
        }

        // ... (原有的升级逻辑) ...
        const MAX_UPGRADE_LEVEL = 20; const UPGRADE_COST = 1000;
        if (checkClick(btnX, 230, 300, 60)) { // Rate Upgrade
            if (upgrades.bulletRateLevel < MAX_UPGRADE_LEVEL && score >= UPGRADE_COST) {
                score -= UPGRADE_COST; upgrades.bulletRateLevel++; saveUpgrades();
            }
        } else if (checkClick(btnX, 380, 300, 60)) { // Size Upgrade
            if (upgrades.bulletSizeLevel < MAX_UPGRADE_LEVEL && score >= UPGRADE_COST) {
                score -= UPGRADE_COST; upgrades.bulletSizeLevel++; saveUpgrades();
            }
        }
        
        // 返回菜单按钮
        else if (checkClick(GAME_WIDTH / 2 - 100, GAME_HEIGHT - 80, 200, 50)) {
            gameState = 'Menu';
        }
    } else if (gameState === 'Shop') {
        handleShopClick(clickX, clickY);
    } else if (gameState === 'Playing') {
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

// 在 drawUpgradeScreen 中添加进入商店的按钮
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

    y += 150;
    
    // --- 3. 道具商店入口 ---
    drawButton(btnX, y + 30, btnW, btnH, '进入道具商店', '#FFA500');


    // 返回菜单按钮
    drawButton(GAME_WIDTH / 2 - 100, GAME_HEIGHT - 80, 200, 50, '返回菜单', '#1E90FF');
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
