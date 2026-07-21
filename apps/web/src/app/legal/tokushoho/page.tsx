"use client";

import Link from "next/link";

/**
 * 特定商取引法に基づく表記。棋譜解析 使い放題プラン(有料デジタルサービス)を日本の消費者に
 * 提供する以上、法律上必須のページ。事業者情報は運営者(個人事業主)の実データ。
 */

const ROWS: { label: string; value: string }[] = [
  { label: "販売業者", value: "萩原直幸(屋号:Runner Runner)" },
  { label: "運営統括責任者", value: "萩原 直幸" },
  { label: "所在地", value: "〒808-0825 福岡県北九州市八幡西区折尾4-15-5" },
  { label: "電話番号", value: "090-8356-6400" },
  { label: "メールアドレス", value: "hagiwara.naoyuki327@mail.kyutech.jp" },
  { label: "販売価格", value: "棋譜解析 使い放題プラン 月額¥980(税込)。表示価格から変更なし。" },
  { label: "商品代金以外の必要料金", value: "なし(通信費等はお客様負担)" },
  { label: "お支払い方法", value: "クレジットカード決済(Stripe)" },
  { label: "お支払い時期", value: "初回登録時、以降は毎月同日に自動課金" },
  { label: "サービス提供時期", value: "決済完了後、即時利用可能" },
  { label: "解約について", value: "いつでも解約可能。解約後は当該課金期間の終了をもってサービス終了。日割り返金は行いません。" },
  { label: "動作環境", value: "最新版のモダンブラウザ(Chrome / Safari 等)" },
];

export default function TokushohoPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-md mx-auto px-4 pb-16">
        <header className="flex items-center justify-between pt-[calc(env(safe-area-inset-top)+16px)] pb-6">
          <div className="text-[11px] tracking-[0.25em] text-gold-600 font-semibold">POKER ART</div>
          <Link href="/pricing" className="text-[12px] text-ink-600 hover:text-ink-900">
            戻る
          </Link>
        </header>

        <h1 className="text-xl font-bold text-ink-950 mb-4">特定商取引法に基づく表記</h1>

        <div className="rounded-2xl bg-ink-100 ring-1 ring-ink-300 divide-y divide-ink-300">
          {ROWS.map((row) => (
            <div key={row.label} className="px-4 py-3">
              <div className="text-[11px] text-ink-600 mb-1">{row.label}</div>
              <div className="text-[13px] text-ink-900 leading-relaxed">{row.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
