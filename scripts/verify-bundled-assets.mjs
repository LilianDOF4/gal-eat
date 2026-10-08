// 实证：**用已装产物**验证"用户目录没图时，包内素材照样能出图"。
// 手法：把 GALEAT_PICTURES 指到空目录、GALEAT_BUNDLED_ASSETS 指到已装产物的 assets/，
// 然后走真实的路由 handler，确认 3 张背景 + 30 道菜全部 200 且响应体非空。
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DEP = 'C:/Users/13934/.dsh/profiles/desktop/node_modules/gal-eat/'
const mod = await import('file:///' + DEP + 'lib/index.js')

const empty = await mkdtemp(join(tmpdir(), 'ge-nouser-'))
process.env.GALEAT_PICTURES = empty                       // 用户目录故意空着
process.env.GALEAT_BUNDLED_ASSETS = DEP + 'assets'        // 指向已装产物自带素材

const routes = []
mod.registerAssetRoute({ webServer: { register: r => { routes.push(r); return () => {} } }, effect: fn => fn() })
const handler = routes[0].handler
const settle = () => new Promise(r => setTimeout(r, 2))

function fakeRes() {
  return {
    status: null, headers: null, bytes: 0,
    writeHead(s, h) { this.status = s; this.headers = h ?? {}; return this },
    write(c) { if (c !== undefined) this.bytes += Buffer.isBuffer(c) ? c.length : Buffer.byteLength(String(c)); return true },
    end() { return this },
    on() { return this },
  }
}

async function get(name) {
  const res = fakeRes()
  handler({ url: mod.ASSET_ROUTE + '?name=' + encodeURIComponent(name), method: 'GET' }, res)
  for (let i = 0; i < 100 && res.status === null; i++) await settle()
  // 等流写完
  for (let i = 0; i < 20 && res.bytes === 0 && res.status === 200; i++) await settle()
  return res
}

const names = [...mod.BACKGROUND_NAMES, ...mod.DISH_NAMES]
const bad = []
for (const name of names) {
  const res = await get(name)
  if (res.status !== 200 || res.bytes === 0) bad.push(`${name}: status=${res.status} bytes=${res.bytes}`)
}

console.log('  用户目录（空）=', empty)
console.log('  包内素材目录   =', process.env.GALEAT_BUNDLED_ASSETS)
console.log(`  素材总数 = ${names.length}（背景 ${mod.BACKGROUND_NAMES.length} + 菜品 ${mod.DISH_NAMES.length}）`)
if (bad.length === 0) {
  console.log('\n包内兜底素材 ALL OK：用户目录为空时，33 个素材全部 200 且响应体非空')
  process.exit(0)
}
console.log('\n失败素材：')
for (const b of bad) console.log('  - ' + b)
process.exit(1)
