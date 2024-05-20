import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function match(
  key: string | undefined,
  map: Record<string | "_", string>,
) {
  const fallback = map["_"];
  return key ? map[key] ?? fallback : fallback;
}
