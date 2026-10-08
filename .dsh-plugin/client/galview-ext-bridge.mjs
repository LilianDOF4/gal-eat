// gal-eat 与 gal-view 的编译期桥接：只转出扩展缝的"客户端契约"部分。
//
// 为什么直接 import gal-view 的源码而不是复制一份：
//  - 缝的契约（服务名/版本号/可用性判定）必须只有一处定义，否则两边漂移后
//    插件会误判"缝不可用"或漏判缺方法。
//  - gal-view 的 client 源码是**同仓同伴**（.galview-fork/gal-view），esbuild 打包时
//    内联进本插件的 client.js；运行时不需要 gal-view 的 JS 模块在场。
//
// 注意：这里只转出纯函数/常量（零 React、零 DOM、零 UI），不会把 gal-view 的界面拖进产物。

export {
  GALVIEW_EXT_SERVICE, GALVIEW_EXT_VERSION, checkGalViewExt,
} from '../../gal-view/.dsh-plugin/client/galview-ext.mjs'
