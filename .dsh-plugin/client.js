window.__ModuleLoader__.load({
	id: "gal-eat",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// .dsh-plugin/client/index.mjs
var index_exports = {};
__export(index_exports, {
  __test: () => __test,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_react3 = __toESM(require("react"), 1);

// ../gal-view/.dsh-plugin/client/game-state.mjs
var TICKET_MS = 30 * 1e3;
var AFFECTION_MS = 10 * 60 * 1e3;
var SATIETY_MS = 5 * 60 * 1e3;
var SATIETY_MAX = 100;
var AFFECTION_POINTS_MAX = 100;
function defaultGameState() {
  return {
    tickets: 0,
    satiety: SATIETY_MAX,
    affectionPoints: 0,
    affectionLevel: 0,
    ticketBankMs: 0,
    affectionBankMs: 0,
    satietyBankMs: 0,
    lastSeenAt: null,
    menuBought: {}
  };
}
function num(value, fallback, min2 = -Infinity, max = Infinity) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min2, n));
}
function int(value, fallback) {
  return Math.floor(num(value, fallback, 0));
}
function normalizeGameState(raw) {
  const base = defaultGameState();
  if (raw === null || typeof raw !== "object") return base;
  const menuBought = {};
  const source = raw.menuBought;
  if (source !== null && typeof source === "object" && !Array.isArray(source)) {
    for (const key of Object.keys(source)) {
      const list = source[key];
      if (!Array.isArray(list)) continue;
      menuBought[key] = list.filter((item) => typeof item === "string" && item !== "");
    }
  }
  return {
    tickets: num(raw.tickets, base.tickets, 0),
    satiety: num(raw.satiety, base.satiety, 0, SATIETY_MAX),
    affectionPoints: int(raw.affectionPoints, base.affectionPoints),
    affectionLevel: int(raw.affectionLevel, base.affectionLevel),
    ticketBankMs: num(raw.ticketBankMs, 0, 0, TICKET_MS),
    affectionBankMs: num(raw.affectionBankMs, 0, 0, AFFECTION_MS),
    satietyBankMs: num(raw.satietyBankMs, 0, 0, SATIETY_MS),
    lastSeenAt: typeof raw.lastSeenAt === "number" && Number.isFinite(raw.lastSeenAt) && raw.lastSeenAt > 0 ? raw.lastSeenAt : null,
    menuBought
  };
}
function applyLevelUps(points, level) {
  let p = int(points, 0);
  let lv = int(level, 0);
  let ups = 0;
  while (p >= AFFECTION_POINTS_MAX) {
    p -= AFFECTION_POINTS_MAX;
    lv += 1;
    ups += 1;
  }
  return { points: p, level: lv, levelUps: ups };
}
function advanceSatiety(satiety, bankMs, elapsedMs) {
  const total = bankMs + elapsedMs;
  const loss = Math.floor(total / SATIETY_MS);
  const nextBank = total - loss * SATIETY_MS;
  return { satiety: Math.max(0, satiety - loss), satietyBankMs: nextBank, lost: loss };
}
function advanceGameState(state, elapsedMs, opts = {}) {
  const s = normalizeGameState(state);
  const elapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  const offline = opts.offline === true;
  const sat = advanceSatiety(s.satiety, s.satietyBankMs, elapsed);
  let tickets = s.tickets;
  let ticketBankMs = s.ticketBankMs;
  let affectionPoints = s.affectionPoints;
  let affectionBankMs = s.affectionBankMs;
  let affectionLevel = s.affectionLevel;
  let levelUps = 0;
  if (!offline && elapsed > 0) {
    const ticketTotal = ticketBankMs + elapsed;
    const gained = Math.floor(ticketTotal / TICKET_MS);
    tickets += gained;
    ticketBankMs = ticketTotal - gained * TICKET_MS;
    const affectionTotal = affectionBankMs + elapsed;
    const points = Math.floor(affectionTotal / AFFECTION_MS);
    affectionBankMs = affectionTotal - points * AFFECTION_MS;
    const leveled = applyLevelUps(affectionPoints + points, affectionLevel);
    affectionPoints = leveled.points;
    affectionLevel = leveled.level;
    levelUps = leveled.levelUps;
  }
  const menuBought = opts.menuDay !== void 0 && opts.menuDay !== null ? pruneMenuBought(s.menuBought, opts.menuDay) : s.menuBought;
  return {
    tickets,
    satiety: sat.satiety,
    affectionPoints,
    affectionLevel,
    ticketBankMs,
    affectionBankMs,
    satietyBankMs: sat.satietyBankMs,
    lastSeenAt: typeof opts.at === "number" && Number.isFinite(opts.at) ? opts.at : s.lastSeenAt,
    menuBought,
    // 本次结算的附带信息（不参与持久化形状，仅调用方展示/记录用）
    lastAdvance: {
      ticketsGained: offline ? 0 : tickets - s.tickets,
      affectionGained: offline ? 0 : affectionPoints + levelUps * AFFECTION_POINTS_MAX - s.affectionPoints,
      satietyLost: sat.lost,
      levelUps,
      offline
    }
  };
}
function affectionForPrice(price) {
  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0) return 0;
  return Math.ceil(p * 0.125);
}
function bonusAffectionForPrice(price) {
  const p = Number(price);
  if (!Number.isFinite(p) || p < 400) return 0;
  return Math.round((p - 300) / 100) * 10;
}
function satietyGainForPrice(price) {
  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0) return 0;
  if (p < 150) return 20;
  if (p < 250) return 40;
  if (p < 350) return 60;
  if (p < 450) return 80;
  return 100;
}
function accountingDay(atMs, offsetHours = 4) {
  const at = typeof atMs === "number" && Number.isFinite(atMs) ? atMs : Date.now();
  const shifted = new Date(at - offsetHours * 60 * 60 * 1e3);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, "0");
  const d = String(shifted.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}
function pruneMenuBought(menuBought, day) {
  const out = {};
  const source = menuBought !== null && typeof menuBought === "object" ? menuBought : {};
  if (Array.isArray(source[day])) out[day] = source[day].filter((k) => typeof k === "string");
  return out;
}
function dishKey(restaurantId, dishName) {
  return String(restaurantId) + "/" + String(dishName);
}
function isDishSoldOut(state, day, restaurantId, dishName) {
  const s = normalizeGameState(state);
  const list = s.menuBought[day];
  if (!Array.isArray(list)) return false;
  return list.includes(dishKey(restaurantId, dishName));
}
function canAfford(state, dish) {
  const s = normalizeGameState(state);
  const price = dish !== null && typeof dish === "object" ? Number(dish.price) : NaN;
  return Number.isFinite(price) && price > 0 && s.tickets >= price;
}
function feedWithDish(state, dish, opts = {}) {
  const s = normalizeGameState(state);
  const day = typeof opts.day === "string" && opts.day !== "" ? opts.day : accountingDay(opts.at);
  if (dish === null || typeof dish !== "object" || typeof dish.name !== "string" || dish.name === "") {
    return { ok: false, state: s, reason: "\u83DC\u54C1\u4E0D\u5B58\u5728" };
  }
  const restaurantId = typeof dish.restaurantId === "string" ? dish.restaurantId : "";
  const price = Number(dish.price);
  if (!Number.isFinite(price) || price <= 0) return { ok: false, state: s, reason: "\u83DC\u54C1\u4EF7\u683C\u975E\u6CD5" };
  if (isDishSoldOut(s, day, restaurantId, dish.name)) return { ok: false, state: s, reason: "\u8FD9\u9053\u83DC\u4ECA\u5929\u5DF2\u7ECF\u5403\u8FC7\u4E86" };
  if (s.tickets < price) return { ok: false, state: s, reason: "\u5238\u4E0D\u591F\u5566\u2026\u2026\u5148\u6302\u4E00\u4F1A\u513F\u673A\u5427\u3002" };
  const base = affectionForPrice(price);
  const bonus = bonusAffectionForPrice(price);
  const leveled = applyLevelUps(s.affectionPoints + base + bonus, s.affectionLevel);
  const satiety = Math.min(SATIETY_MAX, s.satiety + satietyGainForPrice(price));
  const bought = Array.isArray(s.menuBought[day]) ? s.menuBought[day].slice() : [];
  bought.push(dishKey(restaurantId, dish.name));
  const next = {
    ...s,
    tickets: s.tickets - price,
    satiety,
    affectionPoints: leveled.points,
    affectionLevel: leveled.level,
    menuBought: { ...s.menuBought, [day]: bought },
    lastAdvance: {
      ticketsGained: -price,
      affectionGained: base + bonus,
      satietyLost: -(satiety - s.satiety),
      levelUps: leveled.levelUps,
      offline: false
    }
  };
  return {
    ok: true,
    state: next,
    effect: {
      day,
      price,
      baseAffection: base,
      bonusAffection: bonus,
      affectionGained: base + bonus,
      satietyGained: satiety - s.satiety,
      levelUps: leveled.levelUps,
      affectionLevel: leveled.level,
      affectionPoints: leveled.points
    }
  };
}

