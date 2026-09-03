# Synthetic parser fixtures

This package contains a deliberately self-contained synthetic catalog, Golden
Cases, and deterministic log generator for Parser Core tests and Node
benchmarks. Its command values are not real device data.

The Web app uses the separately validated catalog under
`packages/protocol-schema/protocols/`. `logs/demo.log` intentionally follows
that Web catalog for the documented first-run upload. Logs generated into
`logs/generated/` by `npm run fixtures:generate` belong to this package's
parser fixture catalog and are not Web upload examples. Web demonstrations may
also use `e2e/fixtures/` or the built-in “加载合成示例” action.

Keeping the two catalogs explicit tests the parser as a reusable package while
avoiding any implication that either synthetic catalog represents a company
protocol.
