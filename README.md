# gal-eat

DSH **GAL 视窗**的"吃饭"插件：给 AI 角色加上**鲸元券 / 饱食度 / 好感度**三条数值线，
并提供一个"去美食街吃饭"的完整流程（选餐厅 → 点菜 → 吃饭 → 口味评价）。

配套插件 **gal-view**（GAL 视窗本体）是必需项：gal-eat 通过它提供的 `galViewExt`
扩展缝把 HUD 与吃饭页面挂到舞台上。本仓库为便于独立编译/测试，把用到的少量 gal-view
文件放在 `gal-view/` 下（**未修改**，来源与用途见 `gal-view/NOTICE.md`）。

## 安装

```bash
# 先装本体 gal-view，再装本插件
dsh plugin --profile desktop add github:Ayase34/gal-view#main
dsh plugin --profile desktop add github:LilianDOF4/gal-eat#main
```

装完**重启 DSH** 生效。仓库里已含编译好的 `.dsh-plugin/client.js`，
所以从 GitHub 安装**不需要在本地编译**（也不需要 esbuild）。

## 目录

本仓库**根目录就是插件本身**（`package.json` 在主目录），因此可以直接用上面的 `github:` 方式安装。

```
.dsh-plugin/   浏览器端产物（client.js 已提交）与源码
lib/           Node 端：只读素材路由
assets/        包内自带素材（3 背景 + 30 菜品，压缩版）
tests/         单测与仿真
scripts/       构建 / 打包 / 核验脚本
gal-view/      少量被复用的 gal-view 文件（vendored，未修改）
```

> `gal-view/` **不是**完整的 gal-view。要装完整功能请另外获取 gal-view 本体。

## 玩法速览


|          | 规则                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 鲸元券   | 挂机**每分钟 +2**（关机/睡眠不累计）                                                                                                        |
| 饱食度   | 每**5 分钟 -1%**；吃菜 +20/40/60/80/100%（按 100/200/300/400/500 券档位）；归零会"饿昏"（回答末尾带抱怨且发不出消息，点「去吃饭」即可恢复） |
| 好感度   | 每 10 分钟 +1 点；吃菜另加`价格 × 12.5%`（向上取整），400 券以上再 +10/+20/+30                                                             |
| 好感等级 | 每满 100 点为 1 级，等级不封顶                                                                                                              |
| 每天限购 | 同一家店的同一道菜每天只能吃 1 次，凌晨 4:00 刷新                                                                                           |

数值存在浏览器 `localStorage`（`gal-eat:state:v1`），跨会话保留，不随 gal-view 存档回滚。

## 开发

```bash
node tests/run.mjs              # 单测（81 项）
node tests/verify-plugin.mjs    # 插件产物端到端仿真
node tests/verify-flow.mjs      # 真渲染流程仿真（需要 esbuild，见下）
node tests/verify-render.mjs    # 跨插件渲染（需要 gal-view 的产物，仓库里已含）
node scripts/build-client.mjs   # 重新生成 .dsh-plugin/client.js
node scripts/build-client.mjs --check   # 校验产物与源码一致（发布前必跑）
```

`verify-flow` 需要 esbuild 二进制（用它把 .jsx 测试转成可执行模块）：

```bash
npm i -D esbuild @esbuild/<平台包>        # 例如 @esbuild/win32-x64
# 或 pnpm install
```

环境变量（可选）：`GALEAT_PICTURES` 改用户覆盖目录的上级目录，
`GALEAT_BUNDLED_ASSETS` 改包内素材目录（一般不设）。

## 图片素材

插件包内自带压缩版素材（3 张背景 + 30 张菜品，约 3.5 MB），**装完开箱就有图**。
想换成自己的，把同名文件放进用户覆盖目录即可（会自动优先）：

```
<Pictures>/gal-eat/morning.png           早/中/晚 美食街背景
<Pictures>/gal-eat/dishes/<菜名>.png      菜品图
```

## 许可

* 代码与原项目一致:**MIT** © 2026 Yunicon(见 LICENSE);
* 场景中的背景 / 对话框素材为 **AI 生成**,本项目专用;
* 整体发行包含上述 NC-SA 资产,**请勿用于商业用途**。

## 致谢

* [Yunicon / Ayase34](https://github.com/Ayase34/gal-view) — gal-view 原作(MIT)
