'use client';

// ============================================================
// Admin — Algorithm Accuracy Test
// Route: /admin/algorithm-test
//
// Flow:
//  1. User sets N (number of samples) and clicks "Start Scan"
//  2. Browser Geolocation API collects N real GPS samples
//  3. Fake samples are generated from the real data (Gaussian noise)
//  4. Ground truth = weighted average of REAL data
//  5. All algorithms run on both real and fake datasets
//  6. Haversine error against ground truth is computed per algorithm
//  7. Results table sorted ASC by real-data error
// ============================================================

import { useCallback, useRef, useState } from 'react';

import { haversineDistance } from '@/lib/algorithms/geo-utils';
import { simpleAverage } from '@/lib/algorithms/average';
import { weightedAverage } from '@/lib/algorithms/weighted';
import { medianPosition } from '@/lib/algorithms/median';
import { kalmanPosition } from '@/lib/algorithms/kalman';
import type { GpsSample, LatLng } from '@/lib/algorithms/types';
import { generateFakeSamples, countOutliers } from '@/lib/utils/gaussian';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

type Phase = 'idle' | 'collecting' | 'done' | 'error';

interface AlgoRow {
  name: string;
  realPosition: LatLng;
  fakePosition: LatLng;
  /** Haversine distance from ground truth (real data) */
  realError: number;
  /** Haversine distance from ground truth (fake data) */
  fakeError: number;
  isBestReal: boolean;
  isBestFake: boolean;
}

interface TestStats {
  meanAccuracy: number;
  validSamples: number;
  outlierCount: number;
  groundTruth: LatLng;
}

// ────────────────────────────────────────────────────────────
// Algorithm registry
// ────────────────────────────────────────────────────────────

const ALGORITHMS: Array<{ name: string; fn: (s: GpsSample[]) => LatLng }> = [
  { name: 'Simple Average', fn: simpleAverage },
  { name: 'Weighted Average (1/σ²)', fn: weightedAverage },
  { name: 'Coordinate Median', fn: medianPosition },
  { name: 'Kalman Filter (1-D)', fn: kalmanPosition },
];

// ────────────────────────────────────────────────────────────
// Analysis function (pure, no side effects)
// ────────────────────────────────────────────────────────────

