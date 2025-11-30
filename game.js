// --- 1. 初始化设置 ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const GAME_WIDTH = canvas.width;
const GAME_HEIGHT = canvas.height;

// 游戏状态变量
let gameTime = 0; 
const GAME_DURATION = 60000; // 1分钟 (60000毫秒)
const BOSS_TIME = 30000; // 30秒 (30000毫秒)
let gameRunning = true;
let gameStartTimestamp = Date.now(); 
let gameState = 'Playing'; // Playing, BossIntro, BossFight, GameOver

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
    hasWingman: false // 僚机状态
};

// 道具效果状态
let powerUp = {
    type: 'Normal', // Normal, Triple, Spread, Speed, Homing
    duration: 0,
    endTime: 0
};

let bullets = []; 
let enemies = []; 
let items = []; 
let boss = null; 
let bossBullets = []; 

let mouseX = player.x; 
let mouseY = player.y; 

let score = 0; 
let lastEnemyTime = 0; 
const BASE_ENEMY_INTERVAL = 1200; 
const BASE_ENEMY_SPEED = 1; 

let gameOver = false; 

// 自动攻击计时器
let lastShotTime = 0;
const SHOT_INTERVAL = 200; // 自动射击频率

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

// --- 2. 游戏对象绘制函数 (新增 Boss 和 Boss 血条) ---

// 绘制单个飞机 (供玩家和僚机使用)
function drawSinglePlane(x, y, rotation, bodyColor, wingColor) {
    ctx.save(); 
    ctx.translate(x, y); 
    ctx.rotate(rotation); 

    const width = player.width;
    const height = player.height;
    const darkShade = '#5f9ea0';    

    // 主机身 (更窄的梯形)
    ctx.beginPath();
    ctx.moveTo(0, -height / 2); 
    ctx.lineTo(-width * 0.1, height * 0.4); 
    ctx.lineTo(width * 0.1, height * 0.4); 
    ctx.lineTo(0, height / 2); 
    ctx.closePath();
    ctx.fillStyle = bodyColor;
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 主机翼 (大三角)
    ctx.beginPath();
    ctx.moveTo(-width * 0.5, height * 0.2); 
    ctx.lineTo(width * 0.5, height * 0.2); 
    ctx.lineTo(0, height * 0.4); 
    ctx.closePath();
    ctx.fillStyle = wingColor;
    ctx.fill();
    ctx.stroke();

    // 垂直安定面 
    ctx.fillStyle = darkShade;
    ctx.fillRect(-width * 0.05, height * 0.4, width * 0.1, height * 0.2);

    ctx.restore(); 
}

// 绘制玩家及其僚机
function drawPlayer() {
    drawSinglePlane(player.x, player.y, 0, player.color, '#ADD8E6');

    if (player.hasWingman) {
        drawSinglePlane(player.x - 60, player.y + 10, 0, '#DAA520', '#FFD700'); 
        drawSinglePlane(player.x + 60, player.y + 10, 0, '#DAA520', '#FFD700'); 
    }
}

// 绘制 Boss
function drawBoss() {
    if (!boss) return;

    ctx.save();
    ctx.translate(boss.x, boss.y);
    
    // Boss 本体 (一个大红色方块，体现障碍物合体)
    ctx.fillStyle = boss.color;
    ctx.fillRect(-boss.width / 2, -boss.height / 2, boss.width, boss.height);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 5;
    ctx.strokeRect(-boss.width / 2, -boss.height / 2, boss.width, boss.height);

    ctx.restore();
    
    // 绘制 Boss 血条
    const barX = GAME_WIDTH / 2 - 150;
    const barY = 80;
    const barWidth = 300;
    const barHeight = 25;

    ctx.fillStyle = '#ccc';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    const currentHealthWidth = (boss.health / boss.maxHealth) * barWidth;
    ctx.fillStyle = 'red';
    ctx.fillRect(barX, barY, currentHealthWidth, barHeight);

    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    ctx.font = '20px Arial';
    ctx.fillStyle = 'black';
    ctx.textAlign = 'center';
    ctx.fillText(`BOSS HP: ${boss.health}/${boss.maxHealth}`, GAME_WIDTH / 2, barY + 18);
}

// 绘制 Boss 子弹
function drawBossBullet(bullet) {
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#FF0000'; // Boss 子弹为红色
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#FF0000';
    ctx.fill();
    ctx.shadowBlur = 0;
}


