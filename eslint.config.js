import tseslint from 'typescript-eslint'

export default tseslint.config(
  // 忽略构建产物与不入库的临时脚本（night-bot-check.ts 已被 .gitignore 排除；
  // .edgeone 为 EdgeOne Pages 部署产物；.qoder 为 IDE 工具产物；
  // .codebuddy 为运行时探测/调试脚本草稿区，均非源码）
  { ignores: ['dist', 'night-bot-check.ts', '.edgeone', '.qoder', '.codebuddy'] },
  tseslint.configs.recommended,
  {
    rules: {
      // —— 安全规则（Task F 工程化增强；选型避免误伤现有代码风格）——
      eqeqeq: ['error', 'smart'], // 强制全等/不全等（smart 允许与 null/undefined 字面量用 ==）
      curly: ['error', 'multi-line'], // 跨行语句块必须使用花括号（保留现有单行 if 风格）
      'no-debugger': 'error', // 禁止 debugger 语句
      'no-eval': 'error', // 禁止 eval
      'no-console': ['error', { allow: ['warn', 'error'] }], // 禁止 console.log 调试输出（保留 warn/error 上报）
    },
  },
  {
    // bot CLI 脚本依赖 console.log 输出跑圈报告，属合理用法，豁免
    files: ['tests/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
)
