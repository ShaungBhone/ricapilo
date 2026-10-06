import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
export function Feedback({ message }: { message: string }) {
  return message ? (
    <Alert role="status">
      <AlertTitle>အသိပေးချက်</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  ) : null;
}
export function Blank({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
