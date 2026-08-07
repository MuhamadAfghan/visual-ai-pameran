import { format, formatDistanceToNow } from "date-fns";

export function formatDate(date: string | Date): string {
  return format(new Date(date), "dd MMM yyyy, HH:mm");
}

export function formatDateShort(date: string | Date): string {
  return format(new Date(date), "dd/MM/yyyy");
}

export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}
