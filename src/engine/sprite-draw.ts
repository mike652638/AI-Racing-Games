/** 景物形状绘制模块（2026-08-05 从 Renderer 类提取）：树/仙人掌/棕榈/雪堆/路灯。
 *  均为纯函数（仅依赖 ctx 与坐标参数），尺寸由 hpx（投影后像素高度）推导，
 *  与 Renderer.drawSprites 的调度（投影/裁剪/循环）解耦。 */

/** 树：树干 + 两层三角树冠（M17 环境树色由 sprite 携带，缺省回退内置 #2d5a27/#3a7a35） */
export function drawTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hpx: number,
  treeColor?: string,
  treeColorLight?: string,
): void {
  const trunkW = Math.max(hpx * 0.12, 2)
  const trunkH = hpx * 0.35
  ctx.fillStyle = '#5a3a22'
  ctx.fillRect(x - trunkW / 2, y - trunkH, trunkW, trunkH)
  ctx.fillStyle = treeColor ?? '#2d5a27'
  const crownBase = y - trunkH
  const crownW = hpx * 0.9
  ctx.beginPath()
  ctx.moveTo(x, crownBase - hpx * 0.85)
  ctx.lineTo(x - crownW / 2, crownBase)
  ctx.lineTo(x + crownW / 2, crownBase)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = treeColorLight ?? '#3a7a35'
  ctx.beginPath()
  ctx.moveTo(x, crownBase - hpx * 0.55)
  ctx.lineTo(x - crownW * 0.62, crownBase)
  ctx.lineTo(x + crownW * 0.62, crownBase)
  ctx.closePath()
  ctx.fill()
}

/** M17 仙人掌：绿色矮柱（身）+ 左右双臂（模拟沙漠仙人掌剪影；高度较树矮）。
 *  scale 缩放整体尺寸（沙漠远处小仙人掌 scale 0.5）；缺省 1。 */
export function drawCactus(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hpx: number,
  cactusColor?: string,
  scale = 1,
): void {
  const color = cactusColor ?? '#5a6a2a'
  const bodyW = Math.max(hpx * 0.22 * scale, 3)
  const bodyH = hpx * 0.8 * scale
  const armW = Math.max(hpx * 0.12 * scale, 2)
  const armLen = hpx * 0.35 * scale
  ctx.fillStyle = color
  // 主干
  ctx.fillRect(x - bodyW / 2, y - bodyH, bodyW, bodyH)
  // 左臂（向上弯：竖段 + 横段）
  ctx.fillRect(x - bodyW / 2 - armLen, y - bodyH * 0.72, armLen, armW)
  ctx.fillRect(x - bodyW / 2 - armW, y - bodyH * 0.72 - armLen, armW, armLen)
  // 右臂
  ctx.fillRect(x + bodyW / 2, y - bodyH * 0.6, armLen, armW)
  ctx.fillRect(x + bodyW / 2, y - bodyH * 0.6 - armLen, armW, armLen)
}

/** M17 棕榈：弯曲树干 + 扇形冠（热带海岛/海岸）；树干自底部向 rotation 方向弯曲，
 *  冠顶扇形 3 条叶。rotation ±1 控制弯曲方向（-1 左弯 / +1 右弯 / 缺省右弯）。 */
