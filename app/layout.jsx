import localFont from "next/font/local";
import "./globals.css";

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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&family=Ubuntu+Mono:wght@400;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
