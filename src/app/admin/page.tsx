'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Stats {
  totalRooms: number;
  totalLogs: number;
  logsWithFeedback: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ totalRooms: 0, totalLogs: 0, logsWithFeedback: 0 });

  useEffect(() => {
    Promise.all([
      fetch('/api/rooms').then((r) => r.json()),
      fetch('/api/attendance?limit=0').then((r) => r.json()),
      fetch('/api/analytics').then((r) => r.json()),
    ]).then(([rooms, attendance, analytics]) => {
      setStats({
        totalRooms: rooms.length,
        totalLogs: attendance.total,
        logsWithFeedback: analytics.logsWithFeedback,
      });
    });
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
          <div className="text-3xl font-bold text-blue-600">{stats.totalRooms}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Rooms Configured</div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
          <div className="text-3xl font-bold text-green-600">{stats.totalLogs}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Total Check-ins
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
          <div className="text-3xl font-bold text-purple-600">{stats.logsWithFeedback}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            With Ground Truth
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/admin/rooms"
          className="block p-6 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 hover:border-blue-300 transition-colors"
        >
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">🏠 Room Management</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Create rooms, configure corners, adjust buffer radius
          </p>
        </Link>
        <Link
          href="/admin/logs"
          className="block p-6 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 hover:border-blue-300 transition-colors"
        >
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">📋 Attendance Logs</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            View all check-in records with raw data and algorithm results
          </p>
        </Link>
        <Link
          href="/admin/analytics"
          className="block p-6 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 hover:border-blue-300 transition-colors"
        >
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">📊 Analytics</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Compare algorithm accuracy, view confusion matrices, charts
          </p>
        </Link>
        <a
          href="/api/export?format=csv"
          className="block p-6 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 hover:border-blue-300 transition-colors"
        >
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">💾 Export Data</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Download attendance data as CSV for external analysis
          </p>
        </a>
      </div>
    </div>
  );
}
