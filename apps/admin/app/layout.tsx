export const metadata = {
  title: 'SmartBudget Admin',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, -apple-system, sans-serif', margin: 0 }}>{children}</body>
    </html>
  );
}
