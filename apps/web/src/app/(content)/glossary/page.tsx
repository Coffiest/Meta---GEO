import type { Metadata } from "next";
import Link from "next/link";
import { Article, Section } from "@/components/content/Article";
import { ContentAd } from "@/components/content/ContentAd";

export const metadata: Metadata = {
  title: "ポーカー用語集",
  description:
    "テキサスホールデム・トーナメントで使われる基本用語を、カテゴリ別にまとめた用語集。役の一覧、ポジション、ベット用語、トーナメント用語、統計指標(VPIP/PFR/3ベット/ROI)までをわかりやすく解説します。",
  alternates: { canonical: "/glossary" },
};

type Term = { term: string; desc: string };

function Glossary({ title, terms }: { title: string; terms: Term[] }) {
  return (
    <Section title={title}>
      <dl className="divide-y divide-ink-200 rounded-2xl bg-ink-50 ring-1 ring-ink-200">
        {terms.map((t) => (
          <div key={t.term} className="px-4 py-3">
            <dt className="text-[14px] font-extrabold text-ink-950">{t.term}</dt>
            <dd className="mt-1 text-[13px] leading-relaxed text-ink-600">{t.desc}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

const HANDS: Term[] = [
  { term: "ハイカード", desc: "役ができず、最も高いカードで勝負する最弱の状態。" },
  { term: "ワンペア / ツーペア", desc: "同じ数字が2枚で1ペア、2組そろえばツーペア。" },
  { term: "スリーカード(セット/トリップス)", desc: "同じ数字が3枚。手札のペア+ボードで作るとセットと呼ぶ。" },
  { term: "ストレート", desc: "数字が5枚連続している役(例: 5-6-7-8-9)。" },
  { term: "フラッシュ", desc: "同じスート(マーク)のカードが5枚。" },
  { term: "フルハウス", desc: "スリーカード+ワンペアの組み合わせ。" },
  { term: "フォーカード", desc: "同じ数字が4枚。" },
  { term: "ストレートフラッシュ / ロイヤルフラッシュ", desc: "同スートの連続5枚。A-K-Q-J-10 の同スートが最強のロイヤル。" },
];

const POSITIONS: Term[] = [
  { term: "ボタン(BTN)", desc: "ディーラーボタンの席。各ストリートで最後に行動できる最も有利なポジション。" },
  { term: "カットオフ(CO)", desc: "ボタンの右隣。ボタンに次いで有利なレイトポジション。" },
  { term: "UTG(アンダー・ザ・ガン)", desc: "ビッグブラインドの左隣。プリフロップで最初に行動する最も不利な前列。" },
  { term: "スモール/ビッグブラインド(SB/BB)", desc: "カードを見る前に強制的にチップを出す2席。ポストフロップでは最初に行動する。" },
];

const BETS: Term[] = [
  { term: "チェック", desc: "ベットがない状況で、チップを出さずに手番を回すこと。" },
  { term: "コール", desc: "直前のベットと同額を支払って勝負を続けること。" },
  { term: "レイズ / 3ベット", desc: "ベットに上乗せすること。最初の再レイズを特に3ベットと呼ぶ。" },
  { term: "フォールド", desc: "そのハンドを降りること。出したチップは戻らない。" },
  { term: "オールイン", desc: "手持ちチップのすべてを賭けること。" },
  { term: "ポット", desc: "そのハンドで賭けられたチップの総額。勝者が獲得する。" },
  { term: "継続ベット(Cベット)", desc: "プリフロップでレイズした人が、フロップでも続けて打つベット。" },
];

const TOURNEY: Term[] = [
  { term: "SNG(シット&ゴー)", desc: "定員が揃い次第すぐ始まる短時間トーナメント。" },
  { term: "MTT", desc: "マルチテーブルトーナメント。多人数が複数卓で戦い、卓が統合されていく形式。" },
  { term: "ブラインド / アンティ", desc: "毎ハンドの強制ベット。時間経過で増える。アンティは全員が供出する追加分。" },
  { term: "バースト", desc: "チップを失いトーナメントから脱落すること。" },
  { term: "ITM(イン・ザ・マネー)", desc: "賞金圏内に入ること。入賞。" },
];

const STATS: Term[] = [
  { term: "VPIP", desc: "自発的にポットへチップを入れた割合。参加の広さを示す指標。" },
  { term: "PFR", desc: "プリフロップでレイズした割合。積極性の指標。" },
  { term: "3ベット率", desc: "再レイズを行う頻度。攻撃性とレンジの強さを表す。" },
  { term: "ROI", desc: "投資収益率。トーナメント成績の効率を示す。" },
  { term: "RFI(Raise First In)", desc: "自分が最初にレイズして参加する範囲。ポジション別に設計する戦略の土台。" },
  { term: "EVロス", desc: "最適な選択と比べて失った期待値。棋譜解析で可視化される。" },
];

export default function GlossaryPage() {
  return (
    <Article
      eyebrow="Glossary"
      title="ポーカー用語集"
      lead="Poker ART を遊ぶうえで登場する用語を、カテゴリ別にまとめました。プレイ中に分からない言葉が出てきたら、このページで確認してください。より詳しい遊び方は「遊び方」、戦略用語の背景は「GEO戦略」の解説もあわせてどうぞ。"
      updated="2026年7月"
    >
      <Glossary title="役(ハンドランキング)" terms={HANDS} />
      <Glossary title="ポジション" terms={POSITIONS} />
      <Glossary title="ベット・アクション" terms={BETS} />

      <ContentAd />

      <Glossary title="トーナメント" terms={TOURNEY} />
      <Glossary title="統計指標(GEOデータベース)" terms={STATS} />

      <p className="text-[13px] text-ink-500">
        用語の使いどころは、実際のプレイで身につきます。基本の流れは
        <Link href="/guide" className="font-semibold text-gold-700 underline underline-offset-2">遊び方</Link>、
        戦略の考え方は<Link href="/strategy" className="font-semibold text-gold-700 underline underline-offset-2">GEO戦略</Link>で解説しています。
      </p>
    </Article>
  );
}
