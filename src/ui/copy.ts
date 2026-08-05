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

/** 比赛中触屏驾驶引导浮层（#racing-touch-hint）：与实际 joystick 布局一致 */
export const RACING_TOUCH_HINT = '触屏：拖动右下角虚拟摇杆控制方向与油门，左下角暂停按钮'

/** 结算面板漂移提示（#finish-drift-hint）：P1 漂移得分为 0 时显示 */
export const FINISH_DRIFT_HINT = '甩尾过弯可获得漂移得分！'

/** 赛道最佳空态追加说明（#best-summary，2026-08-05 LB-1 拆分：原共用 STATS_EMPTY_HINT
 *  在漂移榜单显示"最佳成绩"文案错误，改为各自独立文案） */
export const BEST_EMPTY_HINT = '完成比赛后这里会显示你的最佳圈速'

/** 漂移榜单空态追加说明（#drift-top） */
export const DRIFT_EMPTY_HINT = '完成比赛后这里会显示你的漂移高分'

/** 对局战绩空态追加说明（#match-top） */
export const MATCH_EMPTY_HINT = '仅分屏对局计入'

/** 结算面板标题（默认；挑战模式改用 FINISH_TITLE_CHALLENGE，2026-08-05 审计 F-2） */
export const FINISH_TITLE_DEFAULT = '完赛!'

/** 挑战模式结算标题（与内容行「挑战结束」呼应，防「完赛!」语义割裂） */
export const FINISH_TITLE_CHALLENGE = '挑战结束'

/** 结算屏重开提示（#finish-restart-hint 默认文案） */
export const FINISH_RESTART_HINT = '按 R 重新开始'

/** 热座 P1 完赛交棒窗口的重开提示（弱化 R，突出回车交棒；2026-08-05 审计 F-4） */
export const HOTSEAT_RESTART_HINT = '按 R 可重跑 P1'
