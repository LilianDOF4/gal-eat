// 真实目录端到端：直接调用宿主取图路由的处理函数，读用户真实图片目录，
// 逐张验证 33 个素材名（3 背景 + 30 菜品）都能 200 且字节正确。
//
// 这补上了单测覆盖不到的空白：单测用的是临时目录，这里用的是
// `C:\Users\13934\Pictures\gal-eat\` 的真实文件。
//
// 用法: node tests/verify-real-assets.mjs
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import {
  ASSET_ROUTE, BACKGROUND_NAMES, DISH_NAMES, assetRoot, isAllowedName, resolveAssetPaths, registerAssetRoute,
} from '../lib/index.js'

const errors = []
const check = (cond, msg) => { if (!cond) errors.push(msg) }

/** 假响应：收集状态头与二进制体。 */
function makeRes() {
  const chunks = []
  const res = {
    status: null, headers: null, ended: false,
    writeHead(status, headers) { res.status = status; res.headers = headers ?? {}; return res },
    write(chunk) { chunks.push(Buffer.from(chunk)); return true },
    end(chunk) { if (chunk !== undefined) chunks.push(Buffer.from(chunk)); res.ended = true; return res },
    on() { return res },
    body: () => Buffer.concat(chunks),
  }
  return res
}

const routes = []
const ctx = {
  webServer: { register: r => { routes.push(r); return () => {} } },
  effect: fn => fn(),
}
registerAssetRoute(ctx)
check(routes.length === 1, '路由未注册')
const handler = routes[0]?.handler
check(typeof handler === 'function', '路由缺少 handler')

const settle = () => new Promise(r => setTimeout(r, 2))
async function fetchAsset(name, method = 'GET') {
  const res = makeRes()
  handler({ url: ASSET_ROUTE + '?name=' + encodeURIComponent(name), method }, res)
  for (let i = 0; i < 200 && !res.ended; i++) await settle()
  return res
}

const root = assetRoot()
console.log('素材根目录:', root)
console.log('目录存在:', await fsp.stat(root).then(s => s.isDirectory()).catch(() => false))

const all = [...BACKGROUND_NAMES, ...DISH_NAMES]
let okCount = 0
const missing = []
const mismatched = []

for (const name of all) {
  if (!isAllowedName(name)) { check(false, '白名单拒绝了自己的条目: ' + name); continue }
  const res = await fetchAsset(name)
  if (res.status !== 200) {
    missing.push(name + '(' + String(res.status) + ')')
    continue
  }
  // 与磁盘原文件逐字节比对（证明路由没有截断/串图）。
  // 菜品图在 `dishes\` 子目录、背景在根目录，所以逐个候选路径找到真实文件再比。
  const candidates = resolveAssetPaths(name) ?? []
  let diskBuf = null
  for (const candidate of candidates) {
    for (const ext of ['.png', '.jpg', '.jpeg', '.webp']) {
      const file = candidate.replace(/\.png$/, '') + ext
      const buf = await fsp.readFile(file).catch(() => null)
      if (buf !== null) { diskBuf = buf; break }
    }
    if (diskBuf !== null) break
  }
  if (diskBuf === null) { check(false, '磁盘读取失败(但路由给了 200): ' + name); continue }
  const got = res.body()
  if (Buffer.compare(diskBuf, got) !== 0) {
    mismatched.push(name + ' 磁盘=' + diskBuf.length + ' 路由=' + got.length)
    continue
  }
  if (res.headers['content-type'] !== 'image/png') mismatched.push(name + ' MIME=' + String(res.headers['content-type']))
  if (res.headers['cache-control'] !== 'no-store') mismatched.push(name + ' cache=' + String(res.headers['cache-control']))
  okCount += 1
}

console.log('成功取图:', okCount, '/', all.length)
if (missing.length > 0) console.log('缺失/未就绪:', missing.join('、'))
if (mismatched.length > 0) console.log('不一致:', mismatched.join('、'))

// 背景三张单独确认（早/中/晚切换依赖它们）
for (const key of BACKGROUND_NAMES) {
  const res = await fetchAsset(key)
  check(res.status === 200, '背景缺失: ' + key + '（状态 ' + String(res.status) + '）')
  if (res.status === 200) {
    const size = res.body().length
    check(size > 100 * 1024, '背景 ' + key + ' 体积异常: ' + size + ' 字节（可能不是真图）')
    console.log('  背景', key, '=', Math.round(size / 1024), 'KB')
  }
}

// 安全边界：真实目录下也必须拒绝逃逸与未知名
for (const bad of ['../gal-eat/dishes/红菜汤', '..\\..\\windows\\win.ini', 'dishes/红菜汤', '不存在菜', '', 'morning.png']) {
  const res = await fetchAsset(bad)
  check(res.status === 404, '危险/未知名未被拒绝: ' + JSON.stringify(bad) + ' → ' + String(res.status))
}

// HEAD 不应回体
const head = await fetchAsset('morning', 'HEAD')
check(head.status === 200, 'HEAD 失败: ' + String(head.status))
check(head.body().length === 0, 'HEAD 不该返回响应体')

if (errors.length > 0) {
  console.error('\nFAIL 真实目录取图端到端：')
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}
if (okCount !== all.length) {
  console.error('\nFAIL：有 ' + (all.length - okCount) + ' 个素材取不到（见上方"缺失/未就绪"）。')
  console.error('提示：图片应放在 <Pictures>\\gal-eat\\（背景 morning/noon/evening.png）与 <Pictures>\\gal-eat\\dishes\\（菜品 <菜名>.png）')
  process.exit(1)
}
console.log('\n真实目录取图端到端 ALL OK：' + all.length + ' 个素材全部 200 且字节与磁盘一致；'
  + '逃逸/未知名全部 404；HEAD 无响应体')
process.exit(0)
