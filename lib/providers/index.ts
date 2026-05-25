import type { DataProvider } from "../data-provider";
import { bigqueryProvider } from "./bigquery-provider";

export async function getProvider(): Promise<DataProvider> {
  return bigqueryProvider;
}
