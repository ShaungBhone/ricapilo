"use client";
import { useTranslations } from "next-intl";

import { SidebarUser } from "@/components/sidebar-user";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AudioLines,
  Home,
  Bot,
  Clapperboard,
  MessageSquare,
  Settings,
  Shield,
} from "lucide-react";
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
import { User } from "@/lib/api";
export function AppSidebar({ user }: { user: User }) {
  const t = useTranslations();

  const path = usePathname();
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
        <SidebarUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