// ../gal-view/.dsh-plugin/client/eat.mjs
var PHASES = Object.freeze({
  idle: "idle",
  intro: "intro",
  restaurant: "restaurant",
  menu: "menu",
  verdict: "verdict"
});
var EAT_INTRO_LINES = Object.freeze([
  "\u4ECA\u5929\u5403\u4EC0\u4E48\u597D\u5462\uFF1F",
  "\u4ECA\u5929\u8981\u5E26\u6211\u53BB\u54EA\u91CC\u5403\u996D\u5440\uFF1F",
  "\u809A\u5B50\u997F\u5566\uFF0C\u4E3B\u4EBA\u51B3\u5B9A\u5427\uFF5E",
  "\u95FB\u5230\u4E86\u5417\uFF1F\u8FD9\u6761\u8857\u597D\u9999\u54E6\u3002",
  "\uFF08\u5DE6\u770B\u53F3\u770B\uFF09\u6BCF\u4E00\u5BB6\u90FD\u597D\u60F3\u5403\u2026\u2026",
  "\u4ECA\u5929\u60F3\u5403\u91CD\u53E3\u5473\u7684\u8FD8\u662F\u6E05\u6DE1\u7684\uFF1F",
  "\uFF08\u62FD\u8896\u5B50\uFF09\u5FEB\u70B9\u51B3\u5B9A\u5566\uFF0C\u6211\u90FD\u997F\u4E86\u3002",
  "\u8FD9\u6761\u8857\u7684\u706F\u7B3C\u597D\u6F02\u4EAE\u2014\u2014\u5148\u5403\u996D\u8FD8\u662F\u5148\u901B\uFF1F"
]);
var HUNGRY_SUFFIXES = Object.freeze([
  "\u95EE\u9898\u6211\u56DE\u7B54\u4E86\uFF0C\u996D\u5462\uFF1F\u6211\u5FEB\u997F\u6B7B\u4E86\uFF01",
  "\uFF08\u6709\u6C14\u65E0\u529B\uFF09\u6211\u771F\u7684\u5E72\u4E0D\u52A8\u4E86\u2026\u2026",
  "\uFF08\u8DB4\u5728\u684C\u4E0A\uFF09\u809A\u5B50\u5728\u53EB\u4E86\u2026\u2026",
  "\uFF08\u773C\u795E\u6DA3\u6563\uFF09\u996D\u2026\u2026\u6211\u8981\u996D\u2026\u2026",
  "\u7B54\u5B8C\u4E86\uFF0C\u53EF\u6211\u7684\u80C3\u8FD8\u662F\u7A7A\u7684\u3002",
  "\uFF08\u5C0F\u58F0\uFF09\u5148\u7ED9\u6211\u53E3\u996D\u5403\u597D\u4E0D\u597D\u3002"
]);
var NO_TICKET_LINES = Object.freeze([
  "\u5238\u4E0D\u591F\u5566\u2026\u2026\u5148\u6302\u4E00\u4F1A\u513F\u673A\u5427\u3002",
  "\u8FD9\u70B9\u5238\u53EF\u4E70\u4E0D\u8D77\u5440\uFF0C\u4E3B\u4EBA\u3002",
  "\uFF08\u7FFB\u94B1\u5305\uFF09\u6BD4\u6211\u7684\u80C3\u8FD8\u7A7A\u5462\u3002"
]);
var TASTE_PHRASES = Object.freeze({
  \u8FA3: ["\u8FA3\u5F97\u6211\u773C\u6CEA\u90FD\u51FA\u6765\u4E86\uFF0C\u53EF\u662F\u505C\u4E0D\u4E0B\u6765\uFF01", "\u5636\u2014\u2014\u597D\u8FA3\uFF01\u4F46\u771F\u7684\u9999\u3002"],
  \u9EBB\u8FA3: ["\u8FA3\u5F97\u6211\u773C\u6CEA\u90FD\u51FA\u6765\u4E86\uFF0C\u53EF\u662F\u505C\u4E0D\u4E0B\u6765\uFF01", "\u5636\u2014\u2014\u597D\u8FA3\uFF01\u4F46\u771F\u7684\u9999\u3002"],
  \u9EBB: ["\u820C\u5934\u9EBB\u5F97\u8BF4\u4E0D\u51FA\u8BDD\uFF0C\u53EF\u662F\u8FD8\u60F3\u518D\u6765\u4E00\u53E3\u3002"],
  \u9178\u751C: ["\u9178\u9178\u751C\u751C\u7684\uFF0C\u6B63\u662F\u6211\u60F3\u8981\u7684\u5473\u9053\u3002"],
  \u54B8\u9C9C: ["\u54B8\u9999\u4E0B\u996D\uFF0C\u914D\u767D\u996D\u80FD\u5403\u4E09\u7897\u3002"],
  \u54B8\u9999: ["\u54B8\u9999\u4E0B\u996D\uFF0C\u914D\u767D\u996D\u80FD\u5403\u4E09\u7897\u3002"],
  \u6E05\u723D: ["\u6E05\u6E05\u723D\u723D\uFF0C\u5403\u5B8C\u4E00\u70B9\u90FD\u4E0D\u817B\u3002"],
  \u6E05\u6DE1: ["\u6E05\u6E05\u723D\u723D\uFF0C\u5403\u5B8C\u4E00\u70B9\u90FD\u4E0D\u817B\u3002"],
  \u9165\u8106: ["\u5916\u9165\u91CC\u5AE9\uFF0C\u5494\u5693\u5494\u5693\u505C\u4E0D\u4E0B\u6765\u3002"],
  \u9999\u714E: ["\u5916\u76AE\u714E\u5F97\u7126\u9999\uFF0C\u4E00\u53E3\u4E0B\u53BB\u5168\u662F\u6EE1\u8DB3\u3002"],
  \u9ED1\u6912: ["\u9ED1\u6912\u7684\u9999\u6C14\u51B2\u4E0A\u6765\uFF0C\u914D\u8089\u6B63\u597D\u3002"],
  \u5976\u9999: ["\u5976\u9999\u6D53\u6D53\u7684\uFF0C\u5E78\u798F\u611F\u62C9\u6EE1\u3002"],
  \u829D\u58EB: ["\u5976\u9999\u6D53\u6D53\u7684\uFF0C\u5E78\u798F\u611F\u62C9\u6EE1\u3002"],
  \u9C9C: ["\u8FD9\u4E2A\u9C9C\u5473\uFF0C\u503C\u56DE\u7968\u4EF7\u3002"],
  \u591A\u6C41: ["\u4E00\u53E3\u54AC\u4E0B\u53BB\u5168\u662F\u6C41\uFF0C\u592A\u6EE1\u8DB3\u4E86\uFF01"],
  \u8C6A\u8FC8: ["\u8FD9\u4E00\u4EFD\u4E0A\u6765\u6211\u76F4\u63A5\u6123\u4F4F\u4E86\u2014\u2014\u597D\u8C6A\u8FC8\uFF01"],
  // 菜单里实际用到的口味（§4.1.1），各自成池以免落到通用句
  \u849C\u9999: ["\u849C\u9999\u6251\u9F3B\uFF0C\u914D\u4EC0\u4E48\u90FD\u5F88\u4E0B\u996D\u3002"],
  \u5B5C\u7136: ["\u5B5C\u7136\u5473\u4E00\u4E0A\u6765\uFF0C\u5C31\u662F\u8DEF\u8FB9\u644A\u7684\u5FEB\u4E50\u3002"],
  \u871C\u6C41: ["\u751C\u751C\u7684\u871C\u6C41\u88F9\u5728\u5916\u9762\uFF0C\u54AC\u4E00\u53E3\u5C31\u7B11\u4E86\u3002"],
  \u9999\u8FA3: ["\u9999\u8FA3\u5473\u5728\u5634\u91CC\u70B8\u5F00\uFF0C\u8D8A\u5403\u8D8A\u60F3\u5403\u3002"],
  \u751C\u8FA3: ["\u751C\u91CC\u5E26\u8FA3\uFF0C\u8FD9\u4E2A\u7EC4\u5408\u6211\u53EF\u4EE5\u5403\u4E00\u8F88\u5B50\u3002"]
});
var GENERIC_VERDICTS = Object.freeze([
  "\u771F\u597D\u5403\uFF01\u5403\u9971\u4E86\uFF01",
  "\u545C\u2026\u2026\u8FD9\u4E2A\u5473\u9053\u6211\u53EF\u4EE5\u8BB0\u5F88\u4E45\u3002"
]);
var RESTAURANTS = Object.freeze([
  {
    id: "grill-fish",
    name: "\u8D85\u7F8E\u5473\u70E4\u9C7C",
    cuisine: "\u70E4\u9C7C",
    dishes: [
      { price: 100, name: "\u914D\u83DC\u62FC\u76D8", taste: "\u6E05\u723D" },
      { price: 200, name: "\u756A\u8304\u70E4\u9C7C", taste: "\u9178\u751C" },
      { price: 300, name: "\u62DB\u724C\u9999\u8FA3\u70E4\u9C7C", taste: "\u8FA3" },
      { price: 400, name: "\u849C\u9999\u8C46\u8C49\u70E4\u9C7C", taste: "\u54B8\u9C9C" },
      { price: 500, name: "\u9752\u82B1\u6912\u70E4\u9C7C", taste: "\u9EBB" },
      { price: 600, name: "\u8C46\u82B1\u70E4\u9C7C", taste: "\u9C9C" }
    ]
  },
  {
    id: "skewer",
    name: "\u592B\u59BB\u70E4\u4E32\u5E97",
    cuisine: "\u70E7\u70E4",
    dishes: [
      { price: 100, name: "\u70E4\u8304\u5B50", taste: "\u849C\u9999" },
      { price: 200, name: "\u7F8A\u8089\u4E32\u5341\u4E32", taste: "\u5B5C\u7136" },
      { price: 300, name: "\u70E4\u9E21\u7FC5\u56DB\u53EA", taste: "\u871C\u6C41" },
      { price: 400, name: "\u70E4\u751F\u869D\u516D\u53EA", taste: "\u9C9C" },
      { price: 500, name: "\u70E4\u7F8A\u6392", taste: "\u9999\u8FA3" },
      { price: 600, name: "\u70E4\u7F8A\u817F", taste: "\u8C6A\u8FC8" }
    ]
  },
  {
    id: "sichuan",
    name: "\u8001\u674E\u5DDD\u83DC\u9986",
    cuisine: "\u5DDD\u83DC",
    dishes: [
      { price: 100, name: "\u9EBB\u5A46\u8C46\u8150", taste: "\u9EBB\u8FA3" },
      { price: 200, name: "\u9C7C\u9999\u8089\u4E1D", taste: "\u9178\u751C" },
      { price: 300, name: "\u592B\u59BB\u80BA\u7247", taste: "\u9EBB\u8FA3" },
      { price: 400, name: "\u5BAB\u4FDD\u9E21\u4E01", taste: "\u751C\u8FA3" },
      { price: 500, name: "\u56DE\u9505\u8089", taste: "\u54B8\u9999" },
      { price: 600, name: "\u5F00\u6C34\u767D\u83DC", taste: "\u6E05\u6DE1" }
    ]
  },
  {
    id: "western",
    name: "\u8BDD\u6885\u897F\u9910\u5385",
    cuisine: "\u897F\u9910",
    dishes: [
      { price: 100, name: "\u7530\u56ED\u6C99\u62C9", taste: "\u6E05\u723D" },
      { price: 200, name: "\u5976\u6CB9\u8611\u83C7\u6C64", taste: "\u5976\u9999" },
      { price: 300, name: "\u7EA2\u83DC\u6C64", taste: "\u9178\u751C" },
      { price: 400, name: "\u9999\u714E\u5927\u9A6C\u54C8\u9C7C", taste: "\u9999\u714E" },
      { price: 500, name: "\u7F50\u7116\u725B\u8089", taste: "\u54B8\u9999" },
      { price: 600, name: "\u5976\u6CB9\u7EA2\u9ED1\u9C7C\u5B50", taste: "\u9C9C" }
    ]
  },
  {
    id: "fastfood",
    name: "\u80AF\u9EA6\u738B\u5FEB\u9910\u5E97",
    cuisine: "\u5FEB\u9910",
    dishes: [
      { price: 100, name: "\u9EC4\u91D1\u85AF\u6761", taste: "\u9165\u8106" },
      { price: 200, name: "\u53CC\u5C42\u829D\u58EB\u6C49\u5821", taste: "\u829D\u58EB" },
      { price: 300, name: "\u70B8\u9E21\u6876", taste: "\u9165\u8106" },
      { price: 400, name: "\u725B\u8089\u6C49\u5821\u5957\u9910", taste: "\u591A\u6C41" },
      { price: 500, name: "\u5168\u5BB6\u6876", taste: "\u9165\u8106" },
      { price: 600, name: "\u5DE8\u65E0\u9738\u8C6A\u534E\u5957\u9910", taste: "\u591A\u6C41" }
    ]
  }
]);
function findRestaurant(restaurantId) {
  return RESTAURANTS.find((r) => r.id === restaurantId) ?? null;
}
function pickPhrase(pool, random = Math.random, avoid = null) {
  if (!Array.isArray(pool) || pool.length === 0) return "";
  if (pool.length === 1) return pool[0];
  const candidates = avoid === null || avoid === void 0 ? pool : pool.filter((p) => p !== avoid);
  const list = candidates.length > 0 ? candidates : pool;
  const idx = Math.floor(random() * list.length);
  return list[Math.max(0, Math.min(list.length - 1, idx))];
}
function pickIntroLines(opts = {}) {
  const pool = opts.pool ?? EAT_INTRO_LINES;
  const random = opts.random ?? Math.random;
  const count = Number.isInteger(opts.count) && opts.count > 0 ? opts.count : 2;
  const out = [];
  let avoid = opts.avoid ?? null;
  for (let i = 0; i < count && out.length < pool.length; i++) {
    const line = pickPhrase(pool, random, avoid);
    out.push(line);
    avoid = line;
  }
  return out;
}
function tasteKey(taste) {
  const t = typeof taste === "string" ? taste : "";
  if (t === "") return "";
  if (TASTE_PHRASES[t] !== void 0) return t;
  if (t === "\u9EBB\u8FA3") return "\u8FA3";
  if (t === "\u9178\u8FA3") return "\u9178\u751C";
  if (t === "\u6E05\u6DE1") return "\u6E05\u723D";
  return "";
}
function verdictFor(dish, random = Math.random) {
  const name2 = dish !== null && typeof dish === "object" && typeof dish.name === "string" ? dish.name : "\u8FD9\u9053\u83DC";
  const key = tasteKey(dish?.taste);
  const specific = key !== "" ? TASTE_PHRASES[key] : null;
  const useGeneric = specific === null || random() < 0.25;
  const pool = useGeneric ? GENERIC_VERDICTS : specific;
  return name2 + "\u2014\u2014" + pickPhrase(pool, random);
}
function createEatSession() {
  return {
    phase: PHASES.idle,
    introLines: [],
    introIndex: 0,
    restaurantId: null,
    lastVerdict: null,
    /** 最近一次评价/提示（verdict 阶段显示）。 */
    message: ""
  };
}
function eatSessionReduce(session, action) {
  const s = session !== null && typeof session === "object" ? session : createEatSession();
  const a = action !== null && typeof action === "object" ? action : {};
  switch (a.type) {
    case "start": {
      const lines = pickIntroLines({ random: a.random, count: a.count });
      return { ...createEatSession(), phase: PHASES.intro, introLines: lines, introIndex: 0 };
    }
    case "introNext": {
      if (s.phase !== PHASES.intro) return s;
      const next = s.introIndex + 1;
      if (next >= s.introLines.length) {
        return { ...s, phase: PHASES.restaurant, introIndex: s.introLines.length };
      }
      return { ...s, introIndex: next };
    }
    case "pickRestaurant": {
      const id = typeof a.restaurantId === "string" ? a.restaurantId : "";
      if (findRestaurant(id) === null) return s;
      if (s.phase !== PHASES.restaurant && s.phase !== PHASES.menu) return s;
      return { ...s, phase: PHASES.menu, restaurantId: id };
    }
    case "backToRestaurants": {
      if (s.phase !== PHASES.menu) return s;
      return { ...s, phase: PHASES.restaurant, restaurantId: null };
    }
    case "dishBought": {
      if (s.phase !== PHASES.menu) return s;
      const dish = a.dish ?? null;
      const random = typeof a.random === "function" ? a.random : Math.random;
      const line = verdictFor(dish, random);
      return { ...s, phase: PHASES.verdict, lastVerdict: line, message: line };
    }
    case "verdictNext":
      if (s.phase !== PHASES.verdict) return s;
      return createEatSession();
    case "notice": {
      const text = typeof a.text === "string" ? a.text : "";
      return { ...s, message: text };
    }
    case "goHome":
      return createEatSession();
    default:
      return s;
  }
}
function isBlocking(session) {
  const s = session ?? createEatSession();
  return s.phase !== PHASES.idle;
}

