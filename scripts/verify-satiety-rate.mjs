// 核验已装产物里的饱食度速率：直接 import desktop profile 里的 game-state 实现，
// 并跑一遍真实推进，确认"每 5 分钟 -1%"。
const DEP = 'file:///C:/Users/13934/.dsh/profiles/desktop/node_modules/'

const gs = await import(DEP + 'gal-view/.dsh-plugin/client/game-state.mjs')

const checks = [
  ['TICKET_MS = 30 秒（每分钟 2 券）', gs.TICKET_MS === 30 * 1000],
  ['1 分钟 → 2 券', gs.advanceGameState(gs.defaultGameState(), 60 * 1000).tickets === 2],
  ['29 秒 → 0 券', gs.advanceGameState(gs.defaultGameState(), 29 * 1000).tickets === 0],
  ['31 秒 → 1 券', gs.advanceGameState(gs.defaultGameState(), 31 * 1000).tickets === 1],
  ['离线 8 小时仍不涨券', gs.advanceGameState(gs.defaultGameState(), 8 * 60 * 60 * 1000, { offline: true }).tickets === 0],
  ['SATIETY_MS = 5 分钟', gs.SATIETY_MS === 5 * 60 * 1000],
  ['4 分钟不扣', gs.advanceGameState(gs.defaultGameState(), 4 * 60 * 1000).satiety === 100],
  ['5 分钟扣 1', gs.advanceGameState(gs.defaultGameState(), 5 * 60 * 1000).satiety === 99],
  ['30 分钟扣 6', gs.advanceGameState(gs.defaultGameState(), 30 * 60 * 1000).satiety === 94],
  ['1 小时扣 12', gs.advanceGameState(gs.defaultGameState(), 60 * 60 * 1000).satiety === 88],
  ['旧速率 4 分钟常量已不存在', gs.SATIETY_MS !== 4 * 60 * 1000],
  // 吃菜饱食度分档（2026-10-08 新增 400 / 500 两档）
  ['100 券 → +20', gs.satietyGainForPrice(100) === 20],
  ['200 券 → +40', gs.satietyGainForPrice(200) === 40],
  ['300 券 → +60', gs.satietyGainForPrice(300) === 60],
  ['400 券 → +80', gs.satietyGainForPrice(400) === 80],
  ['500 券 → +100', gs.satietyGainForPrice(500) === 100],
  ['600 券 → +100', gs.satietyGainForPrice(600) === 100],
]

let bad = 0
for (const [name, ok] of checks) {
  if (!ok) bad += 1
  console.log('  ' + (ok ? 'OK  ' : 'FAIL') + '  ' + name)
}
console.log('  实测 SATIETY_MS =', gs.SATIETY_MS, 'ms =', gs.SATIETY_MS / 60000, '分钟')
console.log(bad === 0 ? '\n饱食度速率核验 ALL OK（每 5 分钟 -1%）' : '\n核验失败 ' + bad + ' 项')
process.exit(bad === 0 ? 0 : 1)
