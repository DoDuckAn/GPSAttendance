'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

// ============================================================
// Types
// ============================================================
interface GpsSample {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
}

interface AlgorithmResult {
  name: string;
  position: { lat: number; lng: number };
  inside: boolean;
  confidence: number;
  metadata?: Record<string, unknown>;
}

interface Room {
  _id: string;
  name: string;
  corners: { lat: number; lng: number }[];
  center: { lat: number; lng: number };
  bufferRadius: number;
}

type Step = 'select-room' | 'collecting' | 'results' | 'feedback' | 'done';

const NUM_SAMPLES = 12;
const SAMPLE_INTERVAL_MS = 800;

// Friendly display names for algorithms
const ALGO_LABELS: Record<string, string> = {
  gps: 'Baseline GPS',
  centroid: 'Sliding Window',
  kalman: 'Kalman Filter',
  irls_huber: 'IRLS + Huber',
  hybrid: 'Hybrid',
};

// ============================================================
// Main Client Page
// ============================================================
export default function ClientPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [step, setStep] = useState<Step>('select-room');
  const [samples, setSamples] = useState<GpsSample[]>([]);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<Record<string, AlgorithmResult> | null>(null);
  const [logId, setLogId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const watchRef = useRef<number | null>(null);
  const samplesRef = useRef<GpsSample[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch rooms on mount
  useEffect(() => {
    fetch('/api/rooms')
      .then((r) => r.json())
      .then(setRooms)
      .catch(() => setError('Failed to load rooms'));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // ============================================================
  // GPS Collection
  // ============================================================
  const startCollection = useCallback(() => {
    setStep('collecting');
    setError(null);
    setSamples([]);
    setProgress(0);
    samplesRef.current = [];

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser');
      setStep('select-room');
      return;
    }

    // Start watching GPS
    let latestPosition: GeolocationPosition | null = null;

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        latestPosition = pos;
      },
      (err) => {
        console.warn('GPS error:', err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );

    // Also get an immediate reading
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        latestPosition = pos;
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );

    // Sample at regular intervals
    let collected = 0;
    intervalRef.current = setInterval(() => {
      if (latestPosition) {
        const sample: GpsSample = {
          lat: latestPosition.coords.latitude,
          lng: latestPosition.coords.longitude,
          accuracy: latestPosition.coords.accuracy,
          timestamp: latestPosition.timestamp,
          altitude: latestPosition.coords.altitude,
          altitudeAccuracy: latestPosition.coords.altitudeAccuracy,
          heading: latestPosition.coords.heading,
          speed: latestPosition.coords.speed,
        };
        samplesRef.current = [...samplesRef.current, sample];
        setSamples([...samplesRef.current]);
        collected++;
        setProgress(Math.min(100, Math.round((collected / NUM_SAMPLES) * 100)));

        if (collected >= NUM_SAMPLES) {
          // Stop collecting
          if (intervalRef.current) clearInterval(intervalRef.current);
          if (watchRef.current !== null) {
            navigator.geolocation.clearWatch(watchRef.current);
            watchRef.current = null;
          }
          // Submit to API
          submitSamples(samplesRef.current);
        }
      }
    }, SAMPLE_INTERVAL_MS);
  }, [selectedRoom]);

  // ============================================================
  // Submit samples to API
  // ============================================================
  const submitSamples = async (collectedSamples: GpsSample[]) => {
    if (!selectedRoom) return;
    setLoading(true);

    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: selectedRoom._id,
          samples: collectedSamples,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Check-in failed');
      }

      const data = await res.json();
      setResults(data.results);
      setLogId(data.logId);
      setStep('results');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check-in failed');
      setStep('select-room');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // Submit ground truth feedback
  // ============================================================
  const submitFeedback = async (wasInside: boolean) => {
    if (!logId) return;
    setLoading(true);

    try {
      await fetch(`/api/attendance/${logId}/feedback`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groundTruth: wasInside }),
      });
      setStep('done');
    } catch {
      setError('Failed to submit feedback');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep('select-room');
    setSelectedRoom(null);
    setSamples([]);
    setResults(null);
    setLogId(null);
    setError(null);
  };

  // ============================================================
  // Render
  // ============================================================

  // Step progress indicator dots
  const STEPS: Step[] = ['select-room', 'collecting', 'results', 'feedback', 'done'];
  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-950">

      {/* â”€â”€ Header â”€â”€ */}
      <header className="sticky top-0 z-10 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 safe-top">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <h1 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">
            ðŸ“ Äiá»ƒm danh
          </h1>
          <a
            href="/admin"
            className="text-xs font-medium text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 active:bg-blue-100"
          >
            Admin â†’
          </a>
        </div>
      </header>

      {/* â”€â”€ Step progress bar â”€â”€ */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-lg mx-auto px-4 py-2 flex items-center gap-1.5">
          {STEPS.slice(0, -1).map((s, i) => (
            <div key={s} className="flex items-center gap-1.5 flex-1">
              <div className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                i < stepIndex ? 'bg-blue-500' : i === stepIndex ? 'bg-blue-300' : 'bg-gray-200 dark:bg-gray-700'
              }`} />
            </div>
          ))}
        </div>
      </div>

      {/* â”€â”€ Main content â”€â”€ */}
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6 safe-bottom">

        {/* Error banner */}
        {error && (
          <div className="mb-5 flex items-start gap-3 p-3.5 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-xl text-sm text-red-700 dark:text-red-300">
            <span className="text-base leading-snug">âš ï¸</span>
            <span className="flex-1 leading-snug">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 font-bold text-lg leading-none mt-0.5">Ã—</button>
          </div>
        )}

        {/* â•â• STEP 1: Select Room â•â• */}
        {step === 'select-room' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Chá»n phÃ²ng</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Chá»n phÃ²ng báº¡n muá»‘n Ä‘iá»ƒm danh</p>
            </div>

            {rooms.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-3">ðŸ </div>
                <p className="text-sm">ChÆ°a cÃ³ phÃ²ng nÃ o. LiÃªn há»‡ admin Ä‘á»ƒ táº¡o phÃ²ng.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {rooms.map((room) => (
                  <button
                    key={room._id}
                    onClick={() => setSelectedRoom(room)}
                    className={`w-full p-4 rounded-2xl border-2 text-left transition-all active:scale-[0.98] ${
                      selectedRoom?._id === room._id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 shadow-sm shadow-blue-100 dark:shadow-none'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-blue-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-900 dark:text-white text-base">
                        {room.name}
                      </span>
                      {selectedRoom?._id === room._id && (
                        <span className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs flex-shrink-0">âœ“</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-1 flex gap-2">
                      <span>Buffer {room.bufferRadius}m</span>
                      {room.corners.length > 0 && <span>â€¢ {room.corners.length} gÃ³c</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {selectedRoom && (
              <div className="pt-2">
                <button
                  onClick={startCollection}
                  className="w-full py-4 bg-blue-600 active:bg-blue-700 text-white rounded-2xl font-bold text-lg shadow-lg shadow-blue-200 dark:shadow-none transition-all active:scale-[0.98]"
                >
                  ðŸŽ¯ Äiá»ƒm danh ngay
                </button>
                <p className="text-center text-xs text-gray-400 mt-2">
                  PhÃ²ng: <strong className="text-gray-600 dark:text-gray-300">{selectedRoom.name}</strong>
                </p>
              </div>
            )}
          </div>
        )}

        {/* â•â• STEP 2: Collecting GPS â•â• */}
        {step === 'collecting' && (
          <div className="flex flex-col items-center space-y-6 pt-4">
            {/* Animated pulse icon */}
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-blue-400/30 animate-ping" />
                <span className="text-4xl relative z-10">ðŸ“¡</span>
              </div>
            </div>

            <div className="text-center space-y-1">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Äang thu tháº­p GPS</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">HÃ£y Ä‘á»©ng yÃªn trong phÃ²ng</p>
            </div>

            {/* Circular-ish large progress */}
            <div className="w-full space-y-2">
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>{samples.length}/{NUM_SAMPLES} máº«u</span>
                {samples.length > 0 && (
                  <span>Â±{samples[samples.length - 1].accuracy.toFixed(0)}m</span>
                )}
              </div>
              <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="text-center text-sm font-semibold text-blue-600 dark:text-blue-400">
                {progress}%
              </div>
            </div>

            {/* Live samples scroll */}
            {samples.length > 0 && (
              <div className="w-full max-h-36 overflow-y-auto bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-xs font-mono space-y-0.5">
                {[...samples].reverse().map((s, i) => (
                  <div key={i} className="text-gray-500 dark:text-gray-400 flex gap-2">
                    <span className="text-gray-300 w-4">#{samples.length - i}</span>
                    <span>{s.lat.toFixed(5)}, {s.lng.toFixed(5)}</span>
                    <span className="text-gray-400 ml-auto">Â±{s.accuracy.toFixed(0)}m</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* â•â• STEP 3: Algorithm Results â•â• */}
        {step === 'results' && results && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Káº¿t quáº£ phÃ¢n tÃ­ch</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                PhÃ²ng: <span className="font-semibold text-blue-600 dark:text-blue-400">{selectedRoom?.name}</span>
                <span className="text-gray-400 ml-2">â€” {samples.length} máº«u GPS</span>
              </p>
            </div>

            {/* Summary badge â€” consensus result */}
            {(() => {
              const vals = Object.values(results);
              const insideCount = vals.filter(r => r.inside).length;
              const consensus = insideCount > vals.length / 2;
              return (
                <div className={`rounded-2xl p-4 text-center ${
                  consensus
                    ? 'bg-green-50 dark:bg-green-900/30 border-2 border-green-300 dark:border-green-700'
                    : 'bg-red-50 dark:bg-red-900/30 border-2 border-red-300 dark:border-red-700'
                }`}>
                  <div className="text-3xl mb-1">{consensus ? 'âœ…' : 'âŒ'}</div>
                  <div className={`font-bold text-lg ${consensus ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                    {consensus ? 'Äa sá»‘: TRONG PHÃ’NG' : 'Äa sá»‘: NGOÃ€I PHÃ’NG'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{insideCount}/{vals.length} thuáº­t toÃ¡n xÃ¡c nháº­n</div>
                </div>
              );
            })()}

            {/* Per-algorithm cards */}
            <div className="space-y-2">
              {Object.entries(results).map(([key, result]) => (
                <div
                  key={key}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border ${
                    result.inside
                      ? 'bg-green-50 dark:bg-green-900/15 border-green-200 dark:border-green-800'
                      : 'bg-red-50 dark:bg-red-900/15 border-red-200 dark:border-red-800'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
                    result.inside ? 'bg-green-100 dark:bg-green-900/50' : 'bg-red-100 dark:bg-red-900/50'
                  }`}>
                    {result.inside ? 'âœ“' : 'âœ—'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900 dark:text-white truncate">
                      {ALGO_LABELS[key] ?? result.name}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 truncate font-mono">
                      {result.position.lat.toFixed(5)}, {result.position.lng.toFixed(5)}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`font-bold text-sm ${result.inside ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {result.inside ? 'TRONG' : 'NGOÃ€I'}
                    </div>
                    <div className="text-xs text-gray-500">{(result.confidence * 100).toFixed(0)}%</div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setStep('feedback')}
              className="w-full py-4 bg-blue-600 active:bg-blue-700 text-white rounded-2xl font-bold text-base shadow-lg shadow-blue-200 dark:shadow-none transition-all active:scale-[0.98]"
            >
              Tiáº¿p theo â†’ XÃ¡c nháº­n thá»±c táº¿
            </button>
          </div>
        )}

        {/* â•â• STEP 4: Ground Truth Feedback â•â• */}
        {step === 'feedback' && (
          <div className="flex flex-col items-center space-y-8 pt-4">
            <div className="text-center space-y-2">
              <div className="text-5xl">ðŸ¤”</div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">XÃ¡c nháº­n thá»±c táº¿</h2>
              <p className="text-gray-600 dark:text-gray-400">
                Báº¡n cÃ³ Ä‘ang <strong>á»Ÿ trong</strong> phÃ²ng{' '}
                <span className="text-blue-600 dark:text-blue-400 font-semibold">
                  &ldquo;{selectedRoom?.name}&rdquo;
                </span>{' '}
                khÃ´ng?
              </p>
              <p className="text-xs text-gray-400">Pháº£n há»“i cá»§a báº¡n giÃºp cáº£i thiá»‡n Ä‘á»™ chÃ­nh xÃ¡c nghiÃªn cá»©u</p>
            </div>

            <div className="w-full space-y-3">
              <button
                onClick={() => submitFeedback(true)}
                disabled={loading}
                className="w-full py-5 bg-green-500 active:bg-green-600 text-white rounded-2xl font-bold text-xl shadow-lg shadow-green-200 dark:shadow-none transition-all active:scale-[0.98] disabled:opacity-50"
              >
                âœ… CÃ³, tÃ´i Ä‘ang á»Ÿ trong phÃ²ng
              </button>
              <button
                onClick={() => submitFeedback(false)}
                disabled={loading}
                className="w-full py-5 bg-red-500 active:bg-red-600 text-white rounded-2xl font-bold text-xl shadow-lg shadow-red-200 dark:shadow-none transition-all active:scale-[0.98] disabled:opacity-50"
              >
                âŒ KhÃ´ng, tÃ´i á»Ÿ ngoÃ i phÃ²ng
              </button>
            </div>

            {loading && (
              <p className="text-sm text-gray-400 animate-pulse">Äang lÆ°u...</p>
            )}
          </div>
        )}

        {/* â•â• STEP 5: Done â•â• */}
        {step === 'done' && (
          <div className="flex flex-col items-center space-y-6 pt-8">
            <div className="w-24 h-24 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center">
              <span className="text-5xl">ðŸŽ‰</span>
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">HoÃ n táº¥t!</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm max-w-xs">
                Dá»¯ liá»‡u Ä‘Ã£ Ä‘Æ°á»£c lÆ°u. Cáº£m Æ¡n báº¡n Ä‘Ã£ Ä‘Ã³ng gÃ³p cho nghiÃªn cá»©u!
              </p>
            </div>
            <button
              onClick={reset}
              className="w-full max-w-xs py-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl font-bold text-base active:opacity-80 transition-all active:scale-[0.98]"
            >
              Äiá»ƒm danh láº§n khÃ¡c
            </button>
          </div>
        )}

      </main>
    </div>
  );
}