// ../gal-view/.dsh-plugin/client/persist.mjs
var LS_KEYS = Object.freeze({
  /** 槽位注册表(旧式会话槽)。数据实为工程级,key 机器级——已知债 C3,面板按前缀过滤。 */
  slots: "gal-view:slots",
  /** 场景设置。数据实为工程级,单 key 跨工程共享——已知债 C3。 */
  scene: "gal-view:scene:v1",
  /** 插件开关(机器级)。 */
  enabled: "gal-view:enabled",
  /** 编辑器面板偏好(机器级)。 */
  editorPanels: "gal-view:editor-panels",
  /** 阅读进度前缀(会话级;key = <readPrefix> 或 <readPrefix>.<scopeKey>)。 */
  readPrefix: "gal-view:read",
  /** 自动存档基线前缀(会话级;key = <autoPrefix>:<sessionId>)。 */
  autoPrefix: "gal-view:auto"
});
var IDB_NAMES = Object.freeze({
  /** 素材库(机器级,表 assets;图片 dataURL 不进 localStorage)。库名沿用历史值。 */
  assetsDb: "gal-view",
  assetsStore: "assets",
  /** 字体库(机器级,表 fonts)。独立库,避免任何版本升级牵连素材库。 */
  fontsDb: "gal-view-fonts",
  fontsStore: "fonts",
  /** 存档目录授权句柄。实为工程级,现单键跨工程——已知债 C4,面板有 mismatch 提示。 */
  fsDb: "gal-view-fs"
});
var IDB_STORES = Object.freeze({
  "gal-view": ["assets"],
  "gal-view-fonts": ["fonts"],
  "gal-view-fs": ["handle"]
});
var IDB_VERSIONS = Object.freeze({
  "gal-view": 1,
  "gal-view-fonts": 1,
  "gal-view-fs": 1
});
var PERSIST_LAYERS = Object.freeze({
  machine: [
    "LS_KEYS.enabled(\u63D2\u4EF6\u5F00\u5173)",
    "LS_KEYS.editorPanels(\u7F16\u8F91\u5668\u9762\u677F\u504F\u597D)",
    "IDB assets/fonts(\u7D20\u6750/\u5B57\u4F53\u5E93,\u8DE8\u5DE5\u7A0B\u5171\u4EAB)"
  ],
  project: [
    "\u573A\u666F\u8BBE\u7F6E(\u5B9E\u4E3A\u5DE5\u7A0B\u7EA7;\u5F53\u524D\u5355 key\u2014\u2014\u503A C3)",
    "\u69FD\u4F4D\u6CE8\u518C\u8868(\u5B9E\u4E3A\u5DE5\u7A0B\u7EA7;\u5F53\u524D\u5355 key\u2014\u2014\u503A C3)",
    "\u5B58\u6863\u76EE\u5F55\u6388\u6743\u53E5\u67C4(\u5B9E\u4E3A\u5DE5\u7A0B\u7EA7;\u5F53\u524D\u5355\u53E5\u67C4\u2014\u2014\u503A C4)"
  ],
  session: [
    "LS_KEYS.readPrefix.<scopeKey>(\u9605\u8BFB\u8FDB\u5EA6)",
    "LS_KEYS.autoPrefix:<sessionId>(\u81EA\u52A8\u5B58\u6863\u57FA\u7EBF)"
  ],
  memory: [
    "sceneSource/historySource/assetsSource/fontsSource \u7B49\u53EF\u89C2\u5BDF\u955C\u50CF",
    "saveLocked(\u5B58\u6863\u4E92\u65A5\u9501)/viewSessionId(\u89C6\u56FE\u6CE8\u5165)/autoSaveSource(\u72B6\u6001\u53D1\u5E03)"
  ]
});

// ../gal-view/.dsh-plugin/client/galview-ext.mjs
var GALVIEW_EXT_VERSION = 1;
function checkGalViewExt(ext) {
  if (ext === null || ext === void 0) {
    return { ok: false, reason: "\u672A\u68C0\u6D4B\u5230 gal-view \u6269\u5C55\u63A5\u53E3\uFF1A\u8BF7\u5148\u5B89\u88C5 gal-view\uFF080.4 \u53CA\u4EE5\u4E0A\uFF09\u63D2\u4EF6" };
  }
  if (typeof ext !== "object") return { ok: false, reason: "gal-view \u6269\u5C55\u63A5\u53E3\u5F62\u72B6\u5F02\u5E38" };
  const version = Number(ext.version);
  if (!Number.isFinite(version)) return { ok: false, reason: "gal-view \u6269\u5C55\u63A5\u53E3\u7F3A\u5C11\u7248\u672C\u53F7" };
  if (version < GALVIEW_EXT_VERSION) {
    return { ok: false, reason: "gal-view \u7248\u672C\u8FC7\u65E7\uFF08\u6269\u5C55\u63A5\u53E3 v" + version + "\uFF0C\u9700\u8981 v" + GALVIEW_EXT_VERSION + "\uFF09\uFF1A\u8BF7\u66F4\u65B0 gal-view", version };
  }
  const required = ["registerStageOverlay", "setLineOverride", "setBackdrop", "addLineTransform", "setBlockReason", "appendHistoryLine"];
  const missing = required.filter((key) => typeof ext[key] !== "function");
  if (missing.length > 0) return { ok: false, reason: "gal-view \u6269\u5C55\u63A5\u53E3\u7F3A\u5C11\u65B9\u6CD5\uFF1A" + missing.join("\u3001"), version };
  return { ok: true, version };
}

// .dsh-plugin/client/eat-assets.mjs
function backgroundKeyForHour(hour) {
  const h = Number.isFinite(hour) ? Math.floor(hour) : 0;
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 17) return "noon";
  return "evening";
}
function backgroundKeyNow(nowMs = Date.now()) {
  return backgroundKeyForHour(new Date(nowMs).getHours());
}
function backgroundLabel(key) {
  if (key === "morning") return "\u6E05\u6668";
  if (key === "noon") return "\u6B63\u5348";
  return "\u591C\u665A";
}
function assetUrl(name2, base = "") {
  return base + "/gal-eat/asset?name=" + encodeURIComponent(String(name2));
}
var FALLBACK_BACKDROP = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#160f2e"/><stop offset="0.55" stop-color="#42215a"/><stop offset="1" stop-color="#8d3f4f"/></linearGradient><linearGradient id="glow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd479" stop-opacity="0.85"/><stop offset="1" stop-color="#ffd479" stop-opacity="0"/></linearGradient></defs><rect width="160" height="90" fill="url(#sky)"/><g fill="#1b1230"><rect x="4" y="34" width="18" height="40"/><rect x="26" y="26" width="14" height="48"/><rect x="44" y="38" width="20" height="36"/><rect x="96" y="28" width="16" height="46"/><rect x="116" y="36" width="18" height="38"/><rect x="138" y="24" width="18" height="50"/></g><g fill="#ffd479" opacity="0.75"><rect x="7" y="38" width="3" height="3"/><rect x="13" y="44" width="3" height="3"/><rect x="29" y="30" width="3" height="3"/><rect x="34" y="38" width="3" height="3"/><rect x="99" y="33" width="3" height="3"/><rect x="105" y="41" width="3" height="3"/><rect x="141" y="29" width="3" height="3"/><rect x="147" y="37" width="3" height="3"/></g><rect y="74" width="160" height="16" fill="#2a1a33"/><g><rect x="14" y="58" width="26" height="16" fill="#5d2a3c"/><rect x="12" y="55" width="30" height="4" fill="#ff9f43"/><rect x="52" y="60" width="30" height="14" fill="#3d2a4f"/><rect x="50" y="57" width="34" height="4" fill="#ff6fae"/><rect x="98" y="59" width="28" height="15" fill="#4a2a35"/><rect x="96" y="56" width="32" height="4" fill="#ffd479"/></g><g fill="#ff6b6b"><circle cx="30" cy="16" r="2.6"/><circle cx="52" cy="12" r="2.6"/><circle cx="74" cy="16" r="2.6"/><circle cx="96" cy="12" r="2.6"/><circle cx="118" cy="16" r="2.6"/><circle cx="140" cy="12" r="2.6"/></g><path d="M0 10 Q40 20 80 10 T160 10" stroke="#3a2140" stroke-width="0.8" fill="none"/><rect width="160" height="90" fill="url(#glow)" opacity="0.35"/></svg>'
);
function createAssetLoader(opts = {}) {
  const baseUrl = typeof opts.baseUrl === "string" ? opts.baseUrl : "";
  const doFetch = typeof opts.fetchImpl === "function" ? opts.fetchImpl : typeof fetch === "function" ? fetch.bind(globalThis) : null;
  const cache = opts.cache instanceof Map ? opts.cache : /* @__PURE__ */ new Map();
  const pending = /* @__PURE__ */ new Map();
  const failed = /* @__PURE__ */ new Set();
  const load = async (name2) => {
    if (typeof name2 !== "string" || name2 === "") return null;
    if (cache.has(name2)) return cache.get(name2);
    if (failed.has(name2)) return null;
    if (doFetch === null) return null;
    if (pending.has(name2)) return pending.get(name2);
    const task = (async () => {
      try {
        const res = await doFetch(assetUrl(name2, baseUrl), { credentials: "same-origin" });
        if (res === null || res === void 0 || res.ok !== true) throw new Error("HTTP " + String(res?.status));
        const blob = await res.blob();
        const dataUrl = await blobToDataUrl(blob);
        cache.set(name2, dataUrl);
        return dataUrl;
      } catch {
        failed.add(name2);
        return null;
      } finally {
        pending.delete(name2);
      }
    })();
    pending.set(name2, task);
    return task;
  };
  return {
    /** 同步读缓存（渲染时用，避免闪烁）。 */
    peek: (name2) => cache.get(name2) ?? null,
    /** 是否已知该素材缺失。 */
    isMissing: (name2) => failed.has(name2),
    /** 异步取图（带缓存/去重）。 */
    load,
    /** 预取一批（进吃饭页面时调用）。 */
    async prefetch(names) {
      const list = Array.isArray(names) ? names : [];
      const results = await Promise.all(list.map((n) => load(n)));
      return results.filter((v) => v !== null).length;
    },
    /** 已缓存的素材快照（供订阅/调试）。 */
    snapshot: () => Object.fromEntries(cache.entries())
  };
}
function blobToDataUrl(blob) {
  if (typeof FileReader === "function") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("FileReader failed"));
      reader.readAsDataURL(blob);
    });
  }
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    const type = typeof blob.type === "string" && blob.type !== "" ? blob.type : "image/png";
    return "data:" + type + ";base64," + btoa(binary);
  });
}
function findSceneAssetId(scene, assetsMap, label) {
  if (scene === null || scene === void 0 || !(assetsMap instanceof Map) || typeof label !== "string" || label === "") return null;
  const elements = Array.isArray(scene.elements) ? scene.elements : [];
  for (const el of elements) {
    if (el === null || typeof el !== "object") continue;
    const text = String(el.text ?? "") + String(el.name ?? "");
    if (!text.includes(label)) continue;
    if (typeof el.assetId === "string" && assetsMap.has(el.assetId)) return el.assetId;
  }
  return null;
}

