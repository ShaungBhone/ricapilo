"use client";
import { useTranslations } from "next-intl";

import { LanguageSelector } from "@/components/language-selector";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
} from "lucide-react";
import { useTheme } from "next-themes";
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
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { api, User } from "@/lib/api";
export function AppSidebar({ user }: { user: User }) {
  const t = useTranslations();

  const path = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const items = [
    { title: t("workspace.home"), url: "/", icon: Home },
    { title: t("workspace.assistants"), url: "/assistants", icon: Bot },
    { title: t("workspace.projects"), url: "/projects", icon: Clapperboard },
    {
      title: t("workspace.conversations"),
      url: "/conversations",
      icon: MessageSquare,
    },
    { title: t("workspace.settings"), url: "/settings", icon: Settings },
    ...(user.is_admin
      ? [{ title: t("workspace.administration"), url: "/admin", icon: Shield }]
      : []),
  ];
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
                <span className="truncate text-xs">
                  {t("workspace.yourStoryYourVoice")}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("workspace.workspace")}</SidebarGroupLabel>
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
        <LanguageSelector />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              tooltip={t("workspace.changeTheme")}
            >
              <Moon />
              <span>{t("workspace.lightDark")}</span>
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
                await api("/auth/logout", { method: "POST" });
                router.replace("/login");
              }}
              tooltip={t("workspace.signOut")}
            >
              <LogOut />
              <span>{t("workspace.signOutOfYourAccount")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
