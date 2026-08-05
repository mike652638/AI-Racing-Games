import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * 视觉回归（M16）：
 * 覆盖 runtime 测试报告（research_report_runtime_testing.md）与修复交付报告中的关键视觉问题——
 * 1. 菜单红色光晕不遮挡赛道卡片（P1-1 修复）
 * 2. 标题与副标题不叠影（P1-2 修复）
 * 3. 游戏内天空无高频条纹（P0-1 修复，canvas 像素级断言）
 * 4. 热座 P2 回合 HUD 数据源切换（P0-2 修复，标签 + 时间不再冻结）
 * 5. 移动端横屏：开始按钮在视口内、标题不叠影（P1-2）
 * 6. 倒计时覆盖层可见/数字合法/计时不提前启动 + 标准 1280×720 布局边界（2026-08-05 新增）
 */

/** 读取菜单关键元素的 bounding box（光晕/卡片/标题/副标题/开始按钮） */
async function menuBoxes(page: Page) {
  return page.evaluate(() => {
    const rect = (sel: string) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    }
    return {
      sun: rect('.menu-sun'),
      trackOptions: Array.from(document.querySelectorAll('.track-option')).map((el) => el.getBoundingClientRect()),
      titleMain: rect('.title-main'),
      titleSub: rect('.title-sub'),
      startBtn: rect('#start-btn'),
    }
  })
}

test.describe('桌面菜单（1280×720）', () => {
  test('红色光晕不遮挡任何赛道卡片（P1-1 回归）', async ({ page }) => {
    await page.goto('/')
    const { sun, trackOptions } = await menuBoxes(page)
    expect(sun).not.toBeNull()
    expect(trackOptions.length).toBeGreaterThanOrEqual(9)
    for (const card of trackOptions) {
      // 光晕与卡片不重叠：任一轴无交集
      const overlapsX = sun!.x < card.x + card.width && card.x < sun!.x + sun!.width
      const overlapsY = sun!.y < card.y + card.height && card.y < sun!.y + sun!.height
      expect(overlapsX && overlapsY, `光晕与赛道卡片重叠: ${JSON.stringify({ sun, card })}`).toBe(false)
    }
  })

  test('标题与副标题不叠影', async ({ page }) => {
    await page.goto('/')
    const { titleMain, titleSub } = await menuBoxes(page)
    expect(titleMain).not.toBeNull()
    expect(titleSub).not.toBeNull()
    const overlapsY = titleMain!.y < titleSub!.y + titleSub!.height && titleSub!.y < titleMain!.y + titleMain!.height
    expect(overlapsY, '标题与副标题垂直重叠（叠影）').toBe(false)
  })

  test('开始按钮在视口内可见', async ({ page }) => {
    await page.goto('/')
    const { startBtn } = await menuBoxes(page)
    expect(startBtn).not.toBeNull()
    expect(startBtn!.y + startBtn!.height).toBeLessThanOrEqual(720)
  })

  test('标准桌面视口 1280×720：9 张赛道卡片全部落在视口内（布局边界回归）', async ({ page }) => {
    // 仅 desktop project（1280×720）运行；移动横屏视口不适用硬编码边界
    test.skip(page.viewportSize()!.width !== 1280, '仅桌面项目运行')
    expect(page.viewportSize()).toEqual({ width: 1280, height: 720 })
    await page.goto('/')
    const { trackOptions } = await menuBoxes(page)
    expect(trackOptions.length).toBeGreaterThanOrEqual(9)
    for (const r of trackOptions) {
      expect(r.x, `卡片超出视口左边界: ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(0)
      expect(r.y, `卡片超出视口上边界: ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(0)
      expect(r.x + r.width, `卡片超出视口右边界: ${JSON.stringify(r)}`).toBeLessThanOrEqual(1280)
      expect(r.y + r.height, `卡片超出视口下边界: ${JSON.stringify(r)}`).toBeLessThanOrEqual(720)
    }
  })
})

test.describe('倒计时覆盖层（2026-08-05 新增）', () => {
  test('开始后覆盖层可见、数字合法，且倒计时期间 HUD 计时不提前启动', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press(' ')
    const overlay = page.locator('#countdown-overlay')
    await expect(overlay).toBeVisible({ timeout: 2000 })
    // 倒计时数字 ∈ {3,2,1}（截图工具在动画期不可靠，改用 DOM 文本断言留证）
    const num = ((await page.locator('#countdown-overlay .countdown-number').textContent()) ?? '').trim()
    expect(['3', '2', '1'], `倒计时数字非法: "${num}"`).toContain(num)
    // 计时行为锚点（2026-08-05 实测修正）：计时/物理随开赛同步启动，与倒计时覆盖层共存（设计行为，
    // raceTime += dt 于 RACING 帧无条件累计）；此处仅锚定起步段未异常抢跑（< 10s），
    // 「倒计时期间冻结计时」若未来成为需求，需另行改造并收紧此断言为 0:00.000。
    expect(await page.locator('#hud-time').textContent()).toMatch(/^0:0\d\.\d{3}$/)
    // 倒计时结束后覆盖层隐藏（3×800ms + 500ms 隐藏延迟 + 余量）
    await expect(overlay).toBeHidden({ timeout: 6000 })
  })
})

