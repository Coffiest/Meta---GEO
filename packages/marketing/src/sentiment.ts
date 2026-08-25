/**
 * ⑨ ネガティブな言及を拾う。
 *
 * 目的は「感情スコアを当てること」ではなく、**人が今すぐ見るべき投稿を取りこぼさないこと**。
 * したがって取りこぼし(見逃し)より空振りを許す設計にしてある。誤検知は人が1秒で捨てられるが、
 * 見逃した炎上は取り返せない。
 *
 * 辞書ベースで、LLMを呼ばない。理由は3つ:
 *  - 同じ投稿に必ず同じ判定が出るので、閾値の調整が意味を持つ
 *  - 監視は件数が多く、毎件LLMを呼ぶとコストと遅延が見合わない
 *  - 判定理由(どの語に当たったか)がそのまま出るので、人が納得して却下できる
 */

/** 深刻度。数値が大きいほど人が早く見る必要がある。 */
export type Severity = "critical" | "warning" | "info";

interface Lexicon {
  severity: Severity;
  /** この語が含まれたら該当。 */
  terms: string[];
  /** なぜ拾ったのかの説明。通知にそのまま出す。 */
  reason: string;
}

/**
 * 日本語の辞書。
 *
 * critical は「放置すると事業リスクになる」もの。詐欺・返金・法的表現・アカウント被害など。
 * warning は不満・失望の表明。info は軽い否定で、量が増えたときだけ意味を持つ。
 */
const LEXICONS: Lexicon[] = [
  {
    severity: "critical",
    terms: ["詐欺", "サギ", "返金", "金返せ", "訴え", "通報", "違法", "賭博", "個人情報", "垢BAN", "アカウント停止", "不正", "イカサマ", "運営最悪"],
    reason: "法務・信用に関わる語",
  },
  {
    severity: "critical",
    terms: ["バグだらけ", "課金したのに", "money back", "scam", "fraud"],
    reason: "課金・重大不具合に関わる語",
  },
  {
    severity: "warning",
    terms: ["最悪", "ひどい", "酷い", "使えない", "つまらない", "つまんない", "萎える", "萎えた", "落ちる", "重い", "クソ", "くそ", "ゴミ", "二度と", "アンインストール", "消した", "やめた", "ストレス", "イライラ"],
    reason: "不満・離脱を示す語",
  },
  {
    severity: "info",
    terms: ["微妙", "残念", "惜しい", "分かりにくい", "わかりにくい", "面倒", "めんどい", "バグ", "不具合", "エラー", "固まる"],
    reason: "軽い否定・改善要望",
  },
];

/**
 * 打ち消し表現。「最悪じゃない」を拾わないための防御。
 *
 * ただし日本語の「〜じゃないの？」「〜じゃない？」は打ち消しではなく**疑いの表明**で、
 * 意味が正反対になる(「詐欺じゃないの？」は詐欺を疑っている)。打ち消しとして扱うのは
 * 言い切りの形だけに限り、後ろに疑問の助詞が続くものは除外する。
 */
const NEGATORS = ["じゃない", "ではない", " not ", "なくない"];

/** 打ち消しの直後に来ると、疑問(=打ち消しではない)になる表現。 */
const INTERROGATIVE_TAILS = ["の?", "の？", "?", "？", "か?", "か？", "かな", "の", "ですか"];

export interface SentimentHit {
  term: string;
  severity: Severity;
  reason: string;
}

export interface SentimentResult {
  /** 最も高い深刻度。何も当たらなければ null。 */
  severity: Severity | null;
  hits: SentimentHit[];
  /** 人が見るべきか。critical / warning は true。 */
  needsAttention: boolean;
}

const RANK: Record<Severity, number> = { critical: 3, warning: 2, info: 1 };

export function analyzeSentiment(text: string): SentimentResult {
  const lower = text.toLowerCase();
  const hits: SentimentHit[] = [];

  for (const lex of LEXICONS) {
    for (const term of lex.terms) {
      const idx = lower.indexOf(term.toLowerCase());
      if (idx < 0) continue;
      // 直後に打ち消しが来ていたら拾わない(「最悪じゃない」など)。
      // ただし打ち消しの後ろが疑問形なら、それは打ち消しではなく疑いなので拾う。
      const after = lower.slice(idx + term.length, idx + term.length + 12);
      const negator = NEGATORS.find((n) => after.startsWith(n.toLowerCase()));
      if (negator) {
        const rest = after.slice(negator.length);
        const isQuestion = INTERROGATIVE_TAILS.some((t) => rest.startsWith(t.toLowerCase()));
        if (!isQuestion) continue;
      }
      hits.push({ term, severity: lex.severity, reason: lex.reason });
    }
  }

  if (hits.length === 0) return { severity: null, hits: [], needsAttention: false };

  const severity = hits.reduce<Severity>(
    (worst, h) => (RANK[h.severity] > RANK[worst] ? h.severity : worst),
    "info",
  );
  return { severity, hits, needsAttention: severity !== "info" };
}
