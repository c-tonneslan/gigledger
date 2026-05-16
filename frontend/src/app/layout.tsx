import "./globals.css";
import Layout from "@/components/Layout";

export const metadata = {
  title: "GigLedger - finance dashboard for 1099 freelancers",
  description:
    "Track real take-home, project quarterly taxes, and see income volatility for self-employed work.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Layout>{children}</Layout>
      </body>
    </html>
  );
}
