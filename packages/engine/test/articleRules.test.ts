import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  KnowledgeFormatError,
  handInRange,
  icmStageOf,
  matchArticleRule,
  parseHandRange,
  parseKnowledgeMarkdown,
  readArticleFacts,
  renderGeneratedRules,
  ruleMatches,
  type ArticleHandInput,
  type ArticleRule,
} from "../src/review/articleRules";
import { ARTICLE_RULES } from "../src/review/articleRules.generated";

/**
 * 解説の知識ベース(knowledge/*.md)→ 解説ルール。
 *
 * 生成物は Markdown から作り直して突き合わせる。食い違っていれば
 * `pnpm --filter @meta-geo/engine run knowledge` で作り直す(UPDATE_KNOWLEDGE=1 のときはこのテストが書き出す)。
 */

const KNOWLEDGE_DIR = join(__dirname, "..", "knowledge");
const GENERATED = join(__dirname, "..", "src", "review", "articleRules.generated.ts");

function loadAllRules(): ArticleRule[] {
  const files = readdirSync(KNOWLEDGE_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();
  const rules = files.flatMap((f) => parseKnowledgeMarkdown(readFileSync(join(KNOWLEDGE_DIR, f), "utf8")));
  const ids = new Set<string>();
  for (const r of rules) {
    if (ids.has(r.id)) throw new KnowledgeFormatError(`id が重複: ${r.id}`);
    ids.add(r.id);
  }
  return rules;
}

describe("知識ベース → 生成物", () => {
  it("Markdown のルールは全て検証を通り、生成物と一致する", () => {
    const rules = loadAllRules();
    const rendered = renderGeneratedRules(rules);
    if (process.env.UPDATE_KNOWLEDGE) writeFileSync(GENERATED, rendered);
    expect(readFileSync(GENERATED, "utf8")).toBe(rendered);
    // 書き出した回は、読み込み済みの生成物が古いので数は比べない。
    if (!process.env.UPDATE_KNOWLEDGE) expect(ARTICLE_RULES.length).toBe(rules.length);
  });

  it("画面に出る文言に、自動で卓を埋める仕組みを匂わせる語が無い", () => {
    for (const r of loadAllRules()) {
      const text = `${r.title}${r.summary}${r.body}`;
      expect(text, r.id).not.toMatch(/\bbots?\b|ボット|봇|机器人/i);
    }
  });

  it("記事から書き起こしたルールには出典が付いている(局面の既定の解説 spots.md は出典なし)", () => {
    for (const r of loadAllRules()) {
      if (r.id.startsWith("spot-")) continue;
      expect(r.sourceUrl, r.id).toMatch(/^https:\/\//);
    }
  });

  it("「解析の対象外」の局面ごとに、既定の解説がある", () => {
    const ids = new Set(loadAllRules().map((r) => r.id));
    for (const id of [
      "spot-bb-vs-limp",
      "spot-vs-limp-iso",
      "spot-open-vs-3bet",
      "spot-vs-4bet",
      "spot-squeeze-raise",
      "spot-cold-vs-3bet",
      "spot-short-vs-open-call",
      "spot-vs-allin-call",
      "spot-multiway-bet",
      "spot-limped-pot-postflop",
      "spot-3bet-pot-postflop",
      "spot-general-preflop",
      "spot-general-postflop",
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
  });
});

describe("parseKnowledgeMarkdown", () => {
  const md = (body: string) => `## 記事A\n出典: https://example.com/a\n\n### 要点\n- メモ\n\n\`\`\`json\n{"not":"rule"}\n\`\`\`\n\n${body}`;

  it("```json rule のブロックだけをルールにする", () => {
    const rules = parseKnowledgeMarkdown(
      md('```json rule\n{"id":"a-1","title":"t","summary":"s","body":"b","when":{"street":["flop"]}}\n```\n')
    );
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ id: "a-1", article: "記事A", sourceUrl: "https://example.com/a", grade: null, priority: 0 });
  });

  it("未知の条件・未知の値・バッジに手が無いルールは弾く", () => {
    const bad = (when: string, extra = "") =>
      md(`\`\`\`json rule\n{"id":"x","title":"t","summary":"s","body":"b"${extra},"when":${when}}\n\`\`\`\n`);
    expect(() => parseKnowledgeMarkdown(bad('{"foo":true}'))).toThrow(KnowledgeFormatError);
    expect(() => parseKnowledgeMarkdown(bad('{"street":["flopp"]}'))).toThrow(KnowledgeFormatError);
    expect(() => parseKnowledgeMarkdown(bad('{"street":["flop"]}', ',"grade":"mistake"'))).toThrow(/action/);
    expect(() => parseKnowledgeMarkdown(bad('{"street":["preflop"],"action":["checkOrCall"]}'))).toThrow(/ストリート/);
    expect(() => parseKnowledgeMarkdown(bad('{"heroHand":["AXs"]}'))).toThrow(/heroHand/);
    expect(() =>
      parseKnowledgeMarkdown(md('```json rule\n{"id":"x","title":"t","summary":"{hnad}","body":"b","when":{}}\n```\n'))
    ).toThrow(/置き換え語/);
  });
});

describe("レンジ表記", () => {
  const h = (a: string, b: string) => [a, b];
  it("ペア / ペア+ / ペアの範囲", () => {
    expect(handInRange(h("Qs", "Qd"), ["QQ+"])).toBe(true);
    expect(handInRange(h("Js", "Jd"), ["QQ+"])).toBe(false);
    expect(handInRange(h("6s", "6d"), ["77-55"])).toBe(true);
  });
  it("スーテッド / オフスート / 両方 / プラス / 範囲", () => {
    expect(handInRange(h("As", "Ks"), ["AKs"])).toBe(true);
    expect(handInRange(h("As", "Kd"), ["AKs"])).toBe(false);
    expect(handInRange(h("Kd", "As"), ["AK"])).toBe(true);
    expect(handInRange(h("As", "Js"), ["ATs+"])).toBe(true);
    expect(handInRange(h("As", "9s"), ["ATs+"])).toBe(false);
    expect(handInRange(h("Ah", "3h"), ["A5s-A2s"])).toBe(true);
    expect(handInRange(h("Ah", "6h"), ["A5s-A2s"])).toBe(false);
  });
  it("読めない表記は null", () => {
    expect(parseHandRange("AXs")).toBeNull();
  });
});

describe("icmStageOf", () => {
  it("入賞までの人数で段階を出す", () => {
    expect(icmStageOf({ playersRemaining: 6, itmPlaces: 2, gameType: "sng" })).toBe("early");
    expect(icmStageOf({ playersRemaining: 4, itmPlaces: 2, gameType: "sng" })).toBe("nearBubble");
    expect(icmStageOf({ playersRemaining: 3, itmPlaces: 2, gameType: "sng" })).toBe("bubble");
    expect(icmStageOf({ playersRemaining: 2, itmPlaces: 2, gameType: "sng" })).toBe("itm");
    expect(icmStageOf({ playersRemaining: 6, itmPlaces: 3, gameType: "mtt" })).toBe("finalTable");
    expect(icmStageOf({ playersRemaining: null, itmPlaces: 2, gameType: "sng" })).toBeNull();
  });
});

describe("readArticleFacts", () => {
  // 席0=BTN, 1=SB, 2=BB, 3=UTG, 4=HJ, 5=CO
  const hand: ArticleHandInput = {
    buttonFixedPos: 0,
    seatCount: 6,
    board: ["Ks", "7s", "2s", "9d", "4c"],
    seats: [0, 1, 2, 3, 4, 5].map((i) => ({
      seatIndex: i,
      startingStack: i === 2 ? 5000 : 4000,
      holeCards: i === 2 ? ["As", "Qd"] : ["", ""],
    })),
    actions: [
      { sequenceNumber: 1, seatIndex: 1, street: "preflop", kind: "postBlind" },
      { sequenceNumber: 2, seatIndex: 2, street: "preflop", kind: "postBlind" },
      { sequenceNumber: 3, seatIndex: 3, street: "preflop", kind: "fold" },
      { sequenceNumber: 4, seatIndex: 4, street: "preflop", kind: "fold" },
      { sequenceNumber: 5, seatIndex: 5, street: "preflop", kind: "raise" },
      { sequenceNumber: 6, seatIndex: 0, street: "preflop", kind: "fold" },
      { sequenceNumber: 7, seatIndex: 1, street: "preflop", kind: "fold" },
      { sequenceNumber: 8, seatIndex: 2, street: "preflop", kind: "raise" },
      { sequenceNumber: 9, seatIndex: 5, street: "preflop", kind: "call" },
      { sequenceNumber: 10, seatIndex: 2, street: "flop", kind: "bet" },
    ],
    icmStage: "bubble",
  };

  it("プリフロップ: オープンに直面している", () => {
    const f = readArticleFacts(hand, {
      sequenceNumber: 8,
      street: "preflop",
      seatIndex: 2,
      heroPos: "BB",
      effStackBb: 40,
      potBb: 3.5,
      facingSizeBb: 1.5,
      bucket: "raise5+",
      role: null,
      boardChange: null,
    });
    expect(f).toMatchObject({ preflopSpot: "vsOpen", heroFirstAction: true, inPosition: null, heroCovers: true, icmStage: "bubble" });
  });

  it("フロップ: 3betポットでOOPのPFR、モノトーン、ナッツフラドロ", () => {
    const f = readArticleFacts(hand, {
      sequenceNumber: 10,
      street: "flop",
      seatIndex: 2,
      heroPos: "BB",
      effStackBb: 30,
      potBb: 20,
      facingSizeBb: 0,
      bucket: "bet20-40",
      role: "cbet",
      boardChange: null,
    });
    expect(f).toMatchObject({
      preflopSpot: null,
      potType: "threeBet",
      heroPreflopAggressor: true,
      inPosition: false,
      multiway: false,
      facingBet: false,
      spr: 1.5,
    });
    expect(f.flop?.suit).toBe("monotone");
    expect(f.hand?.draws.nutFlushDraw).toBe(true);

    const rule: ArticleRule = {
      id: "t",
      article: "",
      sourceUrl: null,
      title: "",
      summary: "",
      body: "",
      grade: "good",
      keepGto: false,
      priority: 0,
      when: { street: ["flop"], potType: ["threeBet"], inPosition: false, boardSuit: ["monotone"], action: ["bet20-40"] },
    };
    expect(ruleMatches(rule, f)).toBe(true);
    expect(ruleMatches({ ...rule, when: { ...rule.when, inPosition: true } }, f)).toBe(false);
    // より具体的なルールが選ばれる。
    const general: ArticleRule = { ...rule, id: "g", when: { street: ["flop"] } };
    expect(matchArticleRule([general, rule], f)?.id).toBe("t");
  });
});
