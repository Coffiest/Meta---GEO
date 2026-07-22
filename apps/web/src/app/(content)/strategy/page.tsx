import type { Metadata } from "next";
import Link from "next/link";
import { Article, Section } from "@/components/content/Article";
import { ContentAd } from "@/components/content/ContentAd";

export const metadata: Metadata = {
  title: "GEO戦略とGTOの解説",
  description:
    "GTO(ゲーム理論的最適戦略)とは何か、そしてPoker ART独自の「GEO戦略」= 実プレイヤー母集団のデータから最適化する考え方をわかりやすく解説。ポジション別のRFIレンジ、3ベット、ポストフロップ、エクスプロイトの基礎までを扱います。",
  alternates: { canonical: "/strategy" },
};

export default function StrategyPage() {
  return (
    <Article
      eyebrow="Strategy"
      title="GTOを超える「GEO戦略」入門"
      lead="ポーカーの戦略論は、近年 GTO(ゲーム理論的最適戦略)を土台に大きく発展しました。Poker ART が掲げる GEO戦略は、その GTO を出発点にしつつ、実際にこのテーブルで戦うプレイヤー母集団のデータに合わせて最適化していく考え方です。両者の違いと使い分けを、具体例とともに解説します。"
      updated="2026年7月"
    >
      <Section title="GTO(ゲーム理論的最適戦略)とは">
        <p>
          GTO とは Game Theory Optimal の略で、<strong>相手にどう対応されても長期的に損をしない、数学的にバランスの取れた戦略</strong>のことです。
          ポーカーを二人以上のゼロサムゲームと捉えたとき、理論上は「これ以上つけ込まれない均衡点(ナッシュ均衡)」が存在します。
          GTO はその均衡に近づこうとするアプローチで、たとえば「バリューベットとブラフを適切な比率で混ぜる」ことで、
          相手がコールしてもフォールドしても自分が有利になるように振る舞います。
        </p>
        <p>
          GTO の強みは<strong>誰が相手でも破綻しない</strong>こと。弱点は、相手の明確なミスを最大限に罰する戦略ではない点です。
          均衡を守ることに徹すると、下手な相手から搾り取れるはずの利益を取りこぼすことがあります。
        </p>
      </Section>

      <Section title="GEO戦略 — データで均衡を補正する">
        <p>
          そこで Poker ART が採るのが <strong>GEO戦略</strong>です。これは GTO の均衡を土台としながら、
          「このテーブルの実際のプレイヤーが、平均してどう打っているか」という<strong>実測データ(母集団の傾向)</strong>を重ねて、
          最も期待値の高い行動へと補正していく考え方です。理論値(GTO)と実測値(母集団の癖)の<strong>乖離</strong>こそが、利益の源泉になります。
        </p>
        <p>
          たとえば、母集団が「ボタンからのオープンに対してブラインドから降りすぎている」なら、
          GTO が推奨する頻度より<strong>広くオープンして盗む</strong>のが正解になります。逆に「コールしすぎ」の母集団に対しては、
          ブラフを減らしてバリュー(強い手での勝負)を厚くします。こうした「相手の傾向につけ込む」調整を
          <strong>エクスプロイト(搾取)</strong>と呼びます。
        </p>
        <p>
          Poker ART では、テーブルで実際にプレイされた全ハンド・全アクションを記録し、GEOデータベースでスポットごとの傾向として可視化しています。
          これがあなたのエクスプロイト判断の材料になります。
        </p>
      </Section>

      <ContentAd />

      <Section title="プリフロップの土台 — RFIレンジ">
        <p>
          戦略の第一歩は<strong>RFI(Raise First In)</strong>、つまり「自分が最初にレイズして参加する手札の範囲」を、
          ポジションごとに決めることです。原則は明快で、<strong>後の席ほど広く、前の席ほど狭く</strong>参加します。
        </p>
        <ul className="list-disc space-y-2 pl-5 text-ink-700">
          <li><strong className="text-ink-950">UTG(最前列)</strong>: 上位の強いハンドのみ。AA〜TT や AK, AQ などタイトに。</li>
          <li><strong className="text-ink-950">CO(カットオフ)</strong>: 中位のポケットペアやスーテッドコネクターまで広げる。</li>
          <li><strong className="text-ink-950">BTN(ボタン)</strong>: 最も広く。多くのブロードウェイやスーテッド、低いペアも参加圏内。</li>
          <li><strong className="text-ink-950">SB(スモールブラインド)</strong>: 後ろに BB が残るため、レイズかフォールドを軸に構成する。</li>
        </ul>
        <p>
          具体的にどのハンドがどの頻度でレイズされているか(169ハンドクラスのマトリクス)は、
          GEO データベースの Study でポジション・シナリオ別に確認できます。
        </p>
      </Section>

      <Section title="3ベットとその意味">
        <p>
          誰かのオープンレイズに対する<strong>再レイズ(3ベット)</strong>には、2つの狙いがあります。1つは
          AA・KK・AK などの強い手で<strong>バリュー</strong>を得ること。もう1つは、単独では弱いが伸びしろのある手
          (A5s のようなブロッカー付きのハンドなど)で<strong>ブラフ</strong>として仕掛け、相手を降ろすことです。
          バリューとブラフを適切な比率で混ぜることで、相手はあなたの3ベットに対応しづらくなります。
        </p>
      </Section>

      <Section title="ポストフロップの考え方">
        <p>
          フロップ以降は、ボードのテクスチャ(乾いた/湿ったボード)と、プリフロップで示したレンジの整合性が鍵になります。
          自分のレンジが相手より強いと想定できるボードでは、小さめの継続ベットを高頻度で打ってポットを取りにいきます。
          逆に相手に有利なボードでは、無理に攻めずチェックで対応します。Poker ART では棋譜解析機能で、
          自分の各アクションを GTO 基準で採点し、失った期待値(EVロス)を可視化できます。
        </p>
      </Section>

      <Section title="上達のためのループ">
        <p>
          GEO戦略の実践は、<strong>「プレイする → データで母集団の傾向を確認する → 乖離を突く調整を試す → またプレイする」</strong>という循環です。
          バーチャルチップだからこそ、この試行錯誤を金銭リスクなしに何百ハンドでも繰り返せます。まずは
          <Link href="/guide" className="font-semibold text-gold-700 underline underline-offset-2">遊び方</Link>で基本を押さえ、
          <Link href="/" className="font-semibold text-gold-700 underline underline-offset-2">実際のトーナメント</Link>で試し、GEOデータベースで振り返る——
          このループがあなたを最短で強くします。
        </p>
      </Section>
    </Article>
  );
}
