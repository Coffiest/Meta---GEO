/**
 * ③ 1本の原稿を、各SNSの「作法」に合わせて出し分ける。
 *
 * 同じ文章をそのまま全SNSへ投げると、どこでも半端になる。プラットフォームごとに
 * 効く形が違うため(文字数・ハッシュタグの許容量・改行の入れ方・リンクの置き場所)、
 * 原稿は1本だけ書き、ここで機械的に変換する。
 *
 * LLMは使わない。同じ原稿からは必ず同じ出力が出るので、投稿前に差分を確認できる。
 */
import { analyzePost, findIssues, type StructureIssue } from "./structure.js";

export type Platform = "x" | "instagram" | "tiktok" | "youtube" | "threads";

export interface PlatformRule {
  label: string;
  /** 本文の上限文字数。 */
  limit: number;
  /** 推奨ハッシュタグ数。 */
  hashtags: number;
  /** リンクを本文に置けるか。置けない所ではプロフィール誘導に差し替える。 */
  linkInBody: boolean;
  /** 段落の目安。ここを超えたら空行で割る。 */
  paragraphMax: number;
}

/**
 * プラットフォームごとの作法。
 *
 * X は 140 字(日本語の実質上限)。Instagram / TikTok は本文にリンクを置いても踏まれないので、
 * プロフィールへ誘導する文言に置き換える。ハッシュタグは Instagram だけ多めが許容される。
 */
export const PLATFORM_RULES: Record<Platform, PlatformRule> = {
  x: { label: "X", limit: 140, hashtags: 2, linkInBody: true, paragraphMax: 60 },
  instagram: { label: "Instagram", limit: 2200, hashtags: 10, linkInBody: false, paragraphMax: 120 },
  tiktok: { label: "TikTok", limit: 2200, hashtags: 5, linkInBody: false, paragraphMax: 80 },
  youtube: { label: "YouTube", limit: 5000, hashtags: 3, linkInBody: true, paragraphMax: 200 },
  threads: { label: "Threads", limit: 500, hashtags: 1, linkInBody: true, paragraphMax: 100 },
};

export interface OptimizedPost {
  platform: Platform;
  text: string;
  length: number;
  /** 上限に収まっているか。 */
  withinLimit: boolean;
  /** 変換の際に行った操作(何をしたかを人が追えるように残す)。 */
  applied: string[];
  /** 変換後にも残っている構造上の弱点。 */
  issues: StructureIssue[];
}

/** 本文からハッシュタグ行を切り離す。末尾にまとまっている前提で扱う。 */
function splitTags(text: string): { body: string; tags: string[] } {
  const tags = text.match(/#[^\s#　]+/g) ?? [];
  const body = text.replace(/#[^\s#　]+/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { body, tags };
}

/** 段落が長すぎるときに、句点で空行を入れて割る。 */
function breakParagraphs(body: string, max: number): { text: string; changed: boolean } {
  let changed = false;
  const out = body
    .split(/\n\s*\n/)
    .map((p) => {
      if (p.length <= max) return p;
      changed = true;
      // 句点で切って、max を超えない範囲で詰め直す。
      const sentences = p.split(/(?<=。)/).filter((s) => s.length > 0);
      const chunks: string[] = [];
      let cur = "";
      for (const s of sentences) {
        if (cur.length > 0 && (cur + s).length > max) {
          chunks.push(cur);
          cur = s;
        } else {
          cur += s;
        }
      }
      if (cur.length > 0) chunks.push(cur);
      return chunks.join("\n\n");
    })
    .join("\n\n");
  return { text: out, changed };
}

/**
 * 上限に収まるよう末尾から削る。
 *
 * 途中で切ると意味が壊れるので、段落単位で後ろから落とす。それでも入らない場合だけ
 * 最後の段落を文単位で削る。フック(1段落目)は絶対に残す。
 */
function fitToLimit(body: string, limit: number): { text: string; trimmed: boolean } {
  if (body.length <= limit) return { text: body, trimmed: false };
  const paras = body.split(/\n\s*\n/);
  while (paras.length > 1 && paras.join("\n\n").length > limit) paras.pop();
  let text = paras.join("\n\n");
  if (text.length > limit) {
    const sentences = text.split(/(?<=。)/);
    while (sentences.length > 1 && sentences.join("").length > limit) sentences.pop();
    text = sentences.join("");
  }
  return { text: text.slice(0, limit), trimmed: true };
}

/**
 * 1本の原稿を指定プラットフォーム向けへ変換する。
 *
 * `link` を渡すと、本文にリンクを置けるプラットフォームでは末尾に付け、
 * 置けないプラットフォームでは「プロフィールのリンクから」に差し替える。
 */
export function optimizeFor(
  platform: Platform,
  source: string,
  options?: { link?: string; profileCta?: string },
): OptimizedPost {
  const rule = PLATFORM_RULES[platform];
  const applied: string[] = [];
  const { body, tags } = splitTags(source);

  const broken = breakParagraphs(body, rule.paragraphMax);
  if (broken.changed) applied.push(`長い段落を${rule.paragraphMax}文字目安で分割`);

  // ハッシュタグは推奨数まで絞る。元の並び順(重要な順に書かれている前提)を尊重して先頭から採る。
  const keptTags = tags.slice(0, rule.hashtags);
  if (tags.length > keptTags.length) {
    applied.push(`ハッシュタグを${tags.length}→${keptTags.length}個へ削減`);
  }

  const link = options?.link;
  const linkLine = link
    ? rule.linkInBody
      ? link
      : (options?.profileCta ?? "プロフィールのリンクから遊べます")
    : "";
  if (link && !rule.linkInBody) applied.push("本文リンクをプロフィール誘導へ差し替え");

  // 先に「本文以外」の長さを確保してから本文を詰める。そうしないとタグやリンクで上限を超える。
  const tail = [keptTags.join(" "), linkLine].filter((s) => s.length > 0).join("\n");
  const budget = rule.limit - (tail.length > 0 ? tail.length + 2 : 0);
  const fitted = fitToLimit(broken.text, Math.max(0, budget));
  if (fitted.trimmed) applied.push(`上限${rule.limit}文字に収まるよう末尾を削除`);

  const text = [fitted.text, tail].filter((s) => s.length > 0).join("\n\n");
  return {
    platform,
    text,
    length: text.length,
    withinLimit: text.length <= rule.limit,
    applied,
    issues: findIssues(analyzePost(text), rule.limit),
  };
}

/** 全プラットフォーム分をまとめて出す。 */
export function optimizeAll(
  source: string,
  options?: { link?: string; profileCta?: string },
): OptimizedPost[] {
  return (Object.keys(PLATFORM_RULES) as Platform[]).map((p) => optimizeFor(p, source, options));
}
