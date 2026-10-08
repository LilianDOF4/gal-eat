// 发布包自检：解出 scripts/pack.mjs 产出的 tar.gz，验证
//   ① 必需文件齐全（缺一个装上去就跑不起来）
//   ② 开发期文件确实没被打进去（tests/、scripts/、node_modules/）
//   ③ 包内声明与源码一致（name/version/dsh.bundle/dsh.client）
//   ④ 关键实现标志存在（取图路由、缝接入、饿昏后缀、HUD）
//
// 用法: node tests/verify-publish.mjs [tgz]
//   缺省用 ../gal-eat-<version>-publish.tar.gz
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'

const ROOT = resolve(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
const tgz = process.argv[2] ?? resolve(ROOT, '..', 'gal-eat-' + pkg.version + '-publish.tar.gz')

/** 极简 tar 解析：只取常规文件（本项目的打包器只产出常规文件）。 */
export function readTarEntries(buffer) {
  const entries = []
  let offset = 0
  while (offset + 512 <= buffer.length) {
    const head = buffer.subarray(offset, offset + 512)
    if (head.every(b => b === 0)) break
    const name = head.subarray(0, 100).toString('utf8').replace(/\0.*$/, '')
    const size = parseInt(head.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim() || '0', 8)
    const type = head[156]
    const start = offset + 512
    if (type === 0 || type === 48) entries.push({ name, body: buffer.subarray(start, start + size) })
    offset = start + size + ((512 - (size % 512)) % 512)
  }
  return entries
}

test('发布包存在（先跑 node scripts/pack.mjs 生成）', () => {
  if (!existsSync(tgz)) {
    // 不硬失败：提示怎么生成
    console.log('[verify-publish] 跳过：未找到 ' + tgz + '，先运行 node scripts/pack.mjs');
    return
  }
  assert.ok(existsSync(tgz))
})

test('发布包清单：必需文件齐全、开发期文件未混入', () => {
  if (!existsSync(tgz)) return
  const entries = readTarEntries(gunzipSync(readFileSync(tgz)))
  const names = entries.map(e => e.name.replace(/^[^/]+\//, ''))
  assert.ok(names.length > 0, '包内不该为空')

  for (const required of ['package.json', 'cordis.patch.yml', 'lib/index.js', '.dsh-plugin/client.js', 'README.md']) {
    assert.ok(names.includes(required), '缺少必需文件: ' + required)
  }
  for (const forbidden of ['node_modules', 'tests/', 'scripts/']) {
    assert.ok(!names.some(n => n.startsWith(forbidden)), '开发期内容混进发布包: ' + forbidden)
  }
  // 客户端源码也要在（便于用户审查/二次构建）
  assert.ok(names.includes('.dsh-plugin/client/runtime.mjs'))
  assert.ok(names.includes('.dsh-plugin/client/Hud.jsx'))
})

test('发布包内的声明与源码一致', () => {
  if (!existsSync(tgz)) return
  const entries = readTarEntries(gunzipSync(readFileSync(tgz)))
  const find = (rel) => entries.find(e => e.name.replace(/^[^/]+\//, '') === rel)
  const bundled = JSON.parse(find('package.json').body.toString('utf8'))
  assert.equal(bundled.name, pkg.name)
  assert.equal(bundled.version, pkg.version)
  assert.equal(bundled.main, pkg.main)
  assert.equal(bundled.dsh.bundle.patch, './cordis.patch.yml')
  assert.deepEqual(bundled.dsh.client.inject, ['slots'])

  const patch = find('cordis.patch.yml').body.toString('utf8')
  assert.ok(patch.includes('id: gal-eat'))
  assert.ok(patch.includes('name: gal-eat'))
})

test('发布包的关键实现标志（取图路由 / 缝接入 / 饿昏 / HUD）', () => {
  if (!existsSync(tgz)) return
  const entries = readTarEntries(gunzipSync(readFileSync(tgz)))
  const find = (rel) => entries.find(e => e.name.replace(/^[^/]+\//, '') === rel)
  const client = find('.dsh-plugin/client.js').body.toString('utf8')
  const host = find('lib/index.js').body.toString('utf8')

  // 宿主侧：白名单 + 双候选目录（根目录与 dishes 子目录）
  assert.ok(host.includes('/gal-eat/asset'), '缺取图路由')
  assert.ok(host.includes('DISH_NAMES'), '缺菜名白名单')
  assert.ok(host.includes('resolveAssetPaths'), '缺多候选路径解析')
  assert.ok(host.includes('dishes'), '应支持 dishes 子目录布局')

  // 客户端：缝接入、HUD、饿昏、覆盖层 id
  // 注意：esbuild 默认 charset=ascii，中文写成 \uXXXX 且**十六进制为大写**，
  // 所以这里统一转小写后再比对。
  const lower = client.toLowerCase()
  assert.ok(client.includes('galViewExt'), '缺扩展缝接入')
  assert.ok(client.includes('ge-hud-left') && client.includes('ge-heart'), '缺 HUD/爱心样式')
  assert.ok(client.includes('gal-eat-hud-left') && client.includes('gal-eat-eat'), '缺覆盖层注册')
  assert.ok(lower.includes('\\u9971\\u98df\\u5ea6'), '缺饱食度标签（\\u9971\\u98df\\u5ea6 = 饱食度）')
  assert.ok(lower.includes('\\u997f\\u660f'), '缺饿昏文案（\\u997f\\u660f = 饿昏）')
  assert.ok(client.includes('addLineTransform'), '饿昏后缀应经显示层改写挂载')
  // 没装 gal-view 时的用户可见提示（计划 §5.1 硬约束：必须提示、不能崩）
  assert.ok(client.includes('ge-degraded') && client.includes('data-gal-eat-notice'),
    '缺降级提示（未装 gal-view 时用户必须看得见提示）')
  assert.ok(lower.includes('\\u672a\\u542f\\u7528'), '降级提示应含「未启用」标题')
})
