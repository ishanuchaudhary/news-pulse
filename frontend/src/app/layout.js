import "./globals.css";

export const metadata = {
  title:       "News Pulse — Topic-Clustered News Timeline",
  description: "Live news grouped by topic, displayed as a visual timeline.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-gray-950 text-gray-100">
        {children}
      </body>
    </html>
  );
}
