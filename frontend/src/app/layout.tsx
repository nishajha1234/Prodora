import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Prodora',
  description:
    'An evidence-based digital product lifecycle passport prototype for trustworthy post-sale laptop records.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
