# AI Coding Case：把协议 JSON 变成可验证的受限 Schema

## 问题

日志解释规则来自 JSON。仅依赖 TypeScript 接口无法验证运行时 JSON；只做逐字段结构校验，又无法发现“两个命令使用同一查找键”“`minBytes` 覆盖不了必读 offset”“同一 offset 的条件分支可以同时命中”等跨记录问题。错误若进入索引，可能发生静默覆盖；错误若进入 Parser，可能把配置缺陷伪装成日志异常。

## 约束

- 公开数据必须完全合成，不连接任何非公开协议库或内部知识库。
- Parser Core 保持确定性，不执行协议中的任意 JavaScript 表达式。
- TypeScript 开启 `strict`、`noUncheckedIndexedAccess` 和 `exactOptionalPropertyTypes`。
- 普通协议扩展应主要修改配置，但配置表达力必须有限且可验证。
- 结构错误与跨记录语义错误需要给出稳定 path/code，便于测试和启动失败提示。

## 候选方案

1. **只写 TypeScript 类型并直接断言 JSON。** 成本低，但类型在运行时被擦除，无法阻止损坏或手写错误的 JSON。
2. **只用 Zod 做逐记录校验。** 能验证 shape，却不擅长目录级唯一性和多个字段间的冲突。
3. **JSON Schema + 独立生成类型。** 可行，但本项目还需要 TypeScript 内的判别联合和自定义跨记录规则，会增加双源同步成本。
4. **Zod 结构层 + 自定义语义层 + 防御性索引。** 结构类型从 schema 推导，跨记录规则集中检查，索引构建仍拒绝重复键。

## 选择

选择方案 4。

`packages/protocol-schema/src/schema.ts` 使用 `z.strictObject`、判别联合和受限枚举表达：

- `processType` 只允许 `single | multi`，方向只允许 `up | down`；
- Hex byte 必须是大写两位十六进制；
- selector 使用协议内配置的非负 `categoryOffset` 与 `subTypeOffset`；当前完全虚构样例刻意采用新的非默认位置，避免 Parser 保留固定字节假设；
- decoder 只允许 `hex`、`uint8`、`enum`；
- 条件只允许 `equals` 或 `in`，不接受任意表达式；
- 未声明属性由 strict object 拒绝。

`validation.ts` 再检查目录级规则：

- single/multi bundle 是否各恰好一份；
- `processType + direction + category + subType` 是否唯一；
- `minBytes` 是否覆盖 selector、必读字段与条件来源；
- 字段 key 是否重复；
- 同一 offset 的无条件/条件字段是否冲突；
- 条件来源不一致或取值集合重叠是否会造成二义性。

最后，`indexer.ts` 在构建嵌套 `Map` 时再次拒绝重复 composite key，避免绕过语义校验后静默覆盖。

## 验证方式

仓库中的可见证据包括：

- `packages/protocol-schema/tests/schema.test.ts`：严格结构、hex、offset、decoder 和 condition；
- `packages/protocol-schema/tests/validation.test.ts`：缺少/重复进程类型、重复命令键、`minBytes`、字段 key、offset 与条件冲突；
- `packages/protocol-schema/tests/catalog-and-index.test.ts`：合成目录加载、版本与索引查找；
- `packages/test-fixtures/golden/cases.json`：条件命中/跳过、未知、短指令、混合进程和原始行索引等合成规则；
- `tools/validate-protocols.ts`：命令行加载当前两份协议并格式化失败路径。

## 失败案例与修正

### 失败 1：把“Zod 通过”当成目录正确

两条命令各自 shape 都合法，仍可能拥有相同 composite key。修正是在结构层之后添加目录级语义遍历，并让索引构建再次拒绝重复键。

### 失败 2：只检查字段 offset，不检查条件来源

条件字段的目标 offset 可能可选，但 `sourceOffset` 是判断分支所必需。若 `minBytes` 不覆盖它，Parser 无法可靠判断字段是否应用。修正是把无条件字段 offset 与所有条件来源都纳入 required offset 计算。

### 失败 3：允许同一 offset 的条件集合重叠

两个条件字段都可能对同一个 byte 生效，产生两种解释。修正是要求共享 offset 的条件使用同一来源且取值集合互斥；不同来源视为可能同时命中并报错。

## 结论

AI 在这个案例中的价值是帮助枚举边界与生成反例；最终工程决策不是“生成一个 schema 即完成”，而是明确分成结构、语义和索引三道防线，并用合成负例约束行为。当前证据只能说明仓库内合成规则得到验证，不能外推为任何非公开真实协议的正确性。
