export const ratios: Record<"9:16" | "16:9" | "1:1" | "4:5", [number, number]>;
export const layouts: readonly string[];
export const templates: readonly string[];
export type Region = {
  x: number;
  y: number;
  width: number;
  height: number;
  circle: boolean;
};
export function regions(
  layout: string,
  width: number,
  height: number,
): Region[];
export function placement(
  region: Region,
  asset: { width: number; height: number },
  slot: { mode: string; scale: number; x: number; y: number },
): { width: number; height: number; x: number; y: number };
export function captionAppearance(
  style: string,
  width: number,
  height: number,
): {
  fontSize: number;
  x: number;
  y: number;
  bold: boolean;
  background: boolean;
  color: string;
  maxWidth: number;
};
export function captionDownload(
  captions: { text: string; startMs: number; endMs: number }[],
  format: string,
): string;
