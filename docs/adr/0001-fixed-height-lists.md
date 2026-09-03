# ADR-0001：固定高度虚拟列表 + 独立详情面板

- 状态：Accepted
- 日期：2026-09-01
- 范围：个人脱敏重构版 MVP

## 背景

工作区需要同时浏览完整原始日志和筛选后的翻译结果。目标规模包含 30,000 与 100,000 行；若为每条数据创建 DOM，渲染规模会随数据总量增长。结果还需要支持由右侧 `rawLineIndex` 定位左侧、搜索过滤、选中高亮和查看完整字段。

行内换行或详情展开会改变单行高度，使简单的 `index × itemHeight` 不再成立。MVP 必须在性能可预测性、信息完整性和实现风险之间作出明确选择。

## 候选方案

### A. 固定高度虚拟列表 + 独立详情面板

- 以固定 `itemHeight` 计算 total height、可见范围和 translate offset。
- 列表行只展示摘要并保持 `nowrap`；完整字段、问题与原始证据进入独立抽屉。
- `scrollToIndex` 可直接、确定地计算目标偏移。
- DOM 数量由 viewport 和 overscan 决定。

代价是列表内不能任意换行或展开，详情需要一次额外交互。

### B. 带测量缓存的动态高度虚拟列表

- 用真实 DOM 高度更新缓存，并维护前缀高度或索引结构。
- 行展开和容器宽度变化后需要 anchor correction。
- resize、过滤、展开/收起和快速滚动组合会增加状态与测试矩阵。

它更接近行内完整展示，但当前需求并未证明复杂度是必要的。

### C. 非虚拟化列表或通用表格组件

实现最简单，但 DOM 数量随 30k/100k 数据规模增长；通用组件也会遮蔽本项目要验证的 range、定位和 DOM 上界，不能满足核心目标。

## 决策

选择 A：固定高度虚拟列表 + 独立详情面板。

`packages/virtual-list` 提供纯函数 range/offset 算法与 Vue 组件。组件使用完整总高度占位、`translate3d` 定位实际行区域、overscan、`ResizeObserver` 和有界索引数组；公开 controller 为：

```ts
scrollToIndex(index, 'start' | 'center' | 'end' | 'auto')
scrollToOffset(offset)
getVisibleRange()
```

Web 左侧原始行固定为 32px，右侧结果行固定为 76px；详情由抽屉独立展示。右侧选择结果后，以 `rawLineIndex` 调用左侧 controller，并标记对应原始行。

## 验证

当前包级验证已实际执行：严格 TypeScript typecheck、ESLint，以及 21 个 Vitest 用例。用例覆盖 0/1/视口内、30k/100k、顶部/中部/底部、overscan 边界、四种对齐、offset/index clamp、ResizeObserver、快速滚动最终范围和 DOM 上界。

浏览器 benchmark 进一步在 560px 实际列表高度下验证：初始 DOM 为左 26、右 13，大滚动最大为左 35、右 19，均不超过 viewport + overscan 推导的 36/20 上界；30k 的左右程序化滚动 median 分别为 14.5ms 和 14.9ms。该测量不是 FPS 或主观滚动顺滑度证据，也没有前版本对照，因此不记录或推断性能提升百分比。

## 后果

正面结果：

- 计算为 O(1)，定位不依赖扫描或测量缓存。
- DOM 结构上界可直接测试。
- 两侧数据密度不同仍可通过显式索引映射定位。
- resize、底部 clamp 和快速滚动的状态较容易验证。

限制：

- 虚拟行必须保持固定高度；超长内容截断显示。
- 不支持行内任意换行、动态展开或混合高度。
- 详情面板是信息完整性的正式组成部分，而非临时补丁。

若未来明确要求动态高度，必须新建 ADR，并补齐测量缓存、高度变化、anchor correction、展开/收起和 resize 测试；在此之前不得声称已支持动态高度。
