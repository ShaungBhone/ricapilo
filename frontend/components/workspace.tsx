"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    api<User>("/auth/me")
      .then(setUser)
      .catch((e) => {
        if (e.status === 401) {
          router.replace("/login");
        } else {
          setError(
            "API ကို ချိတ်ဆက်၍မရပါ။ Docker ဝန်ဆောင်မှုများ စတင်ထားကြောင်း စစ်ဆေးပါ။",
          );
        }
      });
  }, [router]);
  if (error)
    return (
      <main className="mx-auto max-w-xl p-10">
        <Feedback message={error} />
        <Button className="mt-4" onClick={() => location.reload()}>
          ထပ်ကြိုးစားရန်
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
              <Separator orientation="vertical" className="h-4" />
              <span className="text-sm">မြန်မာ AI စတူဒီယို</span>
            </div>
            <span className="text-xs text-muted-foreground">
              ကိုယ်ပိုင် API key ဖြင့်
            </span>
          </header>
          <div className="mx-auto w-full max-w-6xl p-4 md:p-8">
            {!user.email_verified_at && (
              <div className="mb-6 flex flex-col gap-3">
                <Feedback message="AI မသုံးမီ သင့်အီးမေးလ်ကို အတည်ပြုပါ။" />
                <Button
                  variant="outline"
                  className="w-fit"
                  onClick={() =>
                    api("/email/resend", { method: "POST" })
                      .then(() => setNotice("အတည်ပြုအီးမေးလ် ပို့ပြီးပါပြီ။"))
                      .catch((e) => setNotice(e.message))
                  }
                >
                  အတည်ပြုအီးမေးလ် ပြန်ပို့ရန်
                </Button>
              </div>
            )}
            <Feedback message={notice} />
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </UserContext.Provider>
  );
}
