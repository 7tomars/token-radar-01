// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// radar-2: a comparables model, fitted at run time from the snapshot itself, never hardcoded.
//
//   Comps      Every protocol whose token already trades (a market cap, a CoinGecko id and a symbol
//              on its record) with tvl_usd > 0 and mcap_usd > 0: 128 of the snapshot's 758.
//   Size curve log(mcap_usd) = a + b x log(tvl_usd), fitted by least squares on the comps, one
//              cleaning pass that drops comps more than 2.5 residual standard deviations out,
//              then refitted: 126 clean comps. No protocol name is ever special-cased.
//   Implied    base = exp(a + b x log(tvl_usd)) for a pre-token protocol, then the two
//              adjustments the brief names: growth (its seven-day TVL change, clamped) and
//              maturity (how long it has run with no token). implied = base x growth x maturity.
//   Band       The interquartile range of the clean comps' log residuals, as two multipliers on
//              the implied value: low = implied x exp(q25), high = implied x exp(q75).
//   Backtest   Leave-one-out on the clean comps and a deterministic holdout (every fifth comp by
//              slug hash, fitted without it): both report the median fold error, and the dashboard
//              states them. Category offsets were tested the same way and rejected: out of sample
//              they did not beat the single curve, so the model keeps one curve for every row.
//   Farm       A plan's economics, stated as assumptions on the dashboard: a community allocation
//              of 5% of the launch value, paid to qualifying wallets - one qualifying wallet per
//              $5,000 of TVL, at least 100 - with half the pool split equally among them (the
//              activity base a weekly-action plan earns) and half pro rata by capital. Costs are
//              the plan's own gas and fees plus the capital's time at a 5% T-bill rate over the
//              hold. Verdict, netted at the band's low end: Farm when the low band still nets
//              positive, Thin when only the mid does, Skip when neither does.
//              Break-even odds = costs / mid-band take.
//
// The board audits every pre-token protocol the snapshot carries (342), keeps the ones that are
// not a wrapped, staked, bridged, versioned or exchange product of a token that already trades
// (198 rows), and always covers the snapshot's whole 40-protocol watchlist.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  trim_sigma: number;
  allocation_share: number;
  wallet_tvl_usd: number;
  tbill_rate: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  trim_sigma: 2.5,
  allocation_share: 0.05,
  wallet_tvl_usd: 5000,
  tbill_rate: 0.05,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** The fitted size curve and its honest backtest, computed from the snapshot at run time. */
