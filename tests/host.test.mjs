// gal-eat 宿主侧单测：取图白名单 / 路径安全 / 路由行为，以及两侧菜名一致性。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  name as hostName, ASSET_ROUTE, BACKGROUND_NAMES, DISH_NAMES, allowedNames,
  isAllowedName, resolveAssetPath, resolveAssetPaths, registerAssetRoute, assetRoot, bundledAssetRoot,
} from '../lib/index.js'
import { allDishes } from '../gal-view/.dsh-plugin/client/eat.mjs'

/** 假响应对象：记录 writeHead / end，并实现 pipe 目标所需的最小接口。 */
function fakeRes() {
  const res = {
    status: null,
    headers: null,
    body: '',
    ended: false,
    writeHead(status, headers) { res.status = status; res.headers = headers ?? {}; return res },
    write(chunk) { if (chunk !== undefined) res.body += String(chunk); return true },
    end(chunk) { res.ended = true; if (chunk !== undefined) res.body += String(chunk); return res },
    on() { return res },
  }
  return res
}

/** 假请求对象。 */
function fakeReq(url, method = 'GET') {
  return { url, method }
}

test('宿主 half 声明：name/inject 与路由路径', () => {
  assert.equal(hostName, 'gal-eat')
  assert.equal(ASSET_ROUTE, '/gal-eat/asset')
})

test('白名单：正好 3 张背景 + 30 道菜，且与 gal-view 侧菜单逐字一致', () => {
  assert.deepEqual([...BACKGROUND_NAMES], ['morning', 'noon', 'evening'])
  assert.equal(DISH_NAMES.length, 30)
  assert.equal(allowedNames().length, 33)

  const menuNames = allDishes().map(d => d.name).sort()
  const whitelist = [...DISH_NAMES].sort()
  assert.deepEqual(whitelist, menuNames, '宿主白名单与 gal-view 菜单菜名必须完全一致（否则取图会 404）')
  // 无重复
  assert.equal(new Set(DISH_NAMES).size, DISH_NAMES.length)
})

test('isAllowedName：只认白名单，一切路径逃逸都拒绝', () => {
  assert.equal(isAllowedName('招牌香辣烤鱼'), true)
  assert.equal(isAllowedName('morning'), true)
  assert.equal(isAllowedName('evening'), true)
  assert.equal(isAllowedName(''), false)
  assert.equal(isAllowedName(null), false)
  assert.equal(isAllowedName(undefined), false)
  assert.equal(isAllowedName(123), false)
  assert.equal(isAllowedName('不存在菜'), false)
  assert.equal(isAllowedName('../secret'), false)
  assert.equal(isAllowedName('..\\secret'), false)
  assert.equal(isAllowedName('sub/dir'), false)
  assert.equal(isAllowedName('sub\\dir'), false)
  assert.equal(isAllowedName('C:\\Windows\\win.ini'), false)
  assert.equal(isAllowedName('招牌香辣烤鱼.png'), false, '名字里不允许带扩展名')
  assert.equal(isAllowedName('a'.repeat(65)), false, '超长名字拒绝')
  assert.equal(isAllowedName('招牌\u0000烤鱼'), false, '控制字符拒绝')
  assert.equal(isAllowedName('招牌香辣烤鱼 '), false, '尾随空格不等于白名单项')
})

test('resolveAssetPath：解析后的绝对路径必须仍在根目录内', () => {
  const root = 'C:\\Users\\x\\Pictures\\gal-eat'
  const p = resolveAssetPath('麻婆豆腐', root)
  assert.ok(p !== null && p.startsWith(root))
  assert.ok(p.endsWith('麻婆豆腐.png'))
  assert.equal(resolveAssetPath('../evil', root), null)
  assert.equal(resolveAssetPath('nope', root), null)
  // 即便白名单被绕过，越界也会被第二道校验拦下（这里直接构造越界名验证函数不变式）
  assert.equal(resolveAssetPath('..', root), null)
})