// 绘制文字 (得分、游戏结束、血量条文本、剩余时间)
function drawText() {
    ctx.font = '24px Arial';
    ctx.fillStyle = 'black';
    ctx.textAlign = 'left';

    // 显示得分和生命
    ctx.fillText('得分: ' + score, 20, 40);
    ctx.fillText('生命: ' + player.health + '/' + player.maxHealth, GAME_WIDTH - 180, 40);

    // 计算并显示剩余时间
    const timeRemaining = Math.max(0, Math.ceil((GAME_DURATION - gameTime) / 1000));
    ctx.font = 'bold 28px Arial';
    ctx.fillStyle = (timeRemaining <= 10 && timeRemaining > 0) ? 'red' : 'black';
    ctx.textAlign = 'center';
    ctx.fillText(`时间: ${timeRemaining}`, GAME_WIDTH / 2, 40);

    // 显示道具状态
    ctx.font = '24px Arial';
    if (powerUp.type !== 'Normal' && powerUp.type !== 'Wingman') {
        ctx.fillStyle = powerUp.type === 'Speed' ? '#32CD32' : '#FFC0CB';
        const remaining = Math.max(0, Math.ceil((powerUp.endTime - Date.now()) / 1000));
        ctx.textAlign = 'left';
        ctx.fillText(`${powerUp.type} (${remaining}s)`, 20, 70);
    } else if (player.hasWingman) {
        ctx.fillStyle = '#DAA520';
        ctx.textAlign = 'left';
        ctx.fillText(`Wingman Active`, 20, 70);
    }
    
    // 游戏结束显示
    if (gameOver) {
        ctx.font = '48px Arial';
        ctx.fillStyle = 'red';
        ctx.textAlign = 'center'; 
        ctx.fillText('游戏结束！', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30);
        
        ctx.font = '28px Arial';
        ctx.fillStyle = 'black';
        ctx.fillText('点击屏幕重新开始', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20);
    }
    ctx.textAlign = 'left'; 
}

function drawHealthBar() {
    const barX = GAME_WIDTH - 180;
    const barY = 50;
    const barWidth = 150;
    const barHeight = 20;

    ctx.fillStyle = '#ccc';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    const currentHealthWidth = (player.health / player.maxHealth) * barWidth;
    ctx.fillStyle = player.health < 30 ? '#ff4500' : 'red';
    ctx.fillRect(barX, barY, currentHealthWidth, barHeight);

    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.strokeRect(barX, barY, barWidth, barHeight);
}

// 绘制敌人和道具 (保持原样)
function drawItem(item) {
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(item.rotation);

    ctx.beginPath();
    ctx.arc(0, 0, item.radius, 0, Math.PI * 2);
    ctx.fillStyle = item.color;
    ctx.fill();

    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = 'black';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.text, 0, 2);

    ctx.restore();
}

function drawBullet(bullet) {
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2); 
    ctx.fillStyle = '#FFD700'; 
    ctx.shadowBlur = 15; 
    ctx.shadowColor = '#FFD700';
    ctx.fill();
    ctx.shadowBlur = 0; 
}

function drawEnemy(enemy) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(enemy.rotation); 

    ctx.fillStyle = enemy.color; 
    ctx.strokeStyle = '#555';    
    ctx.lineWidth = 2;
    ctx.fillRect(-enemy.width / 2, -enemy.height / 2, enemy.width, enemy.height);
    ctx.strokeRect(-enemy.width / 2, -enemy.height / 2, enemy.width, enemy.height);

    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(-enemy.width / 2, -enemy.height / 2, enemy.width, 5);

    ctx.restore();
}


// --- 3. 游戏逻辑函数 ---

// 碰撞检测 (保持原样)
function checkCollision(objA, objB) {
    // 使用简单的圆形碰撞检测，适用于子弹和道具
    const isCircle = objA.radius !== undefined;
    
    if (isCircle) {
        let testX = objA.x;
        let testY = objA.y;

        if (objA.x < objB.x - objB.width / 2) testX = objB.x - objB.width / 2;
        else if (objA.x > objB.x + objB.width / 2) testX = objB.x + objB.width / 2;
        if (objA.y < objB.y - objB.height / 2) testY = objB.y - objB.height / 2;
        else if (objA.y > objB.y + objB.height / 2) testY = objB.y + objB.height / 2;

        let distX = objA.x - testX;
        let distY = objA.y - testY;
        let distance = Math.sqrt((distX * distX) + (distY * distY));

        return distance <= objA.radius; 
    } else {
        // A, B 都是矩形 (用于玩家-敌人/Boss碰撞)
        return objA.x + objA.width/2 > objB.x - objB.width/2 &&
               objA.x - objA.width/2 < objB.x + objB.width/2 &&
               objA.y + objA.height/2 > objB.y - objB.height/2 &&
               objA.y - objA.height/2 < objB.y + objB.height/2;
    }
}

