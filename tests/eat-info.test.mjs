// 吃饭展示派生信息单测：菜品收益预览（与实际结算同口径）+ 两条状态条的悬停提示词。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  dishGainPreview, dishGainText, satietyTooltip, affectionTooltip, ticketRateText, ticketTooltip,
} from '../.dsh-plugin/client/eat-info.mjs'
import { feedWithDish, defaultGameState, TICKET_MS } from '../gal-view/.dsh-plugin/client/game-state.mjs'
import { readFileSync, readdirSync } from 'node:fs'

test('菜品收益预览：各价位与 §3.2 表一致（饱食 20/40/60/80/100，好感 = 价格×12.5% 上取整 + 高价额外）', () => {
  // 空饱食度下看"标称值"
  const at100 = price => dishGainPreview({ price }, 0)
  assert.deepEqual(at100(100), { satietyGain: 20, satietyGainIdeal: 20, affectionGain: 13, baseAffection: 13, bonusAffection: 0 })
  assert.deepEqual(at100(200), { satietyGain: 40, satietyGainIdeal: 40, affectionGain: 25, baseAffection: 25, bonusAffection: 0 })
  assert.deepEqual(at100(300), { satietyGain: 60, satietyGainIdeal: 60, affectionGain: 38, baseAffection: 38, bonusAffection: 0 })
  // 2026-10-08 新增两档：400→+80%、500 及以上→+100%
  assert.equal(at100(400).satietyGainIdeal, 80)
  assert.equal(at100(500).satietyGainIdeal, 100)
  assert.equal(at100(600).satietyGainIdeal, 100)
  // 400 起有额外好感：+10 / +20 / +30
  assert.equal(at100(400).bonusAffection, 10)
  assert.equal(at100(400).affectionGain, 50 + 10)
  assert.equal(at100(500).affectionGain, 63 + 20)
  assert.equal(at100(600).affectionGain, 75 + 30)
})

test('菜品收益预览：饱食度按上限夹取（与实际结算完全一致）', () => {
  // 饱食度 95% 时吃 +20 的菜，实际只涨 5 —— 展示必须写 5，不能写 20
  const p = dishGainPreview({ price: 100 }, 95)
  assert.equal(p.satietyGain, 5)
  assert.equal(p.satietyGainIdeal, 20, '标称值仍是 20（供需要时区分）')
  // 已满 → 0
  assert.equal(dishGainPreview({ price: 300 }, 100).satietyGain, 0)
  // 与真实结算同口径：跑一遍 feedWithDish 对齐
  const state = { ...defaultGameState(), tickets: 999, satiety: 95 }
  const res = feedWithDish(state, { restaurantId: 'western', name: '田园沙拉', price: 100 }, { at: Date.now(), day: '2026-10-08' })
  assert.equal(res.ok, true)
  assert.equal(res.effect.satietyGained, p.satietyGain, '展示值必须等于真实结算值')
})

test('菜品收益预览：脏入参安全（不缺数据就不崩）', () => {
  for (const bad of [{ price: 0 }, { price: -5 }, { price: 'x' }, {}, null, undefined]) {
    const p = dishGainPreview(bad, 50)
    assert.equal(p.satietyGain, 0)
    assert.equal(p.affectionGain, 0)
  }
  // 饱食度非法 → 按满值处理（夹取后为 0），不抛错
  assert.equal(dishGainPreview({ price: 100 }, NaN).satietyGain, 0)
})

test('菜品收益文案：写进菜单栏中间那行', () => {
  const t = dishGainText({ price: 500 }, 0)
  assert.equal(t.satiety, '饱食 +100%')
  assert.equal(t.affection, '好感 +83（含高价额外 +20）')
  const plain = dishGainText({ price: 100 }, 0)
  assert.equal(plain.satiety, '饱食 +20%')
  assert.equal(plain.affection, '好感 +13', '无额外时不显示括号')
})

test('收益文案显示标称值：接近上限时也写标称值，不写夹取后的零头', () => {
  // 用户实测：饱食度 58% 时买 300 券的菜，实际只能涨 42 → 之前显示"饱食 +42%"，
  // 让人误以为"这道菜只回 42%"。现在必须显示标称 60%，另用 clamped 标记说明会被上限吃掉。
  const t = dishGainText({ price: 300 }, 58)
  assert.equal(t.satiety, '饱食 +60%', '显示的应是菜品标称值')
  assert.equal(t.appliedSatiety, 42, '夹取后的实际增量仍如实给出（供提示词说明）')
  assert.equal(t.clamped, true, '应标记会被上限吃掉')
  assert.equal(dishGainText({ price: 300 }, 0).clamped, false, '远离上限时不标记')
  assert.equal(dishGainText({ price: 300 }, 0).appliedSatiety, 60)
  // 逐档标称值（2026-10-08 起：300→+60、400→+80、500 及以上→+100）
  const byPrice = { 100: '+20%', 200: '+40%', 300: '+60%', 320: '+60%', 400: '+80%', 500: '+100%', 600: '+100%', 1000: '+100%' }
  for (const [price, text] of Object.entries(byPrice)) {
    assert.equal(dishGainText({ price: Number(price) }, 0).satiety, '饱食 ' + text, price + ' 券应是 ' + text)
  }
})

