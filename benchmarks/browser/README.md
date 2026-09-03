# Browser benchmark harness

This Playwright harness measures the running Web application with deterministic,
entirely synthetic logs. It does not use company logs, identifiers, URLs, or
protocols. The default browser is the locally installed Chrome channel in
headless mode with a fixed 1440 × 1000 viewport.

The fixture grammar is deliberately fictional: target lines use
`[WIRE:TX]`/`[WIRE:RX]`, the synthetic multi-process marker is `D7`, and the
protocol bundles read category/subtype from configured offsets 2 and 5. These
tokens and byte values are test-only conventions, not aliases for a real log
format.

## What is measured

- `import-to-ready`: immediately before assigning the synthetic file to the
  file input through ready UI state and two animation frames. It includes local
  file reading, main-thread parsing, Vue commit, and the observed first virtual
  list paint.
- application `file_read_ms`, `parse_ms`, and `upload_to_first_result_ms`
  measures for every import sample. The report keeps each raw phase sample plus
  median/p95; `parse_ms` brackets only the synchronous Parser call.
- `switch-active-tab-to-visible`: browser time from a tab button click until the
  selected session heading and result virtual list are committed. Both sessions
  are parsed before sampling.
- raw/result programmatic scroll: a deterministic `scrollTop` change through
  two animation frames. This is a repeatable DOM-update measurement, not an FPS
  or subjective wheel-smoothness measurement.
- `result-to-raw-locate`: a result-row click until its `rawLineIndex` is inside
  the left visible range and the corresponding DOM row is highlighted.
- actual left/right virtual item DOM counts, the component's
  `data-rendered-count`, visible range, observed viewport height, and a
  geometry-derived upper bound.
- Long Task durations only when Chrome reports support through
  `PerformanceObserver.supportedEntryTypes`. Unsupported runs are marked as
  unsupported rather than recorded as zero.

Every timing sample is retained in `rawValuesMs`; median and p95 use the nearest
rank method. Memory and FPS are deliberately not measured because this harness
does not have a stable, comparable collection method for them.

## Run

From the repository root, with dependencies already installed:

```powershell
npx tsc -p benchmarks/browser/tsconfig.json
npx playwright test --config benchmarks/browser/playwright.benchmark.config.ts
```

The Playwright config starts the Web Vite server on `127.0.0.1:4173`. If a
server is already running there, explicitly reuse it:

```powershell
$env:SRLW_BENCH_EXISTING_SERVER='1'
npx playwright test --config benchmarks/browser/playwright.benchmark.config.ts
```

Environment controls:

| Variable | Default | Meaning |
|---|---:|---|
| `SRLW_BENCH_SIZES` | `1000,10000,30000` | Comma-separated line counts |
| `SRLW_BENCH_SAMPLES` | `5` | Recorded samples per operation and size |
| `SRLW_BENCH_WARMUP` | `1` | Unrecorded warmup runs |
| `SRLW_BENCH_SEED` | `20260901` | Deterministic fixture seed |
| `SRLW_BENCH_INCLUDE_STRESS` | unset | Set to `1` to append the 100k stress size |
| `SRLW_BENCH_BROWSER_CHANNEL` | `chrome` | Installed Playwright browser channel |
| `SRLW_BENCH_BASE_URL` | `http://127.0.0.1:4173` | Application URL |
| `SRLW_BENCH_OUTPUT_DIR` | `benchmarks/results` | Raw JSON output directory |

Run only the opt-in 100k stress scale:

```powershell
$env:SRLW_BENCH_SIZES='100000'
$env:SRLW_BENCH_SAMPLES='3'
$env:SRLW_BENCH_WARMUP='1'
npx playwright test --config benchmarks/browser/playwright.benchmark.config.ts
```

The harness reads `single.json` and `multi.json` from the current protocol
package, validates them, derives `catalogVersion` with the production SHA-256
function, and verifies that the running app displays that exact version. The
hash is never handwritten in the harness.

For meaningful comparisons, use the same code, browser channel/version,
viewport, line sizes, seed, sample count, warmup count, and machine load. Do not
edit generated result numbers; rerun the harness instead.