export interface FitStats {
  comps: number;
  clean_comps: number;
  intercept: number;
  slope: number;
  loo_median_fold: number;
  holdout_median_fold: number;
  holdout_n: number;
  band_low_mult: number;
  band_high_mult: number;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One protocol's farm economics under the stated assumptions. */
export interface FarmEconomics {
  capital_usd: number;
  hold_days: number;
  cash_cost_usd: number;
  opportunity_cost_usd: number;
  total_cost_usd: number;
  take_low_usd: number;
  take_mid_usd: number;
  net_low_usd: number;
  net_mid_usd: number;
  breakeven_pct: number;
  verdict: 'Farm' | 'Thin' | 'Skip';
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  verdict: 'Farm' | 'Thin' | 'Skip';
  model: {
    base_value_usd: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm: FarmEconomics;
  farm_steps: string[];
}

/** The dashboard's view of one row: the board row's figures plus its farm plan, one model everywhere. */
export interface RadarRow extends BoardRow {}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, the fit and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  fit: FitStats;
  audited_size: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Least squares y = a + b x over paired points. */
function ols(xs: number[], ys: number[]): { a: number; b: number } {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  return { a: my - b * mx, b };
}

/** The median of a non-empty list. */
function median(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A quantile of a sorted list, by nearest rank. */
function quantile(sorted: number[], frac: number): number {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(frac * sorted.length)));
  return sorted[i]!;
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** A traded comparable: records a token and carries both a TVL and a market cap to fit on. */
function isComp(p: SnapshotProtocol): boolean {
  return !isPreToken(p) && p.tvl_usd > 0 && p.mcap_usd !== null && p.mcap_usd > 0;
}

/** One cleaning pass and a refit: the curve the board prices from. */
function fitCurve(comps: SnapshotProtocol[], trimSigma: number): { a: number; b: number; clean: SnapshotProtocol[] } {
  const xs = comps.map((p) => Math.log(p.tvl_usd));
  const ys = comps.map((p) => Math.log(p.mcap_usd!));
  const first = ols(xs, ys);
  const resid = ys.map((y, i) => y - (first.a + first.b * xs[i]!));
  const mean = resid.reduce((s, v) => s + v, 0) / resid.length;
  const sd = Math.sqrt(resid.reduce((s, v) => s + (v - mean) * (v - mean), 0) / resid.length);
  const clean = comps.filter((_, i) => Math.abs(resid[i]!) <= trimSigma * sd);
  const cx = clean.map((p) => Math.log(p.tvl_usd));
  const cy = clean.map((p) => Math.log(p.mcap_usd!));
  const refit = ols(cx, cy);
  return { a: refit.a, b: refit.b, clean };
}

/** The deterministic holdout split: every fifth comp by slug char-code sum sits out the fit. */
function inHoldout(slug: string): boolean {
  let sum = 0;
  for (let i = 0; i < slug.length; i++) sum += slug.charCodeAt(i);
  return sum % 5 === 0;
}

/** Fit the size curve on the snapshot's traded protocols and measure it, out of sample, twice. */
export function fitComps(snapshot: Snapshot, model: ModelConstants = MODEL): FitStats {
  const comps = snapshot.protocols.filter(isComp);
  const { a, b, clean } = fitCurve(comps, model.trim_sigma);
  const xs = clean.map((p) => Math.log(p.tvl_usd));
  const ys = clean.map((p) => Math.log(p.mcap_usd!));
  const resid = ys.map((y, i) => y - (a + b * xs[i]!)).sort((x, y) => x - y);

  // Leave-one-out: refit without each comp in turn and price that comp.
  const looErrors: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const rest = clean.filter((_, j) => j !== i);
    const fit = ols(rest.map((p) => Math.log(p.tvl_usd)), rest.map((p) => Math.log(p.mcap_usd!)));
    looErrors.push(Math.abs(ys[i]! - (fit.a + fit.b * xs[i]!)));
  }

  // Holdout: fit on the training comps only, price the held-out fifth.
  const train = clean.filter((p) => !inHoldout(p.slug));
  const test = clean.filter((p) => inHoldout(p.slug));
  const trainFit = fitCurve(train, model.trim_sigma);
  const holdoutErrors = test.map((p) => Math.abs(Math.log(p.mcap_usd!) - (trainFit.a + trainFit.b * Math.log(p.tvl_usd))));

  return {
    comps: comps.length,
    clean_comps: clean.length,
    intercept: round4(a),
    slope: round4(b),
    loo_median_fold: round2(Math.exp(median(looErrors))),
    holdout_median_fold: round2(Math.exp(median(holdoutErrors))),
    holdout_n: test.length,
    band_low_mult: round4(Math.exp(quantile(resid, 0.25))),
    band_high_mult: round4(Math.exp(quantile(resid, 0.75))),
  };
}

/** The growth and maturity adjustments and the implied value one protocol gets under `fit`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fit: FitStats,
  model: ModelConstants = MODEL,
): { implied: number; base: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const base = Math.exp(fit.intercept + fit.slope * Math.log(Math.max(1, protocol.tvl_usd)));
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, base, growthPct, growthMult, maturityMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are a wrapped, staked, bridged or exchange product of a token that trades. */
const WRAPPED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names a wrapped product may begin with. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** A whole word wrapped, staked or staking in a protocol's name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/**
 * Whether a pre-token protocol is a product of a token that already trades, and so not a launch
 * of its own: a wrapped, staked, bridged, versioned or exchange product. The watchlist is exempt:
 * the house's own list is covered whatever this audit says.
 */
export function isWrappedProduct(p: SnapshotProtocol): boolean {
  if (p.category !== null && WRAPPED_CATEGORIES.has(p.category)) return true;
  if (VERSIONED.test(p.name)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  if (EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e))) return true;
  return false;
}

