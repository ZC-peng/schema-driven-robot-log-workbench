# Golden case review notes

All inputs, byte values, command names, and expected values in `cases.json` are
synthetic. The expected values are written as a reviewable rule table; they are
not snapshots emitted by the parser.

The independent rule check is `packages/parser-core/tests/rules.test.ts`. It
tests direction mapping, strict byte decoding, log-level process detection,
protocol-configured selector lookup, each decoder, both condition operators, missing
condition bytes, stable ordering, summaries, determinism, and framework
independence without reading expected values from `cases.json`.

Before presenting these Golden Cases as personally verified portfolio evidence,
the repository owner should review every `rule`, `inputLog`, and `expected`
triple. Automated passing tests are evidence of implementation consistency, not
proof that an AI-generated synthetic protocol reflects any real protocol.
