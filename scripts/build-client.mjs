// 生成器：.dsh-plugin/client/index.mjs → .dsh-plugin/client.js（bundle 产物，随插件分发）。
// 契约与 gal-view 的 scripts/build-client.mjs 完全一致（官方 __ModuleLoader__.load），
// 差别只有 PLUGIN_ID 与入口目录。
//
// --check 模式在内存生成后与已提交的 client.js 逐字节比对，不一致非零退出——
// 手改生成物禁止（改 client/ 源码，勿改 client.js）。
//
// 'react' 保持 external：运行时经 loader 模块表解析，与宿主渲染器共享同一 React 实例。
// 本插件的 client 源码里直接 import 了 gal-view 的纯逻辑模块（game-state/eat/galview-ext），
// esbuild 会把它们**内联**进本产物，因此运行时不需要 gal-view 的 JS 模块在场。
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..')
const ENTRY = '.dsh-plugin/client/index.mjs'
const OUTPUT = join(ROOT, '.dsh-plugin', 'client.js')
const PLUGIN_ID = 'gal-eat'

/** 平台二进制（绕过 .bin shim 的嵌套 spawn；沙箱禁管道捕获，stdio 全走 inherit）。 */
function platformBinary() {
  const name = process.platform === 'win32' ? 'esbuild.exe' : 'esbuild'
  const pkg = '@esbuild/' + process.platform + '-' + process.arch
  return join(ROOT, 'node_modules', pkg, name)
}

function resolveEsbuildBin() {
  const candidates = [
    platformBinary(),
    join(ROOT, 'node_modules/.bin/esbuild'),
    // 复用 gal-view 里已装好的 esbuild（同一 worktree，避免重复安装依赖）
    join(ROOT, '..', 'gal-view', 'node_modules', '@esbuild', process.platform + '-' + process.arch, platformBinary().split(/[\\/]/).pop()),
    ...(process.env.DSH_CHECKOUT ? [join(process.env.DSH_CHECKOUT, 'node_modules/.bin/esbuild')] : []),
  ]
  for (const p of candidates) {
    try {
      if (statSync(p).isFile()) return p
    } catch {
      // 下一个候选
    }
  }
  return null
}

/** esbuild 是否可用。 */
export function esbuildAvailable() {
  return resolveEsbuildBin() !== null
}

/**
 * 生成 client.js。
 * @param {{ check?: boolean, root?: string }} opts
 * @returns {{ ok: boolean, errors?: string[], skipped?: string }}
 */
export function generate({ check = false, root = ROOT } = {}) {
  const esbuildBin = resolveEsbuildBin()
  if (esbuildBin === null) {
    return { ok: true, skipped: 'esbuild 不可用：在 gal-eat 目录 pnpm install，或在 gal-view 目录保留已装的 esbuild' }
  }
  const tmpDir = mkdtempSync(join(tmpdir(), 'gal-eat-'))
  const tmpOut = join(tmpDir, 'client.js')
  const res = spawnSync(
    esbuildBin,
    [
      ENTRY,
      '--bundle',
      '--format=cjs',
      '--platform=browser',
      '--target=es2020',
      '--external:react',
      '--jsx=transform',
      '--jsx-factory=React.createElement',
      '--jsx-fragment=React.Fragment',
      '--outfile=' + tmpOut,
    ],
    { cwd: root, stdio: 'inherit' },
  )
  if (res.status !== 0) {
    return { ok: false, errors: ['esbuild 失败（exit ' + String(res.status) + '）'] }
  }
  const body = readFileSync(tmpOut, 'utf8')
  const code = Buffer.from(
    'window.__ModuleLoader__.load({\n'
    + '\tid: ' + JSON.stringify(PLUGIN_ID) + ',\n'
    + '\tfactory: (require) => {\n'
    + '\t\tvar module = { exports: {} };\n'
    + '\t\tvar exports = module.exports;\n'
    + body.replace(/\n$/, '')
    + '\n\t\treturn module.exports;\n'
    + '\t}\n'
    + '});\n',
  )
  const outputPath = join(root, '.dsh-plugin', 'client.js')
  if (!check) {
    writeFileSync(outputPath, code)
    return { ok: true, bytes: code.length }
  }
  let committed = null
  try {
    committed = readFileSync(outputPath)
  } catch {
    return { ok: false, errors: [outputPath + ' 不存在：运行 node scripts/build-client.mjs 生成'] }
  }
  if (Buffer.compare(committed, code) !== 0) {
    return { ok: false, errors: ['client.js 与生成器输出不一致：运行 node scripts/build-client.mjs 重新生成（手改生成物禁止）'] }
  }
  return { ok: true }
}

// CLI 入口（被 import 时不执行）。
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const check = process.argv.includes('--check')
  const result = generate({ check })
  if (result.skipped !== undefined) {
    console.log('[build-client] SKIP：' + result.skipped)
    process.exit(0)
  }
  if (!result.ok) {
    for (const e of result.errors ?? []) console.error('[build-client] ' + e)
    process.exit(1)
  }
  console.log(check
    ? '[build-client] client.js 新鲜（--check OK）'
    : '[build-client] client.js 已生成（' + Math.round((result.bytes ?? 0) / 1024) + ' KB）')
}
