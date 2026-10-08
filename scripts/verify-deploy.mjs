// 部署核验：确认 desktop profile 里装的就是本地产物，且关键功能真的在里面。
// （esbuild 会把中文转义成 \uXXXX，所以按**转义形式**查找，不能直接查中文字面量。）
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const LOCAL = 'C:/Users/13934/Documents/deepseek-harness/default-workspace/.galview-fork/gal-eat/.dsh-plugin/client.js'
const DEP = 'C:/Users/13934/.dsh/profiles/desktop/node_modules/gal-eat/.dsh-plugin/client.js'
const DEP_PKG = 'C:/Users/13934/.dsh/profiles/desktop/node_modules/gal-eat/package.json'
const LOCAL_PKG = 'C:/Users/13934/Documents/deepseek-harness/default-workspace/.galview-fork/gal-eat/package.json'

const sha = b => createHash('sha256').update(b).digest('hex')
const local = readFileSync(LOCAL)
const dep = readFileSync(DEP)
const pkg = JSON.parse(readFileSync(DEP_PKG, 'utf8'))
const text = dep.toString('utf8')
const localPkg = JSON.parse(readFileSync(LOCAL_PKG, 'utf8'))

/**
 * esbuild 只把**非 ASCII** 转义成大写十六进制的 \uXXXX（实测 \u4E0A 而非 \u4e0a），
 * ASCII 一律保持原样。所以这里只转义 > 0x7e 的字符 —— 早先把空格也转义成 \u0020，
 * 于是含空格的断言永远匹配不上（典型的"测试自己骗自己"）。
 */
const escaped = s => [...s].map(c => (c.codePointAt(0) > 0x7e
  ? '\\u' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')
  : c)).join('')
const escapedLower = s => [...s].map(c => (c.codePointAt(0) > 0x7e
  ? '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')
  : c)).join('')
const has = s => text.includes(s) || text.includes(escaped(s)) || text.includes(escapedLower(s))
const debugRaw = process.env.GALEAT_DEBUG === '1'
if (debugRaw) {
  // 定位"下降"那句在产物里的实际拼接形态（拼接加号/转义都可能影响字面匹配）
  const j = text.indexOf(escaped('下降'))
  console.log('[debug] 「下降」位置:', j)
  if (j >= 0) console.log('[debug] 下降句上下文:', JSON.stringify(text.slice(j - 20, j + 150)))
  console.log('[debug] 直接找 -1%   :', text.indexOf('-1%'))
  console.log('[debug] 直接找 4 分钟 :', text.indexOf(escaped('4 分钟')))
  console.log('[debug] 分钟→-1 拼接 :', text.indexOf(escaped(' 分钟 -1%')))
}

const checks = [
  // 版本跟随本地 package.json（不再写死，免得每次发版都要改脚本）
  ['已装版本 = 本地版本（' + localPkg.version + '）', pkg.version === localPkg.version],
  ['与本地产物字节一致', sha(local) === sha(dep)],
  ['菜品收益栏存在', text.includes('ge-dish-gain')],
  ['菜品收益提示前缀', has('吃下「')],
  ['高价额外说明', has('含高价额外')],
  ['饱食度提示：上涨', has('上涨')],
  ['饱食度提示：下降', has('下降')],
  // 注意 1：数字由 min(SATIETY_MS) 在**运行期拼接**，产物里不存在"4 分钟"这个字面串，
  //         所以只能查拼接后的右半段 " 分钟 -1%"。
  // 注意 2：必须是 ASCII 连字符；一旦被换成 U+2212（−）这条会立刻报出来。
  ['饱食度提示：自然下降速率', has(' 分钟 -1%')],  ['好感度提示：不会自己掉', has('不会自己掉')],
  ['好感度提示：12.5%', has('12.5%')],
  ['顶栏缩放常量', text.includes('eatHead')],
  ['顶栏缩放应用', text.includes('scale(')],
  // 顶栏用 zoom（布局级缩放）：用 transform 会把 left:0;right:0 的 1920px 横栏两端挤出舞台
  ['顶栏使用 zoom', text.includes('"zoom"') || text.includes('zoom:')],
  ['整条横栏不用 transform', !/ge-eat-head[\s\S]{0,400}?scale\(/.test(text) || text.includes('barZoomStyle')],
  // 300 券以上一律 +60%：收益预览必须复用真实规则函数，不能自己另算一套
  ['收益预览复用真实规则', text.includes('satietyGainForPrice')],
  ['历史写入已移除', !/appendHistoryLine\s*\(/.test(text)],
  // ---- 不联网审计（用户 2026-10-08 要求：gal-eat 一切功能不得联网，避免烧 API 余额）----
  // 唯一允许的出网形态：同源的本机素材路由（assetUrl → /gal-eat/asset，走 127.0.0.1）。
  ['没有外部 URL（http/https 仅 SVG 命名空间）', (() => {
    const urls = text.match(/https?:\/\/[^\s"'\\)]+/g) ?? []
    return urls.filter(u => !u.startsWith('http://www.w3.org/')).length === 0
  })()],
  ['没有 WebSocket / EventSource / sendBeacon', !/WebSocket|EventSource|sendBeacon/.test(text)],
  ['唯一网络出口是本机素材路由', text.includes('/gal-eat/asset') && /fetch\(|doFetch\(/.test(text)],
  ['计时只用本地墙钟（Date.now）', text.includes('Date.now')],
  // 券速率文案必须来自常量：产物里是 '每分钟 +' + N 运行期拼接，所以查片段而非完整句子
  ['券速率文案来自常量（每分钟 +N）', has('每分钟 +')],
  ['没有硬编码的旧券速率', !has('挂机 1 分钟') && !has('1 分钟 = 1 券')],
]

let bad = 0
for (const [name, ok] of checks) {
  if (!ok) bad += 1
  console.log('  ' + (ok ? 'OK  ' : 'FAIL') + '  ' + name)
}
console.log(bad === 0 ? '\n部署核验 ALL OK（gal-eat ' + pkg.version + '）' : '\n部署核验失败 ' + bad + ' 项')
process.exit(bad === 0 ? 0 : 1)
