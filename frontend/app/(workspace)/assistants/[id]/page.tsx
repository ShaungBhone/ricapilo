import { AssistantEditor } from "@/components/assistants/assistant-editor";

export default async function EditAssistant({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AssistantEditor key={id} assistantId={id} />;
}
