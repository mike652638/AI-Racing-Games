/**
 * CloudBase 静态托管部署脚本（AI-Racing-Games）。
 *
 * 等价于 README 记载的「CloudBase AI 工具 uploadFiles」语义：
 * localPath=dist/xxx → cloudPath=ai-racing-games/xxx。
 * 基于官方 @cloudbase/manager-node 的 HostingService（静态托管管理 API）。
 *
 * 用法：
 *   node scripts/deploy-cloudbase.mjs                    # 默认 dist/ -> ai-racing-games/
 *   node scripts/deploy-cloudbase.mjs <localDir> <cloudPrefix>
 *
 * 认证（全部来自环境变量，脚本不读写任何凭据文件）：
 *   TCB_ENV_ID            云开发环境 ID（joyful-d6glfqzna80c9f036）
 *   TENCENTCLOUD_SECRETID 腾讯云 API 密钥 SecretId（控制台 cam/capi 获取）
 *   TENCENTCLOUD_SECRETKEY 腾讯云 API 密钥 SecretKey
 *
 * 安全提示：密钥只注入当前终端会话，勿写入 .env / 代码并入库；
 * 长期密钥建议用后轮换，或使用子账号临时密钥。
 */
import CloudBase from '@cloudbase/manager-node'

const envId = process.env.TCB_ENV_ID || process.env.CLOUDBASE_ENV_ID
const secretId = process.env.TENCENTCLOUD_SECRETID
const secretKey = process.env.TENCENTCLOUD_SECRETKEY

if (!envId || !secretId || !secretKey) {
  console.error('缺少环境变量：TCB_ENV_ID / TENCENTCLOUD_SECRETID / TENCENTCLOUD_SECRETKEY')
  console.error('示例：$env:TCB_ENV_ID = "joyful-d6glfqzna80c9f036"（PowerShell）')
  process.exit(1)
}

const localPath = process.argv[2] ?? 'dist'
const cloudPath = process.argv[3] ?? 'ai-racing-games'

const app = CloudBase.init({ envId, secretId, secretKey })

console.log(`上传目录 ${localPath} -> 静态托管 ${cloudPath}/（env ${envId}）...`)
try {
  await app.hosting.uploadFiles({
    localPath,
    cloudPath,
    ignore: ['.DS_Store', 'Thumbs.db'],
    // uploadDirectory 路径下 onFileFinish 回调实参为 null，做空安全处理
    onFileFinish: (file) => console.log(`  ✓ ${file?.cloudPath ?? file?.localPath ?? '(文件)'}`),
  })
  console.log('✅ 上传完成')
} catch (e) {
  console.error('❌ 上传失败：', e.message)
  process.exit(1)
}
