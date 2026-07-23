import type { Metadata } from "next";
import Link from "next/link";
import { Article, Section } from "@/components/content/Article";

export const metadata: Metadata = {
  title: "プライバシーポリシー",
  description:
    "Poker ART(ポーカーアート)のプライバシーポリシー。取得する情報、利用目的、Google AdSense を含む第三者配信の広告とCookieの取り扱い、アクセス解析、決済(Stripe)、免責事項について説明します。",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <Article
      eyebrow="Privacy"
      title="プライバシーポリシー"
      lead="Poker ART(以下「当サイト」)における、利用者の情報の取り扱い方針を定めます。"
      updated="2026年7月"
    >
      <Section title="取得する情報">
        <p>当サイトは、サービス提供に必要な範囲で以下の情報を取得することがあります。</p>
        <ul className="list-disc space-y-2 pl-5 text-ink-700">
          <li>アカウント登録情報(メールアドレス、表示名、選択したアバターなど。認証は Supabase Auth を利用します)。</li>
          <li>ゲームのプレイ記録(ハンド履歴、アクション、成績などの統計データ)。</li>
          <li>有料プランをご利用の場合の決済関連情報(決済は Stripe が処理し、当サイトはカード番号を保持しません)。</li>
          <li>アクセスに関する情報(ブラウザの種類、Cookie、閲覧ページなど、一般的なアクセスログ)。</li>
        </ul>
      </Section>

      <Section title="利用目的">
        <ul className="list-disc space-y-2 pl-5 text-ink-700">
          <li>ログイン・プロフィール管理などサービスの提供および運営のため。</li>
          <li>ゲーム結果の記録、および GEO戦略データベースにおける統計の集計・可視化のため。</li>
          <li>有料プラン(棋譜解析 使い放題)の提供および課金管理のため。</li>
          <li>サービスの品質改善、不正利用の防止のため。</li>
        </ul>
      </Section>

      <Section title="広告配信(Google AdSense)について">
        <p>
          当サイトの一部のコンテンツページでは、第三者配信の広告サービス「Google AdSense」を利用する場合があります。
          Google などの第三者広告配信事業者は、利用者の興味に応じた広告を表示するために Cookie を使用することがあります。
          Cookie を使用することで、当サイトや他サイトへのアクセス情報に基づいた広告が配信されます。
        </p>
        <p>
          利用者は、Google の
          <a href="https://policies.google.com/technologies/ads" className="font-semibold text-gold-700 underline underline-offset-2" rel="nofollow noopener" target="_blank">
            広告設定
          </a>
          でパーソナライズ広告を無効にできます。第三者による Cookie の使用や無効化については、
          <a href="https://www.aboutads.info/" className="font-semibold text-gold-700 underline underline-offset-2" rel="nofollow noopener" target="_blank">
            aboutads.info
          </a>
          もあわせてご確認ください。なお、広告は十分な本文があるコンテンツページにのみ表示し、ログイン画面やゲーム卓などには表示しません。
        </p>
      </Section>

      <Section title="アクセス解析">
        <p>
          当サイトは、サービス改善のためにアクセス状況を分析することがあります。これらのデータは匿名で収集されており、個人を特定するものではありません。
        </p>
      </Section>

      <Section title="第三者への提供">
        <p>当サイトは、法令に基づく場合を除き、取得した個人情報を本人の同意なく第三者へ提供することはありません。</p>
      </Section>

      <Section title="免責事項">
        <p>
          当サイトのコンテンツは、正確性の維持に努めていますが、その内容を保証するものではありません。
          当サイトの利用によって生じたいかなる損害についても、運営者は責任を負いかねます。
        </p>
      </Section>

      <Section title="運営者・お問い合わせ">
        <p>
          運営者: 萩原 直幸(屋号: Runner Runner)<br />
          サービス名: Poker ART(ポーカーアート)<br />
          お問い合わせ: hagiwara.naoyuki327@mail.kyutech.jp
        </p>
        <p>
          事業者としての詳細な表記は
          <Link href="/legal/tokushoho" className="font-semibold text-gold-700 underline underline-offset-2">特定商取引法に基づく表記</Link>
          をご覧ください。本ポリシーは必要に応じて予告なく変更されることがあり、変更後の内容は当ページに掲載した時点から効力を生じます。
        </p>
      </Section>
    </Article>
  );
}
