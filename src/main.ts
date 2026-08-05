import { initGame } from './game/game-loop'
import { setupPwaUpdate } from './game/pwa-update'

// PWA 新版本提示（S 修复 S1）：在游戏初始化前挂载（PROD 浏览器环境生效，dev/test no-op）
setupPwaUpdate()

initGame()
