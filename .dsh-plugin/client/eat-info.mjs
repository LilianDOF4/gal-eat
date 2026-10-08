// 吃饭相关的展示用派生信息（纯函数，单测覆盖）：
//  1) 菜品在**购买前**就能看到的实际收益（饱食度增量要按饱食度上限夹取，与实际结算一致）
//  2) 两条状态条的鼠标悬停提示词（把 game-state 里的规则写成给玩家看的人话）
//
// 放在 .mjs 里是为了可测：.jsx 组件文件 Node 直接解析不了。

import {
  affectionForPrice,
  bonusAffectionForPrice,
  satietyGainForPrice,
  SATIETY_MAX,
  SATIETY_MS,
  AFFECTION_MS,
  AFFECTION_POINTS_MAX,
  TICKET_MS,
} from '../../gal-view/.dsh-plugin/client/game-state.mjs'

/**
 * 菜品收益预览（与实际结算同口径）。
 * 饱食度要按上限夹取：饱食度 95% 时吃 +20 的菜，实际只涨 5 —— 展示也要写 5，不能写 20。
 *
 * @param {{ price: number }} dish
 * @param {number} satiety 当前饱食度
 * @returns {{ satietyGain: number, affectionGain: number, baseAffection: number, bonusAffection: number, satietyGainIdeal: number }}
 */
export function dishGainPreview(dish, satiety) {
  const price = Number(dish?.price)
  if (!Number.isFinite(price) || price <= 0) {
    return { satietyGain: 0, affectionGain: 0, baseAffection: 0, bonusAffection: 0, satietyGainIdeal: 0 }
  }
  const cur = Number.isFinite(satiety) ? Math.max(0, Math.min(SATIETY_MAX, satiety)) : SATIETY_MAX
  const ideal = satietyGainForPrice(price)
  const applied = Math.min(SATIETY_MAX, cur + ideal) - cur
  const base = affectionForPrice(price)
  const bonus = bonusAffectionForPrice(price)
  return {
    satietyGain: applied,          // 实际会涨多少（按上限夹取）
    satietyGainIdeal: ideal,       // 菜品标称值（满饱食度时两者不同）
    affectionGain: base + bonus,   // 好感 = 基础 + 高价档额外
    baseAffection: base,
    bonusAffection: bonus,
  }
}

/** 菜品收益的一行摘要文字（写进菜单栏中间那片空白）。 */
export function dishGainText(dish, satiety) {
  const g = dishGainPreview(dish, satiety)
  // 默认显示**菜品标称值**（300 券以上一律 +60%），不要显示夹取后的零头 —— 那会让人以为"这道菜只回 42%"。
  // 只有确实会被上限吃掉时才追加一句说明。
  const clamped = g.satietyGainIdeal > 0 && g.satietyGain < g.satietyGainIdeal
  const satietyText = '饱食 +' + g.satietyGainIdeal + '%'
  const aff = g.bonusAffection > 0
    ? '好感 +' + g.affectionGain + '（含高价额外 +' + g.bonusAffection + '）'
    : '好感 +' + g.affectionGain
  return {
    satiety: satietyText,
    affection: aff,
    clamped,                       // true 表示当前饱食度下只能涨到上限
    appliedSatiety: g.satietyGain, // 夹取后的实际增量（供提示词说明用）
    preview: g,
  }
}

const min = ms => Math.round(ms / 60000)

/**
 * 券的速率文案：从 TICKET_MS 推出来（间隔已不足 1 分钟，所以按"每分钟几券"表述）。
 * 2026-10-08 用户要求：1 分钟 → 2 券。
 *
 * ⚠️ 界面上**任何**写券速率的地方都必须调它，不许手写字符串 ——
 * 曾经 Hud.jsx 里硬编码了一句"挂机 1 分钟 = 1 券"，改速率时漏掉了（用户发现）。
 */
export function ticketRateText() {
  const perMinute = 60000 / TICKET_MS
  return Number.isInteger(perMinute) ? '每分钟 +' + perMinute : '每 ' + min(TICKET_MS) + ' 分钟 +1'
}

/** 右上角鲸元券数字的悬停提示（同样从速率常量推出来）。 */
export function ticketTooltip() {
  return '鲸元券：挂机 ' + ticketRateText() + '（关机/睡眠期间不累计）'
}

/** 饱食度条的悬停提示：涨/降规则。 */
export function satietyTooltip() {
  return [
    '饱食度：0–100%',
    '↑ 上涨：吃菜。+20%（100 券）/ +40%（200 券）/ +60%（300 券）/ +80%（400 券）/ +100%（500 券及以上），上限 100%。',
    '↓ 下降：每 ' + min(SATIETY_MS) + ' 分钟 -1%（关机/睡眠期间照常流逝）。',
    '归零会饿昏：回答末尾会带上饿昏的抱怨，并且发不出消息——点「去吃饭」即可恢复。',
  ].join('\n')
}

/** 好感度条的悬停提示：涨/降规则。 */
export function affectionTooltip() {
  const perPoint = min(AFFECTION_MS)
  return [
    '好感度：每 ' + AFFECTION_POINTS_MAX + ' 点为 1 级（爱心里的数字），等级不封顶。',
    '↑ 上涨：' + perPoint + ' 分钟 +1 点；吃菜另加基础好感 = 价格 × 12.5%（向上取整，100 券 → +13、200 券 → +25、300 券 → +38…）。',
    '　　　400 券及以上还有额外好感：400 → +10、500 → +20、600 → +30。',
    '↓ 下降：不会自己掉。好感只增不减，等级只升不降。',
    '（顺带：鲸元券' + ticketRateText() + '，同样是关机/睡眠期间照常累计。）',
  ].join('\n')
}