// .dsh-plugin/client/runtime.mjs
var STORAGE_KEY = "gal-eat:state:v1";
var HUD_KEY = "gal-eat:hud:v1";
var OVERLAY_ID_LEFT = "gal-eat-hud-left";
var OVERLAY_ID_RIGHT = "gal-eat-hud-right";
var THEME = Object.freeze({
  satiety: "#ff9f43",
  affection: "#ff6fae",
  ticket: "#ffd479",
  barHeight: 10,
  heartSize: 52,
  tickMs: 1e3,
  saveEveryMs: 1e4
});
var COLORS = Object.freeze({
  satiety: THEME.satiety,
  affection: THEME.affection,
  ticket: THEME.ticket
});
function createExtBridge(opts = {}) {
  const ctx = opts.ctx ?? null;
  const injected = opts.ext ?? null;
  const assetsMap = opts.assetsMap ?? null;
  const getSceneFallback = opts.getScene ?? null;
  const resolve = () => {
    if (injected !== null && injected !== void 0) return injected;
    if (ctx === null || typeof ctx.get !== "function") return null;
    try {
      return ctx.get("galViewExt") ?? null;
    } catch {
      return null;
    }
  };
  return {
    /** 当前缝实例（每次实时解析：gal-view 可能晚于本插件装配）。 */
    ext: resolve,
    /** 探测结果：{ ok, reason?, version? }。 */
    probe() {
      return checkGalViewExt(resolve());
    },
    /** 只读场景：优先问缝，其次用注入的兜底。 */
    scene() {
      const ext = resolve();
      if (ext !== null && typeof ext.getScene === "function") {
        const fromExt = ext.getScene();
        if (fromExt !== null && fromExt !== void 0) return fromExt;
      }
      return typeof getSceneFallback === "function" ? getSceneFallback() : null;
    },
    /** 只读素材库（Map<id, {dataUrl}> 或 null）：优先问缝，其次用注入的兜底。 */
    assets() {
      const ext = resolve();
      if (ext !== null && typeof ext.getAssets === "function") {
        const fromExt = ext.getAssets();
        if (fromExt instanceof Map) return fromExt;
      }
      return assetsMap;
    }
  };
}
function createSource(initial) {
  let value = initial;
  const listeners = /* @__PURE__ */ new Set();
  const emit = () => {
    for (const fn of [...listeners]) {
      try {
        fn();
      } catch (error) {
        console.warn("[gal-eat] \u8BA2\u9605\u56DE\u8C03\u629B\u9519\uFF08\u5DF2\u5FFD\u7565\uFF09:", error);
      }
    }
  };
  return {
    getSnapshot: () => value,
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    set(next) {
      if (next === value) return;
      value = next;
      emit();
    },
    update(patch) {
      value = { ...value, ...patch };
      emit();
    }
  };
}
function initialStateFrom(raw) {
  const base = defaultGameState();
  if (raw === null || typeof raw !== "object") return base;
  return normalizeGameState({ ...base, ...raw });
}
function catchUpOnLoad(raw, nowMs) {
  const state = initialStateFrom(raw);
  if (state.lastSeenAt === null || !Number.isFinite(nowMs)) {
    return { state: { ...state, lastSeenAt: nowMs }, offlineGapMs: 0 };
  }
  const gap = Math.max(0, nowMs - state.lastSeenAt);
  if (gap <= 0) return { state: { ...state, lastSeenAt: nowMs }, offlineGapMs: 0 };
  const next = advanceGameState(state, gap, { offline: true, at: nowMs, menuDay: accountingDay(nowMs) });
  return { state: { ...next, lastSeenAt: nowMs }, offlineGapMs: gap };
}
function tickState(state, elapsedMs, nowMs) {
  return advanceGameState(state, elapsedMs, { at: nowMs, menuDay: accountingDay(nowMs) });
}
function defaultHudPrefs() {
  return { visible: true };
}
function normalizeHudPrefs(raw) {
  if (raw === null || typeof raw !== "object") return defaultHudPrefs();
  return { visible: raw.visible !== false };
}
function hudVisibleFor(hudPrefs, phase) {
  const prefs = normalizeHudPrefs(hudPrefs);
  return prefs.visible === true && phase === "idle";
}
var HUNGRY_SATIETY = 0;
function isHungry(state) {
  const s = state !== null && typeof state === "object" ? state : {};
  return Number(s.satiety) <= HUNGRY_SATIETY;
}
function appendHungrySuffix(text, opts = {}) {
  const body = typeof text === "string" ? text : "";
  const pool = opts.pool ?? HUNGRY_SUFFIXES;
  const line = pickPhrase(pool, opts.random ?? Math.random, opts.avoid ?? null);
  if (line === "") return body;
  return body === "" ? line : body + "\n" + line;
}
function blockReasonFor(session, state) {
  if (isBlocking(session)) {
    return { mode: "eat", reason: "\u5403\u996D\u4E2D\u2026\u2026\u5148\u966A\u6211\u5403\u5B8C\u8FD9\u987F\u5427", stageOwned: true };
  }
  if (isHungry(state)) {
    return { mode: "hungry", reason: "\u997F\u660F\u4E86\u2026\u2026\u5148\u7ED9\u6211\u53E3\u996D\u5403", stageOwned: false };
  }
  return { mode: "none", reason: null, stageOwned: false };
}
function createEatRuntime(opts = {}) {
  const now = typeof opts.now === "function" ? opts.now : () => Date.now();
  const storage = opts.storage !== void 0 ? opts.storage : typeof window !== "undefined" ? window.localStorage : null;
  const tickMs = Number.isFinite(opts.tickMs) ? opts.tickMs : THEME.tickMs;
  const saveEveryMs = Number.isFinite(opts.saveEveryMs) ? opts.saveEveryMs : THEME.saveEveryMs;
  const bridge = createExtBridge({
    ctx: opts.ctx ?? null,
    ext: opts.ext ?? null,
    assetsMap: opts.assetsMap ?? null,
    getScene: opts.getScene ?? null
  });
  const assets = createAssetLoader({
    baseUrl: typeof opts.assetBaseUrl === "string" ? opts.assetBaseUrl : "",
    fetchImpl: opts.fetchImpl,
    cache: opts.assetCache
  });
  const assetTickSource = createSource({ seq: 0 });
  const notifyAssets = () => assetTickSource.update({ seq: assetTickSource.getSnapshot().seq + 1 });
  let loaded = { state: defaultGameState(), offlineGapMs: 0 };
  try {
    const raw = storage !== null && typeof storage.getItem === "function" ? storage.getItem(STORAGE_KEY) : null;
    loaded = catchUpOnLoad(raw === null ? null : JSON.parse(raw), now());
  } catch (error) {
    console.warn("[gal-eat] \u8BFB\u53D6\u5B58\u6863\u5931\u8D25\uFF0C\u4F7F\u7528\u521D\u59CB\u72B6\u6001:", error);
    loaded = catchUpOnLoad(null, now());
  }
  const stateSource = createSource({ ...loaded.state, eat: createEatSession() });
  const storageSource = createSource({ available: storage !== null, lastSavedAt: null, offlineGapMs: loaded.offlineGapMs });
  const eatSource = createSource(stateSource.getSnapshot().eat);
  let hudPrefs = defaultHudPrefs();
  try {
    const rawHud = storage !== null && typeof storage.getItem === "function" ? storage.getItem(HUD_KEY) : null;
    if (rawHud !== null) hudPrefs = normalizeHudPrefs(JSON.parse(rawHud));
  } catch (error) {
    console.warn("[gal-eat] \u8BFB\u53D6 HUD \u504F\u597D\u5931\u8D25\uFF0C\u7528\u9ED8\u8BA4\u503C:", error);
  }
  const hudSource = createSource({ ...hudPrefs, visible: hudVisibleFor(hudPrefs, "idle") });
  const persistHud = () => {
    if (storage === null || typeof storage.setItem !== "function") return false;
    try {
      storage.setItem(HUD_KEY, JSON.stringify(hudPrefs));
      return true;
    } catch (error) {
      console.warn("[gal-eat] \u5199\u5165 HUD \u504F\u597D\u5931\u8D25:", error);
      return false;
    }
  };
  const syncHudVisibility = (phase) => {
    hudSource.set({ ...hudPrefs, visible: hudVisibleFor(hudPrefs, phase ?? eatSource.getSnapshot().phase) });
  };
  let lastTickAt = now();
  let lastSaveAt = lastTickAt;
  let tickTimer = null;
  const persist = () => {
    if (storage === null || typeof storage.setItem !== "function") return false;
    try {
      const snap = stateSource.getSnapshot();
      const { eat, ...persistable } = snap;
      storage.setItem(STORAGE_KEY, JSON.stringify(persistable));
      storageSource.update({ lastSavedAt: now() });
      return true;
    } catch (error) {
      console.warn("[gal-eat] \u5199\u5165\u5B58\u6863\u5931\u8D25:", error);
      return false;
    }
  };
  const applyState = (next) => {
    stateSource.set({ ...next, eat: stateSource.getSnapshot().eat });
  };
  const advanceTo = (at) => {
    const since = Math.max(0, at - lastTickAt);
    lastTickAt = at;
    if (since === 0) return;
    applyState(tickState(stateSource.getSnapshot(), since, at));
  };
  const setEat = (next) => {
    eatSource.set(next);
    stateSource.set({ ...stateSource.getSnapshot(), eat: next });
    syncHudVisibility(next.phase);
  };
  let extReady = false;
  const ensureExtHooks = () => {
    if (extReady) return;
    if (bridge.ext() === null) return;
    extReady = true;
    installHungrySuffix();
  };
  if (opts.autoTick !== false && typeof setInterval === "function") {
    tickTimer = setInterval(() => {
      const at = now();
      advanceTo(at);
      if (!extReady) ensureExtHooks();
      syncBlock();
      if (at - lastSaveAt >= saveEveryMs) {
        lastSaveAt = at;
        persist();
      }
    }, tickMs);
    if (typeof tickTimer === "object" && tickTimer !== null && typeof tickTimer.unref === "function") tickTimer.unref();
  }
  const onHide = () => {
    advanceTo(now());
    persist();
  };
  const hasWindow = typeof window !== "undefined" && typeof window.addEventListener === "function";
  if (hasWindow) {
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
  }
  const syncBlock = () => {
    const ext = bridge.ext();
    if (ext === null || typeof ext.setBlockReason !== "function") return false;
    const { reason, stageOwned } = blockReasonFor(eatSource.getSnapshot(), stateSource.getSnapshot());
    ext.setBlockReason(reason, { stageOwned });
    return true;
  };
  const installHungrySuffix = () => {
    const ext = bridge.ext();
    if (ext === null || typeof ext.addLineTransform !== "function") return false;
    let lastSuffix = null;
    ext.addLineTransform((text, context) => {
      if (context !== null && typeof context === "object" && context.kind === "player") return text;
      if (!isHungry(stateSource.getSnapshot())) return text;
      if (typeof text === "string" && HUNGRY_SUFFIXES.some((line) => text.includes(line))) return text;
      const next = appendHungrySuffix(text, { avoid: lastSuffix });
      const added = next.slice(typeof text === "string" ? text.length : 0).replace(/^\n/, "");
      if (added !== "") lastSuffix = added;
      return next;
    });
    return true;
  };
  const assetOf = (name2) => {
    const hit = assets.peek(name2);
    if (hit !== null) return hit;
    void assets.load(name2).then((v) => {
      if (v !== null) notifyAssets();
    });
    return null;
  };
  const currentBackdrop = () => {
    const key = backgroundKeyNow(now());
    const sceneAssets = bridge.assets();
    const sceneId = findSceneAssetId(bridge.scene(), sceneAssets, backgroundLabel(key));
    if (sceneId !== null && sceneAssets instanceof Map) {
      const record = sceneAssets.get(sceneId);
      if (record !== void 0 && typeof record.dataUrl === "string") return record.dataUrl;
    }
    const fromDisk = assetOf(key);
    return fromDisk !== null ? fromDisk : FALLBACK_BACKDROP;
  };
  const applyBackdrop = (on) => {
    const ext = bridge.ext();
    if (ext === null || typeof ext.setBackdrop !== "function") return false;
    ext.setBackdrop(on ? { dataUrl: currentBackdrop() } : null);
    return true;
  };
  const clearLine = () => {
    const ext = bridge.ext();
    if (ext !== null && typeof ext.setLineOverride === "function") ext.setLineOverride(null);
  };
  const dispatch = (action) => {
    const before = eatSource.getSnapshot();
    const next = eatSessionReduce(before, action);
    if (next !== before) {
      setEat(next);
      syncBlockToExt();
    }
    return next;
  };
  const syncBlockToExt = () => {
    ensureExtHooks();
    return syncBlock();
  };
  ensureExtHooks();
  return {
    stateSource,
    eatSource,
    storageSource,
    hudSource,
    assetTickSource,
    THEME,
    /** 当前缝（可能为 null）。 */
    ext: () => bridge.ext(),
    /** 缝探测结果（降级提示用）。 */
    probe: () => bridge.probe(),
    /** 只读场景（缝 → 注入兜底）。 */
    scene: () => bridge.scene(),
    /** 只读素材库（Map 或 null）。 */
    assetsMap: () => bridge.assets(),
    /**
     * 取一张素材的 dataURL（同步返回缓存，未就绪时返回 null 并后台加载）。
     * 调用方拿到 null 就用兜底（背景 = 内置矢量夜市图；菜品 = 纯文字）。
     */
    asset: assetOf,
    /** 预取一组素材（进吃饭页面时调用）。 */
    prefetchAssets(names) {
      return assets.prefetch(names).then((n) => {
        if (n > 0) notifyAssets();
        return n;
      });
    },
    /** 该素材是否已确认缺失（菜单据此显示"无图"态）。 */
    assetMissing: (name2) => assets.isMissing(name2),
    /**
     * 当前时段的背景：优先场景素材库（用户导入过），其次宿主路由图，
     * 都没有时返回内置矢量夜市图（**绝不空着**）。
     */
    currentBackdrop,
    /** 眼睛开关：切换 HUD 显隐（只影响显示，数值照常结算）。 */
    toggleEye() {
      hudPrefs = { ...hudPrefs, visible: !(hudPrefs.visible === true) };
      persistHud();
      syncHudVisibility();
      return hudPrefs.visible === true;
    },
    /** 眼睛状态（true = 显示）。 */
    eyeOpen: () => hudPrefs.visible === true,
    /** 当前 HUD 是否可见（眼睛开 且 不在吃饭阶段）。 */
    hudVisible: () => hudSource.getSnapshot().visible === true,
    /** 立刻落盘。 */
    save: persist,
    /**
     * 测试用：直接增/减券（正数加券、负数扣券，下限 0），并立刻落盘。
     * 只为验收/调试方便，不改动正常结算规则。
     * @param {number} amount
     * @returns {number} 调整后的券数
     */
    grant(amount = 100) {
      const n = Number(amount);
      const cur = stateSource.getSnapshot();
      if (!Number.isFinite(n) || n === 0) return cur.tickets;
      const next = normalizeGameState({ ...cur, tickets: Math.max(0, Math.round(cur.tickets + n)) });
      applyState(next);
      persist();
      return stateSource.getSnapshot().tickets;
    },
    /**
     * 测试用：把饱食度设为指定值（默认 0 → 立刻饿昏，方便验收饿昏表现）。
     * @param {number} value 0..100
     */
    setSatiety(value = 0) {
      const v = Number(value);
      const cur = stateSource.getSnapshot();
      const next = normalizeGameState({ ...cur, satiety: Number.isFinite(v) ? v : 0 });
      applyState(next);
      syncBlockToExt();
      persist();
      return stateSource.getSnapshot().satiety;
    },
    /** 吃一道菜（走 game-state 规则；失败返回原因且状态不变）。 */
    feed(dish) {
      const at = now();
      advanceTo(at);
      const result = feedWithDish(stateSource.getSnapshot(), dish, { at });
      if (result.ok) applyState(result.state);
      return result;
    },
    /** 吃饭阶段机（见 createEatRuntime 顶部说明）。 */
    dispatch,
    /**
     * 进美食街：换背景 + 置为给定阶段。
     * 放在**事件处理器里**调用，而不是只靠组件 effect —— effect 若被延迟/跳过，
     * 就会重现"点了去吃饭、输入框被禁、背景却没换"的观感（首版真实事故）。
     */
    enterStreet(action = { type: "start" }) {
      const next = dispatch(action);
      if (next.phase !== "idle") applyBackdrop(true);
      return next;
    },
    /** 离开美食街：撤台词 + 恢复家中背景 + 解除封锁（同样在事件里调用，立刻生效）。 */
    leaveStreet() {
      const next = dispatch({ type: "goHome" });
      clearLine();
      applyBackdrop(false);
      syncBlockToExt();
      return next;
    },
    /** 显示一条提示（例如"券不够啦…"），不改变阶段。 */
    setNotice(text) {
      return dispatch({ type: "notice", text: typeof text === "string" ? text : "" });
    },
    /** 是否处于饿昏状态（饱食度 = 0，§3.3）。 */
    hungry: () => isHungry(stateSource.getSnapshot()),
    /** 当前封锁模式与原因（'eat' / 'hungry' / 'none'）。 */
    blockMode: () => blockReasonFor(eatSource.getSnapshot(), stateSource.getSnapshot()),
    /** 按当前阶段同步「是否封锁」到扩展缝（§3.7）。 */
    syncBlockToExt,
    /** 进入/退出吃饭时把舞台背景换成美食街 / 换回家中背景（§3.6）。 */
    applyBackdrop,
    /** 舞台点击订阅（"点击继续"节奏）。无缝时返回 noop。 */
    onStageClick(fn) {
      const ext = bridge.ext();
      if (ext === null || typeof ext.onStageClick !== "function") return () => {
      };
      return ext.onStageClick(fn);
    },
    /**
     * 把一句台词交给 gal-view 的对话框显示（**走它自己的打字机节奏**）。
     * **不写历史面板**（用户要求：吃饭页文本不进历史），只做显示。
     * 缝不可用或方法缺失时安全返回 false（不抛错）。
     */
    say(text, key = "gal-eat") {
      const line = typeof text === "string" ? text : "";
      const ext = bridge.ext();
      if (ext === null) return false;
      if (typeof ext.setLineOverride !== "function") return false;
      ext.setLineOverride({ text: line, key, kind: "assistant" });
      return true;
    },
    /** 撤掉台词覆盖（回家前调用，让对话框回到正常转写）。 */
    clearLine,
    /** 手动推进时间（测试/调试用）。 */
    advanceTo,
    /** 解除封锁（退出吃饭/停用插件时调用）。 */
    releaseBlock() {
      const ext = bridge.ext();
      if (ext !== null && typeof ext.setBlockReason === "function") ext.setBlockReason(null);
    },
    dispose() {
      if (tickTimer !== null) clearInterval(tickTimer);
      tickTimer = null;
      persist();
      if (hasWindow) {
        window.removeEventListener("pagehide", onHide);
        document.removeEventListener("visibilitychange", onHide);
      }
    }
  };
}

