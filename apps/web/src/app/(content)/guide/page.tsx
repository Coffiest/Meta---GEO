import type { Metadata } from "next";
import Link from "next/link";
import { Article, Section } from "@/components/content/Article";
import { ContentAd } from "@/components/content/ContentAd";

export const metadata: Metadata = {
  title: "ポーカーの遊び方・ルール解説",
  description:
    "Poker ART(ポーカーアート)の遊び方を初心者向けにやさしく解説。ノーリミット・テキサスホールデムの基本ルール、1ハンドの流れ、トーナメント(SNG/MTT)の進み方、ブラインドとアンティ、ポジション、ベット操作までを網羅します。",
  alternates: { canonical: "/guide" },
};

export default function GuidePage() {
  return (
    <Article
      eyebrow="How to Play"
      title="ポーカーの遊び方"
      lead="Poker ART は、実際の金銭を賭けないバーチャルチップ専用のノーリミット・テキサスホールデム(NLH)トーナメントです。ポーカーがまったく初めての方でも、この1ページで「1ハンドの流れ」と「トーナメントの仕組み」が分かるように、順を追って説明します。"
      updated="2026年7月"
    >
      <p>
        Poker ART は無料で遊べ、勝っても負けてもお金は動きません。チップはすべてゲーム内専用の仮想チップで、
        購入も換金もできません。だからこそ、リスクを気にせず戦略そのものの練習に集中し、上達を楽しめます。
        まずは「1回のハンドがどう進むのか」を理解し、その上でトーナメント全体の流れを掴んでいきましょう。
      </p>

      <Section title="ポーカー(テキサスホールデム)の目的">
        <p>
          テキサスホールデムの目的はシンプルです。各プレイヤーは自分だけが見られる2枚の手札(ホールカード)を持ち、
          テーブル中央に順番に公開される5枚の共有カード(コミュニティカード)と組み合わせて、
          <strong>5枚で構成する最も強い役</strong>を作ります。最終的に最も強い役を持つプレイヤー、
          あるいは他の全員がフォールド(降り)した時点で残っていたプレイヤーが、そのハンドのポット(賭けチップの総額)を獲得します。
        </p>
        <p>
          役の強さは下から順に「ハイカード → ワンペア → ツーペア → スリーカード → ストレート → フラッシュ →
          フルハウス → フォーカード → ストレートフラッシュ → ロイヤルフラッシュ」です。各役の成り立ちは
          <Link href="/glossary" className="font-semibold text-gold-700 underline underline-offset-2">用語集</Link>で確認できます。
        </p>
      </Section>

      <Section title="1ハンドの流れ(4つのストリート)">
        <p>1回のハンドは、カードが公開されるタイミングで4つの局面に分かれ、各局面の間にベット(賭け)ラウンドがあります。</p>
        <ul className="list-disc space-y-2 pl-5 text-ink-700">
          <li><strong className="text-ink-950">プリフロップ</strong>: 各自に2枚のホールカードが配られた直後。共有カードはまだ0枚。最初のベットラウンド。</li>
          <li><strong className="text-ink-950">フロップ</strong>: 共有カードが3枚同時に公開される。2回目のベットラウンド。</li>
          <li><strong className="text-ink-950">ターン</strong>: 4枚目の共有カードが公開される。3回目のベットラウンド。</li>
          <li><strong className="text-ink-950">リバー</strong>: 5枚目(最後)の共有カードが公開される。最後のベットラウンド。</li>
        </ul>
        <p>
          リバーのベットが終わっても2人以上が残っていれば<strong>ショーダウン</strong>となり、手札を見せ合って役の強い方がポットを取ります。
          途中で1人を残して全員がフォールドすれば、その時点でショーダウンなしに決着します。
        </p>
      </Section>

      <Section title="ベットで選べるアクション">
        <p>自分の手番が回ってきたら、状況に応じて次のいずれかを選びます。画面下部のアクションバーから操作します。</p>
        <ul className="list-disc space-y-2 pl-5 text-ink-700">
          <li><strong className="text-ink-950">チェック</strong>: 誰もベットしていないとき、チップを出さずに次の人へ手番を回す。</li>
          <li><strong className="text-ink-950">ベット</strong>: 誰もまだ賭けていない状況で、自分から賭ける。</li>
          <li><strong className="text-ink-950">コール</strong>: 直前のベットと同額を支払って勝負を続ける。</li>
          <li><strong className="text-ink-950">レイズ</strong>: 直前のベットに上乗せして賭け、相手に圧力をかける。</li>
          <li><strong className="text-ink-950">フォールド</strong>: そのハンドを降りる。それまでに出したチップは戻らない。</li>
          <li><strong className="text-ink-950">オールイン</strong>: 手持ちのチップ全部を賭ける。ノーリミットならいつでも可能。</li>
        </ul>
        <p>
          Poker ART は「ノーリミット」なので、レイズ額に上限はありません(下限=直前のレイズ幅以上、というルールのみ)。
          この自由度の高さが、心理戦とベットサイズの読み合いを生み出します。
        </p>
      </Section>

      <ContentAd />

      <Section title="ブラインドとアンティ">
        <p>
          全員が毎ハンド強制的に賭ける仕組みが<strong>ブラインド</strong>です。ボタン(ディーラー位置)の左隣が
          スモールブラインド(SB)、その左がビッグブラインド(BB)を、カードを見る前に強制的に出します。
          これにより、誰も何もしなくてもポットに常にチップがあり、ゲームが停滞せずに進みます。
        </p>
        <p>
          トーナメントが進むと、一定時間ごとにブラインドの額が上がります(レベルアップ)。後半には
          <strong>アンティ</strong>(参加者がさらに少額を供出する仕組み)が加わり、ポットが大きくなってアクションが活発化します。
          現在のレベルと次のレベルまでの残り時間は、ゲーム画面の上部に常時表示されます。
        </p>
      </Section>

      <Section title="ポジション(座席の有利不利)">
        <p>
          テキサスホールデムでは<strong>後に行動できる席ほど有利</strong>です。相手のアクションを見てから自分の判断ができるからです。
          主なポジションは、アーリー(UTG など)、ミドル、レイト(CO・BTN)、そしてブラインド(SB・BB)に分類されます。
          特にボタン(BTN)は各ストリートで最後に行動できる最強のポジションで、より広いハンドで積極的に参加できます。
        </p>
        <p>
          「どのポジションからどんなハンドで参加すべきか」は戦略の中核です。考え方の理論は
          <Link href="/strategy" className="font-semibold text-gold-700 underline underline-offset-2">GEO戦略の解説</Link>で、
          実データに基づく傾向は GEO データベースで深掘りできます。
        </p>
      </Section>

      <Section title="トーナメント形式(SNG と MTT)">
        <p>Poker ART のトーナメントには2つの形式があります。</p>
        <ul className="list-disc space-y-2 pl-5 text-ink-700">
          <li>
            <strong className="text-ink-950">SNG(シット&ゴー)</strong>: 決まった人数が揃った時点で即スタートする短時間トーナメント。
            さっと1試合遊びたいときに向く。人数が揃わない場合は BOT が補充され、待たされません。
          </li>
          <li>
            <strong className="text-ink-950">MTT(マルチテーブルトーナメント)</strong>: 多数の参加者が複数テーブルに分かれて戦い、
            人数が減るごとにテーブルが統合されていく本格形式。入賞圏(ITM)を目指して勝ち上がります。
          </li>
        </ul>
        <p>
          どちらの形式も、チップを失えばそのトーナメントは終了(バースト)です。入賞すればバーチャルの賞金チップを獲得し、
          あなたの成績(ROIやITM率など)として記録されます。
        </p>
      </Section>

      <Section title="はじめの一歩">
        <p>
          ルールを一度に完璧に覚える必要はありません。まず1試合プレイしてみて、分からない用語が出てきたら
          <Link href="/glossary" className="font-semibold text-gold-700 underline underline-offset-2">用語集</Link>を開く、
          という進め方が上達の近道です。準備ができたら
          <Link href="/" className="font-semibold text-gold-700 underline underline-offset-2">トップページからログインしてトーナメントに参加</Link>してみましょう。
          バーチャルチップなので、何度でも気軽に挑戦できます。
        </p>
      </Section>
    </Article>
  );
}
