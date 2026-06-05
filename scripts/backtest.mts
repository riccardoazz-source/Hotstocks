/**
 * Hotstocks backtest harness.
 *
 *   npm run backtest
 *
 * Validates whether a higher Breakout score actually precedes higher forward
 * returns, and calibrates the factor weights on the data. By default it runs on
 * a SYNTHETIC dataset (so it works offline and demonstrates the machinery);
 * real conclusions require a real point-in-time dataset — see the README.
 *
 * Honest methodology notes:
 *  - Weights are calibrated on a TRAIN split and reported on a held-out TEST
 *    split, so the reported improvement isn't just in-sample overfitting.
 *  - The synthetic world has a hidden "true" model different from our defaults,
 *    so we can see calibration move toward what actually pays.
 */

import { writeFileSync } from "node:fs";
import type { FactorKey, Weights } from "../lib/types";
import { DEFAULT_WEIGHTS } from "../lib/scoring";
import { prepare, evaluate, calibrate, FACTOR_KEYS } from "../lib/backtest/engine";
import { generateSamples } from "../lib/backtest/synthetic";
import type { Sample } from "../lib/backtest/types";

function pct(x: number): string {
  return `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`;
}

function fmtWeights(w: Weights): string {
  return FACTOR_KEYS.map(
    (k) => `${k.padEnd(15)} ${(w[k] * 100).toFixed(1)}%`
  ).join("\n  ");
}

function shuffle<T>(arr: T[], seed = 123): T[] {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function main() {
  const source = process.env.BACKTEST_SOURCE ?? "synthetic";
  console.log(`\n🔥 Hotstocks backtest — source: ${source}\n`);

  let samples: Sample[];
  let trueBetas: Record<FactorKey, number> | undefined;
  if (source === "synthetic") {
    const gen = generateSamples();
    samples = gen.samples;
    trueBetas = gen.trueBetas;
    console.log(
      "⚠️  SYNTHETIC data: demonstrates the harness only. Plug in real\n" +
        "    point-in-time data (BACKTEST_SOURCE=fmp, not yet wired) for real\n" +
        "    conclusions.\n"
    );
  } else {
    console.error(
      `Source "${source}" is not implemented. Only "synthetic" ships today.\n` +
        "Real-data loading needs point-in-time fundamentals — see README."
    );
    process.exit(1);
  }

  // Out-of-sample split.
  const shuffled = shuffle(samples);
  const cut = Math.floor(shuffled.length * 0.7);
  const train = prepare(shuffled.slice(0, cut));
  const test = prepare(shuffled.slice(cut));

  const defTest = evaluate(test, DEFAULT_WEIGHTS);
  const { weights: calibrated } = calibrate(train);
  const calTest = evaluate(test, calibrated);

  console.log(`Samples: ${samples.length}  (train ${cut} / test ${test.length})\n`);

  console.log("── Default weights (held-out test) ──");
  console.log(`  Spearman rank corr : ${defTest.spearman.toFixed(3)}`);
  console.log(`  Top-vs-bottom quintile spread : ${pct(defTest.quintileSpread)}\n`);

  console.log("── Calibrated weights (trained on train, scored on test) ──");
  console.log(`  Spearman rank corr : ${calTest.spearman.toFixed(3)}`);
  console.log(`  Top-vs-bottom quintile spread : ${pct(calTest.quintileSpread)}\n`);

  console.log("Suggested (calibrated) weights:\n  " + fmtWeights(calibrated) + "\n");

  if (trueBetas) {
    const tb = { ...trueBetas };
    const sum = Object.values(tb).reduce((s, x) => s + x, 0) || 1;
    console.log("(Synthetic) hidden TRUE weights for reference:\n  " +
      FACTOR_KEYS.map((k) => `${k.padEnd(15)} ${((tb[k] / sum) * 100).toFixed(1)}%`).join("\n  ") + "\n");
  }

  const improvement = calTest.quintileSpread - defTest.quintileSpread;
  console.log(
    `Calibration changed the out-of-sample quintile spread by ${pct(improvement)}.\n`
  );

  const out = {
    generatedAt: new Date().toISOString(),
    source,
    samples: samples.length,
    defaultWeights: DEFAULT_WEIGHTS,
    calibratedWeights: calibrated,
    test: { default: defTest, calibrated: calTest },
  };
  writeFileSync("backtest-results.json", JSON.stringify(out, null, 2));
  console.log("Wrote backtest-results.json");
  console.log(
    "To adopt the calibrated weights, copy them into DEFAULT_WEIGHTS in lib/scoring.ts.\n"
  );
}

main();