// .dsh-plugin/client/Hud.jsx
var import_react = __toESM(require("react"), 1);

// .dsh-plugin/client/hud-layout.mjs
var HUD_GEO = Object.freeze({
  left: Object.freeze({ top: 10, left: 14, anchor: "left" }),
  right: Object.freeze({ top: 10, right: 14, anchor: "right" })
});
var STAT_GEO = Object.freeze({
  barHeight: 10,
  labelGap: 2,
  // 标签与条之间的间隙
  labelFontSize: 12,
  valueFontSize: 10,
  // 条右侧的小号数值（弱化）
  minWidth: 168
});
var HEART_GEO = Object.freeze({
  size: 52,
  gap: 8
  // 爱心与条之间的间隙
});
function statStack(barHeight = STAT_GEO.barHeight) {
  const h = Number.isFinite(barHeight) ? barHeight : STAT_GEO.barHeight;
  const labelTop = 0;
  const barTop = labelTop + STAT_GEO.labelFontSize + STAT_GEO.labelGap;
  return { labelTop, barTop, barHeight: h, totalHeight: barTop + h };
}
function leftPanelOrder() {
  return ["satiety", "affection"];
}
var UI_SCALE = Object.freeze({
  hudLeft: 2,
  hudRight: 2,
  eatRight: 1.5,
  /** 吃饭页顶部条（美食街·时段 / 鲸元券 / 今天不吃了回家）。 */
  eatHead: 1.5
});
function scaleStyle(scale, inset = {}) {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  if (s === 1) return {};
  const style = { transform: "scale(" + s + ")", transformOrigin: "0 0" };
  if (Number.isFinite(inset.top)) style.top = inset.top / s + "px";
  if (Number.isFinite(inset.left)) style.left = inset.left / s + "px";
  return style;
}
function barZoomStyle(scale) {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  if (s === 1) return {};
  return { zoom: String(s) };
}

