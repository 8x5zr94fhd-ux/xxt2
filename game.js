// --- 1. 初始化设置 ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const GAME_WIDTH = canvas.width;
const GAME_HEIGHT = canvas.height;

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
    maxHealth: 100
};

// 道具效果状态
let powerUp = {
    type: 'Normal', // Normal, Triple, Spread, Speed
    duration: 0,
    endTime: 0
};

let bullets = []; 
let enemies = []; 
let items = []; 
let mouseX = player.x; // 鼠标X坐标 (初始值)
let mouseY = player.y; // 鼠标Y坐标 (初始值)

let score = 0; 
let lastEnemyTime = 0; 
const ENEMY_INTERVAL = 1200; 
let gameOver = false; 

// 背景星星
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

// 绘制星星
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


// --- 2. 游戏对象绘制函数 ---

// 绘制文字 (得分、游戏结束、血量条文本)
function drawText() {
    ctx.font = '24px Arial';
    ctx.fillStyle = 'black';
    ctx.fillText('得分: ' + score, 20, 40);

    ctx.fillText('生命: ' + player.health + '/' + player.maxHealth, GAME_WIDTH - 180, 40);

    if (powerUp.type !== 'Normal') {
        ctx.fillStyle = powerUp.type === 'Speed' ? '#32CD32' : '#FFC0CB';
        const remaining = Math.max(0, Math.ceil((powerUp.endTime - Date.now()) / 1000));
        ctx.fillText(`${powerUp.type} (${remaining}s)`, 20, 70);
    }

    if (gameOver) {
        ctx.font = '48px Arial';
        ctx.fillStyle = 'red';
        ctx.textAlign = 'center'; 
        ctx.fillText('游戏结束！', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 30);
        
        ctx.font = '28px Arial';
        ctx.fillStyle = 'black';
        ctx.fillText('点击屏幕重新开始', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20);
        ctx.textAlign = 'left'; 
    }
}

// 绘制血量条
function drawHealthBar() {
    const barX = GAME_WIDTH - 180;
    const barY = 50;
    const barWidth = 150;
    const barHeight = 20;

    ctx.fillStyle = '#ccc';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    const currentHealthWidth = (player.health / player.maxHealth) * barWidth;
    ctx.fillStyle = 'red';
    ctx.fillRect(barX, barY, currentHealthWidth, barHeight);

    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.strokeRect(barX, barY, barWidth, barHeight);
}

