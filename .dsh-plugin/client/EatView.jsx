/** 吃饭页面：美食街流程（§3.6 阶段机的界面层）。
 *
 * 设计（依据 2026-10-08 用户验收反馈最终确定）：
 *  - **对话框与角色立绘都用 gal-view 自己的**：台词经扩展缝的 `setLineOverride` 交给 gal-view 的
 *    对话框显示（自带场景样式/底图、自己的打字机、名牌与立绘）。吃饭页**不再自己画对话框**
 *    —— 自绘版会变成一个大色块，而且拿不到立绘。
 *  - 吃饭页只负责三件事：美食街背景（铺满舞台）、顶部信息条、右侧餐厅/菜单面板。
 *  - 台词**自动推进**：打完停一会儿自动下一条；玩家点舞台也能立刻推进（复用缝的点击事件）。
 *  - 餐厅/菜单靠右、底部留出对话框高度，给左侧立绘让位置；**不加任何遮罩**，避免糊住立绘。
 *
 * 阶段机（纯逻辑在 gal-view 的 eat.mjs，单测覆盖）：
 *   idle ──「去吃饭」──▶ intro（自动念台词）──▶ restaurant ──▶ menu ──▶ verdict ──▶ idle
 */

import React, { useCallback, useEffect, useRef } from 'react'
import { RESTAURANTS, findRestaurant } from '../../gal-view/.dsh-plugin/client/eat.mjs'
import { isDishSoldOut, canAfford, accountingDay } from '../../gal-view/.dsh-plugin/client/game-state.mjs'
import { backgroundKeyNow, backgroundLabel } from './eat-assets.mjs'
import { LINE_DWELL_MS } from './eat-typing.mjs'
import { UI_SCALE, scaleStyle, barZoomStyle } from './hud-layout.mjs'
import { dishGainText } from './eat-info.mjs'

function useSource(source) {
  const [snap, setSnap] = React.useState(() => source.getSnapshot())
  useEffect(() => {
    setSnap(source.getSnapshot())
    return source.subscribe(() => setSnap(source.getSnapshot()))
  }, [source])
  return snap
}

/** 菜品图（没图就退化为纯文字，绝不崩）。 */
function DishThumb({ runtime, name }) {
  const src = runtime.asset(name)
  if (src === null) {
    return <div className="ge-dish-thumb is-empty">{runtime.assetMissing(name) ? '无图' : '…'}</div>
  }
  return <img className="ge-dish-thumb" src={src} alt={name} draggable={false} />
}