// .dsh-plugin/client/eat-info.mjs
function dishGainPreview(dish, satiety) {
  const price = Number(dish?.price);
  if (!Number.isFinite(price) || price <= 0) {
    return { satietyGain: 0, affectionGain: 0, baseAffection: 0, bonusAffection: 0, satietyGainIdeal: 0 };
  }
  const cur = Number.isFinite(satiety) ? Math.max(0, Math.min(SATIETY_MAX, satiety)) : SATIETY_MAX;
  const ideal = satietyGainForPrice(price);
  const applied = Math.min(SATIETY_MAX, cur + ideal) - cur;
  const base = affectionForPrice(price);
  const bonus = bonusAffectionForPrice(price);
  return {
    satietyGain: applied,
    // 实际会涨多少（按上限夹取）
    satietyGainIdeal: ideal,
    // 菜品标称值（满饱食度时两者不同）
    affectionGain: base + bonus,
    // 好感 = 基础 + 高价档额外
    baseAffection: base,
    bonusAffection: bonus
  };
}
function dishGainText(dish, satiety) {
  const g = dishGainPreview(dish, satiety);
  const clamped = g.satietyGainIdeal > 0 && g.satietyGain < g.satietyGainIdeal;
  const satietyText = "\u9971\u98DF +" + g.satietyGainIdeal + "%";
  const aff = g.bonusAffection > 0 ? "\u597D\u611F +" + g.affectionGain + "\uFF08\u542B\u9AD8\u4EF7\u989D\u5916 +" + g.bonusAffection + "\uFF09" : "\u597D\u611F +" + g.affectionGain;
  return {
    satiety: satietyText,
    affection: aff,
    clamped,
    // true 表示当前饱食度下只能涨到上限
    appliedSatiety: g.satietyGain,
    // 夹取后的实际增量（供提示词说明用）
    preview: g
  };
}
var min = (ms) => Math.round(ms / 6e4);
function ticketRateText() {
  const perMinute = 6e4 / TICKET_MS;
  return Number.isInteger(perMinute) ? "\u6BCF\u5206\u949F +" + perMinute : "\u6BCF " + min(TICKET_MS) + " \u5206\u949F +1";
}
function ticketTooltip() {
  return "\u9CB8\u5143\u5238\uFF1A\u6302\u673A " + ticketRateText() + "\uFF08\u5173\u673A/\u7761\u7720\u671F\u95F4\u4E0D\u7D2F\u8BA1\uFF09";
}
function satietyTooltip() {
  return [
    "\u9971\u98DF\u5EA6\uFF1A0\u2013100%",
    "\u2191 \u4E0A\u6DA8\uFF1A\u5403\u83DC\u3002+20%\uFF08100 \u5238\uFF09/ +40%\uFF08200 \u5238\uFF09/ +60%\uFF08300 \u5238\uFF09/ +80%\uFF08400 \u5238\uFF09/ +100%\uFF08500 \u5238\u53CA\u4EE5\u4E0A\uFF09\uFF0C\u4E0A\u9650 100%\u3002",
    "\u2193 \u4E0B\u964D\uFF1A\u6BCF " + min(SATIETY_MS) + " \u5206\u949F -1%\uFF08\u5173\u673A/\u7761\u7720\u671F\u95F4\u7167\u5E38\u6D41\u901D\uFF09\u3002",
    "\u5F52\u96F6\u4F1A\u997F\u660F\uFF1A\u56DE\u7B54\u672B\u5C3E\u4F1A\u5E26\u4E0A\u997F\u660F\u7684\u62B1\u6028\uFF0C\u5E76\u4E14\u53D1\u4E0D\u51FA\u6D88\u606F\u2014\u2014\u70B9\u300C\u53BB\u5403\u996D\u300D\u5373\u53EF\u6062\u590D\u3002"
  ].join("\n");
}
function affectionTooltip() {
  const perPoint = min(AFFECTION_MS);
  return [
    "\u597D\u611F\u5EA6\uFF1A\u6BCF " + AFFECTION_POINTS_MAX + " \u70B9\u4E3A 1 \u7EA7\uFF08\u7231\u5FC3\u91CC\u7684\u6570\u5B57\uFF09\uFF0C\u7B49\u7EA7\u4E0D\u5C01\u9876\u3002",
    "\u2191 \u4E0A\u6DA8\uFF1A" + perPoint + " \u5206\u949F +1 \u70B9\uFF1B\u5403\u83DC\u53E6\u52A0\u57FA\u7840\u597D\u611F = \u4EF7\u683C \xD7 12.5%\uFF08\u5411\u4E0A\u53D6\u6574\uFF0C100 \u5238 \u2192 +13\u3001200 \u5238 \u2192 +25\u3001300 \u5238 \u2192 +38\u2026\uFF09\u3002",
    "\u3000\u3000\u3000400 \u5238\u53CA\u4EE5\u4E0A\u8FD8\u6709\u989D\u5916\u597D\u611F\uFF1A400 \u2192 +10\u3001500 \u2192 +20\u3001600 \u2192 +30\u3002",
    "\u2193 \u4E0B\u964D\uFF1A\u4E0D\u4F1A\u81EA\u5DF1\u6389\u3002\u597D\u611F\u53EA\u589E\u4E0D\u51CF\uFF0C\u7B49\u7EA7\u53EA\u5347\u4E0D\u964D\u3002",
    "\uFF08\u987A\u5E26\uFF1A\u9CB8\u5143\u5238" + ticketRateText() + "\uFF0C\u540C\u6837\u662F\u5173\u673A/\u7761\u7720\u671F\u95F4\u7167\u5E38\u7D2F\u8BA1\u3002\uFF09"
  ].join("\n");
}

// .dsh-plugin/client/Hud.jsx
var HEART_PATH = "M50 87 C22 66 6 51 6 33 C6 18 18 8 31 8 C40 8 46 13 50 20 C54 13 60 8 69 8 C82 8 94 18 94 33 C94 51 78 66 50 87 Z";
function useSource(source) {
  const [snap, setSnap] = (0, import_react.useState)(() => source.getSnapshot());
  (0, import_react.useEffect)(() => {
    setSnap(source.getSnapshot());
    return source.subscribe(() => setSnap(source.getSnapshot()));
  }, [source]);
  return snap;
}
function HeartLevel({ level }) {
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "ge-heart", style: { width: HEART_GEO.size, height: HEART_GEO.size }, title: "\u597D\u611F\u7B49\u7EA7 " + level }, /* @__PURE__ */ import_react.default.createElement("svg", { viewBox: "0 0 100 100", className: "ge-heart-svg", "aria-hidden": "true" }, /* @__PURE__ */ import_react.default.createElement("path", { d: HEART_PATH, fill: COLORS.affection, stroke: "rgba(255,255,255,.55)", strokeWidth: "3" })), /* @__PURE__ */ import_react.default.createElement("span", { className: "ge-heart-num" }, level));
}
function StatBar({ label, percent, color, valueText, hint }) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const stack = statStack(STAT_GEO.barHeight);
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "ge-stat", style: { minWidth: STAT_GEO.minWidth }, title: hint }, /* @__PURE__ */ import_react.default.createElement("div", { className: "ge-stat-top", style: { marginBottom: STAT_GEO.labelGap } }, /* @__PURE__ */ import_react.default.createElement("span", { className: "ge-stat-label", style: { fontSize: STAT_GEO.labelFontSize } }, label), /* @__PURE__ */ import_react.default.createElement("span", { className: "ge-stat-value", style: { fontSize: STAT_GEO.valueFontSize } }, valueText)), /* @__PURE__ */ import_react.default.createElement("div", { className: "ge-bar", style: { height: stack.barHeight } }, /* @__PURE__ */ import_react.default.createElement("div", { className: "ge-bar-fill", style: { width: clamped + "%", background: color } })));
}
function HudLeft({ runtime }) {
  const state = useSource(runtime.stateSource);
  const hud = useSource(runtime.hudSource);
  if (hud.visible !== true) return null;
  const satiety = Math.max(0, Math.min(100, state.satiety));
  const points = Math.max(0, Math.min(100, state.affectionPoints));
  const bars = {
    satiety: /* @__PURE__ */ import_react.default.createElement(
      StatBar,
      {
        key: "satiety",
        label: "\u9971\u98DF\u5EA6",
        percent: satiety,
        color: COLORS.satiety,
        valueText: Math.round(satiety) + "%",
        hint: satietyTooltip()
      }
    ),
    affection: /* @__PURE__ */ import_react.default.createElement("div", { className: "ge-affection-row", key: "affection" }, /* @__PURE__ */ import_react.default.createElement(HeartLevel, { level: state.affectionLevel }), /* @__PURE__ */ import_react.default.createElement(
      StatBar,
      {
        label: "\u597D\u611F\u5EA6",
        percent: points,
        color: COLORS.affection,
        valueText: points + "/100",
        hint: affectionTooltip()
      }
    ))
  };
  return /* @__PURE__ */ import_react.default.createElement(
    "div",
    {
      className: "ge-hud-left",
      "data-gal-eat": "hud-left",
      style: scaleStyle(UI_SCALE.hudLeft, { top: HUD_GEO.left.top, left: HUD_GEO.left.left })
    },
    leftPanelOrder().map((key) => bars[key])
  );
}
function HudRight({ runtime }) {
  const state = useSource(runtime.stateSource);
  const hud = useSource(runtime.hudSource);
  if (hud.visible !== true) return null;
  const eyeOpen = runtime.eyeOpen();
  return /* @__PURE__ */ import_react.default.createElement(
    "div",
    {
      className: "ge-hud-right",
      "data-gal-eat": "hud-right",
      style: { ...scaleStyle(UI_SCALE.hudRight, { top: HUD_GEO.right.top }), transformOrigin: "100% 0" }
    },
    /* @__PURE__ */ import_react.default.createElement("div", { className: "ge-ticket", title: ticketTooltip() }, /* @__PURE__ */ import_react.default.createElement("span", { className: "ge-ticket-num" }, state.tickets)),
    /* @__PURE__ */ import_react.default.createElement(
      "button",
      {
        type: "button",
        className: "ge-eat-btn",
        title: "\u53BB\u7F8E\u98DF\u8857\u5403\u996D",
        onClick: () => {
          if (typeof runtime.enterStreet === "function") runtime.enterStreet({ type: "start" });
          else runtime.dispatch({ type: "start" });
        }
      },
      "\u53BB\u5403\u996D"
    ),
    /* @__PURE__ */ import_react.default.createElement(
      "button",
      {
        type: "button",
        className: "ge-eye" + (eyeOpen ? " is-open" : ""),
        title: eyeOpen ? "\u9690\u85CF\u72B6\u6001\u680F\uFF08\u6570\u503C\u7167\u5E38\u7ED3\u7B97\uFF09" : "\u663E\u793A\u72B6\u6001\u680F",
        "aria-label": eyeOpen ? "\u9690\u85CF\u72B6\u6001\u680F" : "\u663E\u793A\u72B6\u6001\u680F",
        onClick: () => runtime.toggleEye()
      },
      /* @__PURE__ */ import_react.default.createElement("svg", { viewBox: "0 0 24 24", width: "18", height: "18", "aria-hidden": "true" }, /* @__PURE__ */ import_react.default.createElement(
        "path",
        {
          d: "M2 12 C5 6.5 8.6 4.5 12 4.5 C15.4 4.5 19 6.5 22 12 C19 17.5 15.4 19.5 12 19.5 C8.6 19.5 5 17.5 2 12 Z",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: "1.7",
          strokeLinejoin: "round"
        }
      ), /* @__PURE__ */ import_react.default.createElement("circle", { cx: "12", cy: "12", r: "3.3", fill: "none", stroke: "currentColor", strokeWidth: "1.7" }), !eyeOpen && /* @__PURE__ */ import_react.default.createElement("line", { x1: "4", y1: "20", x2: "20", y2: "4", stroke: "currentColor", strokeWidth: "1.9" }))
    )
  );
}
function HudEyeHint({ runtime }) {
  const hud = useSource(runtime.hudSource);
  const eyeOpen = runtime.eyeOpen();
  if (hud.visible === true || eyeOpen) return null;
  return /* @__PURE__ */ import_react.default.createElement("button", { type: "button", className: "ge-eye ge-eye-solo", title: "\u663E\u793A\u72B6\u6001\u680F", onClick: () => runtime.toggleEye() }, /* @__PURE__ */ import_react.default.createElement("svg", { viewBox: "0 0 24 24", width: "18", height: "18", "aria-hidden": "true" }, /* @__PURE__ */ import_react.default.createElement("path", { d: "M2 12 C5 6.5 8.6 4.5 12 4.5 C15.4 4.5 19 6.5 22 12 C19 17.5 15.4 19.5 12 19.5 C8.6 19.5 5 17.5 2 12 Z", fill: "none", stroke: "currentColor", strokeWidth: "1.7" }), /* @__PURE__ */ import_react.default.createElement("circle", { cx: "12", cy: "12", r: "3.3", fill: "none", stroke: "currentColor", strokeWidth: "1.7" }), /* @__PURE__ */ import_react.default.createElement("line", { x1: "4", y1: "20", x2: "20", y2: "4", stroke: "currentColor", strokeWidth: "1.9" })));
}

// .dsh-plugin/client/EatView.jsx
var import_react2 = __toESM(require("react"), 1);

