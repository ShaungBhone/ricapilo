"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Project, Page } from "@/lib/api";
import { buttonVariants, Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Feedback, Blank } from "@/components/feedback";
export default function Projects() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Project> | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    api<Page<Project>>(`/projects?page=${page}`)
      .then(setData)
      .catch((e) => setMessage(e.message));
  }, [page]);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">ပရောဂျက်များ</h1>
        <Link className={buttonVariants()} href="/projects/new">
          ပရောဂျက်အသစ်
        </Link>
      </div>
      <Feedback message={message} />
      {data?.total === 0 && (
        <Blank
          title="သင့်ပထမ အနှစ်ချုပ်ကို ဖန်တီးပါ"
          description="ပင်မစာမျက်နှာတွင် ဗီဒီယိုရှာပါ သို့မဟုတ် ကိုယ်ပိုင်ဖိုင် ထည့်ပါ။"
        />
      )}
      <div className="grid gap-5 md:grid-cols-2">
        {data?.data.map((p) => (
          <Card key={p.id}>
            <CardHeader>
              <CardDescription>{p.source}</CardDescription>
              <CardTitle className="leading-7">{p.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant="secondary">{p.status}</Badge>
            </CardContent>
            <CardFooter>
              <Link
                href={`/projects/${p.id}`}
                className={buttonVariants({ variant: "outline" })}
              >
                ဖွင့်ရန်
              </Link>
            </CardFooter>
          </Card>
        ))}
      </div>
      {data && data.last_page > 1 && (
        <div className="flex items-center gap-4">
          <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
            ရှေ့စာမျက်နှာ
          </Button>
          <span>
            {page} / {data.last_page}
          </span>
          <Button
            disabled={page === data.last_page}
            onClick={() => setPage(page + 1)}
          >
            နောက်စာမျက်နှာ
          </Button>
        </div>
      )}
    </div>
  );
}
