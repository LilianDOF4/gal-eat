// 真机验证：向**正在运行的 DSH Web 服务器**请求 gal-eat 的取图路由，
// 确认宿主侧插件真的加载了、图片真的能从磁盘送到 HTTP 客户端。
//
// 为什么这一步单测替代不了：单测是直接调用 handler 函数，
// 这里走的是真实的 http server + 路由分发（能抓到"插件宿主侧根本没加载"这类问题）。
//
// 用法: node tests/verify-live-route.mjs [baseUrl]
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { BACKGROUND_NAMES, DISH_NAMES, assetRoot } from '../lib/index.js'

const base = (process.argv[2] ?? 'http://127.0.0.1:19387').replace(/\/$/, '')
const errors = []
const check = (cond, msg) => { if (!cond) errors.push(msg) }

/** 找磁盘上的真实文件（根目录或 dishes 子目录，多扩展名）。 */
function diskFile(name) {
  const root = assetRoot()
  const dirs = [root, resolve(root, 'dishes')]
  for (const dir of dirs) {
    for (const ext of ['.png', '.jpg', '.jpeg', '.webp']) {
      const p = resolve(dir, name + ext)
      try {
        const st = statSync(p)
        if (st.isFile()) return { path: p, size: st.size }
      } catch { /* 下一个 */ }
    }
  }
  return null
}

console.log('目标服务器:', base)

// —— ① 服务器可达性 ——
let serverUp = false
try {
  const res = await fetch(base + '/', { redirect: 'manual' })
  serverUp = res.status < 500
  console.log('服务器可达:', serverUp, '(status ' + res.status + ')')
} catch (error) {
  console.log('服务器不可达:', error?.message ?? error)
}
if (!serverUp) {
  console.log('\n跳过：DSH Web 服务器没在这个地址上跑（或需要鉴权）。这不是失败——')
  console.log('     它只说明「真机取图」这项无法在这里自动验证，请按计划 §7 人工验收。')
  process.exit(0)
}

// —— ② 路由是否已注册（宿主侧插件是否加载）——
const probeName = BACKGROUND_NAMES[0]
let routeRes = null
try {
  routeRes = await fetch(base + '/gal-eat/asset?name=' + encodeURIComponent(probeName))
} catch (error) {
  routeRes = null
  check(false, '请求取图路由失败：' + String(error))
}

if (routeRes !== null) {
  const ct = routeRes.headers.get('content-type') ?? ''
  const cc = routeRes.headers.get('cache-control') ?? ''
  const body = Buffer.from(await routeRes.arrayBuffer())
  console.log('路由响应: status=' + routeRes.status + ' type=' + ct + ' bytes=' + body.length + ' cache=' + cc)

  if (routeRes.status === 404) {
    // 404 有两种含义：插件没加载（路由不存在 → 被 fallback 兜成 404），或文件确实不在
    const onDisk = diskFile(probeName)
    if (onDisk === null) {
      console.log('提示：' + probeName + ' 在磁盘上也不存在（' + assetRoot() + '），所以 404 属正常。')
      console.log('     放一张 ' + probeName + '.png 到该目录后重跑本脚本即可验证真机取图。')
    } else {
      check(false, '磁盘上有 ' + probeName + '（' + onDisk.size + ' 字节）但路由回 404 —— '
        + '说明宿主侧 gal-eat 没有加载（或路由未注册）。检查 profile 的 bundles 是否含 gal-eat、'
        + '以及 DSH 是否已重启。')
    }
  } else if (routeRes.status === 200) {
    check(ct.startsWith('image/'), '200 但 content-type 不是图片：' + ct)
    check(cc === 'no-store', '应带 no-store（换图后立刻生效）：' + cc)
    const onDisk = diskFile(probeName)
    if (onDisk !== null) {
      check(body.length === onDisk.size, '返回字节数(' + body.length + ')与磁盘(' + onDisk.size + ')不一致')
      const diskBuf = readFileSync(onDisk.path)
      check(Buffer.compare(diskBuf, body) === 0, '返回内容与磁盘文件不一致（可能串图/截断）')
      if (body.length === onDisk.size) {
        console.log('字节与磁盘一致: 是（' + onDisk.path + '）')
      }
    }
  } else {
    check(false, '取图路由返回了意外状态码：' + routeRes.status)
  }
}

// —— ③ 抽查一张菜品图（走 dishes 子目录那条路径）——
const dishName = DISH_NAMES.find(n => diskFile(n) !== null)
if (dishName !== undefined && routeRes !== null && routeRes.status !== 404) {
  const res = await fetch(base + '/gal-eat/asset?name=' + encodeURIComponent(dishName))
  const body = Buffer.from(await res.arrayBuffer())
  const onDisk = diskFile(dishName)
  console.log('抽查菜品「' + dishName + '」: status=' + res.status + ' bytes=' + body.length
    + (onDisk !== null ? ' 磁盘=' + onDisk.size : ''))
  if (res.status === 200 && onDisk !== null) {
    check(body.length === onDisk.size, '菜品图字节数不一致：' + body.length + ' vs ' + onDisk.size)
  }
}

// —— ④ 安全边界（真机上也要拒绝）——
for (const bad of ['../gal-eat/dishes/红菜汤', '..\\..\\windows\\win.ini', '不存在菜', 'morning.png']) {
  const res = await fetch(base + '/gal-eat/asset?name=' + encodeURIComponent(bad))
  check(res.status === 404, '真机上危险/未知名未被拒绝：' + JSON.stringify(bad) + ' → ' + res.status)
  // 丢掉响应体，避免连接堆积
  await res.arrayBuffer().catch(() => {})
}

if (errors.length > 0) {
  console.error('\nFAIL 真机取图验证：')
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}
console.log('\n真机取图验证 ALL OK：路由可达、字节与磁盘一致、危险名全部 404')
process.exit(0)
