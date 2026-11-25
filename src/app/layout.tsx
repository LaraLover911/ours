import type { Metadata, Viewport } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" });
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "ours. — Abdullah & Lara", template: "%s · ours." },
  description: "just us, in our own little universe.",
  applicationName: "ours.",
  appleWebApp: { capable: true, title: "ours.", statusBarStyle: "default" },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#FAF7F5",
};

// Applies theme + accent before paint so there is no flash.
const themeScript = `(function(){try{var t=localStorage.getItem('ours-theme')||'system';var a=localStorage.getItem('ours-accent')||'cherry';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.dataset.theme=d?'dark':'light';r.dataset.accent=a;}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" data-theme="light" data-accent="cherry" suppressHydrationWarning className={`${geistSans.variable} ${instrumentSerif.variable} antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        {children}
        <Toaster
          position="top-center"
          offset={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
          toastOptions={{
            classNames: {
              toast: "!rounded-2xl !border-border !bg-card !text-foreground !shadow-lift !font-sans",
              description: "!text-muted-foreground",
            },
          }}
        />
      </body>
    </html>
  );
}