/** Whether a protocol is one the board may rank: pre-token and not a wrapped product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !isWrappedProduct(p);
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** A protocol's farm economics: costs from its own plan, takes from the stated allocation model. */
export function farmEconomics(
  p: SnapshotProtocol,
  age: number | null,
  implied: number,
  impliedLow: number,
  model: ModelConstants = MODEL,
): FarmEconomics {
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  const setupGas = capital >= 150 ? 8 : 4;
  const cash = setupGas + weeks * 2 + 2;
  const opportunity = Math.round(capital * model.tbill_rate * (hold / 365));
  const totalCost = cash + opportunity;
  const wallets = Math.max(100, p.tvl_usd / model.wallet_tvl_usd);
  const share = (v: number) =>
    Math.round(0.5 * model.allocation_share * v * (1 / wallets) + 0.5 * model.allocation_share * v * (capital / (p.tvl_usd + capital)));
  const takeLow = share(impliedLow);
  const takeMid = share(implied);
  const netLow = takeLow - totalCost;
  const netMid = takeMid - totalCost;
  const breakeven = takeMid > 0 ? Math.round((totalCost / takeMid) * 1000) / 10 : 999;
  const verdict: FarmEconomics['verdict'] = netLow > 0 ? 'Farm' : netMid > 0 ? 'Thin' : 'Skip';
  return {
    capital_usd: capital,
    hold_days: hold,
    cash_cost_usd: cash,
    opportunity_cost_usd: opportunity,
    total_cost_usd: totalCost,
    take_low_usd: takeLow,
    take_mid_usd: takeMid,
    net_low_usd: netLow,
    net_mid_usd: netMid,
    breakeven_pct: breakeven,
    verdict,
  };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

const usd = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time, ending in the
 * plan's own economics. Derived from the protocol's record and the model's numbers for it,
 * never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, econ: FarmEconomics, impliedLow: number): FarmStep[] {
  const chain = chainOf(p);
  const capital = econ.capital_usd;
  const hold = econ.hold_days;
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position, about ${usd(econ.opportunity_cost_usd)} of time at a 5% T-bill rate`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
    {
      text:
        econ.breakeven_pct <= 100
          ? `Verdict ${econ.verdict}: at the band's low end (${usd(impliedLow)}) this position's share of a 5% community allocation (half split equally among qualifying wallets, half pro rata by capital) is ${usd(econ.take_low_usd)} against ${usd(econ.total_cost_usd)} of costs, net ${usd(econ.net_low_usd)}; it breaks even if the launch chance is at least ${econ.breakeven_pct}%.`
          : `Verdict ${econ.verdict}: at the band's low end (${usd(impliedLow)}) this position's share of a 5% community allocation (half split equally among qualifying wallets, half pro rata by capital) is ${usd(econ.take_low_usd)} against ${usd(econ.total_cost_usd)} of costs, net ${usd(econ.net_low_usd)}; even a certain launch at the mid band (${usd(econ.take_mid_usd)}) would not cover the costs.`,
      cost: `${usd(econ.total_cost_usd)} all-in for the plan`,
      time: `${hold} days in total`,
    },
  ];
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, fit: FitStats, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, covered whatever the audit says.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The audit: every other pre-token protocol that is not a wrapped product of a traded token.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, fit, model);
    const impliedLow = Math.max(1, Math.round(v.implied * fit.band_low_mult));
    const impliedHigh = Math.max(v.implied, Math.round(v.implied * fit.band_high_mult));
    const econ = farmEconomics(p, v.age, v.implied, impliedLow, model);
    return { p, v, impliedLow, impliedHigh, econ };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    watchlist: snapshot.watchlist.includes(s.p.slug),
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    implied_low_usd: s.impliedLow,
    implied_high_usd: s.impliedHigh,
    verdict: s.econ.verdict,
    model: {
      base_value_usd: Math.round(s.v.base),
      growth_pct: s.v.growthPct,
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      age_days: s.v.age,
    },
    farm: s.econ,
    farm_steps: farmSteps(s.p, s.v.age, s.econ, s.impliedLow).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const fit = fitComps(snapshot, model);
  const board = buildBoard(snapshot, fit, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const audited = snapshot.protocols.filter(isPreToken).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    fit,
    audited_size: audited,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
