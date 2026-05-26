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
  if (months.length === 0) {
    throw new Error(
      "사용 가능한 월 데이터가 없습니다. BigQuery 연결 및 환경변수(BQ_PROJECT_ID, BQ_DATASET, BQ_TABLE)를 확인하세요.",
    );
  }
  if (input && months.includes(input)) return input;
  return months[months.length - 1];
}
