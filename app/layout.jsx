import './globals.css';
import { DM_Sans, DM_Mono } from 'next/font/google';
import AppShell from '@/components/app-shell';
import { ToastProvider } from '@/components/ui/toast-provider';

const sans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' });
const mono = DM_Mono({ subsets: ['latin'], weight: ['400','500'], variable: '--font-mono' });

export const metadata = {
  title: 'EasyLink Absensi',
  description: 'Attendance management for EasyLink biometric devices',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" className={`${sans.variable} ${mono.variable}`}>
      <body className="bg-slate-950 text-slate-100 font-sans antialiased">
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </body>
    </html>
  );
}