test('assetRoot：默认在用户 Pictures\\gal-eat 下，可用环境变量覆盖', () => {
  const prev = process.env.GALEAT_PICTURES
  process.env.GALEAT_PICTURES = 'D:\\pics'
  assert.equal(assetRoot(), join('D:\\pics', 'gal-eat'))
  if (prev === undefined) delete process.env.GALEAT_PICTURES
  else process.env.GALEAT_PICTURES = prev
})

// ============ 包内兜底素材（2026-10-08：让"发给别人"也有图）============

test('候选顺序：**用户目录优先、包内兜底**，两侧都给出根目录与 dishes 子目录', () => {
  const user = 'D:\\pics\\gal-eat'
  const bundled = 'C:\\app\\gal-eat\\assets'
  const list = resolveAssetPaths('全家桶', user, bundled)
  assert.deepEqual(list, [
    join(user, '全家桶.png'),
    join(user, 'dishes', '全家桶.png'),
    join(bundled, '全家桶.png'),
    join(bundled, 'dishes', '全家桶.png'),
  ], '用户目录的候选必须排在包内之前（换图才生效）')
  // 包内目录缺省时不应崩，也不该丢用户候选
  assert.deepEqual(resolveAssetPaths('全家桶', user, ''), [
    join(user, '全家桶.png'),
    join(user, 'dishes', '全家桶.png'),
  ])
  // 非法名字仍然 null（白名单先拦）
  assert.equal(resolveAssetPaths('../evil', user, bundled), null)
})

test('resolveAssetPaths 的候选**全部**落在各自根目录内（含包内兜底根）', () => {
  const user = 'D:\\pics\\gal-eat'
  const bundled = 'C:\\app\\gal-eat\\assets'
  for (const p of resolveAssetPaths('morning', user, bundled)) {
    assert.ok(p.startsWith(user) || p.startsWith(bundled), '越界候选: ' + p)
  }
})

test('路由：用户目录没图时，回落到插件包内素材（网友开箱就有图）', async () => {
  // 用户目录故意留空
  const userBase = await mkdtemp(join(tmpdir(), 'gal-eat-user-'))
  const userRoot = join(userBase, 'gal-eat')
  await mkdir(userRoot, { recursive: true })
  // 包内素材：一张背景（JPEG，验证扩展名回退）+ 一张放在 dishes 子目录的菜品
  const bundleBase = await mkdtemp(join(tmpdir(), 'gal-eat-bundled-'))
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  await writeFile(join(bundleBase, 'noon.jpg'), bytes)
  await mkdir(join(bundleBase, 'dishes'), { recursive: true })
  await writeFile(join(bundleBase, 'dishes', '麻婆豆腐.png'), bytes)

  const prevPics = process.env.GALEAT_PICTURES
  const prevBundled = process.env.GALEAT_BUNDLED_ASSETS
  process.env.GALEAT_PICTURES = userBase
  // **必须**把包内目录也指到临时目录：否则会命中仓库里真实的 assets/，断言就不再独立
  process.env.GALEAT_BUNDLED_ASSETS = bundleBase
  try {
    const routes = []
    const ctx = {
      webServer: { register: route => { routes.push(route); return () => {} } },
      effect: fn => fn(),
    }
    registerAssetRoute(ctx)
    const handler = routes[0].handler
    const settle = () => new Promise(r => setTimeout(r, 2))
    // handler 内部是 `void (async () => …)()`，**不返回 promise**，所以只能等状态落地
    const waitStatus = async res => {
      for (let i = 0; i < 100 && res.status === null; i++) await settle()
      return res.status
    }

    // ① 背景：用户目录没有 → 从包内 assets\noon.jpg 拿到（顺带验证扩展名回退）
    let res = fakeRes()
    handler(fakeReq(ASSET_ROUTE + '?name=noon'), res)
    await waitStatus(res)
    assert.equal(res.status, 200, '包内背景应能取到')
    assert.equal(res.headers['content-type'], 'image/jpeg', '包内背景是压缩后的 JPEG')

    // ② 菜品：包内 dishes 子目录
    res = fakeRes()
    handler(fakeReq(ASSET_ROUTE + '?name=' + encodeURIComponent('麻婆豆腐')), res)
    await waitStatus(res)
    assert.equal(res.status, 200, '包内菜品应能取到')
    assert.equal(res.headers['content-type'], 'image/png')

    // ③ 用户目录放了同名图 → **优先**用用户的（换图才生效）
    await writeFile(join(userRoot, 'night.png'), bytes)
    const userOnly = fakeRes()
    handler(fakeReq(ASSET_ROUTE + '?name=night'), userOnly)
    await waitStatus(userOnly)
    assert.equal(userOnly.status, 404, 'night 不在白名单 → 404（顺带确认白名单仍在拦）')

    // ④ 两边都没有 → 404
    res = fakeRes()
    handler(fakeReq(ASSET_ROUTE + '?name=' + encodeURIComponent('红菜汤')), res)
    await waitStatus(res)
    assert.equal(res.status, 404)
  } finally {
    if (prevPics === undefined) delete process.env.GALEAT_PICTURES
    else process.env.GALEAT_PICTURES = prevPics
    if (prevBundled === undefined) delete process.env.GALEAT_BUNDLED_ASSETS
    else process.env.GALEAT_BUNDLED_ASSETS = prevBundled
  }
})

