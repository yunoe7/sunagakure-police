import type { Metadata, Viewport } from 'next';
import AuthProvider from '@/components/auth/AuthProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sunagakure — Intranet du Village',
  description: 'Intranet du Village Caché du Sable',
  icons: {
    icon: [{ url: 'data:,' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#1a1c2e',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