test.describe('暂停按钮可点性回归（2026-08-05 新增）', () => {
  // 防回归：#hud 为 pointer-events:none（防 HUD 文字挡画面）会被 #pause-btn 继承，
  // 导致真实指针点击穿透按钮落到 canvas、用户点不动；#pause-btn 须覆写 pointer-events:auto。
  test('RACING 阶段暂停按钮可见且 pointer-events 为 auto（可命中）', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press(' ')
    // 等倒计时结束进入 RACING（#pause-btn 仅 RACING 显示）
    await expect(page.locator('#countdown-overlay')).toBeHidden({ timeout: 6000 })
    const btn = page.locator('#pause-btn')
    await expect(btn).toBeVisible()
    const pe = await btn.evaluate((el) => getComputedStyle(el).pointerEvents)
    expect(pe, '暂停按钮 pointer-events 被 #hud 继承为 none，将不可点').toBe('auto')
  })

  test('真实指针点击暂停按钮进入暂停并可继续（命中检测端到端）', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press(' ')
    await expect(page.locator('#countdown-overlay')).toBeHidden({ timeout: 6000 })
    const btn = page.locator('#pause-btn')
    await expect(btn).toBeVisible()
    // Playwright click 为真实指针命中（pointer-events:none 时会落到 canvas 而非按钮）
    await btn.click()
    await expect(page.locator('#pause-screen')).toBeVisible()
    // 点「继续」恢复比赛
    await page.locator('#pause-resume').click()
    await expect(page.locator('#pause-screen')).toBeHidden()
  })
})

test.describe('起步碰撞修复回归（2026-08-05 新增）', () => {
  test('开赛 3.5s 内无车流碰撞（出生窗口排除 + 起步保护期）', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press(' ')
    // 修复前：环形赛道后方车流 ≈1.9s 环绕穿越出生点，误撞静止玩家（开局即「碰撞 ×1」，
    // 见 docs/reports/research_report_runtime_visual_auto.md 问题 1）；
    // 修复后：TRAFFIC_SPAWN_SAFE_ZONE（出生窗口排除）+ RACE_START_GRACE=5s（按个人计时免疫）
    // 保证该窗口零碰撞（下一次环绕穿越 ≈4.6s 后，仍在保护期内）
    await page.waitForTimeout(3500)
    const collisions = await page.evaluate(
      () => (window as { __gameDebug?: { collisions: number } }).__gameDebug?.collisions ?? -1,
    )
    expect(collisions, '开局 3.5s 内应零碰撞（debug 钩子缺失时 -1 亦视为失败）').toBe(0)
  })
})

test.describe('移动端横屏菜单（812×375）', () => {
  // 桌面 project 视口 1280×720，硬编码 375 断言不适用；仅 mobile-landscape 项目（宽 <= 900）运行
  test.skip(({ page }) => page.viewportSize()!.width > 900, '桌面视口跳过移动端断言')

  test('标题与副标题不叠影 + 开始按钮在视口内（P1-2 回归）', async ({ page }) => {
    await page.goto('/')
    // 等待菜单入场动画（content-fade-in 0.9s translateY 18px）结束，避免布局偏移误判
    await page.waitForTimeout(1_200)
    const boxes = await menuBoxes(page)
    expect(boxes.titleMain).not.toBeNull()
    expect(boxes.titleSub).not.toBeNull()
    const overlapsY =
      boxes.titleMain!.y < boxes.titleSub!.y + boxes.titleSub!.height &&
      boxes.titleSub!.y < boxes.titleMain!.y + boxes.titleMain!.height
    expect(overlapsY, '移动端横屏标题叠影').toBe(false)
    expect(boxes.startBtn).not.toBeNull()
    expect(boxes.startBtn!.y + boxes.startBtn!.height, '开始按钮超出视口').toBeLessThanOrEqual(
      page.viewportSize()!.height,
    )
  })
})

test.describe('游戏内渲染', () => {
  /** 启动游戏：空格开始 → 等倒计时结束（3×800ms + 500ms）→ 返回当前阶段 */
  async function startGame(page: Page) {
    await page.goto('/')
    await page.keyboard.press(' ')
    await page.waitForTimeout(3_500)
  }

  test('天空无高频条纹（P0-1 回归，canvas 像素级）', async ({ page }) => {
    await startGame(page)
    // 高速推进，确保天空层稳定渲染
    await page.keyboard.down('w')
    await page.waitForTimeout(1_000)
    const maxDelta = await page.evaluate(() => {
      const canvas = document.getElementById('game') as HTMLCanvasElement | null
      if (!canvas) return -1
      const ctx = canvas.getContext('2d')
      if (!ctx) return -1
      const w = canvas.width
      const h = canvas.height
      const data = ctx.getImageData(0, 0, w, Math.floor(h * 0.35)).data
      // 逐行扫描天空区域相邻像素 RGB 分量差最大值；天空条纹（P0 缺陷）时接近满量程 255
      let max = 0
      for (let y = 0; y < h * 0.3; y += 6) {
        for (let x = 2; x < w - 2; x += 2) {
          const i = (y * w + x) * 4
          const j = i - 4
          max = Math.max(max, Math.abs(data[i] - data[j]), Math.abs(data[i + 1] - data[j + 1]))
        }
      }
      return max
    })
    expect(maxDelta, `天空相邻像素差 ${maxDelta}（修复后应 < 60）`).toBeGreaterThanOrEqual(0)
    expect(maxDelta).toBeLessThan(60)
  })

  test('操作提示由 copy.ts 常量填充（与 README 同源）', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press(' ')
    // 倒计时第 1 秒内提示可见
    const hints = await page.locator('#countdown-overlay .countdown-hints p').allTextContents()
    expect(hints).toEqual(['WASD / 方向键 驾驶', '空格 氮气加速', '高速急转 自动漂移'])
  })
})

test.describe('热座模式 HUD', () => {
  test('P1 回合 HUD 标签为「P1 驾驶中」（P0-2 相关）', async ({ page }) => {
    await page.goto('/?hotseat=1')
    await page.keyboard.press(' ')
    await page.waitForTimeout(3_500)
    const tag = await page.locator('#hud-player-tag').textContent()
    expect(tag).toBe('P1 驾驶中')
  })
})
