# NOTICE — vendored files

本仓库是 **gal-eat**（DSH 的"吃饭"插件）的源码副本。

`gal-view/` 目录下不是 gal-view 的完整源码，而是 gal-eat 需要复用的少量文件（原样拷贝，未修改）：

| 文件 | 用途 |
| --- | --- |
| `gal-view/.dsh-plugin/client/game-state.mjs` | 时间结算与吃菜收益的纯规则（gal-eat 必须与 gal-view 同口径） |
| `gal-view/.dsh-plugin/client/eat.mjs` | 吃饭阶段机与菜单数据（纯函数） |
| `gal-view/.dsh-plugin/client/galview-ext.mjs` | 扩展缝（gal-eat 经它把界面挂到 gal-view 舞台上） |
| `gal-view/.dsh-plugin/client.js` | gal-view 的浏览器产物；测试用它做"真实渲染"验证 |

这样安排是为了让相对引用（源码里写的是 `../../../gal-view/...`）在单独 clone 本仓库后**依然可解析**，
无需改动任何源码。

gal-view 本体（完整插件）与本仓库同许可（MIT）。若需要完整 gal-view，请另外获取它自己的仓库。

## 布局

本仓库**根目录就是插件本身**（`package.json` 在主目录），因此可以直接从 GitHub 安装：

```bash
dsh plugin --profile desktop add github:<你的用户名>/gal-eat#main
```

`gal-view/` 下是少量被复用的 gal-view 文件（**未修改**，来源与用途见 `gal-view/NOTICE.md`）。
插件源码对这些文件的引用与测试都指向这里，所以单独 clone 本仓库即可编译与测试。
