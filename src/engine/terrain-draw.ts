/** 地形装饰模块（2026-08-05 从 Renderer 类提取）：沙漠沙丘 / 海岸海面 / 峡谷岩壁。
 *  纯函数（ctx/opts/environment/night/time 显式传入），不依赖 Renderer 实例状态。 */
import { getEnvironmentProfile } from './environment'
import type { ProjectionOptions } from './projection'

/** M18 沙丘变形：每座沙丘折线逼近的固定步数（帧内零新建数组） */
const DUNE_STEPS = 12
/** M18 沙丘变形：沿沙丘弧线的 sin 波数 */
const DUNE_WAVES = 2.5
/** M18 沙丘变形：起伏幅度占沙丘高度的比例 */
const DUNE_WAVE_AMP = 0.18
/** M18 沙丘变形：三座沙丘的相位偏移（确定性常量，模块级预计算，帧内直接索引） */
const DUNE_PHASES = [0.6, 2.4, 4.2]
/** M18 海面波浪漂移速度（弧度/秒，周期 ≈ 5.2s 缓慢起伏） */
const WAVE_DRIFT_SPEED = 1.2
/** M18 海面波浪漂移：相邻波浪的相位步进（让三道波浪错开浮动） */
const WAVE_DRIFT_PHASE_STEP = 1.1
/** M18 海面波浪漂移幅度（占地面带高度比例，±2% 轻微浮动） */
const WAVE_DRIFT_AMP = 0.02

/** M17 地形装饰：在草地层上叠加与赛道名称关联的地形视觉（沙漠沙丘/海岸海面/峡谷岩壁）。
 *  均为视口固定的俯视纹理（不随 cameraZ 滚动，渲染成本恒定），仅在对应 environment 时绘制，
 *  非目标环境（plains 等）零开销零改动。
 *  M18：新增可选 time 参数（renderer 传累计时间）——海面波浪 y 随 time 轻微漂移；缺省 0 向后兼容。 */