// 绘制玩家纸飞机 (Low-Poly 风格精细化)
function drawPlayer() {
    ctx.save(); 
    ctx.translate(player.x, player.y); 

    const bodyColor = player.color; 
    const wingColor = '#ADD8E6';    
    const darkShade = '#5f9ea0';    

    // 主机身 (更窄的梯形)
    ctx.beginPath();
    ctx.moveTo(0, -player.height / 2); // 机头
    ctx.lineTo(-player.width * 0.1, player.height * 0.4); 
    ctx.lineTo(player.width * 0.1, player.height * 0.4); 
    ctx.lineTo(0, player.height / 2); // 机尾 
    ctx.closePath();
    ctx.fillStyle = bodyColor;
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 主机翼 (大三角)
    ctx.beginPath();
    ctx.moveTo(-player.width * 0.5, player.height * 0.2); // 左翼尖
    ctx.lineTo(player.width * 0.5, player.height * 0.2); // 右翼尖
    ctx.lineTo(0, player.height * 0.4); // 连接机身底部
    ctx.closePath();
    ctx.fillStyle = wingColor;
    ctx.fill();
    ctx.stroke();

    // 尾翼左
    ctx.beginPath();
    ctx.moveTo(-player.width * 0.1, player.height * 0.4);
    ctx.lineTo(-player.width * 0.3, player.height * 0.5);
    ctx.lineTo(-player.width * 0.1, player.height * 0.6);
    ctx.closePath();
    ctx.fillStyle = wingColor;
    ctx.fill();
    ctx.stroke();
    
    // 尾翼右
    ctx.beginPath();
    ctx.moveTo(player.width * 0.1, player.height * 0.4);
    ctx.lineTo(player.width * 0.3, player.height * 0.5);
    ctx.lineTo(player.width * 0.1, player.height * 0.6);
    ctx.closePath();
    ctx.fillStyle = wingColor;
    ctx.fill();
    ctx.stroke();

    // 垂直安定面 
    ctx.fillStyle = darkShade;
    ctx.fillRect(-player.width * 0.05, player.height * 0.4, player.width * 0.1, player.height * 0.2);
    ctx.strokeStyle = '#333';
    ctx.strokeRect(-player.width * 0.05, player.height * 0.4, player.width * 0.1, player.height * 0.2);

    // 机身顶部高光 
    ctx.beginPath();
    ctx.moveTo(0, -player.height / 2);
    ctx.lineTo(-player.width * 0.05, player.height * 0.2);
    ctx.lineTo(player.width * 0.05, player.height * 0.2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fill();

    ctx.restore(); 
}

// 绘制道具
function drawItem(item) {
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(item.rotation);

    // 外圈
    ctx.beginPath();
    ctx.arc(0, 0, item.radius, 0, Math.PI * 2);
    ctx.fillStyle = item.color;
    ctx.fill();

    // 内圈文字 (首字母代表道具类型)
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = 'black';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.text, 0, 2);

    ctx.restore();
}

// 绘制子弹 (带发光效果的黄色光点)
function drawBullet(bullet) {
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2); 
    ctx.fillStyle = '#FFD700'; 
    ctx.shadowBlur = 15; 
    ctx.shadowColor = '#FFD700';
    ctx.fill();
    ctx.shadowBlur = 0; 
}

// 绘制敌人 (带简单3D效果的深灰色障碍物)
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

// 碰撞检测：圆 (子弹/玩家) vs 矩形 (敌人/道具)
function checkCollision(objA, objB) {
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
}

// 敌人/道具生成逻辑
function spawnObject(currentTime) {
    if (currentTime - lastEnemyTime > ENEMY_INTERVAL) {
        const randomX = Math.random() * (GAME_WIDTH - 80) + 40; 
        const isItem = Math.random() < 0.15; // 15% 的几率生成道具

        if (isItem) {
            const itemType = Math.floor(Math.random() * 3) + 1; // 1, 2, or 3
            let color, text, type;
            if (itemType === 1) { color = '#FFC0CB'; text = 'T'; type = 'Triple'; }
            else if (itemType === 2) { color = '#8A2BE2'; text = 'S'; type = 'Spread'; }
            else { color = '#32CD32'; text = 'F'; type = 'Speed'; } 

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
                speed: Math.random() * 2 + 1,
                rotation: Math.random() * 0.1 - 0.05
            });
        }
        lastEnemyTime = currentTime; 
    }
}

// 触发道具效果
function applyPowerUp(type) {
    const duration = 8000;
    
    player.speed = player.baseSpeed; 

    powerUp.type = type;
    powerUp.duration = duration;
    powerUp.endTime = Date.now() + duration;

    if (type === 'Speed') {
        player.speed *= 1.5; // 速度提升 50%
    }
}

// 检查道具状态和过期
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

    // 默认或三倍射击 (Triple)
    if (powerUp.type === 'Normal' || powerUp.type === 'Triple') {
        bullets.push({ x: spawnX, y: spawnY, radius: bulletRadius }); 
        
        if (powerUp.type === 'Triple') {
            bullets.push({ x: spawnX - 15, y: spawnY + 10, radius: bulletRadius }); 
            bullets.push({ x: spawnX + 15, y: spawnY + 10, radius: bulletRadius }); 
        }
    }
    
    // 散弹射击 (Spread)
    else if (powerUp.type === 'Spread') {
        for (let angle = -30; angle <= 30; angle += 15) { // 5颗子弹
            const angleRad = angle * Math.PI / 180;
            bullets.push({
                x: spawnX,
                y: spawnY,
                radius: bulletRadius,
                angle: angleRad // 存储发射角度
            });
        }
    }
}


