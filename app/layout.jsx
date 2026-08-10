import { Ubuntu, Ubuntu_Mono } from "next/font/google";
import "./globals.css";

const ubuntu = Ubuntu({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-ubuntu",
});

const ubuntuMono = Ubuntu_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-ubuntu-mono",
});

export const metadata = {
  title: "Ubuntu Terminal Online — Practise Linux & gcc in Windows",
  description:
    "A working Ubuntu terminal in your browser: bash scripting, coreutils, gcc compilation and cached files. Built for students without a Linux machine.",
  openGraph: {
    title: "Ubuntu Terminal Online — Practise Linux & gcc",
    description:
      "Run bash scripts, coreutils and gcc programs in a browser-based Ubuntu terminal. No install needed.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${ubuntu.variable} ${ubuntuMono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
