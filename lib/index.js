// gal-eat Node half：只做一件事——把用户放在磁盘上的美食街/菜品图，经 Web 服务器
// 以**只读、白名单**方式提供给浏览器 half。
//
// 为什么需要宿主侧：
//   浏览器 half 不能直接读用户磁盘（没有文件系统权限），而菜品图/背景图放在
//   `C:\Users\<用户>\Pictures\gal-eat\` 时体积太大、不适合打进 npm 包。
//
// 安全约束（这是唯一暴露文件内容的通道，必须从严）：
//   1. 只服务**固定根目录**下的文件：`<Pictures>\gal-eat\`
//   2. 只服务**白名单里的名字**：3 张背景 + 30 道菜（与 gal-view 侧 eat.mjs 的菜名对齐，
//      有单测比对两侧一致），映射到磁盘时统一补 `.png`
//   3. 名字里禁止任何路径分隔符/点号逃逸；解析后的绝对路径必须仍在根目录内（双保险）
//   4. 只允许 GET/HEAD；不做目录列举；响应带 no-store，避免用户换图后看到旧图
//
// 客户端地址：`/gal-eat/asset?name=<名字>`（背景用早/中/晚的名字，菜品用菜名）

import { createReadStream, promises as fsp } from 'node:fs'
import { homedir, platform } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'gal-eat'

/** 依赖宿主 web 服务器（route 注册）。 */
export const inject = ['webServer']

/** 客户端取图端点。 */
export const ASSET_ROUTE = '/gal-eat/asset'

/** 用户覆盖目录（与计划 §5.4 一致）：<Pictures>\gal-eat。 */
export function assetRoot() {
  const pictures = process.env.GALEAT_PICTURES
    || join(homedir(), platform() === 'win32' ? 'Pictures' : 'Pictures')
  return join(pictures, 'gal-eat')
}

/**
 * 插件包内自带素材目录（兜底）：`<插件根>\assets`。
 * 可用环境变量 `GALEAT_BUNDLED_ASSETS` 覆盖（测试用；也给"把图放别处"留口子）。
 */
export function bundledAssetRoot() {
  const override = process.env.GALEAT_BUNDLED_ASSETS
  if (typeof override === 'string' && override !== '') return override
  // lib/index.js → 上级就是插件根
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')
}

/** 背景图名字（文件名，不含扩展名）。 */
export const BACKGROUND_NAMES = Object.freeze(['morning', 'noon', 'evening'])

/** 菜名白名单：必须与 gal-view 侧 eat.mjs 的菜单逐字一致（tests 里有比对断言）。 */
export const DISH_NAMES = Object.freeze([
  // 超美味烤鱼
  '配菜拼盘', '番茄烤鱼', '招牌香辣烤鱼', '蒜香豆豉烤鱼', '青花椒烤鱼', '豆花烤鱼',
  // 夫妻烤串店
  '烤茄子', '羊肉串十串', '烤鸡翅四只', '烤生蚝六只', '烤羊排', '烤羊腿',
  // 老李川菜馆
  '麻婆豆腐', '鱼香肉丝', '夫妻肺片', '宫保鸡丁', '回锅肉', '开水白菜',
  // 话梅西餐厅
  '田园沙拉', '奶油蘑菇汤', '红菜汤', '香煎大马哈鱼', '罐焖牛肉', '奶油红黑鱼子',
  // 肯麦王快餐店
  '黄金薯条', '双层芝士汉堡', '炸鸡桶', '牛肉汉堡套餐', '全家桶', '巨无霸豪华套餐',
])

/** 全部允许的名字。 */
export function allowedNames() {
  return [...BACKGROUND_NAMES, ...DISH_NAMES]
}

/** 扩展名 → MIME（菜品图统一是 PNG；兼容用户放 jpg/webp 的情况）。 */
const MIME = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
})

/** 允许的候选扩展名（按优先级尝试）。 */
const EXTS = Object.freeze(['.png', '.jpg', '.jpeg', '.webp'])

/**
 * 校验名字是否合法（白名单 + 无路径逃逸字符）。
 * @returns {boolean}
 */
export function isAllowedName(rawName) {
  if (typeof rawName !== 'string' || rawName === '') return false
  if (rawName.length > 64) return false
  // 禁止任何分隔符/父目录/盘符/控制字符：名字只能是"菜名"本身
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(rawName)) return false
  if (rawName.includes('..')) return false
  if (rawName.includes('/') || rawName.includes('\\')) return false
  return allowedNames().includes(rawName)
}

