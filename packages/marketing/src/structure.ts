/**
 * ② 投稿の「構造」を取り出す。
 *
 * 伸びた投稿を眺めて「なんとなく良い」で終わらせないために、再現できる形へ分解する。
 * 見ているのは、日本語のSNSで実際に効きやすい要素に絞ってある:
 *
 *  - フック(1行目)     : タイムラインで最初に目に入る唯一の行。ここで止まるか流されるかが決まる
 *  - 数字              : 「勝率62%」「3分で」のような具体は、抽象的な言い切りより強い
 *  - 問いかけ / 二人称  : 読み手を当事者にする
 *  - CTA               : 何をしてほしいのかが書いてあるか
 *  - 改行の間隔        : 詰まった塊は読まれない。日本語は特に顕著
 *  - ハッシュタグ      : 多すぎると宣伝色が出て逆効果
 *
 * 判定は全て決定論的(LLMを呼ばない)。同じ投稿を入れれば必ず同じ結果が出るので、
 * 「先週の投稿と比べて何が変わったか」を機械的に追える。
 */

/** 投稿から取り出した構造。 */
export interface PostStructure {
  /** 1行目(フック)。空行を除いた最初の行。 */
  hook: string;
  /** フックの文字数。日本語は全角で数えても実用上ほぼ問題ないので単純な長さで見る。 */
  hookLength: number;
  /** 全体の文字数(ハッシュタグ・URLを含む)。 */
  length: number;
  /** 本文中に現れる数字(「62%」「3分」など)。具体性の指標。 */
  numbers: string[];
  /** ハッシュタグ(# 付き)。 */
  hashtags: string[];
  /** URL。 */
  urls: string[];
  /** 問いかけ(？で終わる行)が含まれるか。 */
  hasQuestion: boolean;
  /** 二人称(あなた/君/きみ)で読み手に呼びかけているか。 */
  addressesReader: boolean;
  /** 行動を促す文言が含まれるか。 */
  hasCta: boolean;
  /** 段落数(空行で区切られた塊)。 */
  paragraphs: number;
  /** 1段落あたりの平均文字数。大きいほど「詰まって」見える。 */
  avgParagraphLength: number;
  /** 箇条書きの行数。 */
  bulletLines: number;
}

/** 行動を促す語。実際に日本語のSNSで使われる言い回しに寄せてある。 */
const CTA_PATTERNS = [
  "フォロー",
  "リポスト",
  "リツイート",
  "拡散",
  "保存",
  "いいね",
  "コメント",
  "リプ",
  "詳しくは",
  "こちら",
  "登録",
  "ダウンロード",
  "試して",
  "使ってみて",
  "プレイ",
  "無料",
];

const READER_PATTERNS = ["あなた", "きみ", "君", "みんな", "初心者の方", "あなたの"];

/** 箇条書きとみなす行頭。 */
const BULLET_HEADS = ["・", "-", "‐", "–", "—", "▶", "▷", "→", "①", "②", "③", "④", "⑤", "✓", "✔"];

/** 数字(全角半角・単位つき)を拾う。「3分」「62%」「1,200人」など。 */
const NUMBER_RE = /[0-9０-９][0-9０-９,，.．]*\s*(?:%|％|人|回|分|秒|時間|日|週|ヶ月|か月|年|円|倍|位|個|件|bb|BB)?/g;
const HASHTAG_RE = /#[^\s#　]+/g;
const URL_RE = /https?:\/\/[^\s　]+/g;

