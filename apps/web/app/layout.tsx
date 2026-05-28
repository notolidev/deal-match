export const metadata = {
  title: "Deal Match",
  description: "Is this a good deal? Browser extension backend.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#0b0d10",
          color: "#e6e6e6",
        }}
      >
        {children}
      </body>
    </html>
  );
}