// 敌人/道具生成逻辑 (难度递增，30秒后停止生成)
function spawnObject(currentTime) {
    if (gameState !== 'Playing' || gameOver) {
        return; 
    }

    // 难度递增：敌人速度和生成频率都随时间增加
    const timeSinceStart = currentTime - gameStartTimestamp;
    const difficultyFactor = 1 + (timeSinceStart / BOSS_TIME) * 1.5; // Boss战前最多2.5倍难度
    const currentEnemyInterval = BASE_ENEMY_INTERVAL / difficultyFactor;
    const currentEnemySpeed = BASE_ENEMY_SPEED * difficultyFactor;

    if (currentTime - lastEnemyTime > currentEnemyInterval) {
        const randomX = Math.random() * (GAME_WIDTH - 80) + 40; 
        
        const isItem = Math.random() < 0.20; 

        if (isItem) {
            // 0:Triple, 1:Spread, 2:ClearScreen, 3:Wingman, 4:Homing
            const itemType = Math.floor(Math.random() * 5); 
            let color, text, type;
            if (itemType === 0) { color = '#FFC0CB'; text = 'T'; type = 'Triple'; }
            else if (itemType === 1) { color = '#8A2BE2'; text = 'S'; type = 'Spread'; }
            else if (itemType === 2) { color = '#7CFC00'; text = 'C'; type = 'ClearScreen'; } 
            else if (itemType === 3) { color = '#DAA520'; text = 'W'; type = 'Wingman'; } 
            else { color = '#FF4500'; text = 'H'; type = 'Homing'; } 

            items.push({
                x: randomX,
                y: -30,
                radius: 15,
                speed: 1.5,
                color: color,
                text: text,
                type: type,
                width: 30, 
                height: 30
            });
        } else {
            enemies.push({
                x: randomX,
                y: -50, 
                width: 40, 
                height: 40,
                color: '#6c7a89', 
                speed: currentEnemySpeed, 
                rotation: Math.random() * 0.1 - 0.05
            });
        }
        lastEnemyTime = currentTime; 
    }
}

// 触发道具效果
function applyPowerUp(type) {
    const duration = 8000;
    
    if (type === 'ClearScreen') {
        enemies = []; 
        bossBullets = []; 
        return; 
    }

    if (type === 'Wingman') {
        player.hasWingman = true;
        return;
    }

    // 计时类道具
    player.speed = player.baseSpeed; 
    powerUp.type = type;
    powerUp.duration = duration;
    powerUp.endTime = Date.now() + duration;

    if (type === 'Speed') {
        player.speed *= 1.5; 
    }
}

function checkPowerUpStatus() {
    if (powerUp.type !== 'Normal' && Date.now() > powerUp.endTime) {
        powerUp.type = 'Normal';
        powerUp.duration = 0;
        player.speed = player.baseSpeed; 
    }
}

// 射击逻辑
function shoot() {
    if (gameOver) return; 
    if (player.health <= 0) return; 

    const bulletRadius = 5;
    const spawnY = player.y - player.height / 2;
    const spawnX = player.x;
    const bulletSpeed = 10;
    
    let homingTarget = null;
    if (powerUp.type === 'Homing' && enemies.length > 0) {
        homingTarget = enemies.reduce((closest, current) => {
            const dist1 = Math.hypot(spawnX - closest.x, spawnY - closest.y);
            const dist2 = Math.hypot(spawnX - current.x, spawnY - current.y);
            return dist2 < dist1 ? current : closest;
        }, enemies[0]);
    } else if (powerUp.type === 'Homing' && boss) {
        homingTarget = boss;
    }

    const fireBullet = (x, y, isWingman = false) => {
        bullets.push({ 
            x: x, 
            y: y, 
            radius: bulletRadius, 
            speed: bulletSpeed,
            isHoming: powerUp.type === 'Homing',
            target: homingTarget,
            isWingman: isWingman // 用于区分僚机子弹
        });
    };

    // 1. 主飞机开火
    if (powerUp.type === 'Spread') {
        for (let angle = -30; angle <= 30; angle += 15) { 
            const angleRad = angle * Math.PI / 180;
            bullets.push({
                x: spawnX,
                y: spawnY,
                radius: bulletRadius,
                angle: angleRad, 
                speed: bulletSpeed
            });
        }
    } else if (powerUp.type === 'Triple') {
        fireBullet(spawnX, spawnY);
        fireBullet(spawnX - 15, spawnY + 10); 
        fireBullet(spawnX + 15, spawnY + 10); 
    } else { // Normal 或 Homing
        fireBullet(spawnX, spawnY);
    }
    
    // 2. 僚机自动开火
    if (player.hasWingman && powerUp.type !== 'Spread' && powerUp.type !== 'Triple') {
         fireBullet(player.x - 60, player.y + 10, true); 
         fireBullet(player.x + 60, player.y + 10, true); 
    }
}

