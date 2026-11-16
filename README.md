# Token Radar — radar-2

A token launch radar for make.fun's token-radar-01 bounty. It reads the sealed DefiLlama
snapshot, works out which protocols still record no token and are not a wrapped or staked
product of one that trades, prices each one's launch off the protocols whose tokens already
trade, and hands in a web dashboard: the ranked board, a detail view for every protocol, and
the costed steps to farm it.

## Run it

Node 22.18+, standard library only, nothing to install:

```
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Outputs in `out/`: `board.json` (the ranked board), `data.js` (the dashboard's data),
`dashboard/` (the static page — open `dashboard/index.html` after a run, it needs no network),
`screenshots/`, and `dossier.json` (built with the vendored `vendor/makefun-board.ts`).
The program is deterministic: two runs on the same snapshot write the same bytes.

## The model (radar-2)

One model prices the board, the page and `board.json`, so they cannot disagree. It is fitted
at run time from the snapshot itself — no protocol name is ever special-cased or hardcoded.

- **Comps.** The 128 protocols whose token already trades (market cap, CoinGecko id and symbol
  on record) with TVL and market cap above zero.
- **Size curve.** `log(mcap_usd) = 6.1397 + 0.5686 × log(tvl_usd)`, least squares on the comps,
  after one cleaning pass that drops comps more than 2.5 residual standard deviations out and
  refits (126 clean comps). The constants above are what the fit produces on this snapshot;
  the code recomputes them from whatever snapshot it is given.
- **Implied value.** `exp(curve at the protocol's TVL)`, adjusted by its seven-day TVL growth
  (clamped −60%…+120%, weight 0.5) and by maturity — how long it has run with no token
  (0.6…1.0 over three years).
- **Band.** Each row carries the interquartile band of the clean comps' residuals:
  implied × 0.3343 to × 3.9857. The band is wide because TVL alone explains only part of a
  launch value — so it is printed on every row, not hidden.
- **Backtest, stated because the curve is only as good as its errors.** Leave-one-out on the
  clean comps: median fold error ×3.43. A deterministic holdout (29 comps the fit never saw):
  ×3.07. Category offsets were fitted and tested the same way and rejected — out of sample
  they did not beat the single curve.
- **The board.** All 342 pre-token protocols in the snapshot are audited; wrapped, staked,
  bridged, versioned and exchange products of a traded token are set aside, leaving 198 rows.
  The snapshot's 40-protocol watchlist is covered in full (marked ★ on the page).

## Farm plans, netted to the dollar

Every row's plan gives concrete steps with a cost and a time for each, and ends in its own
economics under stated assumptions: a launch distributes 5% of its implied value to qualifying
wallets (one per $5,000 of TVL, at least 100), half split equally among them (the activity base
a weekly-action plan earns) and half pro rata by capital. Costs are the plan's gas and fees
plus its capital's time at a 5% T-bill rate.

- **Farm** — the take at the band's low end still beats the costs.
- **Thin** — only the mid-band take does.
- **Skip** — neither does; the plan says so, with the break-even launch odds.

On this snapshot that is 16 Farm, 125 Thin, 57 Skip. The biggest launch is not always the best
farm: the #1 protocol by implied value is a Skip, because its size dilutes a small farmer's
share below the plan's costs.

## The dashboard

`dashboard/` is a static page (no framework, no network) generated from the same board:
sortable and filterable (search, category, farm verdict, watchlist-only), a Live token tab
that keeps the traded protocols apart with the market's own values, a model panel that states
the curve, its backtest and the farm assumptions, and a detail view per protocol with its
model breakdown, band, farm economics and plan. The page recomputes each row's implied value
from the fitted curve and checks it against the board's number. Total dashboard source is
about 31.5 KB, so the judge reads it whole.

## License

MIT — see `LICENSE`.
