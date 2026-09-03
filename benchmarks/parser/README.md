# Parser benchmark

This harness measures the framework-agnostic parser against deterministic,
entirely synthetic logs. It records every wall-clock sample and derives median
and p95 from those retained values. It is a Node baseline; it does not establish
browser main-thread responsiveness or justify a Web Worker by itself.

Generated target frames use the invented `[WIRE:TX]`/`[WIRE:RX]` grammar, a
synthetic `D7` multi-process marker, and selector offsets supplied by the
protocol bundles. No benchmark fixture represents a real device format.

Run the full fixed-size matrix:

```powershell
npm run bench:parser
```

The default matrix is 1k, 10k, 30k, and 100k lines with seed `20260901`, two
warmups, and ten recorded samples. Results are written beneath
`benchmarks/parser/results/`. To make a short smoke run:

```powershell
npm run bench:parser -- --sizes 1000,10000 --samples 3 --warmup 1
```

Do not edit result numbers. Re-run the harness when code, runtime, or machine
changes, and compare like-for-like fixture seeds and environments.

The retained current run is
`results/parser-2026-09-03T04-03-07-943Z.json`. Its 30k median/p95 is
`17.25/19.64 ms`; the 100k Node baseline is `61.90/91.31 ms`. These values are
not browser main-thread measurements.
