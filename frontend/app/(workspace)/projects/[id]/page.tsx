"use client";
import { use } from "react";
import { ProjectEditor } from "@/components/project-editor";
export default function Detail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ProjectEditor key={id} id={id} />;
}
