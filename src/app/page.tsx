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
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-950">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-2xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            📍 Attendance Check-in
          </h1>
          <a
            href="/admin"
            className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
          >
            Admin →
          </a>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Step 1: Select Room */}
        {step === 'select-room' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              Select your room
            </h2>
            {rooms.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400">
                No rooms available. Ask an admin to create rooms first.
              </p>
            ) : (
              <div className="grid gap-3">
                {rooms.map((room) => (
                  <button
                    key={room._id}
                    onClick={() => setSelectedRoom(room)}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      selectedRoom?._id === room._id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                        : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
                    }`}
                  >
                    <div className="font-medium text-gray-900 dark:text-white">
                      {room.name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Buffer: {room.bufferRadius}m
                      {room.corners.length > 0 && ` • ${room.corners.length} corners`}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {selectedRoom && (
              <button
                onClick={startCollection}
                className="w-full py-3 px-6 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors text-lg"
              >
                🎯 Check In
              </button>
            )}
          </div>
        )}

        {/* Step 2: Collecting GPS Samples */}
        {step === 'collecting' && (
          <div className="text-center space-y-6">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              Collecting GPS data...
            </h2>
            <p className="text-gray-500 dark:text-gray-400">
              Stay still. Collecting {NUM_SAMPLES} samples.
            </p>

            {/* Progress bar */}
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {samples.length} / {NUM_SAMPLES} samples
              {samples.length > 0 && (
                <span className="ml-2">
                  (accuracy: {samples[samples.length - 1].accuracy.toFixed(1)}m)
                </span>
              )}
            </p>

            {/* Live samples list */}
            {samples.length > 0 && (
              <div className="text-left max-h-40 overflow-y-auto bg-gray-100 dark:bg-gray-800 rounded-lg p-3 text-xs font-mono">
                {samples.map((s, i) => (
                  <div key={i} className="text-gray-600 dark:text-gray-400">
                    #{i + 1}: {s.lat.toFixed(6)}, {s.lng.toFixed(6)} (±{s.accuracy.toFixed(1)}m)
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Algorithm Results */}
        {step === 'results' && results && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              Algorithm Results for <span className="text-blue-600">{selectedRoom?.name}</span>
            </h2>

            <div className="space-y-3">
              {Object.entries(results).map(([key, result]) => (
                <div
                  key={key}
                  className={`p-4 rounded-lg border ${
                    result.inside
                      ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                      : 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {result.name}
                      </span>
                      <span
                        className={`ml-2 text-sm font-bold ${
                          result.inside ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {result.inside ? '✅ INSIDE' : '❌ OUTSIDE'}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Confidence
                      </div>
                      <div className="font-bold text-lg">
                        {(result.confidence * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Position: {result.position.lat.toFixed(6)}, {result.position.lng.toFixed(6)}
                  </div>
                </div>
              ))}
            </div>

            <div className="text-sm text-gray-500 dark:text-gray-400 text-center">
              {samples.length} GPS samples collected
            </div>

            <button
              onClick={() => setStep('feedback')}
              className="w-full py-3 px-6 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Continue → Provide Feedback
            </button>
          </div>
        )}

        {/* Step 4: Ground Truth Feedback */}
        {step === 'feedback' && (
          <div className="text-center space-y-6">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              Ground Truth Feedback
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-lg">
              Were you actually <strong>inside</strong> the room{' '}
              <span className="text-blue-600">&ldquo;{selectedRoom?.name}&rdquo;</span>?
            </p>

            <div className="flex gap-4 justify-center">
              <button
                onClick={() => submitFeedback(true)}
                disabled={loading}
                className="flex-1 max-w-48 py-4 bg-green-600 text-white rounded-lg font-bold text-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                ✅ YES
              </button>
              <button
                onClick={() => submitFeedback(false)}
                disabled={loading}
                className="flex-1 max-w-48 py-4 bg-red-600 text-white rounded-lg font-bold text-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                ❌ NO
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Done */}
        {step === 'done' && (
          <div className="text-center space-y-6">
            <div className="text-6xl">🎉</div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              Check-in Complete!
            </h2>
            <p className="text-gray-500 dark:text-gray-400">
              Your data has been recorded. Thank you for contributing to the research!
            </p>
            <button
              onClick={reset}
              className="py-3 px-8 bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              Check In Again
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
