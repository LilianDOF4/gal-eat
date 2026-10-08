// gal-eat 自己的样式（注入一个 <style>，不碰 gal-view 的样式表）。
// 类名一律 ge- 前缀，避免与宿主/其它插件冲突。
// 配色与尺寸来自 §3.5：饱食度橙、好感度粉、券金；条高 10px、爱心圈 52px。

export const CSS = `
/* ---------- HUD 容器（左/右两个舞台覆盖层）---------- */
.ge-hud-left,
.ge-hud-right {
  position: absolute;
  top: 10px;
  display: flex;
  font-family: inherit;
  color: #f2f4ff;
  pointer-events: none;              /* 容器不挡舞台，可交互部件单独开启 */
  --ge-satiety: #ff9f43;
  --ge-affection: #ff6fae;
  --ge-ticket: #ffd479;
}
.ge-hud-left { left: 14px; flex-direction: column; gap: 8px; align-items: flex-start; }
.ge-hud-right { right: 14px; flex-direction: row; gap: 8px; align-items: flex-start; }
.ge-hud-left > *, .ge-hud-right > * { pointer-events: auto; }

/* ---------- 状态条 ----------
   尺寸的**唯一真相源**是 hud-layout.mjs（条高 10 / 标签 12 / 数值 10 / 间隙 2 / 爱心 52），
   组件以内联 style 应用它们；这里的 CSS 只负责观感（圆角/阴影/配色）。改尺寸去改 hud-layout。 */
.ge-stat { min-width: 168px; }
.ge-stat-top {
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  margin-bottom: 2px;
}
.ge-stat-label {
  font-size: 12px; letter-spacing: .5px; color: #e8ecff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, .85);
}
.ge-stat-value {
  font-size: 10px; color: rgba(232, 236, 255, .6);
  font-variant-numeric: tabular-nums;
}
.ge-bar {
  position: relative; width: 100%;
  border-radius: 999px; overflow: hidden;
  background: rgba(8, 10, 22, .66);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .14), 0 2px 6px rgba(0, 0, 0, .4);
}
.ge-bar-fill {
  height: 100%; border-radius: 999px;
  transition: width .25s ease-out;
  box-shadow: 0 0 8px rgba(255, 255, 255, .18);
}

/* ---------- 好感度：爱心等级圈 + 条 ---------- */
.ge-affection-row { display: flex; align-items: center; gap: 8px; }
.ge-heart {
  position: relative; flex: none;
  display: flex; align-items: center; justify-content: center;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, .45));
}
.ge-heart-svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.ge-heart-num {
  position: relative;
  font-size: 18px; font-weight: 700; line-height: 1;
  color: #fff;
  text-shadow: 0 1px 3px rgba(120, 0, 60, .8);
  font-variant-numeric: tabular-nums;
}

/* ---------- 右上角：鲸元券 + 去吃饭 + 眼睛 ---------- */
.ge-ticket {
  display: flex; align-items: center; justify-content: center;
  min-width: 54px; padding: 5px 12px;
  border-radius: 12px;
  background: rgba(14, 16, 32, .72);
  border: 1px solid rgba(255, 212, 121, .35);
  box-shadow: 0 6px 18px rgba(0, 0, 0, .35);
  backdrop-filter: blur(3px);
}
.ge-ticket-num {
  font-size: 22px; font-weight: 700; line-height: 1.05;
  color: var(--ge-ticket);
  text-shadow: 0 0 12px rgba(255, 212, 121, .35);
  font-variant-numeric: tabular-nums;
}
.ge-eat-btn {
  padding: 7px 14px; border-radius: 11px; cursor: pointer;
  font-size: 13px; letter-spacing: .5px;
  color: #2a1a06; font-weight: 700;
  background: linear-gradient(180deg, #ffd479, #f2b23c);
  border: 1px solid rgba(255, 236, 190, .75);
  box-shadow: 0 5px 16px rgba(0, 0, 0, .38);
}
.ge-eat-btn:hover { filter: brightness(1.06); }
.ge-eat-btn:active { transform: translateY(1px); }

.ge-eye {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; padding: 0;
  border-radius: 10px; cursor: pointer;
  color: #cfd6ff;
  background: rgba(14, 16, 32, .72);
  border: 1px solid rgba(143, 123, 255, .35);
  box-shadow: 0 5px 14px rgba(0, 0, 0, .35);
}
.ge-eye:hover { color: #fff; background: rgba(30, 34, 58, .82); }
.ge-eye.is-open { color: #ffe9b0; border-color: rgba(255, 212, 121, .45); }
.ge-eye-solo { position: absolute; top: 10px; right: 14px; pointer-events: auto; opacity: .82; }

/* ---------- 降级提示（没装/装了过旧 gal-view 时）----------
   注意：此时取不到 gal-view 的扩展缝，所以**没有舞台可挂**——
   只能自己往 GAL 视窗根节点里塞一个置顶条。 */
.ge-degraded {
  position: absolute; left: 50%; top: 46px; transform: translateX(-50%);
  z-index: 50; max-width: 560px;
  display: flex; align-items: baseline; gap: 8px;
  padding: 8px 14px; border-radius: 11px;
  font-family: inherit; font-size: 12.5px; line-height: 1.5;
  color: #ffd9a8; text-align: left;
  background: rgba(44, 24, 8, .92);
  border: 1px solid rgba(255, 159, 67, .5);
  box-shadow: 0 10px 26px rgba(0, 0, 0, .45);
  pointer-events: auto;
}
.ge-degraded-title { font-weight: 700; color: #ffe0b0; white-space: nowrap; }
.ge-degraded-close {
  margin-left: auto; border: 0; background: transparent; cursor: pointer;
  color: #d8b489; font-size: 15px; line-height: 1; padding: 0 2px;
}
.ge-degraded-close:hover { color: #fff; }

/* ---------- 吃饭页面（美食街）----------
   设计约束（用户验收反馈）：
   - **不要黑罩子、不要自己画对话框**：对话框与立绘都由 gal-view 自己渲染，本页只加
     顶部信息条 + 右侧餐厅/菜单面板
   - 餐厅/菜单**靠右**排布，给左侧立绘留位置；底部留出对话框高度
   - 背景不在这里画（改由 gal-view 的 ExtBackdrop 铺），否则会盖住立绘与对话框 */
.ge-eat-layer {
  position: absolute; inset: 0;
  font-family: inherit; color: #f6f7ff;
  pointer-events: none;   /* 只有内部可交互部件开启：其余点击透给舞台（可跳过打字/点对话框） */
}
.ge-eat-head, .ge-eat-notice, .ge-eat-right { pointer-events: auto; }
.ge-eat-bg { display: none; }   /* 背景由 gal-view 的 ExtBackdrop 铺 */

/* 吃饭时把场景自己的"家中背景"元素隐掉（美食街背景由 ExtBackdrop 提供），
   避免两张背景叠在一起。舞台上的 data-ext-backdrop 标记由 gal-view 提供。 */
.gv-stage[data-ext-backdrop] .gv-el-background { opacity: 0 !important; }
.ge-eat-head {
  position: absolute; left: 0; right: 0; top: 0; z-index: 3;
  display: flex; align-items: center; gap: 10px;
  padding: 9px 14px;
  background: linear-gradient(180deg, rgba(10, 8, 22, .72), rgba(10, 8, 22, .12));
}
.ge-eat-title { font-size: 13px; letter-spacing: 1px; color: #ffe9b0; text-shadow: 0 1px 4px rgba(0,0,0,.8); }
.ge-eat-tickets {
  margin-left: auto; font-size: 13px; color: #ffd479;
  font-variant-numeric: tabular-nums;
  padding: 2px 10px; border-radius: 9px;
  background: rgba(255, 212, 121, .14); border: 1px solid rgba(255, 212, 121, .35);
}
.ge-eat-notice {
  position: absolute; left: 14px; top: 46px; z-index: 3;
  padding: 6px 12px; border-radius: 10px;
  font-size: 12px; color: #ffd9a8;
  background: rgba(60, 30, 12, .82); border: 1px solid rgba(255, 159, 67, .4);
}
/* 右侧内容区：给左侧立绘让位，底部给 gal-view 对话框让位（否则会被对话框压住） */
.ge-eat-right {
  position: absolute; z-index: 2;
  right: 18px; top: 52px; bottom: 46%;
  width: min(42%, 420px);
  display: flex; flex-direction: column; align-items: flex-end;
  justify-content: flex-start; gap: 8px;
  overflow: auto; padding-right: 2px;
}
.ge-dim { color: rgba(232, 236, 255, .72); font-size: 12px; text-shadow: 0 1px 3px rgba(0,0,0,.8); }
.ge-primary-btn {
  padding: 8px 22px; border-radius: 11px; cursor: pointer;
  font-size: 13px; font-weight: 700; color: #2a1a06;
  background: linear-gradient(180deg, #ffd479, #f2b23c);
  border: 1px solid rgba(255, 236, 190, .75);
  box-shadow: 0 6px 18px rgba(0, 0, 0, .4);
}
.ge-primary-btn:hover { filter: brightness(1.06); }
.ge-ghost-btn {
  padding: 6px 14px; border-radius: 10px; cursor: pointer;
  font-size: 12px; color: #e8ecff;
  background: rgba(18, 20, 38, .72);
  border: 1px solid rgba(143, 123, 255, .38);
}
.ge-ghost-btn:hover { background: rgba(34, 38, 66, .85); }

/* 餐厅选项卡片（单列纵向，靠右排布） */
.ge-cards { display: flex; flex-direction: column; gap: 8px; width: 100%; }
.ge-card {
  width: 100%; padding: 10px 14px; border-radius: 13px; cursor: pointer;
  display: flex; flex-direction: column; gap: 2px; text-align: left;
  color: #f6f7ff;
  background: rgba(14, 16, 34, .84);
  border: 1px solid rgba(143, 123, 255, .38);
  box-shadow: 0 10px 26px rgba(0, 0, 0, .42);
}
.ge-card:hover { border-color: rgba(255, 212, 121, .6); transform: translateY(-1px); }
.ge-card-name { font-size: 15px; font-weight: 700; color: #ffe9b0; }
.ge-card-sub { font-size: 11px; color: rgba(232, 236, 255, .62); }
.ge-card-price { font-size: 11px; color: #ffd479; margin-top: 2px; }

/* 菜单 */
.ge-menu { width: 100%; display: flex; flex-direction: column; gap: 8px; }
.ge-menu-head { display: flex; align-items: baseline; gap: 10px; }
.ge-menu-title { font-size: 16px; font-weight: 700; color: #ffe9b0; letter-spacing: .5px; }
.ge-dishes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.ge-dish {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 10px; border-radius: 12px;
  background: rgba(12, 14, 30, .78);
  border: 1px solid rgba(255, 255, 255, .1);
}
.ge-dish-thumb {
  width: 46px; height: 46px; flex: none; border-radius: 9px; object-fit: cover;
  background: rgba(255, 255, 255, .06);
}
.ge-dish-thumb.is-empty {
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; color: rgba(232, 236, 255, .45);
  border: 1px dashed rgba(255, 255, 255, .18);
}
.ge-dish-info { display: flex; flex-direction: column; min-width: 0; flex: 0 1 auto; }
.ge-dish-name { font-size: 13px; color: #f6f7ff; }
.ge-dish-taste { font-size: 10px; color: rgba(232, 236, 255, .55); }
/* 中间的收益数据：菜品名与价格之间那片空位 */
.ge-dish-gain {
  display: flex; flex-direction: column; gap: 1px;
  flex: 1 1 auto; min-width: 0; padding: 0 8px;
  font-variant-numeric: tabular-nums; line-height: 1.3;
}
.ge-gain-satiety { font-size: 11px; color: #9ff0c0; }
.ge-gain-affection { font-size: 10px; color: #ffb3c8; }
.ge-dish-price { font-size: 12px; color: #ffd479; font-variant-numeric: tabular-nums; flex: none; }
.ge-buy {
  flex: none; padding: 6px 12px; border-radius: 9px; cursor: pointer;
  font-size: 12px; font-weight: 700; color: #2a1a06;
  background: linear-gradient(180deg, #ffb85c, #f08a2c);
  border: 1px solid rgba(255, 220, 170, .7);
}
.ge-buy:hover { filter: brightness(1.06); }
.ge-buy.is-disabled, .ge-buy:disabled {
  cursor: not-allowed; filter: grayscale(.85) brightness(.85); opacity: .75;
}
.ge-menu-foot { display: flex; justify-content: flex-end; }

/* 口味评价 */
.ge-verdict {
  display: flex; flex-direction: column; align-items: flex-end; gap: 10px; text-align: right;
  width: 100%;
}

/* 注：对话框与台词**不使用本插件样式** —— 走 gal-view 自己的对话框
   （经 galview-ext 的 setLineOverride 显示，自带场景样式/底图/名牌/立绘/打字机）。
   早期版本在这里自绘过一个 ge-fake-dlg，实际效果是个大色块且拿不到立绘，已删除。 */
`