// --- 4. Boss 逻辑 ---

const BOSS_MOVE_SPEED = 2;
let lastBossShotTime = 0;
const BOSS_SHOT_INTERVAL = 1500; // Boss 基础射击间隔

function Boss() {
    this.x = GAME_WIDTH / 2;
    this.y = -100; // 从上方入场
    this.width = 150;
    this.height = 150;
    this.color = '#B22222';
    this.maxHealth = 200;
    this.health = 200;
    this.isVulnerable = false; // 合体时不受伤害
    this.targetX = GAME_WIDTH / 2;
    this.introStep = 0;
    this.bossTimeStart = Date.now();
    this.baseBulletSpeed = 3;

    // Boss 入场动画 (障碍物合体)
    this.intro = function() {
        if (this.y < 150) {
            this.y += 3; // 缓慢下降
        } else {
            gameState = 'BossFight';
            this.isVulnerable = true;
        }
    }

    // Boss 战斗更新
    this.update = function(currentTime) {
        if (!this.isVulnerable) return;

        // 左右移动
        this.x += BOSS_MOVE_SPEED * Math.sin(currentTime / 1500);
        
        // Boss 射击
        if (currentTime - lastBossShotTime > BOSS_SHOT_INTERVAL) {
            this.fire();
            lastBossShotTime = currentTime;
        }
    }

    // Boss 射击逻辑
    this.fire = function() {
        // 难度递增：Boss 子弹加速
        const bossTimeElapsed = Date.now() - this.bossTimeStart;
        const speedFactor = 1 + bossTimeElapsed / 45000; // 45秒内加速
        const currentSpeed = this.baseBulletSpeed * speedFactor;

        // 瞄准玩家发射子弹
        const angle = Math.atan2(player.y - this.y, player.x - this.x);
        
        bossBullets.push({
            x: this.x,
            y: this.y + this.height / 2, // 从Boss底部发射
            radius: 8,
            speed: currentSpeed,
            angle: angle,
            damage: 20
        });
    }

    this.draw = function() {
        drawBoss(this);
    }
}

// 触发 Boss 战的函数 (在 update 循环中调用)
function startBossBattle() {
    gameState = 'BossIntro';
    enemies = []; // 清空现有敌人
    items = []; // 清空道具
    boss = new Boss();
}

// --- 5. 游戏核心循环 ---