function runAnalysis(realSamples: GpsSample[]): { rows: AlgoRow[]; stats: TestStats } {
  const fakeSamples = generateFakeSamples(realSamples);

  // Ground truth: weighted average of REAL data (highest-confidence baseline)
  const groundTruth = weightedAverage(realSamples);

  const rows: AlgoRow[] = ALGORITHMS.map(({ name, fn }) => ({
    name,
    realPosition: fn(realSamples),
    fakePosition: fn(fakeSamples),
    realError: haversineDistance(fn(realSamples), groundTruth),
    fakeError: haversineDistance(fn(fakeSamples), groundTruth),
    isBestReal: false,
    isBestFake: false,
  }));

  // Sort ASC by error on real data
  rows.sort((a, b) => a.realError - b.realError);

  // Mark best (lowest error) per column — skip Weighted Average from "best real"
  // since it IS the ground truth (error = 0 by construction); highlight second-best instead.
  const realRanked = [...rows].sort((a, b) => a.realError - b.realError);
  const fakeRanked = [...rows].sort((a, b) => a.fakeError - b.fakeError);
  realRanked[0].isBestReal = true;
  fakeRanked[0].isBestFake = true;

  const meanAccuracy =
    realSamples.reduce((s, p) => s + p.accuracy, 0) / realSamples.length;

  return {
    rows,
    stats: {
      meanAccuracy,
      validSamples: realSamples.length,
      outlierCount: countOutliers(realSamples),
      groundTruth,
    },
  };
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export default function AlgorithmTestPage() {
  const [n, setN] = useState(20);
  // 'timeout' → auto-finalise after N seconds; 'strict' → wait until N samples collected
  const [timeoutMode, setTimeoutMode] = useState<'timeout' | 'strict'>('timeout');
  const [timeoutSecs, setTimeoutSecs] = useState(30);
  const [phase, setPhase] = useState<Phase>('idle');
  const [collected, setCollected] = useState(0);
  const [currentAccuracy, setCurrentAccuracy] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [rows, setRows] = useState<AlgoRow[]>([]);
  const [stats, setStats] = useState<TestStats | null>(null);

  const samplesRef = useRef<GpsSample[]>([]);
  const watchIdRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Stop geolocation watch + timeout ──
  const stopCollection = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // ── Finalise: run analysis on whatever we have ──
  const finalise = useCallback((samples: GpsSample[]) => {
    stopCollection();
    if (samples.length === 0) {
      setPhase('error');
      setErrorMsg('No GPS samples collected. Check permissions and try outdoors.');
      return;
    }
    const { rows: newRows, stats: newStats } = runAnalysis(samples);
    setRows(newRows);
    setStats(newStats);
    setPhase('done');
  }, [stopCollection]);

  // ── Start scan ──
  const startScan = useCallback(() => {
    if (!navigator.geolocation) {
      setPhase('error');
      setErrorMsg('Geolocation API is not supported in this browser.');
      return;
    }

    // Reset state
    samplesRef.current = [];
    setCollected(0);
    setCurrentAccuracy(null);
    setRows([]);
    setStats(null);
    setErrorMsg('');
    setPhase('collecting');

    const targetN = n;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const sample: GpsSample = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp,
          altitude: pos.coords.altitude,
          altitudeAccuracy: pos.coords.altitudeAccuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
        };

        samplesRef.current = [...samplesRef.current, sample];
        setCollected(samplesRef.current.length);
        setCurrentAccuracy(pos.coords.accuracy);

        if (samplesRef.current.length >= targetN) {
          finalise(samplesRef.current);
        }
      },
      (err) => {
        stopCollection();
        setPhase('error');
        setErrorMsg(`Geolocation error (${err.code}): ${err.message}`);
      },
      { enableHighAccuracy: true, maximumAge: 0 },
    );

    // Only set timeout when mode is 'timeout'
    if (timeoutMode === 'timeout') {
      timeoutRef.current = setTimeout(() => {
        finalise(samplesRef.current);
      }, timeoutSecs * 1000);
    }
    // mode === 'strict': no timeout — wait until exactly N samples are collected
  }, [n, timeoutMode, timeoutSecs, finalise, stopCollection]);

  // ── Reset ──
  const reset = useCallback(() => {
    stopCollection();
    samplesRef.current = [];
    setPhase('idle');
    setCollected(0);
    setCurrentAccuracy(null);
    setRows([]);
    setStats(null);
    setErrorMsg('');
  }, [stopCollection]);

  // ────────────────────────────────────────────────────────
  // Render helpers
  // ────────────────────────────────────────────────────────

  const formatCoord = (v: number) => v.toFixed(7);
  const formatError = (m: number) =>
    m < 0.01 ? '< 0.01 m' : `${m.toFixed(2)} m`;

  // ────────────────────────────────────────────────────────
  // JSX
  // ────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-4">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          🧪 Algorithm Accuracy Test
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Collect real GPS samples, generate simulated noisy data, and compare
          positioning algorithms using Haversine error against ground truth.
        </p>
      </div>

      {/* ── Control Panel ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-4">
          Configuration
        </h2>
        <div className="flex flex-wrap items-end gap-4">
          {/* N input */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="n-input"
              className="text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Number of samples (N)
            </label>
            <input
              id="n-input"
              type="number"
              min={5}
              max={100}
              value={n}
              onChange={(e) => setN(Math.max(5, Math.min(100, Number(e.target.value))))}
              disabled={phase === 'collecting'}
              className="w-32 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          {/* Timeout mode toggle */}
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Completion mode
            </span>
            <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-700 text-sm">
              <button
                type="button"
                disabled={phase === 'collecting'}
                onClick={() => setTimeoutMode('timeout')}
                className={`px-3 py-2 transition-colors disabled:opacity-50 ${
                  timeoutMode === 'timeout'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                ⏱ Timeout
              </button>
              <button
                type="button"
                disabled={phase === 'collecting'}
                onClick={() => setTimeoutMode('strict')}
                className={`px-3 py-2 transition-colors disabled:opacity-50 ${
                  timeoutMode === 'strict'
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                🔒 Strict N
              </button>
            </div>
          </div>

          {/* Timeout seconds — only shown in timeout mode */}
          {timeoutMode === 'timeout' && (
            <div className="flex flex-col gap-1">
              <label
                htmlFor="timeout-input"
                className="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Timeout (seconds)
              </label>
              <input
                id="timeout-input"
                type="number"
                min={5}
                max={300}
                value={timeoutSecs}
                onChange={(e) =>
                  setTimeoutSecs(Math.max(5, Math.min(300, Number(e.target.value))))
                }
                disabled={phase === 'collecting'}
                className="w-28 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>
          )}

          {/* Start / Reset buttons */}
          {phase !== 'collecting' ? (
            <button
              onClick={startScan}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold transition-colors"
            >
              🚀 Start Scan
            </button>
          ) : (
            <button
              onClick={reset}
              className="px-5 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors"
            >
              ✕ Cancel
            </button>
          )}

          {phase === 'done' && (
            <button
              onClick={reset}
              className="px-5 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-semibold transition-colors"
            >
              ↺ Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Collecting progress ── */}
      {phase === 'collecting' && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
            </span>
            <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
              Collecting GPS samples…
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-blue-100 dark:bg-blue-900 rounded-full h-2 mb-3">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, (collected / n) * 100)}%` }}
            />
          </div>

          <p className="text-sm text-blue-800 dark:text-blue-200 font-mono">
            Sample{' '}
            <span className="font-bold">{collected}</span>
            {' / '}
            <span className="font-bold">{n}</span>
            {currentAccuracy !== null && (
              <span className="ml-3 text-blue-600 dark:text-blue-400">
                (±{currentAccuracy.toFixed(1)} m accuracy)
              </span>
            )}
          </p>

          <p className="mt-2 text-xs text-blue-500 dark:text-blue-400">
            {timeoutMode === 'timeout'
              ? `Auto-finalise after ${timeoutSecs} s — will analyse whatever has been collected.`
              : `Strict mode — waiting until all ${n} samples are collected. Cancel to stop early.`}
          </p>
        </div>
      )}

      {/* ── Error state ── */}
      {phase === 'error' && (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800 p-5">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">
            ⚠ Error
          </p>
          <p className="text-sm text-red-600 dark:text-red-400 mt-1">{errorMsg}</p>
          <button
            onClick={reset}
            className="mt-3 px-4 py-1.5 rounded-lg bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 text-sm font-medium hover:bg-red-200"
          >
            Try again
          </button>
        </div>
      )}

      {/* ── Results ── */}
      {phase === 'done' && stats && rows.length > 0 && (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              label="Valid samples"
              value={String(stats.validSamples)}
              sub="collected"
              color="blue"
            />
            <StatCard
              label="Mean GPS accuracy"
              value={`±${stats.meanAccuracy.toFixed(1)} m`}
              sub="average radius"
              color="green"
            />
            <StatCard
              label="Outliers detected"
              value={String(stats.outlierCount)}
              sub="z-score > 2σ"
              color="amber"
            />
            <StatCard
              label="Ground truth"
              value={`${formatCoord(stats.groundTruth.lat)}`}
              sub={formatCoord(stats.groundTruth.lng)}
              color="purple"
            />
          </div>

          {/* Algorithm comparison table */}
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Algorithm Comparison
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Sorted by error on real data (ascending). Ground truth = weighted
                average of real samples.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800 text-left">
                    <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                      Algorithm
                    </th>
                    <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                      Result — Real data
                    </th>
                    <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300 text-right">
                      Error (real)
                    </th>
                    <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300">
                      Result — Fake data
                    </th>
                    <th className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-300 text-right">
                      Error (fake)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {rows.map((row, i) => (
                    <tr
                      key={row.name}
                      className={
                        i === 0
                          ? 'bg-green-50 dark:bg-green-900/10'
                          : 'bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/60'
                      }
                    >
                      {/* Algorithm name */}
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                        <span className="flex items-center gap-2">
                          {i === 0 && (
                            <span className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded-full font-semibold">
                              #1
                            </span>
                          )}
                          {row.name}
                        </span>
                      </td>

                      {/* Real position */}
                      <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">
                        {formatCoord(row.realPosition.lat)},<br />
                        {formatCoord(row.realPosition.lng)}
                      </td>

                      {/* Real error */}
                      <td className="px-4 py-3 text-right">
                        <ErrorBadge
                          value={row.realError}
                          isBest={row.isBestReal}
                          label={formatError(row.realError)}
                        />
                      </td>

                      {/* Fake position */}
                      <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">
                        {formatCoord(row.fakePosition.lat)},<br />
                        {formatCoord(row.fakePosition.lng)}
                      </td>

                      {/* Fake error */}
                      <td className="px-4 py-3 text-right">
                        <ErrorBadge
                          value={row.fakeError}
                          isBest={row.isBestFake}
                          label={formatError(row.fakeError)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
              <span>
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500 mr-1" />
                Best on real data
              </span>
              <span>
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500 mr-1" />
                Best on fake data
              </span>
              <span>
                Fake data = real samples + Gaussian noise (σ = accuracy/2) + 15% outliers (20–50 m)
              </span>
            </div>
          </div>

          {/* Interpretation note */}
          <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-200 dark:border-amber-800 p-4 text-sm text-amber-800 dark:text-amber-200">
            <p className="font-semibold mb-1">ℹ️ Interpretation note</p>
            <p className="text-xs leading-relaxed">
              <strong>Error on real data</strong> measures how close each algorithm is to the
              weighted-average ground truth — lower is better, but{' '}
              <em>Weighted Average always has zero error</em> since it IS the ground truth.
              Focus on <strong>Error on fake data</strong> to judge robustness to noise and
              outliers, where Kalman and Median typically shine.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: 'blue' | 'green' | 'amber' | 'purple';
}) {
  const colorMap = {
    blue: 'text-blue-600 dark:text-blue-400',
    green: 'text-green-600 dark:text-green-400',
    amber: 'text-amber-600 dark:text-amber-400',
    purple: 'text-purple-600 dark:text-purple-400',
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-4">
      <div className={`text-xl font-bold font-mono ${colorMap[color]}`}>{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</div>
      <div className="text-xs text-gray-400 dark:text-gray-600 font-mono mt-0.5">{sub}</div>
    </div>
  );
}

function ErrorBadge({
  value,
  isBest,
  label,
}: {
  value: number;
  isBest: boolean;
  label: string;
}) {
  // Colour: green < 1m, yellow < 5m, orange < 20m, red otherwise
  let colorClass = 'text-red-600 dark:text-red-400';
  if (value < 1) colorClass = 'text-green-600 dark:text-green-400 font-bold';
  else if (value < 5) colorClass = 'text-green-500 dark:text-green-400';
  else if (value < 20) colorClass = 'text-amber-600 dark:text-amber-400';

  return (
    <span className={`font-mono text-xs ${colorClass} inline-flex items-center gap-1 justify-end`}>
      {isBest && (
        <span className="text-[10px] bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-1 py-0.5 rounded">
          best
        </span>
      )}
      {label}
    </span>
  );
}
