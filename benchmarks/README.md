# Benchmark 证据与复现规则

本目录保存已运行的 Parser Node 基线与真实浏览器 benchmark。全部输入均由固定 seed 生成，协议版本由当前合成协议内容推导；原始样本、环境、median/p95、Long Task 和 DOM 结构证据保存在 JSON 中。`npm run bench` 会依次运行 Parser 与通用浏览器基准；也可分别使用 `npm run bench:parser` 与 `npm run bench:browser`。单侧/双侧虚拟化的同运行对照使用独立命令 `npm run bench:tab-switch-ab`，避免把诊断实验混入常规基线。

## 为什么单元测试不等于 benchmark

Virtual List 的测试已验证 30k/100k 时 DOM 行数受 viewport 与 overscan 约束；Parser/Schema 测试验证确定性和错误边界。这些属于正确性与结构证据，不能回答真实浏览器中的解析耗时、长任务、滚动帧率或 Tab 切换耗时。

## 已实现的场景

1. **Parser Node 基线**：1k、10k、30k、100k 合成行，记录总行、目标行、完整原始样本、median 和 p95；该结果不代表浏览器响应性。
2. **首次导入与渲染**：从文件输入赋值前到 ready UI 加两帧，包含文件读取、主线程解析、Vue 提交和首个虚拟列表绘制。
3. **双侧滚动与定位**：程序化大滚动、结果点击到左侧 `rawLineIndex` 可见并高亮，记录实际 DOM 数量和几何上界。
4. **Tab 切换**：两个已解析会话往返切换，测量视图提交，不把初次 Parser 成本混入。
5. **Long Task**：仅在浏览器支持相应 PerformanceObserver entry 时记录；不支持时明确标注，而不是记作零。
6. **Tab 切换 A/B**：两份 30k 行、各 3k 结果的会话预先解析；以 ABBA 顺序比较“仅左侧虚拟化”和“双侧虚拟化”，详见 [tab-switch/README.md](tab-switch/README.md)。

数据只使用各 harness 的确定性合成生成器；默认 seed 与行数必须写进每份结果。Parser fixture catalog 与 Web catalog 相互独立，浏览器 harness 会读取并核对当前 Web catalog 的内容哈希。

当前未测搜索派生更新、FPS 与内存；程序化滚动耗时不能表述为帧率或主观顺滑度。

## 最低实验规范

每次结果至少记录：

- commit 或源码快照标识；
- 日期、OS、CPU、内存、Node、浏览器与版本；
- fixture seed、总行数、目标行数、process type；
- viewport、item height、overscan；
- warm-up 次数、正式样本数和原始样本；
- median、p95 的计算方式；
- 是否启用 DevTools、后台标签页和节能模式；
- 失败、异常值与剔除理由。

原始结果优先保存为 JSON 或 CSV，汇总 Markdown 只能由原始数据派生。不得只保留截图或一个平均数。

建议结构：

```text
benchmarks/
├─ browser/
├─ parser/
├─ rendering/
├─ tab-switch/
└─ results/
   └─ browser-<timestamp>.json
```

## 当前可引用结果

本机环境、完整口径和原始值见 [rendering/README.md](rendering/README.md) 与 [results/](results/)。代表规模 30k 行：导入 median/p95 `232.4/238.3 ms`，应用内 Parser `20.7/22.6 ms`，Tab 切换 `8.6/8.8 ms`，结果定位 `11.1/11.3 ms`；100k 压力规模导入为 `524.5/559.3 ms`，Parser 为 `63.2/65.9 ms`。初始 DOM 为左 26、右 13，大滚动最大为左 35、右 19，均未超过当前 560px 视口计算出的 36/20 上界。

30k 与 100k 的宽口径导入窗口观测到 Long Task；30k 的 5/5 个导入窗口均有记录，但同期同步 Parser 原始样本仅为 `16.8–22.6 ms`，未单独形成 50ms 长任务；100k 的 3/3 个导入窗口均有记录，其 Parser 样本为 `61.4–65.9 ms`。1k 与 10k 的本次导入样本没有记录到窗口内 Long Task。因此 Core MVP 延后 Worker，并在 [ADR-0002](../docs/adr/0002-worker-deferred.md) 记录重新评估条件。常规浏览器基线没有同口径前版本，不能据此报告提升百分比；只有 [单侧/双侧虚拟化 A/B](tab-switch/README.md) 具备受控对照，并且其数字必须明确限定为当前脱敏重构与合成数据。

## 结果发布门槛

- 至少在同一环境重复运行并保留所有样本。
- 比较前后必须使用相同 fixture、viewport、构建模式和浏览器版本。
- 报告绝对时间和分布，不只报告百分比。
- 将结构结论和耗时结论分开：DOM 有界不自动等于滚动无卡顿。
- 如果结果显示 Parser 形成明显长任务，再评估 Worker；不能先选 Worker 再寻找理由。
- 未满足上述门槛时，只能写“测试覆盖 30k/100k 的 DOM 上界”，不能写性能收益。
