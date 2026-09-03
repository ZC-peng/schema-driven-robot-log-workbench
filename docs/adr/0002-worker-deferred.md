# ADR-0002：Core MVP 延后 Web Worker

- 状态：Accepted
- 日期：2026-09-01
- 范围：个人脱敏重构版 Core MVP

## 背景

日志解析全部发生在浏览器主线程。Worker 会引入消息复制、job/requestId、进度、取消、错误传播和资源清理，因此只能在代表业务规模证明 Parser 本身形成长任务或稳定阻塞交互时采用，不能先实现再寻找理由。

## 证据

固定 seed `20260901`、Chrome `152.0.7977.65`、1440×1000 viewport 的原始结果位于 `benchmarks/results/`：

| 规模 | 定位 | Parser median / p95 | Parser 原始范围 | 外层 import-to-ready median / p95 |
|---:|---|---:|---:|---:|
| 30k | 代表规模 | 20.7 / 22.6 ms | 16.8–22.6 ms | 232.4 / 238.3 ms |
| 100k | 压力规模 | 63.2 / 65.9 ms | 61.4–65.9 ms | 524.5 / 559.3 ms |

30k 的 5/5 个外层导入窗口存在 Long Task，但同期同步 Parser 样本均低于 50ms，说明不能把外层条目直接归因于 Parser。100k 的 3/3 个外层窗口存在 Long Task，且压力规模的 Parser 超过 50ms，但它不是当前代表业务规模。Node 基线仅作为纯函数对照，不用于推断浏览器交互。

## 决策

Core MVP 不引入 Web Worker。保留当前纯 TypeScript Parser 与主线程调用边界，并保存分段 Performance measures。这个结论是“当前代表规模证据不足以证明 Worker 必要”，不是“Worker 永远无用”或“100k 无阻塞”。

## 重新评估条件

满足任一条件时新建后续 ADR 并进行同口径 A/B：

- 30k 代表 fixture 的 `parse_ms` 可重复达到或超过 50ms；
- 多日志并行导入造成可复现输入或绘制阻塞；
- 产品把 100k 提升为常规而非压力规模；
- Profile 将主要长任务明确定位到 Parser，而不是文件、框架提交或绘制阶段。

若采用 Worker，必须复用同一 Parser Core，以 `requestId` 隔离 job，并验证结果一致性、消息成本、进度、终止取消、错误传播和资源清理；不得只比较一个总耗时数字。

## 后果

- Core MVP 保持较小的状态与错误面，30k 代表路径无需承担 Worker 协议复杂度。
- 100k 压力规模仍可能出现主线程停顿；文档与 UI 不声称“100k 不卡”或稳定 FPS。
- 后续优化先细分 Vue 提交和绘制，再决定 Worker 是否能改善端到端体验。
