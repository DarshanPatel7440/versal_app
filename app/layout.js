export const metadata = {
  title: 'MobiOffice Billing',
  description: 'Payment and subscription management for MobiOffice products',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
