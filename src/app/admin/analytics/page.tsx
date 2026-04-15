'use client';

import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';

interface ConfusionMatrix {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

interface AlgoMetrics {
  name: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  totalPredictions: number;
  confusionMatrix: ConfusionMatrix;
  avgConfidence: number;
  avgErrorDistance: number;
}

interface PerRoomAlgo {
  name: string;
  accuracy: number;
  total: number;
}

interface PerRoom {
  roomId: string;
  roomName: string;
  totalLogs: number;
  algorithms: PerRoomAlgo[];
}

interface AnalyticsData {
  totalLogs: number;
  logsWithFeedback: number;
  algorithms: AlgoMetrics[];
  perRoom: PerRoom[];
}

const ALGO_COLORS: Record<string, string> = {
  gps: '#ef4444',
  centroid: '#f59e0b',
  kalman: '#3b82f6',
  irls_huber: '#8b5cf6',
  hybrid: '#10b981',
};

const ALGO_LABELS: Record<string, string> = {
  gps: 'Baseline GPS',
  centroid: 'Centroid',
  kalman: 'Kalman',
  irls_huber: 'IRLS+Huber',
  hybrid: 'Hybrid',
};

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/analytics')
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="text-gray-500">Loading analytics...</div>;
  if (!data || data.logsWithFeedback === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Analytics</h1>
        <p className="text-gray-500 dark:text-gray-400">
          No data with ground truth feedback yet. Check in and provide feedback to see analytics.
        </p>
        <p className="text-sm text-gray-400 mt-2">
          Total logs: {data?.totalLogs || 0} (need feedback for analysis)
        </p>
      </div>
    );
  }

  // Prepare chart data
  const accuracyData = data.algorithms.map((a) => ({
    name: ALGO_LABELS[a.name] || a.name,
    'Accuracy %': a.accuracy,
    'Precision %': a.precision,
    'Recall %': a.recall,
    'F1 %': a.f1,
  }));

  const confidenceData = data.algorithms.map((a) => ({
    name: ALGO_LABELS[a.name] || a.name,
    'Avg Confidence': Math.round(a.avgConfidence * 100),
    'Avg Error (m)': a.avgErrorDistance,
  }));

  // Radar chart data for multi-metric comparison
  const radarData = [
    { metric: 'Accuracy', ...Object.fromEntries(data.algorithms.map((a) => [a.name, a.accuracy])) },
    { metric: 'Precision', ...Object.fromEntries(data.algorithms.map((a) => [a.name, a.precision])) },
    { metric: 'Recall', ...Object.fromEntries(data.algorithms.map((a) => [a.name, a.recall])) },
    { metric: 'F1 Score', ...Object.fromEntries(data.algorithms.map((a) => [a.name, a.f1])) },
    {
      metric: 'Confidence',
      ...Object.fromEntries(data.algorithms.map((a) => [a.name, Math.round(a.avgConfidence * 100)])),
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Analytics</h1>
        <span className="text-sm text-gray-500">
          {data.logsWithFeedback} logs with feedback / {data.totalLogs} total
        </span>
      </div>

      {/* Accuracy Comparison Bar Chart */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Algorithm Accuracy Comparison
        </h2>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={accuracyData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Accuracy %" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Precision %" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Recall %" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            <Bar dataKey="F1 %" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Radar Chart — Multi-metric Comparison */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Multi-Metric Radar Comparison
        </h2>
        <ResponsiveContainer width="100%" height={400}>
          <RadarChart data={radarData}>
            <PolarGrid stroke="#374151" opacity={0.3} />
            <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
            {data.algorithms.map((a) => (
              <Radar
                key={a.name}
                name={ALGO_LABELS[a.name] || a.name}
                dataKey={a.name}
                stroke={ALGO_COLORS[a.name] || '#666'}
                fill={ALGO_COLORS[a.name] || '#666'}
                fillOpacity={0.1}
                strokeWidth={2}
              />
            ))}
            <Legend />
            <Tooltip />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Confusion Matrices */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Confusion Matrices
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.algorithms.map((algo) => (
            <div
              key={algo.name}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
            >
              <h3
                className="font-semibold text-center mb-3"
                style={{ color: ALGO_COLORS[algo.name] }}
              >
                {ALGO_LABELS[algo.name] || algo.name}
              </h3>
              <table className="w-full text-center text-sm">
                <thead>
                  <tr>
                    <th className="p-1"></th>
                    <th className="p-1 text-green-600 text-xs">Pred IN</th>
                    <th className="p-1 text-red-600 text-xs">Pred OUT</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-1 text-green-600 text-xs font-medium">Act IN</td>
                    <td className="p-2 bg-green-100 dark:bg-green-900/30 rounded font-bold text-green-700">
                      {algo.confusionMatrix.tp}
                    </td>
                    <td className="p-2 bg-red-100 dark:bg-red-900/30 rounded font-bold text-red-700">
                      {algo.confusionMatrix.fn}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-1 text-red-600 text-xs font-medium">Act OUT</td>
                    <td className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded font-bold text-orange-700">
                      {algo.confusionMatrix.fp}
                    </td>
                    <td className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded font-bold text-blue-700">
                      {algo.confusionMatrix.tn}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="mt-2 text-xs text-gray-500 text-center">
                Accuracy: {algo.accuracy}% | F1: {algo.f1}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Confidence & Error Distance */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Confidence & Avg Error Distance
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={confidenceData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Avg Confidence" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Avg Error (m)" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Per-Room Performance */}
      {data.perRoom.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Per-Room Performance
          </h2>
          <div className="space-y-4">
            {data.perRoom.map((room) => (
              <div key={room.roomId} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 dark:text-white mb-2">
                  {room.roomName}
                  <span className="text-sm text-gray-500 ml-2">({room.totalLogs} logs)</span>
                </h3>
                <div className="flex gap-3 flex-wrap">
                  {room.algorithms.map((a) => (
                    <div
                      key={a.name}
                      className="px-3 py-2 rounded-md text-sm"
                      style={{
                        backgroundColor: `${ALGO_COLORS[a.name]}15`,
                        color: ALGO_COLORS[a.name],
                      }}
                    >
                      <span className="font-medium">{ALGO_LABELS[a.name]}</span>:{' '}
                      <span className="font-bold">{a.accuracy}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Detailed Metrics Table
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-gray-600 dark:text-gray-400">Algorithm</th>
                <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">Accuracy</th>
                <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">Precision</th>
                <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">Recall</th>
                <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">F1</th>
                <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">Confidence</th>
                <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">TP</th>
                <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">FP</th>
                <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">FN</th>
                <th className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">TN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.algorithms.map((a) => (
                <tr key={a.name}>
                  <td className="px-4 py-3 font-medium" style={{ color: ALGO_COLORS[a.name] }}>
                    {ALGO_LABELS[a.name] || a.name}
                  </td>
                  <td className="px-4 py-3 text-right font-bold">{a.accuracy}%</td>
                  <td className="px-4 py-3 text-right">{a.precision}%</td>
                  <td className="px-4 py-3 text-right">{a.recall}%</td>
                  <td className="px-4 py-3 text-right">{a.f1}%</td>
                  <td className="px-4 py-3 text-right">{(a.avgConfidence * 100).toFixed(1)}%</td>
                  <td className="px-4 py-3 text-right text-green-600">{a.confusionMatrix.tp}</td>
                  <td className="px-4 py-3 text-right text-orange-600">{a.confusionMatrix.fp}</td>
                  <td className="px-4 py-3 text-right text-red-600">{a.confusionMatrix.fn}</td>
                  <td className="px-4 py-3 text-right text-blue-600">{a.confusionMatrix.tn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
