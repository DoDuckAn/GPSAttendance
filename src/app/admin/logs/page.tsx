'use client';

import { useEffect, useState } from 'react';

interface AlgoResult {
  name: string;
  position: { lat: number; lng: number };
  inside: boolean;
  confidence: number;
  metadata?: Record<string, unknown>;
}

interface LogEntry {
  _id: string;
  roomName: string;
  timestamp: string;
  rawSamples: { lat: number; lng: number; accuracy: number; timestamp: number }[];
  results: {
    gps: AlgoResult;
    centroid: AlgoResult;
    kalman: AlgoResult;
    irls_huber: AlgoResult;
    hybrid: AlgoResult;
  };
  groundTruth: boolean | null;
}

const ALGO_KEYS = ['gps', 'centroid', 'kalman', 'irls_huber', 'hybrid'] as const;
const ALGO_LABELS: Record<string, string> = {
  gps: 'Baseline GPS',
  centroid: 'Centroid',
  kalman: 'Kalman',
  irls_huber: 'IRLS+Huber',
  hybrid: 'Hybrid',
};

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const limit = 20;

  const fetchLogs = async (skip: number) => {
    setLoading(true);
    const res = await fetch(`/api/attendance?limit=${limit}&skip=${skip}`);
    const data = await res.json();
    setLogs(data.logs);
    setTotal(data.total);
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs(page * limit);
  }, [page]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Attendance Logs
        </h1>
        <div className="flex gap-2">
          <a
            href="/api/export?format=csv"
            className="px-3 py-1.5 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
          >
            📥 Export CSV
          </a>
          <a
            href="/api/export?format=json"
            className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
          >
            📥 Export JSON
          </a>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-500">Loading...</div>
      ) : logs.length === 0 ? (
        <div className="text-gray-500 text-center py-12">
          No attendance logs yet. Check in from the client page first.
        </div>
      ) : (
        <>
          {/* Log Table */}
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-400 font-medium">
                      Time
                    </th>
                    <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-400 font-medium">
                      Room
                    </th>
                    <th className="px-4 py-3 text-center text-gray-600 dark:text-gray-400 font-medium">
                      Samples
                    </th>
                    {ALGO_KEYS.map((k) => (
                      <th
                        key={k}
                        className="px-3 py-3 text-center text-gray-600 dark:text-gray-400 font-medium"
                      >
                        {ALGO_LABELS[k]}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-center text-gray-600 dark:text-gray-400 font-medium">
                      Ground Truth
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {logs.map((log) => (
                    <>
                      <tr
                        key={log._id}
                        onClick={() =>
                          setExpanded(expanded === log._id ? null : log._id)
                        }
                        className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                      >
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                          {log.roomName}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-500">
                          {log.rawSamples.length}
                        </td>
                        {ALGO_KEYS.map((k) => {
                          const r = log.results[k];
                          return (
                            <td key={k} className="px-3 py-3 text-center">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                  r.inside
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                }`}
                              >
                                {r.inside ? 'IN' : 'OUT'}
                              </span>
                              <div className="text-xs text-gray-400 mt-0.5">
                                {(r.confidence * 100).toFixed(0)}%
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-center">
                          {log.groundTruth === null ? (
                            <span className="text-gray-400 text-xs">—</span>
                          ) : log.groundTruth ? (
                            <span className="text-green-600 font-bold">✅ IN</span>
                          ) : (
                            <span className="text-red-600 font-bold">❌ OUT</span>
                          )}
                        </td>
                      </tr>
                      {/* Expanded Detail */}
                      {expanded === log._id && (
                        <tr key={`${log._id}-detail`}>
                          <td colSpan={3 + ALGO_KEYS.length + 1} className="px-4 py-4 bg-gray-50 dark:bg-gray-800/50">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {/* Raw Samples */}
                              <div>
                                <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">
                                  Raw GPS Samples ({log.rawSamples.length})
                                </h4>
                                <div className="max-h-40 overflow-y-auto text-xs font-mono bg-white dark:bg-gray-900 rounded p-2">
                                  {log.rawSamples.map((s, i) => (
                                    <div key={i} className="text-gray-600 dark:text-gray-400">
                                      #{i + 1}: {s.lat.toFixed(7)}, {s.lng.toFixed(7)} ±{s.accuracy.toFixed(1)}m
                                    </div>
                                  ))}
                                </div>
                              </div>
                              {/* Algorithm Details */}
                              <div>
                                <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">
                                  Algorithm Details
                                </h4>
                                <div className="space-y-2">
                                  {ALGO_KEYS.map((k) => {
                                    const r = log.results[k];
                                    return (
                                      <div
                                        key={k}
                                        className="text-xs bg-white dark:bg-gray-900 rounded p-2"
                                      >
                                        <span className="font-medium text-gray-800 dark:text-gray-200">
                                          {r.name}
                                        </span>
                                        <span className="text-gray-500 ml-2">
                                          pos: {r.position.lat.toFixed(7)}, {r.position.lng.toFixed(7)}
                                        </span>
                                        {r.metadata && (
                                          <div className="text-gray-400 mt-1">
                                            {Object.entries(r.metadata).map(([mk, mv]) => (
                                              <span key={mk} className="mr-3">
                                                {mk}: {typeof mv === 'number' ? mv.toFixed(2) : JSON.stringify(mv)}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex justify-between items-center text-sm text-gray-500">
            <span>
              Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-40"
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
