import type { Metadata } from "next";
import "./globals.css";
import "./theme.css";
import "./auth.css";
import "./content-studio.css";

// Apply the saved preference before the page paints to avoid a light-mode flash.
const themeScript = `(() => {
  let theme;
  try { theme = localStorage.getItem('signal-theme'); } catch {}
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme;
})();`;

export const metadata: Metadata = {
  title: "Analytiq | AI visibility workspace",
  description: "An evidence-driven workspace for understanding and improving your business's visibility in AI search.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head><body>{children}</body></html>;
}
