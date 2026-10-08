// gal-eat 发布打包器：产出可 `dsh plugin add file:<tgz>` 的 tar.gz，
// 并**排除开发期文件**（tests/、scripts/、node_modules/、.git/），避免把测试与构建脚本分发给网友。
//
// 与 .galview-fork/pack.mjs 的差异：
//   - pack.mjs 是"给我自己部署用"（全量打包，含 tests/scripts）
//   - 本文件是"发到网上用"（发布态裁剪，README + 声明 + 运行所需产物）
//
// 用法：node scripts/pack.mjs [输出文件]
//   默认输出 <插件根>/../../gal-eat-<version>.tar.gz
//
// 安全：打包后**自检**产物清单里不含被排除的目录；包内必须有 package.json / cordis.patch.yml /
// lib/index.js / .dsh-plugin/client.js（缺任何一个装上去都跑不起来）。
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const ROOT = path.resolve(import.meta.dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const outFile = process.argv[2] ?? path.resolve(ROOT, '..', 'gal-eat-' + pkg.version + '.tar.gz')
const prefix = pkg.name + '/'

/** 发布态排除清单（顶层目录名或相对路径）。 */
const EXCLUDE = new Set([
  'node_modules', '.git', 'tests', 'scripts', 'pnpm-lock.yaml', 'package-lock.json',
])
/** 必须存在的文件（缺了装上去跑不起来）。 */
const REQUIRED = ['package.json', 'cordis.patch.yml', 'lib/index.js', '.dsh-plugin/client.js', 'README.md']

function walk(dir, rel = '') {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + '/' + entry.name : entry.name
    if (EXCLUDE.has(entry.name) || EXCLUDE.has(r)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full, r))
    else out.push({ full, rel: r })
  }
  return out
}

function header(name, size) {
  const buf = Buffer.alloc(512)
  buf.write(name, 0, 100, 'utf8')
  buf.write('0000644\0', 100, 8)
  buf.write('0000000\0', 108, 8)
  buf.write('0000000\0', 116, 8)
  buf.write(size.toString(8).padStart(11, '0') + '\0', 124, 12)
  buf.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0', 136, 12)
  buf.write('        ', 148, 8)
  buf.write('0', 156, 1)
  buf.write('ustar\0', 257, 6)
  buf.write('00', 263, 2)
  buf.write('root', 265, 32)
  buf.write('root', 297, 32)
  let sum = 0
  for (const b of buf) sum += b
  buf.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8)
  return buf
}

const files = walk(ROOT).sort((a, b) => a.rel.localeCompare(b.rel))
const names = new Set(files.map(f => f.rel))
const missing = REQUIRED.filter(r => !names.has(r))
if (missing.length > 0) {
  console.error('[pack] 缺少必需文件，拒绝打包：' + missing.join('、'))
  process.exit(1)
}
const leaked = files.filter(f => f.rel.startsWith('tests/') || f.rel.startsWith('scripts/') || f.rel.includes('node_modules/'))
if (leaked.length > 0) {
  console.error('[pack] 排除清单失效，以下文件不该进包：' + leaked.map(f => f.rel).join('、'))
  process.exit(1)
}

const chunks = []
for (const f of files) {
  const data = fs.readFileSync(f.full)
  chunks.push(header(prefix + f.rel, data.length), data)
  const pad = (512 - (data.length % 512)) % 512
  if (pad) chunks.push(Buffer.alloc(pad))
}
chunks.push(Buffer.alloc(1024))
const gz = zlib.gzipSync(Buffer.concat(chunks), { level: 9 })
fs.writeFileSync(outFile, gz)

console.log('[pack] ' + pkg.name + '@' + pkg.version + ' → ' + outFile
  + '（' + files.length + ' 个文件，' + Math.round(gz.length / 1024) + ' KB）')
console.log('[pack] 内容：' + files.map(f => f.rel).sort().join(', '))
