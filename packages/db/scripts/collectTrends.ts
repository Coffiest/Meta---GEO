/**
 * ④ トレンドを収集して保存する。GitHub Actions の日次実行から呼ぶ。
 *
 * 鍵が要らないRSSだけを見るので、Secret を1つも設定していなくても動く。
 * 監視対象のキーワードは MARKETING_KEYWORDS(カンマ区切り)で差し替えられる。
 */
import { collectTrends, defaultSources, youtubeChannelSource } from "@meta-geo/marketing";
import { prisma } from "../src/client.js";
import { saveTrendItems } from "../src/marketing.js";

function keywords(): string[] {
  const raw = process.env["MARKETING_KEYWORDS"];
  if (!raw) return ["ポーカー", "テキサスホールデム", "GTO ポーカー"];
  return raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

/** 監視したいYouTubeチャンネル。"UCxxxx:名前,UCyyyy:名前" 形式。 */
function youtubeSources() {
  const raw = process.env["MARKETING_YOUTUBE_CHANNELS"];
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.includes(":"))
    .map((s) => {
      const [id, ...rest] = s.split(":");
      return youtubeChannelSource(id!.trim(), rest.join(":").trim() || id!.trim());
    });
}

async function main(): Promise<void> {
  const sources = [...defaultSources(keywords()), ...youtubeSources()];
  console.log(`[trends] ${sources.length}ソースから収集`);

  const { items, failures } = await collectTrends(sources);
  console.log(`[trends] 取得 ${items.length}件 / 失敗 ${failures.length}件`);
  // 失敗は必ず出す。黙って0件になると「話題が無かった」と取り違える。
  for (const f of failures) console.warn(`[trends] 失敗: ${f.source.label} → ${f.reason}`);

  const r = await saveTrendItems(items);
  console.log(`[trends] 新規 ${r.saved}件 / 既存 ${r.skipped}件 / 要対応 ${r.needsAttention}件`);

  // 要対応が出た日はログの先頭で分かるようにする(Actionsの実行一覧から気づけるように)。
  if (r.needsAttention > 0) console.log(`::warning::ネガティブな言及を${r.needsAttention}件検知しました`);
}

main()
  .catch((err) => {
    console.error("[trends] 失敗:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
