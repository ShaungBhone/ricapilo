"use client";
import { useTranslations } from "next-intl";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppSidebar } from "@/components/app-sidebar";
import { Feedback } from "@/components/feedback";
import { api, User } from "@/lib/api";
const UserContext = createContext<User | null>(null);
export const useUser = () => useContext(UserContext);
export function Workspace({ children }: { children: React.ReactNode }) {
  const t = useTranslations();

  const router = useRouter();
  const pathname = usePathname();
  const fullWidthPage =
    /^\/projects\/\d+$/.test(pathname) ||
    pathname === "/assistants" ||
    pathname.startsWith("/assistants/") ||
    pathname === "/conversations";
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<User>("/auth/me")
      .then(setUser)
      .catch((e) => {
        if (e.status === 401) {
          router.replace("/login");
        } else {
          setError("workspace.cannotConnectToTheApiCheckThatThe");
        }
      });
  }, [router]);
  if (error)
    return (
      <main className="mx-auto max-w-xl p-10">
        <Feedback message={error} />
        <Button className="mt-4" onClick={() => location.reload()}>
          {t("workspace.tryAgain")}
        </Button>
      </main>
    );
  if (!user)
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Skeleton className="h-12 w-64" />
      </div>
    );
  return (
    <UserContext.Provider value={user}>
      <SidebarProvider>
        <AppSidebar user={user} />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4 md:px-6">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <Separator
                orientation="vertical"
                className="h-4 data-vertical:self-center"
              />
              <span className="text-sm">{t("workspace.burmeseAiStudio")}</span>
            </div>
          </header>
          <div
            className={
              fullWidthPage
                ? "flex h-[calc(100svh-4rem)] min-h-0 w-full flex-col overflow-hidden"
                : "mx-auto w-full max-w-6xl p-4 md:p-8"
            }
          >
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </UserContext.Provider>
  );
}
