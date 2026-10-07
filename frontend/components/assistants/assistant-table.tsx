"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import {
  ArrowUpDown,
  Bot,
  Columns3,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  createColumnHelper,
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSortingFeature,
  createPaginatedRowModel,
  createSortedRowModel,
  sortFn_text,
  sortFn_basic,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import type { Assistant } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableCaption,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { AssistantStatus } from "./shared";

const features = tableFeatures({
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSortingFeature,
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  sortFns: { text: sortFn_text, basic: sortFn_basic },
});
const helper = createColumnHelper<typeof features, Assistant>();

export function AssistantTable({
  data,
  loading,
  busy,
  onEdit,
  onTalk,
  onPreview,
  onDelete,
  empty,
  toolbar,
}: {
  data: Assistant[];
  loading: boolean;
  busy: boolean;
  onEdit: (a: Assistant) => void;
  onTalk: (a: Assistant) => void;
  onPreview: (a: Assistant) => void;
  onDelete: (a: Assistant) => void;
  empty: ReactNode;
  toolbar: ReactNode;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const labels: Record<string, string> = useMemo(
    () => ({
      name: t("assistants.agent"),
      llm_model: t("shared.aiModel"),
      voice: t("assistants.voiceId"),
      enabled: t("assistants.usage"),
      actions: t("assistants.actions"),
    }),
    [t],
  );
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor("name", {
          header: labels.name,
          enableHiding: false,
          sortFn: "text",
          cell: ({ row }) => (
            <div className="flex max-w-sm min-w-64 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted">
                <Bot className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <Link
                  className="font-medium hover:underline"
                  href={`/assistants/${row.original.id}`}
                >
                  {row.original.name}
                </Link>
                <p className="truncate text-xs text-muted-foreground">
                  {row.original.instructions}
                </p>
              </div>
            </div>
          ),
        }),
        helper.accessor("llm_model", {
          header: labels.llm_model,
          sortFn: "text",
        }),
        helper.accessor("voice", { header: labels.voice, sortFn: "text" }),
        helper.accessor("enabled", {
          header: labels.enabled,
          sortFn: "basic",
          cell: ({ row }) => <AssistantStatus enabled={row.original.enabled} />,
        }),
        helper.display({
          id: "actions",
          header: labels.actions,
          enableHiding: false,
          cell: ({ row }) => (
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={busy}
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("assistants.actionsFor", {
                      name: row.original.name,
                    })}
                  />
                }
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => onEdit(row.original)}>
                    {t("assistants.edit")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!row.original.enabled}
                    onClick={() => onTalk(row.original)}
                  >
                    {t("assistants.talk")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!row.original.enabled || busy}
                    onClick={() => onPreview(row.original)}
                  >
                    {t("assistants.previewVoice")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={busy}
                    onClick={() => onDelete(row.original)}
                  >
                    {t("assistants.delete")}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ),
        }),
      ]),
    [labels, t, busy, onEdit, onTalk, onPreview, onDelete],
  );
  const table = useTable({
    features,
    data,
    columns,
    getRowId: (a) => String(a.id),
  });
  const rows = table.getRowModel().rows;
  const format = (value: number) => new Intl.NumberFormat(locale).format(value);
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      aria-busy={loading}
    >
      <div className="flex shrink-0 items-center gap-3 border-b p-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">{toolbar}</div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
            <Columns3 data-icon="inline-start" />
            {t("assistants.columns")}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              {table
                .getAllColumns()
                .filter((c) => c.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(value)}
                  >
                    {labels[column.id]}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableCaption className="sr-only">
            {t("workspace.assistants")}
          </TableCaption>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    scope="col"
                    aria-sort={
                      header.column.getIsSorted() === "asc"
                        ? "ascending"
                        : header.column.getIsSorted() === "desc"
                          ? "descending"
                          : undefined
                    }
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <table.FlexRender header={header} />
                        <ArrowUpDown data-icon="inline-end" />
                      </Button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 10 }, (_, i) => (
                <TableRow key={i}>
                  {table.getVisibleLeafColumns().map((column) => (
                    <TableCell key={column.id}>
                      <Skeleton className="h-8 w-24" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length ? (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={(event) => {
                    if (
                      !(event.target as HTMLElement).closest(
                        "a,button,[role=menuitem]",
                      )
                    )
                      onEdit(row.original);
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={table.getVisibleLeafColumns().length}>
                  {empty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-background px-4 py-3">
        <span className="text-sm text-muted-foreground" role="status">
          {loading
            ? t("assistants.loading")
            : t("assistants.tablePage", {
                page: format(
                  data.length ? table.state.pagination.pageIndex + 1 : 0,
                ),
                total: format(table.getPageCount()),
                count: data.length,
              })}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loading || !table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            <ChevronLeft data-icon="inline-start" />
            {t("assistants.previous")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || !table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            {t("assistants.next")}
            <ChevronRight data-icon="inline-end" />
          </Button>
        </div>
      </div>
    </div>
  );
}
