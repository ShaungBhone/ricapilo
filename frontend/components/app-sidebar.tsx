"use client"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  AudioLines,
  Home,
  Bot,
  Clapperboard,
  MessageSquare,
  Settings,
  Shield,
  LogOut,
  Moon,
} from "lucide-react"
import { useTheme } from "next-themes"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { api, User } from "@/lib/api"
export function AppSidebar({ user }: { user: User }) {
  const path = usePathname()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const items = [
    { title: "ပင်မစာမျက်နှာ", url: "/", icon: Home },
    { title: "လက်ထောက်များ", url: "/assistants", icon: Bot },
    { title: "ပရောဂျက်များ", url: "/projects", icon: Clapperboard },
    { title: "စကားဝိုင်းများ", url: "/conversations", icon: MessageSquare },
    { title: "ဆက်တင်များ", url: "/settings", icon: Settings },
    ...(user.is_admin
      ? [{ title: "စီမံခန့်ခွဲမှု", url: "/admin", icon: Shield }]
      : []),
  ]
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <AudioLines />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Ricapilo</span>
                <span className="truncate text-xs">သင့်ဇာတ်လမ်း၊ သင့်အသံ</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>ဖန်တီးမှုနေရာ</SidebarGroupLabel>
          <SidebarMenu>
            {items.map(({ title, url, icon: Icon }) => (
              <SidebarMenuItem key={url}>
                <SidebarMenuButton
                  render={<Link href={url} />}
                  tooltip={title}
                  isActive={url === "/" ? path === "/" : path.startsWith(url)}
                >
                  <Icon />
                  <span>{title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              tooltip="အရောင်ပြောင်းရန်"
            >
              <Moon />
              <span>အလင်း / အမှောင်</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip={user.email}>
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg">
                  {user.name.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm">
                <span className="truncate font-semibold">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {user.email}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={async () => {
                await api("/auth/logout", { method: "POST" })
                router.replace("/login")
              }}
              tooltip="ထွက်ရန်"
            >
              <LogOut />
              <span>အကောင့်မှ ထွက်ရန်</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
