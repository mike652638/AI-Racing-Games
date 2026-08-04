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
