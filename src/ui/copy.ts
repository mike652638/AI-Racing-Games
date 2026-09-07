/**
 * UI 文案常量（M16）：起步倒计时覆盖层的操作提示与 README.md「操作说明」同源。
 * 修改任何提示文案时必须同步更新 README.md 对应条目——
 * tests/unit/copy.test.ts 以关键词断言锁定两者一致（防文案漂移）。
 */

/**
 * 应用版本号（2026-08-08 新增，部署可见性需求）：菜单页显示 + index.html meta app-version 同步。
 * 每次更新部署时递增 BUILD 号并更新 BUILD_DATE，方便用户确认线上已是最新版。
 * 当前对应 M21 里程碑（2026-08-07 菜单沉浸感优化批次：赛道预览背景层/响应式修复/整体感优化/子路径部署修复）。
 */
export const APP_VERSION = 'v1.22.1'
export const APP_VERSION_DATE = '2026-09-07'

/** 起步倒计时覆盖层操作提示（#countdown-overlay .countdown-hints，由 startCountdown 填充） */
export const COUNTDOWN_HINTS = ['WASD / 方向键 驾驶', '空格 氮气加速', '高速急转 自动漂移'] as const

/**
 * 触屏单屏倒计时操作提示（2026-08-08 小米 13 Ultra 横屏专项实测修复）：
 * 触屏设备倒计时覆盖层不再显示键盘文案（WASD/空格 对触屏玩家无意义），
 * 改为与 RACING_TOUCH_HINT 一致的摇杆指引；高速急转自动漂移为通用机制保留。
 */
export const COUNTDOWN_HINTS_TOUCH = [
  '拖动右下角摇杆 控制方向与油门',
  '左下角暂停按钮 可随时暂停',
  '高速急转 自动漂移',
] as const

/**
 * 触屏分屏倒计时操作提示（2026-08-08）：分屏触屏为各自半屏四分区触控（无摇杆），
 * 文案与 SPLIT_TOUCH_HINT 语义一致，避免误导「右下角摇杆」。
 */
export const COUNTDOWN_HINTS_TOUCH_SPLIT = [
  'P1 左半 / P2 右半 触控',
  '右上油门 · 左上刹车 · 左下左转 · 右下右转',
  '高速急转 自动漂移',
] as const

/**
 * 单条提示对应的 README 操作说明关键词（copy.test.ts 断言 README 包含），
 * 数组下标与 COUNTDOWN_HINTS 一一对应。
 */
export const COUNTDOWN_HINT_README_KEYWORDS = [['W', '方向键'], ['氮气', 'Space'], ['高速急转']] as const

/** 菜单提示（#menu-hint） */
export const MENU_HINT = '空格键开始 · 1-9 / 方向键 切换赛道'

/** 菜单触屏提示（#menu-hint-touch） */
export const MENU_HINT_TOUCH = '点击赛道开始 · 点击榜单可展开'

/**
 * M28 方案 14：菜单每日挑战进度文案（#daily-progress）——
 * 前缀「今日挑战」+ 赛道名 + 完成状态（已完成/未完成）+ 连续签到天数。
 * 修改需同步 copy.test.ts 非空断言与 README。
 */
export const DAILY_PROGRESS_PREFIX = '今日挑战'

/**
 * M23 方案 11：菜单天气模式徽章文案（#menu-weather-badge，URL `?weather=` 驱动）。
 * 键与 engine/lighting 的 WeatherOverride 对应；修改需同步 copy.test.ts 非空断言与 README。
 */
export const WEATHER_MODE_LABEL: Record<string, string> = {
  auto: '天气循环',
  random: '随机天气',
  sunny: '晴天',
  rain: '雨天',
  night: '夜晚',
}

/** 比赛中触屏驾驶引导浮层（#racing-touch-hint）：与实际 joystick 布局一致 */
export const RACING_TOUCH_HINT = '触屏：拖动右下角虚拟摇杆控制方向与油门，左下角暂停按钮'

/**
 * 分屏模式触屏引导（#touch-hint / #racing-touch-hint 分屏分支）：
 * 分屏四分区触控（M21 遗留技术债修复，2026-08-08）——P1 用左半屏、P2 用右半屏，
 * 各自半屏内四分区：右上油门 / 左上刹车 / 左下左转 / 右下右转（与 touchToCarInput 语义一致）。
 * 分屏不创建常驻摇杆（U-4 防 P2 半屏语义混淆）。
 */
export const SPLIT_TOUCH_HINT = '触屏：P1 左半屏 / P2 右半屏 · 各半屏右上油门 · 左上刹车 · 左下左转 · 右下右转'

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

/**
 * M23 方案 7：赛道 S/A/B 奖牌展示文案（结算行 / 菜单 best-summary / 赛道卡共用）。
 * 键 S/A/B 与 shared/medal 的 MedalGrade 对应；修改需同步 copy.test.ts 非空断言。
 */
export const MEDAL_LABEL: Record<'S' | 'A' | 'B', string> = {
  S: 'S',
  A: 'A',
  B: 'B',
}

/**
 * M23 方案 6：成就名称/描述（id 与 shared/achievements 的 AchievementId 一一对应）。
 * 修改需同步 copy.test.ts 非空断言与 save.ts 的 ACHIEVEMENT_ID_LIST（进度 X/N 总数口径）。
 */
export const ACHIEVEMENTS: Record<string, { name: string; desc: string }> = {
  'first-boost': { name: '首次氮气', desc: '使用一次 BOOST 氮气加速' },
  'perfect-boost': { name: '完美爆发', desc: '蓄力 ≥80% 触发一次完美氮气' },
  'combo-5': { name: '连击新星', desc: '单局漂移最高连击达到 5' },
  'near-miss-3': { name: '贴地飞行', desc: '单局贴身超车达到 3 次' },
  'medal-s': { name: '金牌车手', desc: '任意赛道获得 S 级奖牌' },
  'rain-finish': { name: '雨中飞驰', desc: '在雨天完成一场比赛' },
  'night-finish': { name: '夜行猎手', desc: '在夜晚赛道完成一场比赛' },
  'drift-score-2000': { name: '漂移大师', desc: '单局漂移总分达到 2000' },
}
