# Rendering, scroll, and locate benchmark

The raw evidence is in:

- `../results/browser-2026-09-03T04-03-21-631Z.json` — representative 1k,
  10k, and 30k sizes; five samples and one warmup per operation.
- `../results/browser-2026-09-03T04-03-45-284Z.json` — opt-in 100k stress
  size; three samples and one warmup per operation.

Environment recorded by both files: headless Chrome channel reported as
`chromium 152.0.7977.65`, Windows `10.0.26200`, Intel Core Ultra 5 125H,
1440 × 1000 page viewport, seed `20260901`, and catalog
`sha256:24cccf567c0c62088b038ee1189716b8e62795319c7c52c14c4bf5348c9189d6`.
The catalog value was derived at runtime from the current protocol JSON.

## Observed results

| Lines | Import median / p95 (ms) | Raw scroll median / p95 (ms) | Result scroll median / p95 (ms) | Locate median / p95 (ms) | Tab median / p95 (ms) |
|---:|---:|---:|---:|---:|---:|
| 1,000 | 99.8 / 104.2 | 12.1 / 12.7 | 13.7 / 15.1 | 6.1 / 8.0 | 8.0 / 8.5 |
| 10,000 | 131.6 / 144.0 | 13.6 / 14.9 | 14.3 / 16.1 | 7.6 / 9.0 | 7.2 / 7.2 |
| 30,000 | 232.4 / 238.3 | 14.5 / 16.1 | 14.9 / 15.6 | 11.1 / 11.3 | 8.6 / 8.8 |
| 100,000 stress | 524.5 / 559.3 | 14.3 / 14.6 | 15.6 / 16.8 | 28.3 / 29.5 | 16.3 / 17.0 |

The application also records narrower boundaries during every initial import:

| Lines | File read median / p95 (ms) | Parser median / p95 (ms) | App upload-to-first-result median / p95 (ms) |
|---:|---:|---:|---:|
| 1,000 | 3.3 / 4.2 | 1.3 / 1.8 | 46.9 / 51.2 |
| 10,000 | 5.4 / 10.0 | 7.0 / 8.9 | 57.2 / 60.9 |
| 30,000 | 8.5 / 14.7 | 20.7 / 22.6 | 71.8 / 79.6 |
| 100,000 stress | 29.6 / 29.7 | 63.2 / 65.9 | 141.3 / 141.9 |

`import-to-ready` is a Playwright-observed outer window. The app measure starts
inside the input handler, and the Parser measure brackets only the synchronous
framework-independent Parser call. These boundaries intentionally answer
different questions and must not be substituted for one another.

For initial render, every recorded sample contained 26 actual left items and 13
actual right items. After large scrolls, maxima were 35 left items and 19 right
items. The observed structural bounds were 36 left and 20 right, so every
sample remained within its viewport-plus-overscan bound despite 30k or 100k
source lines. These bounds use the actual 560 px list client height reported by
this run; another layout or viewport must recompute them.

Chrome reported no in-window Long Task entries for the warmed 1k import
samples. Long Tasks occurred in all five 30k import-to-ready windows, while
their synchronous Parser samples remained `16.8–22.6 ms`. All three 100k
import-to-ready windows also contained Long Tasks, and their Parser samples
were `61.4–65.9 ms`. This establishes that Long Tasks occurred during those
outer import windows on this machine. It does not
attribute each entry solely to parsing, nor by itself prove a specific Worker
design will improve end-to-end time.

FPS and memory were not measured. The programmatic scroll samples only measure
the defined DOM update interval and must not be presented as frame-rate or
subjective smoothness evidence.