// .dsh-plugin/client/eat-typing.mjs
var LINE_DWELL_MS = 1600;

// .dsh-plugin/client/EatView.jsx
function useSource2(source) {
  const [snap, setSnap] = import_react2.default.useState(() => source.getSnapshot());
  (0, import_react2.useEffect)(() => {
    setSnap(source.getSnapshot());
    return source.subscribe(() => setSnap(source.getSnapshot()));
  }, [source]);
  return snap;
}
function DishThumb({ runtime, name: name2 }) {
  const src = runtime.asset(name2);
  if (src === null) {
    return /* @__PURE__ */ import_react2.default.createElement("div", { className: "ge-dish-thumb is-empty" }, runtime.assetMissing(name2) ? "\u65E0\u56FE" : "\u2026");
  }
  return /* @__PURE__ */ import_react2.default.createElement("img", { className: "ge-dish-thumb", src, alt: name2, draggable: false });
}
function EatView({ runtime }) {
  const session = useSource2(runtime.eatSource);
  const state = useSource2(runtime.stateSource);
  const phase = session.phase;
  const atStreet = phase !== "idle";
  const backdropRef = (0, import_react2.useRef)(false);
  if (atStreet && !backdropRef.current) {
    backdropRef.current = true;
    runtime.applyBackdrop(true);
  }
  (0, import_react2.useEffect)(() => {
    if (atStreet) return void 0;
    if (backdropRef.current) {
      backdropRef.current = false;
      runtime.applyBackdrop(false);
    }
    return void 0;
  }, [atStreet, runtime]);
  const introLines = Array.isArray(session.introLines) ? session.introLines : [];
  const introIndex = session.introIndex;
  const restaurant = session.restaurantId !== null ? findRestaurant(session.restaurantId) : null;
  const lineForPhase = phase === "intro" ? introLines[introIndex] ?? "" : phase === "restaurant" ? "\u60F3\u5403\u54EA\u4E00\u5BB6\uFF1F\u70B9\u53F3\u8FB9\u7684\u62DB\u724C\u5C31\u884C\uFF5E" : phase === "menu" && restaurant !== null ? restaurant.name + "\u2014\u2014\u4ECA\u5929\u60F3\u5403\u70B9\u4EC0\u4E48\uFF1F" : phase === "verdict" ? String(session.lastVerdict ?? "") : "";
  (0, import_react2.useEffect)(() => {
    if (lineForPhase !== "") runtime.say(lineForPhase, "gal-eat:" + phase + ":" + introIndex);
    return void 0;
  }, [lineForPhase, phase, introIndex, runtime]);
  (0, import_react2.useEffect)(() => () => runtime.clearLine(), [runtime]);
  (0, import_react2.useEffect)(() => {
    if (phase !== "intro") return void 0;
    const advance = () => runtime.dispatch({ type: "introNext" });
    const off = runtime.onStageClick(() => advance());
    const timer = setTimeout(advance, LINE_DWELL_MS + 2200);
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [phase, introIndex, runtime]);
  (0, import_react2.useEffect)(() => {
    if (phase !== "menu" || restaurant === null) return;
    void runtime.prefetchAssets(restaurant.dishes.map((d) => d.name));
  }, [phase, restaurant, runtime]);
  const goHome = (0, import_react2.useCallback)(() => runtime.leaveStreet(), [runtime]);
  const pickRestaurant = (0, import_react2.useCallback)((id) => runtime.dispatch({ type: "pickRestaurant", restaurantId: id }), [runtime]);
  const backToRestaurants = (0, import_react2.useCallback)(() => runtime.dispatch({ type: "backToRestaurants" }), [runtime]);
  const verdictNext = (0, import_react2.useCallback)(() => runtime.leaveStreet(), [runtime]);
  const buy = (0, import_react2.useCallback)((dish) => {
    const result = runtime.feed(dish);
    if (result.ok) runtime.dispatch({ type: "dishBought", dish });
    else runtime.setNotice(result.reason ?? "\u4E70\u4E0D\u4E86\u8FD9\u9053\u83DC");
    return result;
  }, [runtime]);
  if (!atStreet) return null;
  const day = accountingDay(Date.now());
  const tickets = state.tickets;
  return /* @__PURE__ */ import_react2.default.createElement("div", { className: "ge-eat-layer", "data-gal-eat": "eat", "data-phase": phase }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "ge-eat-head", style: barZoomStyle(UI_SCALE.eatHead) }, /* @__PURE__ */ import_react2.default.createElement("span", { className: "ge-eat-title" }, "\u7F8E\u98DF\u8857 \xB7 ", backgroundLabel(backgroundKeyNow())), /* @__PURE__ */ import_react2.default.createElement("span", { className: "ge-eat-tickets" }, "\u9CB8\u5143\u5238 ", tickets), /* @__PURE__ */ import_react2.default.createElement("button", { type: "button", className: "ge-ghost-btn", onClick: goHome }, "\u4ECA\u5929\u4E0D\u5403\u4E86\uFF0C\u56DE\u5BB6")), session.message !== "" && /* @__PURE__ */ import_react2.default.createElement("div", { className: "ge-eat-notice" }, session.message), /* @__PURE__ */ import_react2.default.createElement(
    "div",
    {
      className: "ge-eat-right",
      style: { ...scaleStyle(UI_SCALE.eatRight, {}), transformOrigin: "100% 0", width: "min(42%, 420px)" }
    },
    phase === "restaurant" && /* @__PURE__ */ import_react2.default.createElement("div", { className: "ge-cards", role: "list", "aria-label": "\u9009\u4E00\u5BB6\u9910\u5385" }, RESTAURANTS.map((r) => /* @__PURE__ */ import_react2.default.createElement("button", { key: r.id, type: "button", role: "listitem", className: "ge-card", onClick: () => pickRestaurant(r.id) }, /* @__PURE__ */ import_react2.default.createElement("span", { className: "ge-card-name" }, r.name), /* @__PURE__ */ import_react2.default.createElement("span", { className: "ge-card-sub" }, r.cuisine, " \xB7 ", r.dishes.length, " \u9053\u83DC"), /* @__PURE__ */ import_react2.default.createElement("span", { className: "ge-card-price" }, r.dishes[0].price, "\u2013", r.dishes[r.dishes.length - 1].price, " \u5238")))),
    phase === "menu" && restaurant !== null && /* @__PURE__ */ import_react2.default.createElement("div", { className: "ge-menu" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "ge-menu-head" }, /* @__PURE__ */ import_react2.default.createElement("span", { className: "ge-menu-title" }, restaurant.name), /* @__PURE__ */ import_react2.default.createElement("span", { className: "ge-dim" }, "\u540C\u4E00\u9053\u83DC\u4E00\u5929\u53EA\u80FD\u5403\u4E00\u6B21")), /* @__PURE__ */ import_react2.default.createElement("ul", { className: "ge-dishes" }, restaurant.dishes.map((d) => {
      const dish = { ...d, restaurantId: restaurant.id };
      const soldOut = isDishSoldOut(state, day, restaurant.id, d.name);
      const affordable = canAfford(state, dish);
      const disabled = soldOut || !affordable;
      const gainText = dishGainText(d, state.satiety);
      return /* @__PURE__ */ import_react2.default.createElement("li", { key: d.name, className: "ge-dish" }, /* @__PURE__ */ import_react2.default.createElement(DishThumb, { runtime, name: d.name }), /* @__PURE__ */ import_react2.default.createElement("div", { className: "ge-dish-info" }, /* @__PURE__ */ import_react2.default.createElement("span", { className: "ge-dish-name" }, d.name), /* @__PURE__ */ import_react2.default.createElement("span", { className: "ge-dish-taste" }, d.taste)), /* @__PURE__ */ import_react2.default.createElement(
        "div",
        {
          className: "ge-dish-gain",
          title: "\u5403\u4E0B\u300C" + d.name + "\u300D\u540E\uFF1A" + gainText.satiety + "\uFF0C" + gainText.affection + (gainText.clamped ? "\u3002\u5F53\u524D\u9971\u98DF\u5EA6\u8F83\u9AD8\uFF0C\u5B9E\u9645\u53EA\u4F1A\u6DA8\u5230\u4E0A\u9650\uFF08+" + gainText.appliedSatiety + "%\uFF09" : "")
        },
        /* @__PURE__ */ import_react2.default.createElement("span", { className: "ge-gain-satiety" }, gainText.satiety),
        /* @__PURE__ */ import_react2.default.createElement("span", { className: "ge-gain-affection" }, gainText.affection)
      ), /* @__PURE__ */ import_react2.default.createElement("span", { className: "ge-dish-price" }, d.price, " \u5238"), /* @__PURE__ */ import_react2.default.createElement(
        "button",
        {
          type: "button",
          className: "ge-buy" + (disabled ? " is-disabled" : ""),
          disabled,
          title: soldOut ? "\u4ECA\u5929\u5DF2\u7ECF\u5403\u8FC7\u4E86" : affordable ? "\u8D2D\u4E70\u5E76\u5403\u6389" : "\u5238\u4E0D\u591F",
          onClick: () => buy(dish)
        },
        soldOut ? "\u5DF2\u552E\u7F44" : affordable ? "\u8D2D\u4E70" : "\u5238\u4E0D\u591F"
      ));
    })), /* @__PURE__ */ import_react2.default.createElement("div", { className: "ge-menu-foot" }, /* @__PURE__ */ import_react2.default.createElement("button", { type: "button", className: "ge-ghost-btn", onClick: backToRestaurants }, "\u6362\u4E00\u5BB6"))),
    phase === "verdict" && /* @__PURE__ */ import_react2.default.createElement("div", { className: "ge-verdict" }, /* @__PURE__ */ import_react2.default.createElement("button", { type: "button", className: "ge-primary-btn", onClick: verdictNext }, "\u5403\u9971\u4E86\uFF0C\u56DE\u5BB6"))
  ));
}

// .dsh-plugin/client/DegradedNotice.mjs
var NOTICE_ATTR = "data-gal-eat-notice";
function showDegradedNotice(reason) {
  if (typeof document === "undefined" || document === null) return () => {
  };
  let host = null;
  try {
    host = document.querySelector("[data-gal-view]");
  } catch {
    host = null;
  }
  if (host === null || host === void 0) return () => {
  };
  const stale = host.querySelector("[" + NOTICE_ATTR + "]");
  if (stale !== null && stale !== void 0 && typeof stale.remove === "function") stale.remove();
  const box = document.createElement("div");
  box.setAttribute(NOTICE_ATTR, "");
  box.setAttribute("role", "status");
  box.className = "ge-degraded";
  const title = document.createElement("span");
  title.className = "ge-degraded-title";
  title.textContent = "gal-eat \u672A\u542F\u7528";
  box.append(title);
  const text = document.createElement("span");
  text.textContent = reason !== null && reason !== void 0 && String(reason) !== "" ? String(reason) : "\u672A\u68C0\u6D4B\u5230 gal-view \u6269\u5C55\u63A5\u53E3\uFF0C\u8BF7\u5148\u5B89\u88C5/\u66F4\u65B0 gal-view\u3002";
  box.append(text);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "ge-degraded-close";
  close.setAttribute("aria-label", "\u5173\u95ED\u63D0\u793A");
  close.textContent = "\xD7";
  close.addEventListener("click", () => {
    try {
      box.remove();
    } catch {
    }
  });
  box.append(close);
  try {
    host.append(box);
  } catch {
    try {
      document.body.append(box);
    } catch {
    }
  }
  return () => {
    try {
      box.remove();
    } catch {
    }
  };
}