export function drawTerrain(
  ctx: CanvasRenderingContext2D,
  opts: ProjectionOptions,
  environment: string,
  night: boolean,
  time = 0,
): void {
  const profile = getEnvironmentProfile(environment as Parameters<typeof getEnvironmentProfile>[0])
  const terrain = profile.terrain
  if (!terrain) return
  const w = opts.width
  const h = opts.height
  const horizon = opts.horizon
  const roadCenter = w / 2
  const roadHalf = w * 0.14 // 路面在视口中的近似半宽（装饰不与路面重叠，绘制在路面两侧之外）
  if (terrain === 'dunes') {
    // 沙漠沙丘：路面两侧叠加 3 道半透明深黄弧形条带（近大远小），模拟起伏沙丘。
    // M18：纯 ellipse 改为 sin 噪声叠加（预计算相位常量，帧内零新建数组）——
    // 沙丘顶线沿弧线 2.5 个波、端点包络归零（附着地面），形成起伏沙丘轮廓
    const duneColors = night ? 'rgba(60, 40, 15, 0.35)' : 'rgba(120, 85, 35, 0.3)'
    // 左侧沙丘
    for (let i = 0; i < 3; i++) {
      const y0 = horizon + (h - horizon) * (0.25 + i * 0.24)
      const y1 = y0 + (h - horizon) * 0.16
      const x0 = roadCenter - roadHalf * (2.6 - i * 0.6) - w * 0.1 * (i + 1)
      const x1 = roadCenter - roadHalf * (1.8 - i * 0.4)
      const phase = DUNE_PHASES[i % DUNE_PHASES.length]
      ctx.fillStyle = duneColors
      ctx.beginPath()
      for (let s = 0; s <= DUNE_STEPS; s++) {
        const t = s / DUNE_STEPS
        const ex = x0 + (x1 - x0) * t
        const env = Math.sin(Math.PI * t) // 端点包络归零：沙丘两端附着地面
        const bump = env * (y1 - y0) * 0.5
        const wave = env * Math.sin(t * Math.PI * DUNE_WAVES + phase) * (y1 - y0) * DUNE_WAVE_AMP
        if (s === 0) {
          ctx.moveTo(ex, y0 - bump + wave)
        } else {
          ctx.lineTo(ex, y0 - bump + wave)
        }
      }
      ctx.closePath()
      ctx.fill()
    }
  } else if (terrain === 'sea') {
    // 海岸海面：道路右侧整片海蓝（从地平线到近处），左侧保持草地/沙滩
    const seaColor = night ? 'rgba(20, 60, 90, 0.85)' : 'rgba(60, 150, 210, 0.75)'
    ctx.fillStyle = seaColor
    ctx.beginPath()
    ctx.moveTo(roadCenter + roadHalf * 1.4, horizon)
    ctx.lineTo(w, horizon)
    ctx.lineTo(w, h)
    ctx.lineTo(roadCenter + roadHalf * 0.9, h)
    ctx.closePath()
    ctx.fill()
    // M17 增强：白色波浪纹理——海面右侧叠加 3 道半透明白色椭圆弧线（近大远小）
    // M18：波浪 y 随 time 轻微漂移（sin(time*speed + phase)，幅度 ±2% 地面带高），三道波浪相位错开
    const waveColor = night ? 'rgba(220, 235, 245, 0.35)' : 'rgba(255, 255, 255, 0.45)'
    ctx.fillStyle = waveColor
    for (let i = 0; i < 3; i++) {
      const drift = Math.sin(time * WAVE_DRIFT_SPEED + i * WAVE_DRIFT_PHASE_STEP) * (h - horizon) * WAVE_DRIFT_AMP
      const y0 = horizon + (h - horizon) * (0.3 + i * 0.25) + drift
      const waveLen = w * (0.28 - i * 0.05)
      const waveH = (h - horizon) * (0.06 - i * 0.01)
      ctx.beginPath()
      ctx.ellipse(w * (0.72 - i * 0.03), y0, waveLen, waveH, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (terrain === 'rock') {
    // 峡谷岩壁：道路两侧叠加暗红棕竖条（近处高、远处低），模拟峡谷壁体
    const rockColor = night ? 'rgba(45, 20, 10, 0.5)' : 'rgba(140, 70, 40, 0.35)'
    const rockEdge = night ? 'rgba(70, 35, 18, 0.6)' : 'rgba(180, 100, 60, 0.5)'
    for (let i = 0; i < 3; i++) {
      const yTop = horizon + (h - horizon) * (0.3 + i * 0.2)
      const yBot = h
      const sideW = w * (0.16 - i * 0.04)
      // 左侧岩壁
      ctx.fillStyle = rockColor
      ctx.fillRect(0, yTop, sideW, yBot - yTop)
      // 右侧岩壁
      ctx.fillRect(w - sideW, yTop, sideW, yBot - yTop)
      // M17 增强：不规则锯齿顶线（左右两侧沿顶边画 3 段斜线，模拟岩石断裂边缘）
      const segs = 5
      const segW = sideW / segs
      ctx.fillStyle = rockEdge
      for (let s = 0; s < segs; s++) {
        const sx = s * segW
        const spike = (s % 2 === 0 ? 1 : -1) * (h - horizon) * 0.03
        // 左顶线（从顶边向下凸出锯齿）
        ctx.beginPath()
        ctx.moveTo(sx, yTop)
        ctx.lineTo(sx + segW / 2, yTop + spike)
        ctx.lineTo(sx + segW, yTop)
        ctx.closePath()
        ctx.fill()
        // 右顶线（镜像）
        ctx.beginPath()
        ctx.moveTo(w - sx, yTop)
        ctx.lineTo(w - sx - segW / 2, yTop + spike)
        ctx.lineTo(w - sx - segW, yTop)
        ctx.closePath()
        ctx.fill()
      }
    }
  }
}