export function drawPalm(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hpx: number,
  trunkColor?: string,
  leafColor?: string,
  rotation = 1,
): void {
  const trunkW = Math.max(hpx * 0.1, 2)
  const trunkH = hpx * 0.6
  const bend = hpx * 0.08 * rotation
  // 弯曲树干：底部在 x，顶部偏移 bend（方向随 rotation）
  ctx.fillStyle = trunkColor ?? '#7a5a35'
  ctx.fillRect(x - trunkW / 2 + bend, y - trunkH, trunkW, trunkH)
  const crownY = y - trunkH
  const crownW = hpx * 0.75
  // 扇形冠：3 条叶（中心 + 左右），用三角近似（整体随树干偏移）
  ctx.fillStyle = leafColor ?? '#2a6a3a'
  ctx.beginPath()
  ctx.moveTo(x + bend, crownY - hpx * 0.4)
  ctx.lineTo(x + bend - crownW * 0.55, crownY)
  ctx.lineTo(x + bend + crownW * 0.55, crownY)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = (leafColor ?? '#2a6a3a').replace('#', '#3') // 简化：上层叶略亮用同一色系近似
  ctx.beginPath()
  ctx.moveTo(x + bend, crownY - hpx * 0.22)
  ctx.lineTo(x + bend - crownW * 0.8, crownY)
  ctx.lineTo(x + bend + crownW * 0.8, crownY)
  ctx.closePath()
  ctx.fill()
}

/** M17 雪堆：圆顶雪包 + 顶部覆雪小树（山岳冷色；雪白圆顶模拟积雪路面旁雪堆） */
export function drawSnowpile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  hpx: number,
  snowColor?: string,
  treeColorLight?: string,
): void {
  const r = Math.max(hpx * 0.28, 3)
  const treeColor = treeColorLight ?? '#c8d8e8'
  // 雪堆本体（椭圆：压缩圆）
  ctx.fillStyle = snowColor ?? '#e8f0f8'
  ctx.beginPath()
  ctx.ellipse(x, y - r * 0.4, r, r * 0.55, 0, 0, Math.PI * 2)
  ctx.fill()
  // 雪堆上的覆雪小树（冷色三角，区别于普通绿树）
  const treeH = hpx * 0.5
  ctx.fillStyle = '#5a6a7a'
  ctx.beginPath()
  ctx.moveTo(x, y - r * 0.9 - treeH)
  ctx.lineTo(x - r * 0.5, y - r * 0.9)
  ctx.lineTo(x + r * 0.5, y - r * 0.9)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = treeColor
  ctx.beginPath()
  ctx.moveTo(x, y - r * 0.7 - treeH)
  ctx.lineTo(x - r * 0.35, y - r * 0.7)
  ctx.lineTo(x + r * 0.35, y - r * 0.7)
  ctx.closePath()
  ctx.fill()
}

/** 路灯：灯杆 + 发光灯头 + 柔和光晕（2026-08-08 实测修复：补两层低 alpha 光晕圆，夜晚/黄昏氛围更自然；
 *  光晕半径克制（灯头 2.6 倍）且随 hpx 缩放，近距不重新引入 MAX_LAMP_SCALE 防住的巨型黄斑；
 *  用纯色圆而非径向渐变——避免每帧每路灯创建 gradient 对象的 GC 压力，也不污染 M16 vignette 的
 *  createRadialGradient 计数断言） */
export function drawLamp(ctx: CanvasRenderingContext2D, x: number, y: number, hpx: number): void {
  const poleW = Math.max(hpx * 0.06, 2)
  ctx.fillStyle = '#8a8a8a'
  ctx.fillRect(x - poleW / 2, y - hpx, poleW, hpx)
  const r = Math.max(hpx * 0.14, 2)
  // 光晕：外圈淡光 + 内圈微光（逐层覆盖模拟渐变衰减）
  // C3：光晕色向黄偏移（255,224,138→255,208,90）+ 半径/透明度梯度微增，更黄更弥散，与车头灯冷白反向拉开
  ctx.fillStyle = 'rgba(255, 208, 90, 0.16)'
  ctx.beginPath()
  ctx.arc(x, y - hpx, r * 2.9, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255, 208, 90, 0.26)'
  ctx.beginPath()
  ctx.arc(x, y - hpx, r * 2.1, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffe08a'
  ctx.beginPath()
  ctx.arc(x, y - hpx, r * 1.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffd75e'
  ctx.beginPath()
  ctx.arc(x, y - hpx, r, 0, Math.PI * 2)
  ctx.fill()
}
