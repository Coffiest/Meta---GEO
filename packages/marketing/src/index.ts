/**
 * マーケティング支援の共通ロジック。
 *
 * SNS運用のうち「外部APIの鍵が無くても成立する部分」をここへ集めてある。
 * 収集(trends)・分解(structure)・出し分け(optimize)・作り直し(recycle)・監視(sentiment)。
 *
 * 鍵が要る部分(競合アカウントの日次分析・フォロワー推移・メンション監視・返信生成)は
 * packages/server 側のアダプタで扱い、鍵が無い間は「未設定」と明示して落ちないようにする。
 */
export * from "./structure.js";
export * from "./optimize.js";
export * from "./trends.js";
export * from "./recycle.js";
export * from "./sentiment.js";
export * from "./share.js";
export * from "./reply.js";
export * from "./xClient.js";
