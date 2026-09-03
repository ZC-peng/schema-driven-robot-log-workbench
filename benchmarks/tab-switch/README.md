# Tab switching: one-sided versus two-sided virtualization A/B

This benchmark reconstructs one specific historical diagnosis using only the
current privacy-safe project and synthetic data. It is **not** a measurement of
the unavailable internship build.

Both variants consume the same deliberately invented frame grammar:
`[WIRE:TX]`/`[WIRE:RX]`, a `D7` synthetic multi-process marker, and
protocol-configured selector offsets. The byte values do not encode a real
device protocol.

- A: the 30k-row raw list is virtualized; all ~3k result rows are mounted.
- B: both the raw and result lists are virtualized (the normal app behavior).
- Both variants use the exact same `ResultCommandRow.vue` markup and CSS.
- Each variant has two 30k-line sessions parsed before timing begins.
- Seed `20260901` and `targetEvery = 10` produce exactly 3,000 result rows per
  session.
- Warmups and formal samples are interleaved in repeated ABBA blocks. Defaults:
  four warmups and 30 formal samples per variant.

The measured window starts immediately before clicking the inactive tab and
ends after the target heading and list are committed across two animation-frame
boundaries. It excludes file reading, hashing, and parsing. Raw timing values,
Long Task entries, left/right DOM counts, environment, catalog version, seeds,
and source hashes are written to `results/tab-switch-ab-*.json`.

Run:

```powershell
npm run bench:tab-switch-ab
```

Optional variables:

- `SRLW_TAB_AB_SAMPLES`: even number, at least 30 per variant.
- `SRLW_TAB_AB_WARMUP_BLOCKS`: ABBA blocks; default 2 = 4 warmups per variant.
- `SRLW_TAB_AB_SEED`: deterministic fixture seed.
- `SRLW_TAB_AB_BROWSER_CHANNEL`: Playwright browser channel; default `chrome`.
- `SRLW_TAB_AB_OUTPUT_DIR`: output directory.
- `SRLW_TAB_AB_BASE_URL` plus `SRLW_TAB_AB_EXISTING_SERVER=1`: reuse a server.

## Interpretation boundary

The result may support wording such as “在当前脱敏重构的同机合成 A/B 中……”.
It must not be presented as an internship production metric, a user-efficiency
metric, FPS evidence, memory evidence, or a universal percentage improvement.

## Recorded results

Two complete runs were recorded with the same source hash, catalog, machine,
Chrome version, viewport, and seeds. Each cell is based on 30 formal samples
per variant after four warmups per variant.

| Run | A median / p95 | B median / p95 | Median reduction | A / B right-row DOM | Samples with Long Task, A / B |
|---|---:|---:|---:|---:|---:|
| `2026-09-03T04-04-23-020Z` | 327.0 / 447.0 ms | 11.1 / 15.9 ms | 96.61% | 3,000 / 13 | 30 / 0 |
| `2026-09-03T04-04-48-529Z` | 308.3 / 579.3 ms | 11.1 / 15.6 ms | 96.40% | 3,000 / 13 | 30 / 0 |

Raw evidence:

- `results/tab-switch-ab-2026-09-03T04-04-23-020Z.json`
- `results/tab-switch-ab-2026-09-03T04-04-48-529Z.json`

The A p95 varies because occasional full-DOM rebuilds are slower, but the two
runs agree on the direction and scale of the median. All 60 A samples mounted
exactly 3,000 result rows and contained at least one Long Task. All 60 B samples
mounted exactly 13 result rows and contained no Long Task in the measured
window. Target-session stratification also preserved the result: in the repeat
runs; their aggregate A medians were 327.0 and 308.3 ms, while both aggregate
B medians were 11.1 ms.

The safe evidence statement is: “在当前脱敏重构的同机合成 A/B 中，30k 行、
约 3k 条结果的双侧虚拟化将右侧挂载行数从 3,000 控制到 13；两次各 30 组
样本中，Tab 切换中位数由 308.3–327.0 ms 降至 11.1 ms。” The percentage and
absolute values must always retain that scope. A more conservative résumé claim
can use the structural fact (3,000 → 13 mounted rows) and “切换 p95 控制在 17
ms 内” while identifying it as a reconstruction benchmark.

The first attempted run is not retained: its A page was in the background and
Chrome throttled `requestAnimationFrame`. The valid harness calls
`page.bringToFront()` outside every measured window; that control is recorded in
each JSON report.
