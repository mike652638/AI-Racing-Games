/**
 * UI 文案常量（M16）：起步倒计时覆盖层的操作提示与 README.md「操作说明」同源。
 * 修改任何提示文案时必须同步更新 README.md 对应条目——
 * tests/unit/copy.test.ts 以关键词断言锁定两者一致（防文案漂移）。
 */

/** 起步倒计时覆盖层操作提示（#countdown-overlay .countdown-hints，由 startCountdown 填充） */
export const COUNTDOWN_HINTS = ['WASD / 方向键 驾驶', '空格 氮气加速', '高速急转 自动漂移'] as const

/**
 * 单条提示对应的 README 操作说明关键词（copy.test.ts 断言 README 包含），
 * 数组下标与 COUNTDOWN_HINTS 一一对应。
 */
export const COUNTDOWN_HINT_README_KEYWORDS = [['W', '方向键'], ['氮气', 'Space'], ['高速急转']] as const

/** 菜单提示（#menu-hint） */
export const MENU_HINT = '空格键开始 · 1-9 / 方向键 切换赛道'

/** 菜单触屏提示（#menu-hint-touch） */
export const MENU_HINT_TOUCH = '点击赛道开始 · 点击榜单可展开'
