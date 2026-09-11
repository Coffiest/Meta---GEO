"use client";

import { motion, useReducedMotion } from "framer-motion";
import { SPRING_MOVE, FADE } from "@/lib/motion";

/**
 * 画面遷移(ページ間ナビゲーション)の共通アニメーション(Appleデザインスキル準拠)。
 *
 * `template.tsx` はNext.jsの規約で、同じルートへの再訪問も含めナビゲーションのたびに
 * 新しいインスタンスとして描画される(`layout.tsx`は逆に維持されたままなので使えない)。
 * このアプリの「画面」はほとんどがLobby.tsx内のタブ切り替え(ローカルstateのみ、URL変更なし。
 * それぞれのタブは既にAnimatePresenceで独自のトランジションを持つ)なので、ここが動くのは
 * 本当に別ページへ遷移したとき(ホーム⇄GEO Database、各静的ページ等)だけに限られ、
 * プレイ中の卓画面(ソケット接続を保ったまま`/`のローカルstateだけで完結する)を
 * 割り込んで巻き戻すことはない。
 *
 * Next.js自体には「前のページを少し残して重ねる」仕組みが無く(新ページのマウント時点で
 * 旧ページは既にツリーから外れている)、真のクロスフェードは組めない。そのため出現側だけを
 * ふわっとフェードインさせる。
 *
 * transform(移動・拡縮)は使わない。framer-motionは静止後も`transform: translateY(0px)
 * scale(1)`のような明示値をインラインstyleに残し続け(`none`には戻らない)、transformを
 * 持つ要素はその子孫のposition:fixedの基準を「画面」から「この要素」へすり替えてしまう。
 * このラッパーは全ページ(モーダル/シートのfixed inset-0を含む)を包むため、
 * 一度でもtransformを載せると全画面でfixed配置が壊れる。opacityだけなら
 * そのリスクが無い(opacity<1でスタッキングコンテキストは作るが、fixedの基準は変えない)。
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reduce ? FADE : SPRING_MOVE}
    >
      {children}
    </motion.div>
  );
}