// .dsh-plugin/client/styles.mjs
var CSS = `
/* ---------- HUD \u5BB9\u5668\uFF08\u5DE6/\u53F3\u4E24\u4E2A\u821E\u53F0\u8986\u76D6\u5C42\uFF09---------- */
.ge-hud-left,
.ge-hud-right {
  position: absolute;
  top: 10px;
  display: flex;
  font-family: inherit;
  color: #f2f4ff;
  pointer-events: none;              /* \u5BB9\u5668\u4E0D\u6321\u821E\u53F0\uFF0C\u53EF\u4EA4\u4E92\u90E8\u4EF6\u5355\u72EC\u5F00\u542F */
  --ge-satiety: #ff9f43;
  --ge-affection: #ff6fae;
  --ge-ticket: #ffd479;
}
.ge-hud-left { left: 14px; flex-direction: column; gap: 8px; align-items: flex-start; }
.ge-hud-right { right: 14px; flex-direction: row; gap: 8px; align-items: flex-start; }
.ge-hud-left > *, .ge-hud-right > * { pointer-events: auto; }

/* ---------- \u72B6\u6001\u6761 ----------
   \u5C3A\u5BF8\u7684**\u552F\u4E00\u771F\u76F8\u6E90**\u662F hud-layout.mjs\uFF08\u6761\u9AD8 10 / \u6807\u7B7E 12 / \u6570\u503C 10 / \u95F4\u9699 2 / \u7231\u5FC3 52\uFF09\uFF0C
   \u7EC4\u4EF6\u4EE5\u5185\u8054 style \u5E94\u7528\u5B83\u4EEC\uFF1B\u8FD9\u91CC\u7684 CSS \u53EA\u8D1F\u8D23\u89C2\u611F\uFF08\u5706\u89D2/\u9634\u5F71/\u914D\u8272\uFF09\u3002\u6539\u5C3A\u5BF8\u53BB\u6539 hud-layout\u3002 */
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

/* ---------- \u597D\u611F\u5EA6\uFF1A\u7231\u5FC3\u7B49\u7EA7\u5708 + \u6761 ---------- */
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

/* ---------- \u53F3\u4E0A\u89D2\uFF1A\u9CB8\u5143\u5238 + \u53BB\u5403\u996D + \u773C\u775B ---------- */
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

/* ---------- \u964D\u7EA7\u63D0\u793A\uFF08\u6CA1\u88C5/\u88C5\u4E86\u8FC7\u65E7 gal-view \u65F6\uFF09----------
   \u6CE8\u610F\uFF1A\u6B64\u65F6\u53D6\u4E0D\u5230 gal-view \u7684\u6269\u5C55\u7F1D\uFF0C\u6240\u4EE5**\u6CA1\u6709\u821E\u53F0\u53EF\u6302**\u2014\u2014
   \u53EA\u80FD\u81EA\u5DF1\u5F80 GAL \u89C6\u7A97\u6839\u8282\u70B9\u91CC\u585E\u4E00\u4E2A\u7F6E\u9876\u6761\u3002 */
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

/* ---------- \u5403\u996D\u9875\u9762\uFF08\u7F8E\u98DF\u8857\uFF09----------
   \u8BBE\u8BA1\u7EA6\u675F\uFF08\u7528\u6237\u9A8C\u6536\u53CD\u9988\uFF09\uFF1A
   - **\u4E0D\u8981\u9ED1\u7F69\u5B50\u3001\u4E0D\u8981\u81EA\u5DF1\u753B\u5BF9\u8BDD\u6846**\uFF1A\u5BF9\u8BDD\u6846\u4E0E\u7ACB\u7ED8\u90FD\u7531 gal-view \u81EA\u5DF1\u6E32\u67D3\uFF0C\u672C\u9875\u53EA\u52A0
     \u9876\u90E8\u4FE1\u606F\u6761 + \u53F3\u4FA7\u9910\u5385/\u83DC\u5355\u9762\u677F
   - \u9910\u5385/\u83DC\u5355**\u9760\u53F3**\u6392\u5E03\uFF0C\u7ED9\u5DE6\u4FA7\u7ACB\u7ED8\u7559\u4F4D\u7F6E\uFF1B\u5E95\u90E8\u7559\u51FA\u5BF9\u8BDD\u6846\u9AD8\u5EA6
   - \u80CC\u666F\u4E0D\u5728\u8FD9\u91CC\u753B\uFF08\u6539\u7531 gal-view \u7684 ExtBackdrop \u94FA\uFF09\uFF0C\u5426\u5219\u4F1A\u76D6\u4F4F\u7ACB\u7ED8\u4E0E\u5BF9\u8BDD\u6846 */
.ge-eat-layer {
  position: absolute; inset: 0;
  font-family: inherit; color: #f6f7ff;
  pointer-events: none;   /* \u53EA\u6709\u5185\u90E8\u53EF\u4EA4\u4E92\u90E8\u4EF6\u5F00\u542F\uFF1A\u5176\u4F59\u70B9\u51FB\u900F\u7ED9\u821E\u53F0\uFF08\u53EF\u8DF3\u8FC7\u6253\u5B57/\u70B9\u5BF9\u8BDD\u6846\uFF09 */
}
.ge-eat-head, .ge-eat-notice, .ge-eat-right { pointer-events: auto; }
.ge-eat-bg { display: none; }   /* \u80CC\u666F\u7531 gal-view \u7684 ExtBackdrop \u94FA */

/* \u5403\u996D\u65F6\u628A\u573A\u666F\u81EA\u5DF1\u7684"\u5BB6\u4E2D\u80CC\u666F"\u5143\u7D20\u9690\u6389\uFF08\u7F8E\u98DF\u8857\u80CC\u666F\u7531 ExtBackdrop \u63D0\u4F9B\uFF09\uFF0C
   \u907F\u514D\u4E24\u5F20\u80CC\u666F\u53E0\u5728\u4E00\u8D77\u3002\u821E\u53F0\u4E0A\u7684 data-ext-backdrop \u6807\u8BB0\u7531 gal-view \u63D0\u4F9B\u3002 */
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
/* \u53F3\u4FA7\u5185\u5BB9\u533A\uFF1A\u7ED9\u5DE6\u4FA7\u7ACB\u7ED8\u8BA9\u4F4D\uFF0C\u5E95\u90E8\u7ED9 gal-view \u5BF9\u8BDD\u6846\u8BA9\u4F4D\uFF08\u5426\u5219\u4F1A\u88AB\u5BF9\u8BDD\u6846\u538B\u4F4F\uFF09 */
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

/* \u9910\u5385\u9009\u9879\u5361\u7247\uFF08\u5355\u5217\u7EB5\u5411\uFF0C\u9760\u53F3\u6392\u5E03\uFF09 */
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

/* \u83DC\u5355 */
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
/* \u4E2D\u95F4\u7684\u6536\u76CA\u6570\u636E\uFF1A\u83DC\u54C1\u540D\u4E0E\u4EF7\u683C\u4E4B\u95F4\u90A3\u7247\u7A7A\u4F4D */
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

/* \u53E3\u5473\u8BC4\u4EF7 */
.ge-verdict {
  display: flex; flex-direction: column; align-items: flex-end; gap: 10px; text-align: right;
  width: 100%;
}

/* \u6CE8\uFF1A\u5BF9\u8BDD\u6846\u4E0E\u53F0\u8BCD**\u4E0D\u4F7F\u7528\u672C\u63D2\u4EF6\u6837\u5F0F** \u2014\u2014 \u8D70 gal-view \u81EA\u5DF1\u7684\u5BF9\u8BDD\u6846
   \uFF08\u7ECF galview-ext \u7684 setLineOverride \u663E\u793A\uFF0C\u81EA\u5E26\u573A\u666F\u6837\u5F0F/\u5E95\u56FE/\u540D\u724C/\u7ACB\u7ED8/\u6253\u5B57\u673A\uFF09\u3002
   \u65E9\u671F\u7248\u672C\u5728\u8FD9\u91CC\u81EA\u7ED8\u8FC7\u4E00\u4E2A ge-fake-dlg\uFF0C\u5B9E\u9645\u6548\u679C\u662F\u4E2A\u5927\u8272\u5757\u4E14\u62FF\u4E0D\u5230\u7ACB\u7ED8\uFF0C\u5DF2\u5220\u9664\u3002 */
`;

// .dsh-plugin/client/index.mjs
var name = "gal-eat";
var inject = ["slots"];
var __test = { runtime: null };
var OVERLAY_ID_EAT = "gal-eat-eat";
var OVERLAY_ID_EYE = "gal-eat-eye";
function apply(ctx) {
  if (document.querySelector("style[data-gal-eat-style]") !== null) return;
  const styleEl = document.createElement("style");
  styleEl.setAttribute("data-gal-eat-style", "");
  styleEl.setAttribute("data-plugin", "gal-eat");
  styleEl.textContent = CSS;
  document.head.append(styleEl);
  const runtime = createEatRuntime({ ctx });
  __test.runtime = runtime;
  ctx.effect(() => () => {
    if (__test.runtime === runtime) __test.runtime = null;
    runtime.releaseBlock();
    runtime.dispose();
    styleEl.remove();
  }, "gal-eat: styles/runtime");
  const layer = (Component, id, order, extra = {}) => {
    if (runtime.probe().ok !== true) return null;
    const ext = runtime.ext();
    if (ext === null || typeof ext.registerStageOverlay !== "function") return null;
    try {
      return ext.registerStageOverlay(
        // 双保险：优先用缝传回来的 runtime（同一实例），缺失时回落到闭包里的
        (props) => import_react3.default.createElement(Component, { ...props, runtime: props?.overlayRuntime ?? runtime }),
        { id, order, runtime, ...extra }
      );
    } catch (error) {
      console.warn("[gal-eat] \u6CE8\u518C\u8986\u76D6\u5C42\u5931\u8D25\uFF08\u8BE5\u5C42\u5C06\u4E0D\u663E\u793A\uFF09:", id, error);
      return null;
    }
  };
  let disposers = [];
  const register = () => {
    for (const off of disposers) off();
    disposers = [];
    const list = [
      layer(HudLeft, OVERLAY_ID_LEFT, 40),
      layer(HudRight, OVERLAY_ID_RIGHT, 40),
      layer(HudEyeHint, OVERLAY_ID_EYE, 42),
      layer(EatView, OVERLAY_ID_EAT, 60, { keepWhenStageOwned: true })
    ].filter(Boolean);
    disposers = list;
    return list.length;
  };
  let tries = 0;
  let removeNotice = null;
  const syncDegradedNotice = () => {
    const probe2 = runtime.probe();
    if (probe2.ok === true) {
      if (removeNotice !== null) {
        removeNotice();
        removeNotice = null;
      }
      return;
    }
    removeNotice = showDegradedNotice(probe2.reason);
  };
  register();
  syncDegradedNotice();
  const timer = setInterval(() => {
    tries += 1;
    if (runtime.probe().ok === true) {
      register();
      syncDegradedNotice();
      clearInterval(timer);
      return;
    }
    if (tries >= 20) {
      syncDegradedNotice();
      clearInterval(timer);
    }
  }, 500);
  ctx.effect(() => () => {
    clearInterval(timer);
    if (removeNotice !== null) removeNotice();
    removeNotice = null;
    for (const off of disposers) off();
    disposers = [];
  }, "gal-eat: stage overlays");
  const probe = runtime.probe();
  console.info("[gal-eat] \u5DF2\u52A0\u8F7D\uFF1A" + (probe.ok ? "galViewExt v" + probe.version + " \u5DF2\u63A5\u5165" : probe.reason));
  if (typeof window !== "undefined") {
    window.__galEat = {
      grant: (n) => runtime.grant(n),
      setSatiety: (v) => runtime.setSatiety(v),
      state: () => ({ ...runtime.stateSource.getSnapshot() }),
      eat: () => ({ ...runtime.eatSource.getSnapshot() }),
      phase: () => runtime.eatSource.getSnapshot().phase,
      runtime
    };
    console.info("[gal-eat] \u63A7\u5236\u53F0\u6307\u4EE4\uFF1A__galEat.grant(100) \u52A0\u5238 / __galEat.setSatiety(0) \u8FDB\u997F\u660F / __galEat.state() \u770B\u6570\u503C");
  }
}
		return module.exports;
	}
});
