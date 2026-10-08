// gal-eat 单测聚合入口：同进程直接执行（沙箱下 `node --test` 的 spawn 会被 EPERM 拦）。
// 与 gal-view 的 tests/run.mjs 同一套路：主入口运行时自动运行注册的测试。
import './runtime.test.mjs'
import './host.test.mjs'
import './assets.test.mjs'
import './degraded.test.mjs'
import './hud-layout.test.mjs'
import './eat-info.test.mjs'
// 发布包自检（发布包不存在时自动跳过，不会误红）。
import './verify-publish.mjs'