// --- 4. 游戏核心循环 ---

function update(currentTime) {
    if (gameOver) {
        drawStars();
        drawText(); 
        requestAnimationFrame(update);
        return;
    }

    // 检查并应用道具状态
    checkPowerUpStatus();

    // 1. 敌人/道具生成
    spawnObject(currentTime);

    // 2. 清除画布 
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // 3. 绘制背景星星
    drawStars();

    // 4. 更新玩家位置：***安全瞬时移动***
    player.x = mouseX;
    player.y = mouseY;


    // 边界限制
    if (player.x < player.width / 2) { player.x = player.width / 2; }
    else if (player.x > GAME_WIDTH - player.width / 2) { player.x = GAME_WIDTH - player.width / 2; }
    if (player.y < player.height / 2) { player.y = player.height / 2; }
    else if (player.y > GAME_HEIGHT - player.height / 2) { player.y = GAME_HEIGHT - player.height / 2; }


    // 5. 更新子弹和敌人位置
    bullets = bullets.filter(bullet => {
        // 散弹子弹根据角度移动
        if (bullet.angle !== undefined) {
            // 这里我们使用固定速度 10，并根据角度分解 x/y 速度
            const speed = 10; 
            bullet.x += Math.sin(bullet.angle) * speed;
            bullet.y -= Math.cos(bullet.angle) * speed;
        } else {
            bullet.y -= 10; // 默认向上移动
        }
        return bullet.y > -bullet.radius && bullet.x > -bullet.radius && bullet.x < GAME_WIDTH + bullet.radius; 
    });
    
    // 敌人更新和碰撞检测
    enemies = enemies.filter(enemy => {
        enemy.y += enemy.speed; 
        enemy.rotation += 0.01; 
        
        const playerCollisionObj = { x: player.x, y: player.y, radius: Math.min(player.width, player.height) / 2 * 0.8 };
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

    // 道具更新和碰撞检测
    items = items.filter(item => {
        item.y += item.speed;
        item.rotation += 0.05; 

        const playerCollisionObj = { x: player.x, y: player.y, radius: Math.min(player.width, player.height) / 2 * 0.8 };
        
        // 检查是否吃到道具
        if (checkCollision(playerCollisionObj, item)) {
            applyPowerUp(item.type);
            return false; // 移除道具
        }
        
        return item.y < GAME_HEIGHT + item.height;
    });


    // 6. 碰撞检测：子弹击中敌人
    for (let i = 0; i < bullets.length; i++) {
        for (let j = 0; j < enemies.length; j++) {
            const bulletCollisionObj = { x: bullets[i].x, y: bullets[i].y, radius: bullets[i].radius };
            if (checkCollision(bulletCollisionObj, enemies[j])) {
                score += 10; 
                bullets.splice(i, 1); 
                enemies.splice(j, 1); 
                i--; 
                break; 
            }
        }
    }


    // 7. 绘制所有对象
    items.forEach(drawItem); 
    drawPlayer();
    bullets.forEach(drawBullet);
    enemies.forEach(drawEnemy);
    drawText(); 
    drawHealthBar(); 

    // 循环调用下一帧
    requestAnimationFrame(update);
}

// --- 5. 输入控制 ---

canvas.addEventListener('mousemove', (e) => {
    // 鼠标移动时更新坐标
    mouseX = e.offsetX; 
    mouseY = e.offsetY; 
});

canvas.addEventListener('mousedown', () => {
    if (gameOver) {
        document.location.reload(); 
    } else {
        shoot();
    }
});


// --- 6. 启动游戏 ---
update();