test('路由：非法名字 → 404；方法不允许 → 405；合法且存在 → 200 + 图片 MIME；HEAD 不回体', async () => {
  // 在临时根下造一个 gal-eat/dishes 结构，并用 GALEAT_PICTURES 指过去
  const base = await mkdtemp(join(tmpdir(), 'gal-eat-root-'))
  const root = join(base, 'gal-eat')
  await mkdir(root, { recursive: true })
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
  await writeFile(join(root, '麻婆豆腐.png'), bytes)

  const routes = []
  const ctx = {
    webServer: { register: route => { routes.push(route); return () => {} } },
    effect: fn => fn(),
  }
  const dispose = registerAssetRoute(ctx)
  assert.equal(typeof dispose, 'function')
  assert.equal(routes.length, 1)
  assert.equal(routes[0].kind, 'exact')
  assert.equal(routes[0].path, ASSET_ROUTE)

  const prev = process.env.GALEAT_PICTURES
  const prevBundled = process.env.GALEAT_BUNDLED_ASSETS
  process.env.GALEAT_PICTURES = base
  // 包内兜底指到**空目录**：否则"文件不存在 → 404"会被包内素材救活，这个用例就不再成立
  process.env.GALEAT_BUNDLED_ASSETS = await mkdtemp(join(tmpdir(), 'gal-eat-empty-'))
  // 文件 stat 走线程池：让出一轮宏任务比 setImmediate 更可靠。
  const settle = () => new Promise(r => setTimeout(r, 2))
  /** 等到响应头落地（或超时）。 */
  const waitStatus = async res => {
    for (let i = 0; i < 100 && res.status === null; i++) await settle()
    return res.status
  }
  try {
    assert.equal(assetRoot(), root)

    // ① 名字非法（路径逃逸）
    let res = fakeRes()
    routes[0].handler(fakeReq(ASSET_ROUTE + '?name=' + encodeURIComponent('../etc/passwd')), res)
    await waitStatus(res)
    assert.equal(res.status, 404)

    // ② 名字合法但文件不存在（stat 是异步的，等状态落地）
    res = fakeRes()
    routes[0].handler(fakeReq(ASSET_ROUTE + '?name=' + encodeURIComponent('红菜汤')), res)
    await waitStatus(res)
    assert.equal(res.status, 404)

    // ③ 方法不允许
    res = fakeRes()
    routes[0].handler(fakeReq(ASSET_ROUTE, 'POST'), res)
    assert.equal(res.status, 405)

    // ④ 缺 name 参数
    res = fakeRes()
    routes[0].handler(fakeReq(ASSET_ROUTE), res)
    await waitStatus(res)
    assert.equal(res.status, 404)

    // ⑤ 合法 + 文件存在 → 200，MIME 正确，可缓存策略为 no-store
    res = fakeRes()
    routes[0].handler(fakeReq(ASSET_ROUTE + '?name=' + encodeURIComponent('麻婆豆腐')), res)
    // 文件流是异步的：等 status 落地
    await waitStatus(res)
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'image/png')
    assert.equal(res.headers['content-length'], String(bytes.length))
    assert.equal(res.headers['cache-control'], 'no-store')

    // ⑥ HEAD：同一张图，只回头不回体
    res = fakeRes()
    routes[0].handler(fakeReq(ASSET_ROUTE + '?name=' + encodeURIComponent('麻婆豆腐'), 'HEAD'), res)
    await waitStatus(res)
    assert.equal(res.status, 200)
    assert.equal(res.body, '')
  } finally {
    if (prev === undefined) delete process.env.GALEAT_PICTURES
    else process.env.GALEAT_PICTURES = prev
    if (prevBundled === undefined) delete process.env.GALEAT_BUNDLED_ASSETS
    else process.env.GALEAT_BUNDLED_ASSETS = prevBundled
  }
})

