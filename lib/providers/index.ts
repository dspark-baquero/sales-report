import type { DataProvider } from "../data-provider";

let provider: DataProvider | null = null;

export async function getProvider(): Promise<DataProvider> {
  if (provider) return provider;

  if (process.env.DATA_PROVIDER === "kv") {
    const { kvProvider } = await import("./kv-provider");
    provider = kvProvider;
  } else {
    const { csvProvider } = await import("./csv-provider");
    provider = csvProvider;
  }

  return provider;
}
