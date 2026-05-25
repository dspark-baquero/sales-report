import { availableMonths as loadAvailableMonths } from "./load";

export async function availableMonths(): Promise<string[]> {
  return loadAvailableMonths();
}

export async function defaultMonth(): Promise<string> {
  const months = await availableMonths();
  return months[months.length - 1];
}

export async function resolveMonth(input: string | undefined | null): Promise<string> {
  const months = await availableMonths();
  if (input && months.includes(input)) return input;
  return months[months.length - 1];
}
