# AI Coding Case：用可测试的固定高度算法约束大列表 DOM

## 问题

工作区左侧需要保留完整日志上下文，右侧只显示目标指令，二者数据密度不同。30,000 或 100,000 条数据若直接 `v-for`，DOM 数量会随数据总量增长；右侧点击还必须可靠定位到左侧原始行。仅凭“滚动感觉流畅”无法形成可复现证据。

## 约束

- Vue 3 + 严格 TypeScript；核心 range 逻辑需要与框架解耦。
- MVP 行高固定，完整内容放入独立详情面板。
- 必须覆盖空列表、底部、overscan、resize、快速滚动和越界调用。
- `scrollToIndex` 需要 `start / center / end / auto` 四种对齐。
- DOM 上界应由 viewport 和 overscan 推导，不以性能百分比替代结构验证。
- 左右数据索引不能硬对应，定位必须使用 Parser 生成的 `rawLineIndex`。

## 候选方案

1. **直接渲染全部行。** 实现简单，但不满足 DOM 与数据总量解耦的目标。
2. **使用通用表格/虚拟化库。** 能快速交付，但会弱化 range、定位和边界测试这一核心工程案例，并增加并非当前需求所需的能力。
3. **自研固定高度虚拟列表。** total height、range、offset 都能用 O(1) 纯函数表达，测试矩阵明确。
4. **自研动态高度虚拟列表。** 能支持内联展开，但需要测量缓存、前缀高度、anchor correction 和更大的交互状态空间。

## 选择

选择方案 3，并把完整详情移到独立抽屉；方案 4 延后，除非出现明确需求与新的 ADR。

`packages/virtual-list/src/fixed.ts` 负责：

- total height 与最大 scroll offset；
- scroll offset、item index 的 clamp；
- 固定行高可见范围与 overscan；
- range 对应的 translate offset；
- `scrollToIndex` 的四种对齐和 `auto` 最小移动。

`FixedVirtualList.vue` 负责：

- 用总高度 spacer 保留原生滚动范围；
- 只为 range 内索引创建行 DOM，并用 `translate3d` 定位；
- 通过 `ResizeObserver` 更新 viewport；
- 暴露 `scrollToIndex`、`scrollToOffset`、`getVisibleRange`；
- 提供 slot `{ index, selected }`、选中标识和开发/测试用 rendered count。

Web 结果行点击后保留命令 id，并以 `rawLineIndex` 调用左侧 `scrollToIndex(..., 'center')`；完整字段、字节、问题和原始证据显示在独立详情抽屉中。

## 验证方式

本次实际执行的包级结果为：

- `vue-tsc -p packages/virtual-list/tsconfig.json` 通过；
- `eslint packages/virtual-list --max-warnings=0` 通过；
- Vitest 共 21 个用例通过。

用例覆盖 0、1、视口内、30k、100k，顶部/中部/底部，overscan 不越界，部分可见行，offset/index clamp，`start/center/end/auto`，ResizeObserver，快速连续 scroll 事件后的最终 range，以及 DOM 行数上界。

包级结果验证算法边界；随后真实 Chrome benchmark 在 30k/100k 下观测到初始左/右 DOM 26/13，大滚动最大 35/19，仍受当前 36/20 结构上界约束。程序化滚动测量不是浏览器帧率证据，也没有前版本对照，因此不产生性能提升百分比。

## 失败案例与修正

### 失败 1：底部 scrollTop 未 clamp

数据缩短或调用方传入过大 offset 时，`firstVisible` 可能超过 itemCount，形成 `start > end`。修正是在 range 和 controller 边界统一 clamp 到 `totalHeight - viewportHeight`。

### 失败 2：只用 `ceil(viewportHeight / itemHeight)`

当顶部只露出一部分行时，viewport 底部还可能多露出一行。修正是按 `(scrollTop + viewportHeight) / itemHeight` 计算 exclusive end，并保留部分可见行。

### 失败 3：`auto` 每次都强制居中

目标本已可见时仍跳动会破坏阅读位置。修正是：目标在 viewport 内保持当前 offset；超出上边界时按 start，超出下边界时只滚动到刚好可见。

### 失败 4：把动态详情放回虚拟行

这会破坏固定高度数学模型，而代码没有测量缓存与 anchor correction。修正是做出产品级边界：摘要留在固定行，详情进入独立面板，并在 ADR 中明确不支持动态高度。

## 结论

AI 辅助的重点不是生成一个滚动组件，而是把性能目标改写为可验证的不变量：range 不越界、定位 offset 可预测、DOM 只随 viewport 与 overscan 增长。最终结论严格限定在固定高度实现；任何动态高度或性能百分比都需要新的实现与测量证据。
