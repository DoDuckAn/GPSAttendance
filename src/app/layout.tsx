import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Indoor Positioning Attendance System',
  description: 'Research platform for evaluating indoor positioning algorithms',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 dark:bg-gray-950">
        {children}
      </body>
    </html>
  );
}
