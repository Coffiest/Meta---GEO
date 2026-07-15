"use client";

/**
 * 多言語対応(i18n)の基盤。日本語(ja)を基準に、英語(en)・韓国語(ko)・中国語(zh)へ切り替える。
 * - 言語は localStorage("locale") に保存し、いつでも切替可能(LanguageSwitcher から)。
 * - 初回は保存値 → ブラウザ言語 → ja の順で決定する。
 * - t("key") で辞書を引く。未定義キーは ja にフォールバックし、それも無ければキー文字列を返す。
 * - {name} 形式のプレースホルダは t("key", { name }) で差し込む。
 *
 * まずは共通・ログイン・オンボーディングの文言を収録。以降、画面ごとに辞書を追加していく。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Locale = "ja" | "en" | "ko" | "zh";

export const LOCALES: { code: Locale; label: string; short: string }[] = [
  { code: "ja", label: "日本語", short: "JA" },
  { code: "en", label: "English", short: "EN" },
  { code: "ko", label: "한국어", short: "KO" },
  { code: "zh", label: "中文", short: "ZH" },
];

const STORAGE_KEY = "locale";

type Dict = Record<string, string>;

const ja: Dict = {
  "common.appName": "Poker ART",
  "common.cancel": "キャンセル",
  "common.back": "戻る",
  "common.language": "言語",

  "app.authUnavailable": "ログイン機能が設定されていません。管理者にお問い合わせください。",
  "app.profileFetchFailed": "プロフィールの取得に失敗しました。",
  "app.retry": "再試行",
  "menu.editProfile": "プロフィールを編集",
  "menu.logout": "ログアウト",

  "login.heroLine1": "GTOを、",
  "login.heroLine2": "超えていけ",
  "login.subtitle": "GTOの先を行くGEO戦略データベース。",
  "login.title.login": "ログイン",
  "login.title.signup": "新規登録",
  "login.title.reset": "パスワードの再設定",
  "login.sub.login": "アカウントにログイン",
  "login.sub.signup": "無料で始める",
  "login.sub.reset": "登録メールに再設定リンクを送ります",
  "login.orEmail": "またはメールで",
  "login.email": "メールアドレス",
  "login.password": "パスワード",
  "login.passwordConfirm": "パスワード(確認)",
  "login.passwordPlaceholder": "6文字以上",
  "login.passwordConfirmPlaceholder": "もう一度入力",
  "login.passwordMismatch": "パスワードが一致しません。",
  "login.forgot": "パスワードを忘れた方",
  "login.submit.login": "ログイン",
  "login.submit.signup": "無料ではじめる",
  "login.submit.reset": "リセットリンクを送る",
  "login.submitting": "処理中…",
  "login.oauthFailed": "Google/Appleログインに失敗しました",
  "login.oauthDetail": "詳細",
  "login.toSignupPrefix": "アカウントをお持ちでない方は",
  "login.toSignup": "会員登録",
  "login.toLoginPrefix": "すでにアカウントをお持ちの方は",
  "login.toLogin": "ログイン",
  "login.backToLogin": "ログイン画面に戻る",
  "login.err.passwordLen": "パスワードは6文字以上で入力してください。",
  "login.err.passwordMismatch": "パスワードが一致しません。確認用と同じパスワードを入力してください。",
  "login.info.confirm": "{email} 宛に確認メールを送りました。メール内のリンクを開くと登録が完了します。",
  "login.info.reset": "{email} 宛にパスワード再設定用のリンクを送りました。",
  "login.whatYouCanDo": "What you can do",
  "login.feat1.title": "トーナメント対戦",
  "login.feat1.body": "SNG・MTTのNLHトーナメントをバーチャルチップで。リアルマネー不要。",
  "login.feat2.title": "GEO戦略分析",
  "login.feat2.body": "GTO Wizard風のレンジ分析。“GTOを超える”GEO戦略をマスターする。",
  "login.feat3.title": "詳細スタッツ",
  "login.feat3.body": "VPIP・PFR・3bet・ROIを自動記録。自分のプレイを数字で可視化。",

  "onb.step": "最後のステップ",
  "onb.profile": "プロフィール",
  "onb.editTitle": "プロフィールを編集",
  "onb.setupTitle": "プロフィールを設定",
  "onb.save": "保存する",
  "onb.saveFailed": "保存に失敗しました。もう一度お試しください。",
  "onb.heroLine1": "さあ、",
  "onb.heroLine2": "テーブルへ",
  "onb.leadFirst": "あと一歩でプレイ開始。テーブルに表示される名前を決めよう(アイコンは任意)。",
  "onb.leadEdit": "テーブルで表示される名前とアイコンを変更できます。",
  "onb.changePhoto": "写真を変更",
  "onb.pickPhoto": "写真を選ぶ(任意)",
  "onb.processing": "処理中…",
  "onb.delete": "削除",
  "onb.photoError": "画像を設定できませんでした。別の画像でお試しください。",
  "onb.playerName": "プレイヤー名",
  "onb.namePlaceholder": "テーブルで表示される名前",
  "onb.start": "はじめる",
  "onb.saving": "保存中…",
  "onb.nextUp": "この先に待っているもの",
  "onb.next1": "トーナメント",
  "onb.next2": "GEO戦略分析",
  "onb.next3": "詳細スタッツ",
  "onb.footer": "Poker ART · バーチャルチップ専用",
};

const en: Dict = {
  "common.appName": "Poker ART",
  "common.cancel": "Cancel",
  "common.back": "Back",
  "common.language": "Language",

  "app.authUnavailable": "Sign-in isn't configured. Please contact the administrator.",
  "app.profileFetchFailed": "Couldn't load your profile.",
  "app.retry": "Retry",
  "menu.editProfile": "Edit profile",
  "menu.logout": "Log out",

  "login.heroLine1": "Go beyond",
  "login.heroLine2": "GTO",
  "login.subtitle": "GEO strategy database — one step past GTO.",
  "login.title.login": "Log in",
  "login.title.signup": "Sign up",
  "login.title.reset": "Reset password",
  "login.sub.login": "Log in to your account",
  "login.sub.signup": "Get started for free",
  "login.sub.reset": "We'll email you a reset link",
  "login.orEmail": "or with email",
  "login.email": "Email",
  "login.password": "Password",
  "login.passwordConfirm": "Password (confirm)",
  "login.passwordPlaceholder": "6+ characters",
  "login.passwordConfirmPlaceholder": "Enter again",
  "login.passwordMismatch": "Passwords don't match.",
  "login.forgot": "Forgot your password?",
  "login.submit.login": "Log in",
  "login.submit.signup": "Start for free",
  "login.submit.reset": "Send reset link",
  "login.submitting": "Processing…",
  "login.oauthFailed": "Google/Apple sign-in failed",
  "login.oauthDetail": "Details",
  "login.toSignupPrefix": "Don't have an account?",
  "login.toSignup": "Sign up",
  "login.toLoginPrefix": "Already have an account?",
  "login.toLogin": "Log in",
  "login.backToLogin": "Back to log in",
  "login.err.passwordLen": "Password must be at least 6 characters.",
  "login.err.passwordMismatch": "Passwords don't match. Enter the same password in both fields.",
  "login.info.confirm": "We sent a confirmation email to {email}. Open the link in it to finish signing up.",
  "login.info.reset": "We sent a password reset link to {email}.",
  "login.whatYouCanDo": "What you can do",
  "login.feat1.title": "Tournament play",
  "login.feat1.body": "SNG & MTT No-Limit Hold'em tournaments with virtual chips. No real money.",
  "login.feat2.title": "GEO strategy analysis",
  "login.feat2.body": "GTO Wizard-style range analysis. Master the GEO strategy that goes beyond GTO.",
  "login.feat3.title": "Detailed stats",
  "login.feat3.body": "VPIP, PFR, 3bet and ROI tracked automatically. See your play in numbers.",

  "onb.step": "Last step",
  "onb.profile": "Profile",
  "onb.editTitle": "Edit profile",
  "onb.setupTitle": "Set up profile",
  "onb.save": "Save",
  "onb.saveFailed": "Couldn't save. Please try again.",
  "onb.heroLine1": "To the",
  "onb.heroLine2": "table",
  "onb.leadFirst": "One step from playing. Choose the name shown at the table (icon optional).",
  "onb.leadEdit": "Change the name and icon shown at the table.",
  "onb.changePhoto": "Change photo",
  "onb.pickPhoto": "Choose a photo (optional)",
  "onb.processing": "Processing…",
  "onb.delete": "Remove",
  "onb.photoError": "Couldn't set that image. Please try another.",
  "onb.playerName": "Player name",
  "onb.namePlaceholder": "Name shown at the table",
  "onb.start": "Start",
  "onb.saving": "Saving…",
  "onb.nextUp": "What's waiting for you",
  "onb.next1": "Tournaments",
  "onb.next2": "GEO analysis",
  "onb.next3": "Detailed stats",
  "onb.footer": "Poker ART · Virtual chips only",
};

const ko: Dict = {
  "common.appName": "Poker ART",
  "common.cancel": "취소",
  "common.back": "뒤로",
  "common.language": "언어",

  "app.authUnavailable": "로그인 기능이 설정되어 있지 않습니다. 관리자에게 문의해 주세요.",
  "app.profileFetchFailed": "프로필을 불러오지 못했습니다.",
  "app.retry": "다시 시도",
  "menu.editProfile": "프로필 편집",
  "menu.logout": "로그아웃",

  "login.heroLine1": "GTO를",
  "login.heroLine2": "넘어서라",
  "login.subtitle": "GTO를 넘어서는 GEO 전략 데이터베이스.",
  "login.title.login": "로그인",
  "login.title.signup": "회원가입",
  "login.title.reset": "비밀번호 재설정",
  "login.sub.login": "계정에 로그인",
  "login.sub.signup": "무료로 시작하기",
  "login.sub.reset": "가입 이메일로 재설정 링크를 보냅니다",
  "login.orEmail": "또는 이메일로",
  "login.email": "이메일",
  "login.password": "비밀번호",
  "login.passwordConfirm": "비밀번호(확인)",
  "login.passwordPlaceholder": "6자 이상",
  "login.passwordConfirmPlaceholder": "다시 입력",
  "login.passwordMismatch": "비밀번호가 일치하지 않습니다.",
  "login.forgot": "비밀번호를 잊으셨나요?",
  "login.submit.login": "로그인",
  "login.submit.signup": "무료로 시작",
  "login.submit.reset": "재설정 링크 보내기",
  "login.submitting": "처리 중…",
  "login.oauthFailed": "Google/Apple 로그인에 실패했습니다",
  "login.oauthDetail": "상세",
  "login.toSignupPrefix": "계정이 없으신가요?",
  "login.toSignup": "회원가입",
  "login.toLoginPrefix": "이미 계정이 있으신가요?",
  "login.toLogin": "로그인",
  "login.backToLogin": "로그인 화면으로 돌아가기",
  "login.err.passwordLen": "비밀번호는 6자 이상으로 입력해 주세요.",
  "login.err.passwordMismatch": "비밀번호가 일치하지 않습니다. 확인란에 같은 비밀번호를 입력해 주세요.",
  "login.info.confirm": "{email} 주소로 확인 메일을 보냈습니다. 메일의 링크를 열면 가입이 완료됩니다.",
  "login.info.reset": "{email} 주소로 비밀번호 재설정 링크를 보냈습니다.",
  "login.whatYouCanDo": "이용할 수 있는 기능",
  "login.feat1.title": "토너먼트 대전",
  "login.feat1.body": "SNG·MTT 노리밋 홀덤 토너먼트를 가상 칩으로. 실제 돈은 필요 없습니다.",
  "login.feat2.title": "GEO 전략 분석",
  "login.feat2.body": "GTO Wizard 스타일 레인지 분석. GTO를 넘어서는 GEO 전략을 마스터하세요.",
  "login.feat3.title": "상세 통계",
  "login.feat3.body": "VPIP·PFR·3bet·ROI를 자동 기록. 자신의 플레이를 숫자로 확인하세요.",

  "onb.step": "마지막 단계",
  "onb.profile": "프로필",
  "onb.editTitle": "프로필 편집",
  "onb.setupTitle": "프로필 설정",
  "onb.save": "저장",
  "onb.saveFailed": "저장하지 못했습니다. 다시 시도해 주세요.",
  "onb.heroLine1": "자,",
  "onb.heroLine2": "테이블로",
  "onb.leadFirst": "플레이까지 한 걸음. 테이블에 표시될 이름을 정하세요(아이콘은 선택).",
  "onb.leadEdit": "테이블에 표시되는 이름과 아이콘을 변경할 수 있습니다.",
  "onb.changePhoto": "사진 변경",
  "onb.pickPhoto": "사진 선택(선택 사항)",
  "onb.processing": "처리 중…",
  "onb.delete": "삭제",
  "onb.photoError": "이미지를 설정할 수 없습니다. 다른 이미지로 시도해 주세요.",
  "onb.playerName": "플레이어 이름",
  "onb.namePlaceholder": "테이블에 표시될 이름",
  "onb.start": "시작하기",
  "onb.saving": "저장 중…",
  "onb.nextUp": "앞으로 즐길 수 있는 것",
  "onb.next1": "토너먼트",
  "onb.next2": "GEO 분석",
  "onb.next3": "상세 통계",
  "onb.footer": "Poker ART · 가상 칩 전용",
};

const zh: Dict = {
  "common.appName": "Poker ART",
  "common.cancel": "取消",
  "common.back": "返回",
  "common.language": "语言",

  "app.authUnavailable": "尚未配置登录功能，请联系管理员。",
  "app.profileFetchFailed": "无法加载个人资料。",
  "app.retry": "重试",
  "menu.editProfile": "编辑资料",
  "menu.logout": "退出登录",

  "login.heroLine1": "超越",
  "login.heroLine2": "GTO",
  "login.subtitle": "领先 GTO 一步的 GEO 策略数据库。",
  "login.title.login": "登录",
  "login.title.signup": "注册",
  "login.title.reset": "重置密码",
  "login.sub.login": "登录你的账户",
  "login.sub.signup": "免费开始",
  "login.sub.reset": "我们会向注册邮箱发送重置链接",
  "login.orEmail": "或使用邮箱",
  "login.email": "邮箱",
  "login.password": "密码",
  "login.passwordConfirm": "密码(确认)",
  "login.passwordPlaceholder": "至少 6 个字符",
  "login.passwordConfirmPlaceholder": "再次输入",
  "login.passwordMismatch": "两次密码不一致。",
  "login.forgot": "忘记密码？",
  "login.submit.login": "登录",
  "login.submit.signup": "免费开始",
  "login.submit.reset": "发送重置链接",
  "login.submitting": "处理中…",
  "login.oauthFailed": "Google/Apple 登录失败",
  "login.oauthDetail": "详情",
  "login.toSignupPrefix": "还没有账户？",
  "login.toSignup": "注册",
  "login.toLoginPrefix": "已经有账户？",
  "login.toLogin": "登录",
  "login.backToLogin": "返回登录页面",
  "login.err.passwordLen": "密码至少需要 6 个字符。",
  "login.err.passwordMismatch": "两次密码不一致。请在确认栏输入相同的密码。",
  "login.info.confirm": "已向 {email} 发送确认邮件。打开邮件中的链接即可完成注册。",
  "login.info.reset": "已向 {email} 发送密码重置链接。",
  "login.whatYouCanDo": "你可以做什么",
  "login.feat1.title": "锦标赛对战",
  "login.feat1.body": "用虚拟筹码畅玩 SNG 与 MTT 无限注德州扑克锦标赛。无需真钱。",
  "login.feat2.title": "GEO 策略分析",
  "login.feat2.body": "GTO Wizard 风格的范围分析。掌握超越 GTO 的 GEO 策略。",
  "login.feat3.title": "详细数据",
  "login.feat3.body": "自动记录 VPIP、PFR、3bet 与 ROI，用数字看清自己的打法。",

  "onb.step": "最后一步",
  "onb.profile": "个人资料",
  "onb.editTitle": "编辑资料",
  "onb.setupTitle": "设置资料",
  "onb.save": "保存",
  "onb.saveFailed": "保存失败，请重试。",
  "onb.heroLine1": "现在，",
  "onb.heroLine2": "上桌吧",
  "onb.leadFirst": "距离开局只差一步。设置将在牌桌上显示的名字(头像可选)。",
  "onb.leadEdit": "可以修改在牌桌上显示的名字和头像。",
  "onb.changePhoto": "更换照片",
  "onb.pickPhoto": "选择照片(可选)",
  "onb.processing": "处理中…",
  "onb.delete": "删除",
  "onb.photoError": "无法设置该图片，请换一张试试。",
  "onb.playerName": "玩家名称",
  "onb.namePlaceholder": "将在牌桌上显示的名字",
  "onb.start": "开始",
  "onb.saving": "保存中…",
  "onb.nextUp": "接下来等着你的",
  "onb.next1": "锦标赛",
  "onb.next2": "GEO 分析",
  "onb.next3": "详细数据",
  "onb.footer": "Poker ART · 仅限虚拟筹码",
};

const DICTS: Record<Locale, Dict> = { ja, en, ko, zh };

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return "ja";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "ja" || saved === "en" || saved === "ko" || saved === "zh") return saved;
  const nav = (window.navigator.language || "ja").toLowerCase();
  if (nav.startsWith("ko")) return "ko";
  if (nav.startsWith("zh")) return "zh";
  if (nav.startsWith("en")) return "en";
  return "ja";
}

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  // SSRとの齟齬を避けるため初期値はjaにし、マウント後に保存値/ブラウザ言語で上書きする。
  const [locale, setLocaleState] = useState<Locale>("ja");

  useEffect(() => {
    setLocaleState(detectInitialLocale());
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* localStorage 不可の環境では保存をスキップ */
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const raw = DICTS[locale][key] ?? DICTS.ja[key] ?? key;
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
    },
    [locale],
  );

  const value = useMemo<I18nValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** i18n フック。LocaleProvider の外で呼ばれた場合は ja 固定・切替不可のフォールバックを返す。 */
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  return {
    locale: "ja",
    setLocale: () => {},
    t: (key, vars) => {
      const raw = DICTS.ja[key] ?? key;
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
    },
  };
}
