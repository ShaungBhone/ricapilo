"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { api, Conversation, Page } from "@/lib/api"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { Blank, Feedback } from "@/components/feedback"
import { Transcript } from "@/components/transcript"
export default function Conversations() {
  const [list, setList] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [message, setMessage] = useState("")
  useEffect(() => {
    api<Page<Conversation>>("/conversations")
      .then((r) => setList(r.data))
      .catch((e) => setMessage(e.message))
  }, [])
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">စကားဝိုင်းများ</h1>
      <Feedback message={message} />
      {!list.length && (
        <Blank
          title="စကားဝိုင်း မရှိသေးပါ"
          description="လက်ထောက်တစ်ခုကို ရွေးပြီး စကားပြောပါ။"
        />
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {list.map((c) => (
          <Card key={c.id}>
            <CardHeader>
              <CardTitle className="leading-7">{c.title}</CardTitle>
              <CardDescription>{c.messages.length} messages</CardDescription>
            </CardHeader>
            <CardFooter>
              <button
                className={buttonVariants({ variant: "outline" })}
                onClick={() => setSelected(c)}
              >
                စာသား ကြည့်ရန်
              </button>
              <Link
                className={buttonVariants({ variant: "ghost" })}
                href={`/talk?assistant=${c.assistant_id}`}
              >
                စကားဝိုင်းအသစ်
              </Link>
            </CardFooter>
          </Card>
        ))}
      </div>
      {selected && (
        <Card>
          <CardHeader>
            <CardTitle>{selected.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <Transcript messages={selected.messages} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
