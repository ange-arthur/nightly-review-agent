# nightly-review-agent

A scheduled review agent for an automated system that runs without you watching it.

Every evening it answers four questions a human would otherwise have to answer by hand:

1. **What did the system actually do today?**
2. **Did it do what the reference model said it should?** (expected vs actual reconciliation)
3. **Is it healthy and configured the way we decided?** (heartbeat, data freshness, runtime configuration drift)
4. **Is anything serious enough to stop it?** (account guard)

It writes a Markdown report, classifies every finding on a three-level incident protocol, and keeps a
**persistent decision register** so that a question raised on Monday is still visible on Friday until a
human closes it.

This is the public, generalised version of an agent I run in production on a live automated trading
system (Windows task at 23:15 local time, every weekday). The production version adds domain checks
(strategy tags, simulation duels, market scoring audit) that are private; the orchestration, the
reconciliation, the health and configuration checks, the reporting and the governance are what you see
here, with synthetic example data.

## The governance rules the agent follows

| Level | Meaning | What the agent does |
|---|---|---|
| **N1 — tooling** | the agent or its data pipeline misbehaved (missing file, crashing check) | reports it; the rest of the report is still produced |
| **N2 — anomaly** | the monitored system did something unexpected | reports it for investigation |
| **N3 — production** | the only sane reaction would touch the live system | prepares the action, writes a **GO / NO-GO** question in the register, and **blocks**. It never acts on its own. |

Two design rules come with it:

- A check that crashes becomes an N1 incident. One broken data source must never cost you the whole nightly report.
- Everything that can be a rule is a rule. The agent explains, reconciles and asks; thresholds, tolerances and expectations live in a JSON file, not in a prompt.

## Quick start

Requires Node.js ≥ 22.18 (runs TypeScript directly, no build step for development).

```bash
npm install
npm test          # 35 tests, node:test
npm run demo      # reviews the bundled example day in dry-run mode
```

The demo writes `examples/reports/_preview_2026-10-06.md`. A committed real run is in
[`examples/reports/report_2026-10-06.md`](examples/reports/report_2026-10-06.md); it shows one missing
expected event, one event executed without a reference, a configuration drift on one symbol, a
heartbeat gap and a failed heartbeat, all flagged at the right level.

Production use:

```bash
node src/cli.ts --config /path/to/config.json            # reviews the day that just ended
node src/cli.ts --config config.json --date 2026-10-06    # replays a past day
node src/cli.ts --config config.json --dry-run            # preview without touching the register
```

The exit code is `3` when at least one N3 incident was raised, so a scheduler can alert on it.

## Inputs

Five flat files, written by the monitored system and its supervisor. Column names are fixed; the
delimiter (`;` or `,`) is detected from the header.

| Source | Columns | Used by |
|---|---|---|
| `actual` | `t;symbol;dir;result[;id]` | activity, reconcile |
| `expected` | `t;symbol;dir;result[;id]` — what the reference model (simulation, plan) expected | reconcile |
| `heartbeat` | `t;ok[;note]` — one line per supervisor check | health |
| `runtimeConfig` | `t;symbol;params` with `params = key=value key=value` emitted at each (re)start | config drift |
| `equity` | `t;balance;equity[;openPositions]` | account guard |
| `state_{symbol}` | any file whose modification time proves the component is alive | health (freshness) |

Timestamps are written in the monitored system's own clock; `utcOffsetHours` tells the agent how far
that clock is from UTC so "the day that just ended" is computed correctly. `--now` injects the clock for
reproducible runs on archived data, which is how the tests stay deterministic.

See [`examples/config.json`](examples/config.json) for every knob: matching tolerance, result divergence,
heartbeat gap, freshness limit, closed weekdays, loss thresholds, expected configuration per symbol.

## Architecture

```
src/
  cli.ts                 argument parsing, config loading, exit code
  agent.ts               orchestration: runs checks in isolation, builds report, updates register
  checks/
    activity.ts          what happened today
    reconcile.ts         expected vs actual (nearest-neighbour matching within tolerance)
    health.ts            heartbeat gaps and failures, freshness of state exports
    configDrift.ts       last runtime configuration vs expectation, changes during the day
    pnl.ts               account guard (N2 warning, N3 block)
  register.ts            persistent Markdown decision register (append-only for the agent)
  report.ts              Markdown rendering, incident ordering, one-line summary
  csv.ts, time.ts        small, tested primitives
```

A check is a plain object `{ name, run(ctx) }` returning `{ title, lines, incidents, questions? }`.
Adding a domain check means adding one file and one entry in `defaultChecks`; nothing else changes.

## Scheduling

`scripts/register-task.ps1` registers the agent as a Windows scheduled task (weekdays, 23:15). On
Linux or macOS a cron line does the same:

```
15 23 * * 1-5  cd /opt/nightly-review-agent && node src/cli.ts --config /etc/review/config.json >> /var/log/nightly-review.log 2>&1
```

## Development

```bash
npm run typecheck   # strict TypeScript, erasable syntax only (runs under Node's type stripping)
npm run build       # emits dist/ for environments that cannot run .ts directly
```

## How this was built

I designed the production agent this repository generalises and have run it nightly since
September 2026. This public version was produced with Claude Code working under my direction: I set
the scope (what to keep, what to strip), the architecture (isolated checks, three-level protocol,
append-only register), reviewed every module and test, and validated the example report against what
the production agent produces. The commits carry the AI co-author trailer on purpose: directing coding
agents and owning the result is the workflow this project demonstrates.

## License

MIT
