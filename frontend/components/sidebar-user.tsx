"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import {
  ChevronsUpDown,
  Globe,
  LogOut,
  Monitor,
  Moon,
  Sun,
  UserRound,
} from "lucide-react";

import { Feedback } from "@/components/feedback";
import { useSetLocale } from "@/components/locale-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { resolveLocale } from "@/i18n/locales";
import { api, type User } from "@/lib/api";
import { useRecapProgress } from "@/components/recap-progress-provider";

function UserIdentity({ user }: { user: User }) {
  const initials = user.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((name) => Array.from(name)[0])
    .join("")
    .toLocaleUpperCase();

  return (
    <>
      <Avatar className="size-8 rounded-md">
        <AvatarFallback className="rounded-md">{initials}</AvatarFallback>
      </Avatar>
      <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{user.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {user.email}
        </span>
      </div>
    </>
  );
}

export function SidebarUser({ user }: { user: User }) {
  const t = useTranslations();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const { theme, setTheme } = useTheme();
  const { isMobile, setOpenMobile } = useSidebar();
  const router = useRouter();
  const recapProgress = useRecapProgress();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    setSigningOut(true);
    setError("");
    try {
      await api("/auth/logout", { method: "POST" });
      recapProgress.clear();
      router.replace("/login");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : t("shared.requestFailed"),
      );
      setSigningOut(false);
    }
  }

  return (
    <>
      <Feedback message={error} />
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  size="lg"
                  aria-label={t("workspace.openProfileMenu")}
                  className="data-popup-open:bg-sidebar-accent data-popup-open:text-sidebar-accent-foreground"
                />
              }
            >
              <UserIdentity user={user} />
              <ChevronsUpDown
                className="ml-auto group-data-[collapsible=icon]:hidden"
                aria-hidden="true"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-64"
              align="end"
              side={isMobile ? "bottom" : "right"}
              sideOffset={4}
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex min-w-0 items-center gap-2 px-1 py-1.5">
                    <UserIdentity user={user} />
                  </div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  render={<Link href="/profile" />}
                  onClick={() => setOpenMobile(false)}
                >
                  <UserRound />
                  {t("profile.title")}
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Globe />
                    {t("shared.language")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup
                      value={locale}
                      onValueChange={(value) => setLocale(resolveLocale(value))}
                    >
                      <DropdownMenuRadioItem value="en">
                        English
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="my">
                        မြန်မာ
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Sun />
                    {t("workspace.appearance")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup
                      value={theme ?? "system"}
                      onValueChange={setTheme}
                    >
                      <DropdownMenuRadioItem value="light">
                        <Sun />
                        {t("workspace.light")}
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="dark">
                        <Moon />
                        {t("workspace.dark")}
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="system">
                        <Monitor />
                        {t("workspace.system")}
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  variant="destructive"
                  disabled={signingOut}
                  onClick={signOut}
                >
                  <LogOut />
                  {t("workspace.signOut")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </>
  );
}