function update(currentTime) {
    if (gameOver) {
        drawStars();
        if (boss) drawBoss();
        drawText(); 
        requestAnimationFrame(update);
        return;
    }

    gameTime = Date.now() - gameStartTimestamp;
    
    // 游戏结束计时
    if (gameTime >= GAME_DURATION) {
        gameOver = true;
    }

    // 检查并应用道具状态
    checkPowerUpStatus();

    // 1. 状态机逻辑
    if (gameState === 'Playing') {
        spawnObject(currentTime);
        // 触发 Boss 战
        if (gameTime >= BOSS_TIME) {
            startBossBattle();
        }
    } else if (gameState === 'BossIntro') {
        boss.intro();
    } else if (gameState === 'BossFight') {
        boss.update(currentTime);
    }
    
    // 2. 自动射击
    if (gameRunning && gameState !== 'BossIntro' && gameTime - lastShotTime > SHOT_INTERVAL) {
        shoot();
        lastShotTime = gameTime;
    }

    // 3. 清除画布 & 绘制背景
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    drawStars();

    // 4. 更新玩家位置
    player.x = mouseX;
    player.y = mouseY;
    // ... (边界限制代码保持不变) ...

    // 5. 更新子弹和对象位置

    // 玩家子弹更新 (包含追踪逻辑)
    bullets = bullets.filter(bullet => {
        if (bullet.isHoming && bullet.target) {
            const target = bullet.target;
            // 实时计算角度，让追踪更精确
            const angle = Math.atan2(target.y - bullet.y, target.x - bullet.x);
            bullet.x += Math.cos(angle) * bullet.speed;
            bullet.y += Math.sin(angle) * bullet.speed;
        } else if (bullet.angle !== undefined) {
            bullet.x += Math.sin(bullet.angle) * bullet.speed;
            bullet.y -= Math.cos(bullet.angle) * bullet.speed;
        } else {
            bullet.y -= bullet.speed; 
        }
        return bullet.y > -bullet.radius && bullet.x > -bullet.radius && bullet.x < GAME_WIDTH + bullet.radius; 
    });

    // Boss 子弹更新
    bossBullets = bossBullets.filter(bullet => {
        bullet.x += Math.cos(bullet.angle) * bullet.speed;
        bullet.y += Math.sin(bullet.angle) * bullet.speed;
        
        // 碰撞检测：Boss子弹击中玩家
        const playerCollisionObj = { x: player.x, y: player.y, width: player.width * 0.8, height: player.height * 0.8 };
        const bossBulletCollisionObj = { x: bullet.x, y: bullet.y, radius: bullet.radius };

        if (checkCollision(bossBulletCollisionObj, playerCollisionObj)) {
            player.health -= bullet.damage;
            if (player.health <= 0) {
                gameOver = true;
                player.health = 0;
            }
            return false; // 移除子弹
        }

        return bullet.y < GAME_HEIGHT + bullet.radius && bullet.y > -bullet.radius && bullet.x > -bullet.radius && bullet.x < GAME_WIDTH + bullet.radius; 
    });
    
    // 敌人更新和碰撞检测 (与玩家)
    enemies = enemies.filter(enemy => {
        enemy.y += enemy.speed; 
        enemy.rotation += 0.01; 
        
        const playerCollisionObj = { x: player.x, y: player.y, width: player.width * 0.8, height: player.height * 0.8 };
        if (checkCollision(playerCollisionObj, enemy)) {
            player.health -= 20; 
            if (player.health <= 0) {
                gameOver = true;
                player.health = 0;
            }
            return false;
        }
        return enemy.y < GAME_HEIGHT + enemy.height; 
    });

    // 道具更新和碰撞检测 (与玩家)
    items = items.filter(item => {
        item.y += item.speed;
        item.rotation += 0.05; 

        const playerCollisionObj = { x: player.x, y: player.y, width: player.width * 0.8, height: player.height * 0.8 };
        const itemCollisionObj = { x: item.x, y: item.y, radius: item.radius };
        
        if (checkCollision(itemCollisionObj, playerCollisionObj)) {
            applyPowerUp(item.type);
            return false; 
        }
        
        return item.y < GAME_HEIGHT + item.height;
    });


    // 6. 碰撞检测：子弹击中敌人/Boss

    for (let i = 0; i < bullets.length; i++) {
        let bulletHit = false;
        const bulletCollisionObj = { x: bullets[i].x, y: bullets[i].y, radius: bullets[i].radius };

        // 击中 Boss
        if (boss && boss.isVulnerable && checkCollision(bulletCollisionObj, boss)) {
            score += 1; // 击中Boss加分
            boss.health -= 1; 
            bulletHit = true;

            if (boss.health <= 0) {
                gameOver = true;
            }
        }
        
        // 击中普通敌人
        for (let j = 0; j < enemies.length; j++) {
            if (checkCollision(bulletCollisionObj, enemies[j])) {
                score += 10; 
                enemies.splice(j, 1); 
                bulletHit = true;
                break; 
            }
        }

        if (bulletHit) {
            bullets.splice(i, 1); 
            i--; 
        }
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

    requestAnimationFrame(update);
}

// --- 8. 输入控制 ---
canvas.addEventListener('mousemove', (e) => {
    mouseX = e.offsetX; 
    mouseY = e.offsetY; 
});

canvas.addEventListener('mousedown', () => {
    if (gameOver) {
        document.location.reload(); 
    } 
    // 移除手动射击逻辑，现在是自动射击
});

// --- 9. 启动游戏 ---
update();
