"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import type { AuthState } from "@/lib/useAuth";
import { useI18n } from "@/lib/i18n";
import { APP_VERSION } from "@/lib/version";
import { Header, HeaderLogo } from "./Header";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { PasscodeModal } from "./PasscodeModal";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]">
      <path
        fill="#EA4335"
        d="M12 5.04c1.62 0 3.06.56 4.2 1.66l3.12-3.12C17.4 1.8 14.9.75 12 .75 7.55.75 3.73 3.3 1.9 7.02l3.66 2.84C6.44 7.1 8.99 5.04 12 5.04Z"
      />
      <path
        fill="#4285F4"
        d="M23.25 12.26c0-.8-.07-1.57-.2-2.31H12v4.51h6.33c-.28 1.44-1.1 2.66-2.34 3.48l3.58 2.78c2.09-1.94 3.68-4.8 3.68-8.46Z"
      />
      <path
        fill="#FBBC05"
        d="M5.56 14.14a6.9 6.9 0 0 1 0-4.28L1.9 7.02a11.24 11.24 0 0 0 0 9.96l3.66-2.84Z"
      />
      <path
        fill="#34A853"
        d="M12 23.25c3.04 0 5.6-1 7.46-2.72l-3.58-2.78c-.99.67-2.28 1.06-3.88 1.06-3.01 0-5.56-2.06-6.44-4.82L1.9 16.98c1.83 3.72 5.65 6.27 10.1 6.27Z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-white">
      <path d="M16.98 12.83c.03 3.02 2.65 4.03 2.68 4.04-.02.07-.42 1.44-1.38 2.85-.83 1.22-1.7 2.43-3.06 2.46-1.34.02-1.77-.8-3.3-.8-1.53 0-2 .77-3.27.82-1.31.05-2.31-1.32-3.15-2.53C3.78 17.18 2.47 12.66 4.23 9.6c.88-1.53 2.44-2.5 4.14-2.52 1.29-.02 2.51.87 3.3.87.79 0 2.27-1.07 3.83-.92.65.03 2.48.26 3.66 1.99-.1.06-2.19 1.28-2.18 3.81ZM14.46 5.4c.7-.85 1.17-2.03 1.04-3.2-1.01.04-2.22.67-2.94 1.51-.65.75-1.21 1.95-1.06 3.1 1.12.09 2.26-.57 2.96-1.41Z" />
    </svg>
  );
}

/** 機能アイコン(モノクロ・ストローク。Swissらしく最小限の線で構成)。 */
function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M6 4h12v4a6 6 0 0 1-12 0V4Z" />
      <path d="M6 6H3v1a3 3 0 0 0 3 3M18 6h3v1a3 3 0 0 1-3 3" />
      <path d="M12 14v3M9 21h6M10 21v-1.5a2 2 0 0 1 4 0V21" />
    </svg>
  );
}

function MatrixIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
      <path d="M9 3.5v17M15 3.5v17M3.5 9h17M3.5 15h17" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M4 20V4M20 20H4" />
      <path d="M8 20v-5M12 20V9M16 20v-8" />
    </svg>
  );
}

type Mode = "login" | "signup" | "reset";

// 機能インデックスのアイコンとキー(タイトル/本文はi18n辞書から引く)。
const FEATURES = [
  { n: "01", icon: <TrophyIcon />, key: "feat1" },
  { n: "02", icon: <MatrixIcon />, key: "feat2" },
  { n: "03", icon: <ChartIcon />, key: "feat3" },
];

/** 上部を流れるキーワード帯(ポーカー×戦略の語彙)。何のアプリかを一目で伝える。 */
const KEYWORDS = ["NLH", "SNG", "MTT", "GTO", "GEO", "VPIP", "PFR", "3BET", "ICM", "RANGE", "EQUITY", "ROI"];

const EASE = [0.16, 1, 0.3, 1] as const;

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/** ログイン / 新規登録画面。Swiss(モノクロ + ゴールドの単一アクセント)を保ったまま、
 * ヒーロー見出しの直下に認証カードを置き、スクロールせずログインできるようにしている。
 * その下に流れるキーワード帯・機能インデックスでアプリの価値を提示する。
 * Google/Appleはパスワード不要で直接OAuthへ、メールはパスワード必須(ログイン/新規登録/再設定の3モード)。 */