export function EatView({ runtime }) {
  const session = useSource(runtime.eatSource)
  const state = useSource(runtime.stateSource)
  const phase = session.phase
  const atStreet = phase !== 'idle'
  const backdropRef = useRef(false)

  // ---- 背景：渲染期兜底（幂等）----
  if (atStreet && !backdropRef.current) {
    backdropRef.current = true
    runtime.applyBackdrop(true)
  }
  useEffect(() => {
    if (atStreet) return undefined
    if (backdropRef.current) {
      backdropRef.current = false
      runtime.applyBackdrop(false)
    }
    return undefined
  }, [atStreet, runtime])

  // ---- 本页要"说"的话（交给 gal-view 的对话框显示）----
  const introLines = Array.isArray(session.introLines) ? session.introLines : []
  const introIndex = session.introIndex
  const restaurant = session.restaurantId !== null ? findRestaurant(session.restaurantId) : null
  const lineForPhase = phase === 'intro'
    ? (introLines[introIndex] ?? '')
    : phase === 'restaurant'
      ? '想吃哪一家？点右边的招牌就行～'
      : phase === 'menu' && restaurant !== null
        ? restaurant.name + '——今天想吃点什么？'
        : phase === 'verdict'
          ? String(session.lastVerdict ?? '')
          : ''

  // 台词经缝写进 gal-view 的对话框（它自己的打字机、名牌、立绘都还在原位）
  useEffect(() => {
    if (lineForPhase !== '') runtime.say(lineForPhase, 'gal-eat:' + phase + ':' + introIndex)
    return undefined
  }, [lineForPhase, phase, introIndex, runtime])

  // 离开吃饭页时撤掉台词覆盖，让对话框回到正常转写
  useEffect(() => () => runtime.clearLine(), [runtime])

  // 开场自动推进：点舞台可立刻推进；没人点就在停留时间后自动进下一句
  useEffect(() => {
    if (phase !== 'intro') return undefined
    const advance = () => runtime.dispatch({ type: 'introNext' })
    const off = runtime.onStageClick(() => advance())
    const timer = setTimeout(advance, LINE_DWELL_MS + 2200)
    return () => { off(); clearTimeout(timer) }
  }, [phase, introIndex, runtime])

  // 进菜单时预取该餐厅菜品图
  useEffect(() => {
    if (phase !== 'menu' || restaurant === null) return
    void runtime.prefetchAssets(restaurant.dishes.map(d => d.name))
  }, [phase, restaurant, runtime])

  const goHome = useCallback(() => runtime.leaveStreet(), [runtime])
  const pickRestaurant = useCallback(id => runtime.dispatch({ type: 'pickRestaurant', restaurantId: id }), [runtime])
  const backToRestaurants = useCallback(() => runtime.dispatch({ type: 'backToRestaurants' }), [runtime])
  const verdictNext = useCallback(() => runtime.leaveStreet(), [runtime])

  const buy = useCallback(dish => {
    const result = runtime.feed(dish)
    if (result.ok) runtime.dispatch({ type: 'dishBought', dish })
    else runtime.setNotice(result.reason ?? '买不了这道菜')
    return result
  }, [runtime])

  if (!atStreet) return null

  const day = accountingDay(Date.now())
  const tickets = state.tickets

  return (
    <div className="ge-eat-layer" data-gal-eat="eat" data-phase={phase}>
      {/* 美食街背景由 gal-view 的 ExtBackdrop 铺（画在所有场景元素之前），
          这样角色立绘与对话框仍在它上面 —— 早前在这里自铺背景会把两者盖住。 */}

      {/* 顶部细条：时段 / 券数 / 回家。
          放大 150% 用 **zoom**（布局级缩放）：这条是 left:0;right:0 铺满舞台的，
          舞台内部宽 1920px；用 transform 放大时只有"视觉"变宽，最左边的标题会被推出舞台。
          zoom 让盒子本身算 1.5 倍宽，内容仍排在框内，左右两侧都不丢。 */}
      <div className="ge-eat-head" style={barZoomStyle(UI_SCALE.eatHead)}>
        <span className="ge-eat-title">美食街 · {backgroundLabel(backgroundKeyNow())}</span>
        <span className="ge-eat-tickets">鲸元券 {tickets}</span>
        <button type="button" className="ge-ghost-btn" onClick={goHome}>今天不吃了，回家</button>
      </div>

      {session.message !== '' && <div className="ge-eat-notice">{session.message}</div>}

      {/* 右侧：餐厅招牌 / 菜单 / 回家（给左侧立绘让位置；底部留出对话框高度）
          用户要求：整体放大到 150%。以**右上角**为原点缩放，面板不会跑出画面。 */}
      <div
        className="ge-eat-right"
        style={{ ...scaleStyle(UI_SCALE.eatRight, {}), transformOrigin: '100% 0', width: 'min(42%, 420px)' }}
      >
        {phase === 'restaurant' && (
          <div className="ge-cards" role="list" aria-label="选一家餐厅">
            {RESTAURANTS.map(r => (
              <button key={r.id} type="button" role="listitem" className="ge-card" onClick={() => pickRestaurant(r.id)}>
                <span className="ge-card-name">{r.name}</span>
                <span className="ge-card-sub">{r.cuisine} · {r.dishes.length} 道菜</span>
                <span className="ge-card-price">{r.dishes[0].price}–{r.dishes[r.dishes.length - 1].price} 券</span>
              </button>
            ))}
          </div>
        )}

        {phase === 'menu' && restaurant !== null && (
          <div className="ge-menu">
            <div className="ge-menu-head">
              <span className="ge-menu-title">{restaurant.name}</span>
              <span className="ge-dim">同一道菜一天只能吃一次</span>
            </div>
            <ul className="ge-dishes">
              {restaurant.dishes.map(d => {
                const dish = { ...d, restaurantId: restaurant.id }
                const soldOut = isDishSoldOut(state, day, restaurant.id, d.name)
                const affordable = canAfford(state, dish)
                const disabled = soldOut || !affordable
                const gainText = dishGainText(d, state.satiety)
                return (
                  <li key={d.name} className="ge-dish">
                    <DishThumb runtime={runtime} name={d.name} />
                    <div className="ge-dish-info">
                      <span className="ge-dish-name">{d.name}</span>
                      <span className="ge-dish-taste">{d.taste}</span>
                    </div>
                    {/* 中间空位写**实际收益**（饱食度按上限夹取，与实际结算同口径） */}
                    <div
                      className="ge-dish-gain"
                      title={'吃下「' + d.name + '」后：' + gainText.satiety + '，' + gainText.affection
                        + (gainText.clamped ? '。当前饱食度较高，实际只会涨到上限（+' + gainText.appliedSatiety + '%）' : '')}
                    >
                      <span className="ge-gain-satiety">{gainText.satiety}</span>
                      <span className="ge-gain-affection">{gainText.affection}</span>
                    </div>
                    <span className="ge-dish-price">{d.price} 券</span>
                    <button
                      type="button"
                      className={'ge-buy' + (disabled ? ' is-disabled' : '')}
                      disabled={disabled}
                      title={soldOut ? '今天已经吃过了' : (affordable ? '购买并吃掉' : '券不够')}
                      onClick={() => buy(dish)}
                    >
                      {soldOut ? '已售罄' : (affordable ? '购买' : '券不够')}
                    </button>
                  </li>
                )
              })}
            </ul>
            <div className="ge-menu-foot">
              <button type="button" className="ge-ghost-btn" onClick={backToRestaurants}>换一家</button>
            </div>
          </div>
        )}

        {phase === 'verdict' && (
          <div className="ge-verdict">
            <button type="button" className="ge-primary-btn" onClick={verdictNext}>吃饱了，回家</button>
          </div>
        )}
      </div>
    </div>
  )
}
