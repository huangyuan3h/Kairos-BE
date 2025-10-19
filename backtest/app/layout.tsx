import "../styles/globals.css";
import { ReactNode } from "react";

export const metadata = {
  title: "Kairos Backtest Dashboard",
  description: "Visualize and compare backtest strategies",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