export function LoginScreen({ auth }: { auth: AuthState }) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** 新規登録後、確認メールを送ったアドレス(セット中は手順ガイドパネルを表示)。 */
  const [confirmSentTo, setConfirmSentTo] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  /** バージョン表記タップ→パスコード(2357)→管理者画面への隠し導線。 */
  const [adminGateOpen, setAdminGateOpen] = useState(false);
  const router = useRouter();
  const reduce = useReducedMotion();
  const { t } = useI18n();

  const resetFeedback = () => {
    setError(null);
    setInfo(null);
    auth.clearOauthError();
  };

  const goTo = (next: Mode) => {
    setMode(next);
    resetFeedback();
  };

  const handleSubmit = async () => {
    if (!email.trim()) return;
    if (mode !== "reset" && !password) return;

    setSubmitting(true);
    resetFeedback();

    if (mode === "login") {
      const { error } = await auth.signInWithPassword(email.trim(), password);
      if (error) setError(error);
    } else if (mode === "signup") {
      if (password.length < 6) {
        setError(t("login.err.passwordLen"));
        setSubmitting(false);
        return;
      }
      if (password !== confirmPassword) {
        setError(t("login.err.passwordMismatch"));
        setSubmitting(false);
        return;
      }
      const { error, needsConfirmation } = await auth.signUpWithPassword(email.trim(), password);
      if (error) setError(error);
      else if (needsConfirmation) setConfirmSentTo(email.trim());
    } else {
      const { error } = await auth.resetPassword(email.trim());
      if (error) setError(error);
      else setInfo(t("login.info.reset", { email }));
    }

    setSubmitting(false);
  };

  const title = mode === "login" ? t("login.title.login") : mode === "signup" ? t("login.title.signup") : t("login.title.reset");
  const subtitle = mode === "login" ? t("login.sub.login") : mode === "signup" ? t("login.sub.signup") : t("login.sub.reset");
  const submitLabel = mode === "login" ? t("login.submit.login") : mode === "signup" ? t("login.submit.signup") : t("login.submit.reset");

  return (
    <div className="min-h-screen bg-ink-50 text-ink-950 overflow-x-hidden">
      {/* 背景のごく淡いゴールドの光。ゆっくり呼吸させて動きを添える(Swissの静けさは崩さない)。 */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <motion.div
          className="absolute -top-40 -right-28 h-80 w-80 rounded-full bg-gold-400/20 blur-3xl"
          animate={reduce ? undefined : { scale: [1, 1.18, 1], opacity: [0.45, 0.75, 0.45] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute -bottom-40 -left-24 h-72 w-72 rounded-full bg-ink-900/[0.04] blur-3xl" />
      </div>

      {/* ホーム画面と同じ共有ヘッダー(ロゴ+ワードマーク)。右に言語切替を置き、ログイン前でも
          いつでも言語を変えられるようにする。 */}
      <div className="relative">
        <Header left={<HeaderLogo />} right={<LanguageSwitcher />} />
      </div>

      <div className="relative mx-auto w-full max-w-md px-6 pt-6 pb-12">
        {/* ヒーロー(コンパクトに。すぐ下に認証カードが来る) */}
        <motion.div initial="hidden" animate="show" variants={container}>
          <motion.h1 variants={item} className="mt-4 text-[38px] font-extrabold leading-[1.02] tracking-tight text-balance">
            {t("login.heroLine1")}
            <br />
            {t("login.heroLine2")}
            <span className="text-gold-500">.</span>
          </motion.h1>

          <motion.p variants={item} className="mt-3.5 text-[13px] leading-relaxed text-ink-600">
            {t("login.subtitle")}
          </motion.p>
        </motion.div>

        {/* 認証カード(ヒーロー直下 = ノースクロールで到達) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, duration: 0.55, ease: EASE }}
          className="mt-6 rounded-2xl border border-ink-200 bg-white p-6 shadow-panel"
        >
          {confirmSentTo ? (
            /* 新規登録直後: 確認メールの手順ガイド。何をすればいいかを1ステップずつ示す。 */
            <div>
              <div className="flex justify-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gold-500">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth={1.8} className="h-6 w-6">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="m3 7 9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
              <h2 className="mt-3 text-center text-lg font-extrabold tracking-tight">確認メールを送信しました</h2>
              <p className="mt-1.5 text-center text-[12px] leading-relaxed text-ink-600">
                <span className="font-bold text-ink-950">{confirmSentTo}</span> 宛に
                <br />
                登録確認のメールをお送りしました。
              </p>

              <div className="mt-5 space-y-3">
                {[
                  { n: "1", text: "メールアプリを開いて、受信箱を確認してください。見当たらない場合は迷惑メールフォルダもご確認ください。" },
                  { n: "2", text: "「Poker ART」からのメールを開き、中の確認リンク(Confirm)をタップしてください。" },
                  { n: "3", text: "このアプリに戻れば登録完了。そのままログインしてご利用いただけます。" },
                ].map((s) => (
                  <div key={s.n} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-950 text-[11px] font-black text-white">
                      {s.n}
                    </span>
                    <p className="pt-0.5 text-[12px] leading-relaxed text-ink-700">{s.text}</p>
                  </div>
                ))}
              </div>

              <button
                onClick={async () => {
                  if (resendState === "sending") return;
                  setResendState("sending");
                  const { error } = await auth.resendConfirmation(confirmSentTo);
                  if (error) {
                    setError(error);
                    setResendState("idle");
                  } else {
                    setResendState("sent");
                  }
                }}
                disabled={resendState !== "idle"}
                className="mt-5 w-full rounded-xl border border-ink-300 py-3 text-[13px] font-semibold text-ink-950 transition-colors hover:bg-ink-50 active:scale-[0.98] disabled:opacity-50"
              >
                {resendState === "sending" ? "再送信中…" : resendState === "sent" ? "再送信しました" : "メールが届かない場合は再送信"}
              </button>
              {error && <p className="mt-3 text-center text-[12px] text-crimson-500">{error}</p>}

              <button
                onClick={() => {
                  setConfirmSentTo(null);
                  setResendState("idle");
                  goTo("login");
                }}
                className="mt-4 w-full text-center text-[13px] font-semibold text-ink-950 underline underline-offset-2"
              >
                ログイン画面へ戻る
              </button>
            </div>
          ) : (
            <>
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
            <span className="text-[12px] text-ink-500">{subtitle}</span>
          </div>

          {mode !== "reset" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => auth.signInWithGoogle()}
                  className="flex items-center justify-center gap-2 rounded-xl border border-ink-300 py-3 transition-colors hover:bg-ink-50 active:scale-[0.97]"
                >
                  <GoogleIcon />
                  <span className="text-[13px] font-semibold">Google</span>
                </button>
                <button
                  onClick={() => auth.signInWithApple()}
                  className="flex items-center justify-center gap-2 rounded-xl bg-ink-950 py-3 transition-transform active:scale-[0.97]"
                >
                  <AppleIcon />
                  <span className="text-[13px] font-semibold text-white">Apple</span>
                </button>
              </div>

              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-ink-200" />
                <span className="text-[11px] tracking-wide text-ink-400">{t("login.orEmail")}</span>
                <div className="h-px flex-1 bg-ink-200" />
              </div>
            </>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold tracking-wide text-ink-700">{t("login.email")}</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && mode === "reset" && handleSubmit()}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint={mode === "reset" ? "send" : "next"}
                placeholder="mail@example.com"
                className="w-full rounded-xl border border-ink-300 px-3.5 py-3 text-sm text-ink-950 placeholder:text-ink-400 focus:border-ink-950 focus:outline-none focus:ring-2 focus:ring-ink-950/5"
              />
            </div>

            {mode !== "reset" && (
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold tracking-wide text-ink-700">{t("login.password")}</label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  enterKeyHint={mode === "signup" ? "next" : "go"}
                  placeholder={t("login.passwordPlaceholder")}
                  className="w-full rounded-xl border border-ink-300 px-3.5 py-3 text-sm text-ink-950 placeholder:text-ink-400 focus:border-ink-950 focus:outline-none focus:ring-2 focus:ring-ink-950/5"
                />
              </div>
            )}

            {mode === "signup" && (
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold tracking-wide text-ink-700">{t("login.passwordConfirm")}</label>
                <input
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  type="password"
                  autoComplete="new-password"
                  enterKeyHint="go"
                  placeholder={t("login.passwordConfirmPlaceholder")}
                  className={`w-full rounded-xl border px-3.5 py-3 text-sm text-ink-950 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-ink-950/5 ${
                    confirmPassword && confirmPassword !== password ? "border-crimson-500" : "border-ink-300 focus:border-ink-950"
                  }`}
                />
                {confirmPassword && confirmPassword !== password && (
                  <p className="mt-1 text-[11px] text-crimson-500">{t("login.passwordMismatch")}</p>
                )}
              </div>
            )}

            {mode === "login" && (
              <button onClick={() => goTo("reset")} className="text-[12px] text-ink-500 underline underline-offset-2 hover:text-ink-800">
                {t("login.forgot")}
              </button>
            )}
          </div>

          {auth.oauthError && (
            <div className="mt-4 space-y-0.5 rounded-xl border border-crimson-500/30 bg-crimson-500/5 px-3.5 py-2.5 text-[12px] text-crimson-500">
              <p className="font-semibold">{t("login.oauthFailed")}</p>
              <p>{auth.oauthError}</p>
              {auth.oauthErrorRaw && <p className="break-all text-ink-400">{t("login.oauthDetail")}: {auth.oauthErrorRaw}</p>}
            </div>
          )}
          {error && <p className="mt-4 text-[12px] text-crimson-500">{error}</p>}
          {info && <p className="mt-4 text-[12px] text-mint-700">{info}</p>}

          <button
            onClick={handleSubmit}
            disabled={
              submitting ||
              !email.trim() ||
              (mode !== "reset" && !password) ||
              (mode === "signup" && (!confirmPassword || confirmPassword !== password))
            }
            className="mt-5 w-full rounded-xl bg-ink-950 py-3.5 font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-40"
          >
            {submitting ? t("login.submitting") : submitLabel}
          </button>

          <div className="mt-5 text-center text-[13px]">
            {mode === "login" && (
              <button onClick={() => goTo("signup")} className="text-ink-600">
                {t("login.toSignupPrefix")}
                <span className="ml-1 font-semibold text-ink-950 underline underline-offset-2">{t("login.toSignup")}</span>
              </button>
            )}
            {mode === "signup" && (
              <button onClick={() => goTo("login")} className="text-ink-600">
                {t("login.toLoginPrefix")}
                <span className="ml-1 font-semibold text-ink-950 underline underline-offset-2">{t("login.toLogin")}</span>
              </button>
            )}
            {mode === "reset" && (
              <button onClick={() => goTo("login")} className="font-semibold text-ink-950 underline underline-offset-2">
                {t("login.backToLogin")}
              </button>
            )}
          </div>
            </>
          )}
        </motion.div>

        {/* 流れるキーワード帯 */}
        <div className="relative mt-10 -mx-6 overflow-hidden border-y border-ink-200 py-2.5">
          <motion.div
            className="flex w-max gap-7 whitespace-nowrap px-6"
            animate={reduce ? undefined : { x: ["0%", "-50%"] }}
            transition={{ duration: 24, ease: "linear", repeat: Infinity }}
          >
            {[...KEYWORDS, ...KEYWORDS].map((k, i) => (
              <span key={i} className="text-[11px] font-bold tracking-[0.28em] text-ink-400">
                {k}
              </span>
            ))}
          </motion.div>
        </div>

        {/* 機能インデックス(何ができるか) */}
        <div className="mt-8">
          <p className="mb-1 text-[11px] font-bold tracking-[0.22em] text-ink-400 uppercase">{t("login.whatYouCanDo")}</p>
          <motion.ul initial="hidden" whileInView="show" viewport={{ once: true, margin: "-40px" }} variants={container} className="border-t border-ink-200">
            {FEATURES.map((f) => (
              <motion.li
                key={f.n}
                variants={item}
                whileTap={reduce ? undefined : { scale: 0.99 }}
                className="flex gap-4 border-b border-ink-200 py-4"
              >
                <span className="w-6 pt-0.5 text-[11px] font-bold tabular-nums text-gold-500">{f.n}</span>
                <span className="mt-0.5 text-ink-900">{f.icon}</span>
                <div className="flex-1">
                  <div className="text-[15px] font-bold tracking-tight">{t(`login.${f.key}.title`)}</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-600">{t(`login.${f.key}.body`)}</p>
                </div>
              </motion.li>
            ))}
          </motion.ul>
        </div>

        {/* 公開コンテンツへの導線。ログイン前(クローラーを含む)でも、遊び方・戦略・用語集・規約などの
            実コンテンツへ辿れるようにするための内部リンク。 */}
        <nav className="mt-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-ink-200 pt-6">
          {[
            { href: "/guide", label: "遊び方" },
            { href: "/strategy", label: "GEO戦略" },
            { href: "/glossary", label: "用語集" },
            { href: "/pricing", label: "料金プラン" },
            { href: "/privacy", label: "プライバシー" },
            { href: "/legal/tokushoho", label: "特商法表記" },
          ].map((l) => (
            <Link key={l.href} href={l.href} className="text-[12px] font-semibold text-ink-500 underline-offset-2 hover:text-ink-900 hover:underline">
              {l.label}
            </Link>
          ))}
        </nav>

        {/* バージョン表記(タップ→パスコード2357→管理者画面への隠し導線) */}
        <div className="mt-8 flex justify-center">
          <button
            onClick={() => setAdminGateOpen(true)}
            className="cursor-pointer text-[11px] font-medium tracking-wide text-ink-400 transition-colors active:text-ink-600"
          >
            Poker ART v{APP_VERSION} ・ © 2026 Poker ART
          </button>
        </div>
      </div>

      <AnimatePresence>
        {adminGateOpen && (
          <PasscodeModal
            expected="2357"
            title="パスコードを入力"
            onSuccess={(code) => {
              try {
                sessionStorage.setItem("adminPasscode", code);
              } catch {
                /* プライベートブラウズ等でsessionStorage不可でも/admin側で再入力できる */
              }
              router.push("/admin");
            }}
            onClose={() => setAdminGateOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
