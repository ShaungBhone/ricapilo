import type { Metadata } from "next"
import "@fontsource-variable/inter"
import "@fontsource/noto-sans-myanmar/400.css"
import "@fontsource/noto-sans-myanmar/600.css"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
export const metadata: Metadata = {
  title: { default: "Recap — မြန်မာ AI", template: "%s | Recap" },
  description:
    "ဗီဒီယိုများ ရှာဖွေပြီး မြန်မာဘာသာဖြင့် အနှစ်ချုပ်နှင့် အသံဖန်တီးပါ။",
}
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="my" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