/**
 * 解析成磁盘绝对路径，并确保仍在根目录内（双保险）。
 * 查找顺序（先命中先用）：
 *   1. **用户覆盖目录** `<Pictures>\gal-eat\`（根目录 + `dishes\`）—— 想让用户自己换图就放这里
 *   2. **插件包内兜底** `assets/`（`<插件>\assets\` + `<插件>\assets\dishes\`）——
 *      这样网友装完**开箱就有图**，不必自己准备素材
 *
 * 注：包内图是压缩版（背景 1920×1080 JPEG、菜品长边 640 PNG），用于显示绰绰有余；
 *     想要原画质就把自己的图丢进用户覆盖目录，会自动优先。
 *
 * @returns {string[]|null} 候选绝对路径（按优先级；未做存在性检查）
 */
export function resolveAssetPaths(rawName, root = assetRoot(), bundled = bundledAssetRoot()) {
  if (!isAllowedName(rawName)) return null
  const out = []
  for (const base of [root, bundled]) {
    if (typeof base !== 'string' || base === '') continue
    const abs = resolve(base)
    for (const dir of [abs, join(abs, 'dishes')]) {
      const target = resolve(dir, rawName + '.png')
      // 目录穿越双保险：解析结果必须落在该目录内
      if (target !== dir && !target.startsWith(dir + sep)) continue
      if (!out.includes(target)) out.push(target)
    }
  }
  return out.length > 0 ? out : null
}

/** 兼容旧名：返回第一个候选路径（存在性不保证）。 */
export function resolveAssetPath(rawName, root = assetRoot()) {
  const list = resolveAssetPaths(rawName, root)
  return list === null ? null : list[0]
}

/** 在候选路径 × 候选扩展名里找到第一个真实存在的文件。 */
async function findExisting(candidates) {
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const stem = candidate.replace(/\.png$/, '')
    for (const ext of EXTS) {
      const file = stem + ext
      try {
        const st = await fsp.stat(file)
        if (st.isFile()) return { path: file, size: st.size, mime: MIME[ext] ?? 'application/octet-stream' }
      } catch {
        // 试下一个
      }
    }
  }
  return null
}

/**
 * 注册取图路由（在 web 服务器上）。
 * @param {object} ctx - 宿主插件上下文（提供 webServer 与 effect）
 * @returns {() => void} 注销函数
 */
export function registerAssetRoute(ctx) {
  if (ctx === null || ctx === undefined || ctx.webServer === undefined || typeof ctx.webServer.register !== 'function') {
    // web 服务器不可用（例如纯 CLI 形态）：不注册，浏览器侧会退化为内置素材/纯文字
    return () => {}
  }
  return ctx.webServer.register({
    kind: 'exact',
    path: ASSET_ROUTE,
    handler: (req, res) => {
      const method = String(req.method ?? 'GET').toUpperCase()
      if (method !== 'GET' && method !== 'HEAD') {
        res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('method not allowed')
        return
      }
      let name = ''
      try {
        const url = new URL(req.url ?? '/', 'http://localhost')
        name = url.searchParams.get('name') ?? ''
      } catch {
        name = ''
      }
      if (!isAllowedName(name)) {
        // 统一 404：不暴露"名字存在但文件缺失"与"名字非法"的区别
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
        res.end('not found')
        return
      }
      void (async () => {
        const candidates = resolveAssetPaths(name)
        const found = candidates === null ? null : await findExisting(candidates)
        if (found === null) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
          res.end('not found')
          return
        }
        res.writeHead(200, {
          'content-type': found.mime,
          'content-length': String(found.size),
          'cache-control': 'no-store',
        })
        if (method === 'HEAD') {
          res.end()
          return
        }
        // 用 data/end 事件写响应（不依赖 res 是可写流；任何实现只要支持 write/end 即可）。
        const stream = createReadStream(found.path)
        stream.on('data', chunk => {
          try { res.write(chunk) } catch { stream.destroy() }
        })
        stream.on('end', () => { try { res.end() } catch { /* 已断开 */ } })
        stream.on('error', (error) => {
          console.warn('[gal-eat] 读取素材失败:', found.path, error?.message ?? error)
          try { res.end() } catch { /* 已断开 */ }
        })
      })().catch((error) => {
        // 已经发过响应头时不能再写：只记日志，避免二次 writeHead 抛错把真实原因盖掉。
        console.warn('[gal-eat] 取图失败:', name, error?.message ?? error)
        try {
          if (res.headersSent !== true) {
            res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
            res.end('error')
          } else {
            res.end()
          }
        } catch { /* 已断开 */ }
      })
    },
  })
}

export function apply(ctx) {
  // 路由随插件纤维卸载自动注销。
  ctx.effect(() => registerAssetRoute(ctx), 'gal-eat: asset route')
}
