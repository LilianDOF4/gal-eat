// gal-eat 客户端素材层单测：时段背景选择 / 取图地址 / 加载器缓存与失败回退 / 场景素材反查。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  backgroundKeyForHour, backgroundKeyNow, backgroundLabel, assetUrl,
  createAssetLoader, findSceneAssetId, FALLBACK_BACKDROP,
} from '../.dsh-plugin/client/eat-assets.mjs'

/** 假 fetch：按名字返回 png / 404。 */
function fakeFetch(map, log = []) {
  return async (url) => {
    log.push(url)
    const name = decodeURIComponent(String(url).split('name=')[1] ?? '')
    if (!(name in map)) return { ok: false, status: 404, blob: async () => null }
    const bytes = Uint8Array.from(map[name])
    return {
      ok: true,
      status: 200,
      blob: async () => ({ type: 'image/png', arrayBuffer: async () => bytes.buffer }),
    }
  }
}

test('背景时段：05–11 早、11–17 中、其余晚（含边界）', () => {
  assert.equal(backgroundKeyForHour(5), 'morning')
  assert.equal(backgroundKeyForHour(10), 'morning')
  assert.equal(backgroundKeyForHour(11), 'noon')
  assert.equal(backgroundKeyForHour(16), 'noon')
  assert.equal(backgroundKeyForHour(17), 'evening')
  assert.equal(backgroundKeyForHour(23), 'evening')
  assert.equal(backgroundKeyForHour(0), 'evening')
  assert.equal(backgroundKeyForHour(4), 'evening')
  assert.equal(backgroundKeyForHour(NaN), 'evening')
  // 具体时刻 → 具体时段
  assert.equal(backgroundKeyNow(new Date(2026, 9, 8, 7, 30).getTime()), 'morning')
  assert.equal(backgroundKeyNow(new Date(2026, 9, 8, 12, 0).getTime()), 'noon')
  assert.equal(backgroundKeyNow(new Date(2026, 9, 8, 20, 0).getTime()), 'evening')
  assert.equal(backgroundLabel('morning'), '清晨')
  assert.equal(backgroundLabel('noon'), '正午')
  assert.equal(backgroundLabel('evening'), '夜晚')
})

test('assetUrl：同源相对地址并做 URL 编码（中文菜名安全）', () => {
  assert.equal(assetUrl('morning'), '/gal-eat/asset?name=morning')
  assert.ok(assetUrl('招牌香辣烤鱼').includes(encodeURIComponent('招牌香辣烤鱼')))
  assert.equal(assetUrl('x', 'http://127.0.0.1:1234'), 'http://127.0.0.1:1234/gal-eat/asset?name=x')
})

test('内置兜底背景：是合法 SVG data URL（没图也不空着）', () => {
  assert.ok(FALLBACK_BACKDROP.startsWith('data:image/svg+xml'))
  assert.ok(decodeURIComponent(FALLBACK_BACKDROP).includes('<svg'))
})

test('加载器：成功取图 → 缓存；重复请求命中缓存不再打网', async () => {
  const log = []
  const loader = createAssetLoader({ fetchImpl: fakeFetch({ 招牌香辣烤鱼: [1, 2, 3] }, log) })
  assert.equal(loader.peek('招牌香辣烤鱼'), null)
  const dataUrl = await loader.load('招牌香辣烤鱼')
  assert.ok(String(dataUrl).startsWith('data:image/png;base64,'))
  assert.equal(loader.peek('招牌香辣烤鱼'), dataUrl)
  assert.equal(log.length, 1)
  await loader.load('招牌香辣烤鱼')
  assert.equal(log.length, 1, '第二次应命中缓存')
})

test('加载器：并发去重（同一张图只请求一次）', async () => {
  const log = []
  const loader = createAssetLoader({ fetchImpl: fakeFetch({ morning: [9] }, log) })
  const [a, b, c] = await Promise.all([loader.load('morning'), loader.load('morning'), loader.load('morning')])
  assert.equal(a, b)
  assert.equal(b, c)
  assert.equal(log.length, 1)
})

test('加载器：404 → 静默失败、记为缺失、不重复重试', async () => {
  const log = []
  const loader = createAssetLoader({ fetchImpl: fakeFetch({}, log) })
  assert.equal(await loader.load('红菜汤'), null)
  assert.equal(loader.isMissing('红菜汤'), true)
  assert.equal(await loader.load('红菜汤'), null)
  assert.equal(log.length, 1, '已确认缺失的不该反复打网')
})

test('加载器：fetch 抛错也被吞掉（不能把吃饭页面炸掉）', async () => {
  const loader = createAssetLoader({ fetchImpl: async () => { throw new Error('network down') } })
  assert.equal(await loader.load('morning'), null)
  assert.equal(loader.isMissing('morning'), true)
})

test('加载器：无 fetch 环境/空名字安全', async () => {
  const loader = createAssetLoader({ fetchImpl: undefined, cache: new Map() })
  // 没有 fetch 时返回 null（浏览器一定有，这里只是兜底分支）
  const r = await loader.load('morning')
  assert.ok(r === null || typeof r === 'string')
  assert.equal(await loader.load(''), null)
  assert.equal(await loader.load(null), null)
})

test('加载器：prefetch 统计成功数，失败不抛', async () => {
  const loader = createAssetLoader({ fetchImpl: fakeFetch({ a: [1], b: [2] }) })
  // 名字不在白名单也没关系：这一层不校验白名单（宿主会 404）
  const ok = await loader.prefetch(['a', 'b', 'c'])
  assert.equal(ok, 2)
  assert.equal(await loader.prefetch('junk'), 0)
})

test('findSceneAssetId：按元素文案里的关键词反查素材 id（§5.4 查找顺序②）', () => {
  const assets = new Map([['asset-1', { id: 'asset-1', dataUrl: 'data:image/png;base64,AA' }]])
  const scene = { elements: [{ id: 'e1', type: 'background', text: '夜晚美食街', assetId: 'asset-1' }] }
  assert.equal(findSceneAssetId(scene, assets, '夜晚'), 'asset-1')
  assert.equal(findSceneAssetId(scene, assets, '清晨'), null)
  assert.equal(findSceneAssetId(null, assets, '夜晚'), null)
  assert.equal(findSceneAssetId(scene, null, '夜晚'), null)
  assert.equal(findSceneAssetId(scene, assets, ''), null)
  // 元素引用了不存在的素材 → 不返回
  const bad = { elements: [{ text: '夜晚', assetId: 'missing' }] }
  assert.equal(findSceneAssetId(bad, assets, '夜晚'), null)
})
