# Browser benchmark result manifest

Generated JSON files are immutable raw evidence. Do not hand-edit their timing,
DOM, Long Task, environment, seed, or catalog fields; rerun the harness to
produce a new timestamped file.

Current retained runs:

- `browser-2026-09-03T04-03-21-631Z.json`: representative 1k/10k/30k matrix,
  15 records, five measured samples and one warmup for every operation.
- `browser-2026-09-03T04-03-45-284Z.json`: separately labeled 100k stress run,
  five records, three measured samples and one warmup for every operation.

Each report retains:

- all `rawValuesMs`, median, and p95;
- initial-import `fileReadMs`, `parseMs`, and `uploadToFirstResultMs` raw phase
  samples plus their median/p95 summaries;
- actual DOM count, component count attribute, visible range, viewport geometry,
  and structural upper bound for both lists;
- raw located line indices for locate samples;
- Long Task support and raw duration arrays per sample;
- OS, CPU, actual browser version/channel, fixed viewport, seed, synthetic
  fixture identity, and catalog version derived from current protocol content;
- explicit exclusions for FPS and memory.

See `../browser/README.md` for the exact command and measurement boundaries.