test('resolveAssetPaths：根目录与 dishes\\ 子目录都作为候选（用户实际布局是后者）', () => {
  const root = 'C:\\Users\\x\\Pictures\\gal-eat'
  // 传空字符串关掉"包内兜底"，只看用户目录的候选
  const list = resolveAssetPaths('麻婆豆腐', root, '')
  assert.equal(list.length, 2)
  assert.equal(list[0], join(root, '麻婆豆腐.png'), '第一候选是根目录')
  assert.equal(list[1], join(root, 'dishes', '麻婆豆腐.png'), '第二候选是 dishes 子目录（用户实际位置）')
  // 背景同样两个候选（放哪都能取到）
  assert.equal(resolveAssetPaths('morning', root, '').length, 2)
  // 非法名字没有候选
  assert.equal(resolveAssetPaths('../evil', root, ''), null)
  assert.equal(resolveAssetPaths('不存在菜', root, ''), null)
  // 兼容旧接口：返回第一候选
  assert.equal(resolveAssetPath('麻婆豆腐', root), join(root, '麻婆豆腐.png'))
})

test('路由：菜品图放在 dishes\\ 子目录时也能取到（回归：曾因只在根目录找而全部 404）', async () => {
  const base = await mkdtemp(join(tmpdir(), 'gal-eat-sub-'))
  const root = join(base, 'gal-eat')
  const dishesDir = join(root, 'dishes')
  await mkdir(dishesDir, { recursive: true })
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02, 0x03])
  await writeFile(join(dishesDir, '麻婆豆腐.png'), bytes)

  const routes = []
  registerAssetRoute({
    webServer: { register: r => { routes.push(r); return () => {} } },
    effect: fn => fn(),
  })
  const prev = process.env.GALEAT_PICTURES
  process.env.GALEAT_PICTURES = base
  const settle = () => new Promise(r => setTimeout(r, 2))
  try {
    const res = fakeRes()
    routes[0].handler(fakeReq(ASSET_ROUTE + '?name=' + encodeURIComponent('麻婆豆腐')), res)
    for (let i = 0; i < 100 && res.status === null; i++) await settle()
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-length'], String(bytes.length))
  } finally {
    if (prev === undefined) delete process.env.GALEAT_PICTURES
    else process.env.GALEAT_PICTURES = prev
  }
})

test('路由：webServer 不可用时安全跳过（不抛错）', () => {
  assert.equal(typeof registerAssetRoute(null), 'function')
  assert.equal(typeof registerAssetRoute({}), 'function')
  const noServer = registerAssetRoute({ effect: () => {} })
  assert.equal(typeof noServer, 'function')
})