test('悬停提示词：两条都写了涨/降规则，且数字来自规则常量', () => {
  const sat = satietyTooltip()
  assert.ok(sat.includes('上涨'), '饱食度提示要有上涨规则')
  assert.ok(sat.includes('下降'), '饱食度提示要有下降规则')
  assert.ok(sat.includes('+20%') && sat.includes('+40%') && sat.includes('+60%'), '要写清各价位增量')
  assert.ok(sat.includes('+80%') && sat.includes('+100%'), '要写清 400/500 券两档新增量')
  assert.ok(sat.includes('每 5 分钟 -1%'), '要写清自然下降速率（2026-10-08 起为 5 分钟）')
  assert.ok(!sat.includes('每 4 分钟'), '提示词不该再写 4 分钟（规则已放宽）')
  assert.ok(sat.includes('饿昏'), '要说明归零后果')
  assert.ok(sat.includes('100%'), '要写上限')

  const aff = affectionTooltip()
  assert.ok(aff.includes('上涨') && aff.includes('下降'))
  assert.match(aff, /10\s*分钟\s*\+1\s*点/, '要写清随时间累积速率')
  assert.match(aff, /价格\s*×\s*12\.5%/, '要写清吃菜基础好感系数')
  assert.ok(aff.includes('+13') && aff.includes('+25') && aff.includes('+38'), '要给具体例子')
  assert.ok(aff.includes('+10') && aff.includes('+20') && aff.includes('+30'), '要写高价档额外好感')
  assert.ok(aff.includes('不会自己掉'), '要说明好感不会自然下降')
  assert.match(aff, /每分钟 \+2/, '券速率应写成"每分钟 +2"（2026-10-08 起）')
})

// ============ 券速率：界面文案必须从常量推出来，不许硬编码 ============

test('券速率文案：从 TICKET_MS 推出来，改常量就自动跟着变', () => {
  assert.equal(ticketRateText(), '每分钟 +2', '每分钟 2 券（TICKET_MS = 30s）')
  assert.equal(60000 / TICKET_MS, 2, '常量本身也应是 30 秒')
  // 右上角鲸元券的悬停提示同样如此
  const tip = ticketTooltip()
  assert.ok(tip.includes('每分钟 +2'), '鲸元券提示词应写每分钟 +2，实际：' + tip)
  assert.ok(!tip.includes('1 券') && !tip.includes('1分钟'), '不该再出现旧的"1 分钟 = 1 券"')
})

test('回归守护：插件源码里不许硬编码券速率（曾漏改过 Hud.jsx 的 title）', () => {
  // 用户实测发现：右上角鲸元券的 title 写死成"挂机 1 分钟 = 1 券"，改速率时漏了。
  // 这里扫全部客户端源码，任何形如"分钟…1 券"的硬编码都直接报出来。
  const dir = new URL('../.dsh-plugin/client/', import.meta.url)
  const files = readdirSync(dir).filter(f => f.endsWith('.jsx') || f.endsWith('.mjs'))
  assert.ok(files.length > 0, '应能找到客户端源码')
  const offenders = []
  for (const file of files) {
    const text = readFileSync(new URL(file, dir), 'utf8')
    for (const [i, line] of text.split('\n').entries()) {
      // 只看字符串字面量里的速率描述（注释里提到历史数字不算）
      const isComment = /^\s*(\/\/|\*|\/\*)/.test(line)
      if (isComment) continue
      if (/分钟\s*[=＝]\s*1\s*券|每\s*1\s*分钟\s*[=＝]?\s*1\s*券|1\s*分钟\s*[=＝]\s*1\s*券/.test(line)) {
        offenders.push(file + ':' + (i + 1) + '  ' + line.trim())
      }
    }
  }
  assert.deepEqual(offenders, [], '发现硬编码的券速率（应改用 eat-info.ticketRateText/ticketTooltip）：\n' + offenders.join('\n'))
})
