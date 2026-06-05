import { Dashboard } from "@/components/Dashboard";
import { getStocks } from "@/lib/data/provider";
import { scoreAll } from "@/lib/scoring";

// Re-score at most every 30 minutes (keeps us well within API limits).
export const revalidate = 1800;

export default async function HomePage() {
  const { stocks, source, notice } = await getStocks();
  const scored = scoreAll(stocks);

  return (
    <Dashboard
      stocks={scored}
      source={source}
      notice={notice}
      generatedAt={new Date().toISOString()}
    />
  );
}
