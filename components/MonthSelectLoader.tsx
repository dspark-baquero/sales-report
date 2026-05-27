import { availableMonths, defaultMonth } from "@/lib/months";
import { MonthSelect } from "./MonthSelect";

export async function MonthSelectLoader() {
  const months = (await availableMonths()).slice().reverse();
  const fallback = await defaultMonth();
  return <MonthSelect fallback={fallback} available={months} />;
}
