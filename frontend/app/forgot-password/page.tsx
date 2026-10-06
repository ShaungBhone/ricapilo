import Link from "next/link";
import { AudioLines } from "lucide-react";
import { LoginForm } from "@/components/login-form";
export default function Page() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 bg-muted/40 p-6">
      <Link href="/" className="flex items-center gap-2 text-xl font-semibold">
        <AudioLines /> Ricapilo
      </Link>
      <div className="w-full max-w-sm">
        <LoginForm mode="forgot" />
      </div>
      <p className="text-center text-sm text-muted-foreground">
        သင့်ကိုယ်ပိုင် AI · မြန်မာဇာတ်လမ်းများ
      </p>
    </main>
  );
}
