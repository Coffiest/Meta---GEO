/**
 * ⑤ 返信の下書きを作る。
 *
 * 「自動で返信する」ことはしない。SNSの返信は運営の言葉として残り、取り消せない。
 * 機械が勝手に断定して事実と違うことを書いたり、怒っている相手に的外れな定型文を返せば、
 * 火を大きくするだけになる。ここが返すのは**下書きと、送る前に確認すべき点**で、
 * 送信は必ず人が決める。
 *
 * 相手の投稿を貼り付ければ動くので、APIの鍵は要らない。
 */
import { analyzeSentiment, type Severity } from "./sentiment.js";

/** 返信の型。相手が何をしに来たかで、返すべきものが変わる。 */
export type ReplyKind = "praise" | "question" | "bug" | "complaint" | "escalate" | "unknown";

export interface ReplyDraft {
  kind: ReplyKind;
  /** なぜこの型だと判断したか。人が却下できるように残す。 */
  reason: string;
  /** 下書き本文。そのまま送れる形にはせず、埋める箇所を【】で残す。 */
  draft: string;
  /** 送る前に人が確認すべき点。 */
  checklist: string[];
  /** 機械に任せず人が書くべきか。 */
  needsHuman: boolean;
}

const QUESTION_MARKS = ["?", "？", "ですか", "でしょうか", "教えて", "どうやって", "どこ", "なぜ", "いつ"];
const BUG_TERMS = ["バグ", "不具合", "エラー", "落ちる", "固まる", "動かない", "表示されない", "ログインできない"];
const PRAISE_TERMS = ["ありがとう", "神", "最高", "面白い", "おもしろい", "楽しい", "助かる", "すごい", "good", "great"];

function classify(text: string, severity: Severity | null): { kind: ReplyKind; reason: string } {
  if (severity === "critical") {
    return { kind: "escalate", reason: "法務・信用に関わる語が含まれている" };
  }
  if (BUG_TERMS.some((t) => text.includes(t))) {
    return { kind: "bug", reason: "不具合の報告とみられる語が含まれている" };
  }
  if (severity === "warning") {
    return { kind: "complaint", reason: "不満の表明とみられる" };
  }
  if (QUESTION_MARKS.some((t) => text.includes(t))) {
    return { kind: "question", reason: "問い合わせとみられる" };
  }
  if (PRAISE_TERMS.some((t) => text.toLowerCase().includes(t.toLowerCase()))) {
    return { kind: "praise", reason: "好意的な言及" };
  }
  return { kind: "unknown", reason: "型を判別できなかった" };
}

/**
 * 下書きは意図的に短くしてある。
 *
 * SNSの返信は長いほど言い訳がましく見え、とくに苦情に対しては逆効果になる。
 * 事実と次の行動だけを書き、詳細はDMや問い合わせ先へ寄せる。
 */
const TEMPLATES: Record<ReplyKind, { draft: string; checklist: string[]; needsHuman: boolean }> = {
  praise: {
    draft: "ありがとうございます！【相手が触れた機能】を気に入っていただけて嬉しいです。",
    checklist: ["相手が具体的に何を褒めたかを1つ拾って入れる(定型文に見せない)"],
    needsHuman: false,
  },
  question: {
    draft: "ご質問ありがとうございます。【回答】です。【補足があれば1文】",
    checklist: [
      "回答が事実か確認する(推測で答えない)",
      "仕様が変わる予定があるなら、その旨も書く",
    ],
    needsHuman: false,
  },
  bug: {
    draft:
      "ご報告ありがとうございます。【再現条件の確認 or 修正予定】\n" +
      "お手数ですが、端末とアプリのバージョンを教えていただけますか。",
    checklist: [
      "既知の不具合かを先に確認する(既知なら修正予定を答える)",
      "直っていないのに「修正しました」と書かない",
    ],
    needsHuman: false,
  },
  complaint: {
    draft: "ご不便をおかけしております。【何が起きているかの事実】【いつ・何をするか】",
    checklist: [
      "言い訳を書かない。事実と次の行動だけにする",
      "できないことを「検討します」で濁さない。できないなら、できないと書く",
      "送る前に一度置いて読み返す",
    ],
    needsHuman: true,
  },
  escalate: {
    draft: "(下書きを出しません)",
    checklist: [
      "法務・信用に関わる内容。定型文で返してはいけない",
      "事実関係を確認してから、責任者が文面を決める",
      "公開の場で返すか、DM/問い合わせへ誘導するかを先に決める",
    ],
    needsHuman: true,
  },
  unknown: {
    draft: "【相手の投稿に合わせて書く】",
    checklist: ["型を判別できなかった。定型文を当てず、内容を読んで書く"],
    needsHuman: true,
  },
};

/**
 * 相手の投稿から返信の下書きを作る。
 *
 * 返すのは下書きであって、送信するものではない。needsHuman が立っているものは
 * テンプレートを当てずに人が書く。
 */
export function draftReply(text: string): ReplyDraft {
  const s = analyzeSentiment(text);
  const { kind, reason } = classify(text, s.severity);
  const t = TEMPLATES[kind];

  // 相手が怒っているなら、型が何であれ人が読んでから送る。
  // 型だけで決めると、怒っている人からの不具合報告に落ち着いた定型文
  // (「バージョンを教えてください」)をそのまま当ててしまい、突き放して見える。
  const isUpset = s.severity === "warning" || s.severity === "critical";
  const checklist = isUpset && !t.needsHuman
    ? ["相手が苛立っている。定型文をそのまま送らず、まず不便をかけた事実に触れる", ...t.checklist]
    : t.checklist;

  return {
    kind,
    reason: isUpset && !t.needsHuman ? `${reason}(かつ不満の表明あり)` : reason,
    draft: t.draft,
    checklist,
    needsHuman: t.needsHuman || isUpset,
  };
}