export function analyzePost(text: string): PostStructure {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const lines = normalized.split("\n");
  const hook = lines.find((l) => l.trim().length > 0)?.trim() ?? "";

  // ハッシュタグとURLは「本文の密度」を測るときにノイズになるので、先に分けて数える。
  const hashtags = normalized.match(HASHTAG_RE) ?? [];
  const urls = normalized.match(URL_RE) ?? [];
  const body = normalized.replace(HASHTAG_RE, "").replace(URL_RE, "");

  const paragraphs = normalized
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const bulletLines = lines.filter((l) => {
    const t = l.trim();
    return BULLET_HEADS.some((h) => t.startsWith(h));
  }).length;

  return {
    hook,
    hookLength: hook.length,
    length: normalized.length,
    numbers: body.match(NUMBER_RE)?.map((n) => n.trim()).filter((n) => n.length > 0) ?? [],
    hashtags,
    urls,
    hasQuestion: /[?？]\s*$/m.test(normalized),
    addressesReader: READER_PATTERNS.some((p) => normalized.includes(p)),
    hasCta: CTA_PATTERNS.some((p) => normalized.includes(p)),
    paragraphs: paragraphs.length,
    avgParagraphLength:
      paragraphs.length === 0
        ? 0
        : Math.round(paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphs.length),
    bulletLines,
  };
}

/** 構造の弱点。何をどう直せばいいかまで書く(「短くしろ」ではなく「何文字に」)。 */
export interface StructureIssue {
  /** 機械が扱うためのキー。 */
  code:
    | "hook-too-long"
    | "hook-missing-punch"
    | "no-numbers"
    | "no-cta"
    | "too-many-hashtags"
    | "wall-of-text"
    | "too-long";
  /** 人が読んで直せる指摘。 */
  message: string;
}

/**
 * フックの上限。タイムライン上で折り返さずに読み切れる長さの目安。
 * 日本語は1行あたりの情報量が多いので、欧文の感覚より短めに置く。
 */
const HOOK_MAX = 28;
/** 1段落がこれを超えると、読み手には「塊」に見えて飛ばされやすい。 */
const PARAGRAPH_MAX = 120;
/** ハッシュタグはこれを超えると宣伝色が勝つ。 */
const HASHTAG_MAX = 3;

/**
 * 構造の弱点を洗い出す。
 *
 * `platformLimit` を渡すと、その文字数に対して長すぎないかも見る
 * (X の 140 など。プラットフォームごとの上限は optimize.ts 側に持たせてある)。
 */
export function findIssues(s: PostStructure, platformLimit?: number): StructureIssue[] {
  const issues: StructureIssue[] = [];

  if (s.hookLength > HOOK_MAX) {
    issues.push({
      code: "hook-too-long",
      message: `1行目が${s.hookLength}文字。${HOOK_MAX}文字以内に切り詰めると、折り返さずに読み切ってもらえる。`,
    });
  }
  if (s.hookLength > 0 && !/[0-9０-９]/.test(s.hook) && !/[?？!！]/.test(s.hook)) {
    issues.push({
      code: "hook-missing-punch",
      message: "1行目に数字も問いかけも感嘆も無い。具体的な数字か問いを1つ入れると止まりやすくなる。",
    });
  }
  if (s.numbers.length === 0) {
    issues.push({
      code: "no-numbers",
      message: "本文に数字が1つも無い。「勝率62%」「3分で」のような具体を1つ入れる。",
    });
  }
  if (!s.hasCta) {
    issues.push({ code: "no-cta", message: "read後に何をしてほしいのかが書かれていない。CTAを1つ置く。" });
  }
  if (s.hashtags.length > HASHTAG_MAX) {
    issues.push({
      code: "too-many-hashtags",
      message: `ハッシュタグが${s.hashtags.length}個。${HASHTAG_MAX}個までに絞ると宣伝色が薄まる。`,
    });
  }
  if (s.avgParagraphLength > PARAGRAPH_MAX) {
    issues.push({
      code: "wall-of-text",
      message: `1段落が平均${s.avgParagraphLength}文字。${PARAGRAPH_MAX}文字を目安に空行で割る。`,
    });
  }
  if (platformLimit !== undefined && s.length > platformLimit) {
    issues.push({
      code: "too-long",
      message: `${s.length}文字で上限${platformLimit}文字を超えている。${s.length - platformLimit}文字削る必要がある。`,
    });
  }

  return issues;
}
