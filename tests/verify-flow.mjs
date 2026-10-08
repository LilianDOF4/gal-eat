// 真渲染版流程仿真入口：先用 **esbuild 平台二进制**把 tests/verify-flow.jsx 转成 ESM
// 写到同目录临时文件，再 import 它（这样里面的相对 import 能解析到 ./react-double.mjs）。
//
// 为什么不用 esbuild 的 JS API：其 transformSync 会 spawn 一个 service 子进程，
// 在 DSH 沙箱下被 EPERM 拦；而平台二进制以 `stdio: 'inherit'` 直接调用是允许的
// （gal-view 的 scripts/build-client.mjs 就是这个套路）。
//
// 用法: node tests/verify-flow.mjs
import { readFileSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const BIN = fileURLToPath(new URL('../node_modules/@esbuild/win32-x64/esbuild.exe', import.meta.url))
const jsxPath = fileURLToPath(new URL('./verify-flow.jsx', import.meta.url))
const genPath = fileURLToPath(new URL('./.verify-flow.generated.mjs', import.meta.url))

if (!existsSync(BIN)) {
  console.error('[verify-flow] 找不到 esbuild 二进制：' + BIN)
  process.exit(2)
}

const res = spawnSync(BIN, [
  jsxPath,
  '--loader:.jsx=jsx',
  '--format=esm',
  '--jsx=transform',
  '--jsx-factory=React.createElement',
  '--jsx-fragment=React.Fragment',
  '--target=es2022',
  '--outfile=' + genPath,
], { stdio: 'inherit' })

if (res.status !== 0 || !statSync(genPath, { throwIfNoEntry: false })) {
  console.error('[verify-flow] JSX 转换失败（exit ' + String(res.status) + '）')
  process.exit(2)
}

try {
  await import(new URL('./.verify-flow.generated.mjs', import.meta.url).href)
} finally {
  if (existsSync(genPath)) {
    try { rmSync(genPath) } catch { /* 留给下次覆盖 */ }
  }
}
