/**
 * アプリ唯一のアイコン入口。
 *
 * 以前は各コンポーネントが `<svg viewBox="0 0 24 24">` を直書きしており、33ファイル・101箇所に
 * 散らばっていた。線幅が 1.6 / 1.7 / 1.8 / 2 / 2.2 / 2.4 / 2.6 とばらばらで、同じ意味のアイコン
 * (矢印・情報・トロフィー等)が場所ごとに微妙に違う絵柄になっていた。ここへ集約し、
 * 名前で引く形にすることで見た目を1箇所で揃える。
 *
 * 絵柄の出所は3つ。CLAUDE.md の「アイコンはSVG(ストローク/モノクロ)、絵文字禁止」に沿う。
 *
 *  - Iconoir(基本) — 24pxグリッド・線画で、従来の自作SVGと重心がほぼ同じ。UIのほぼ全て
 *  - Phosphor      — Iconoir に無い絵柄だけ(ポーカーチップ・トランプ・チケット・ブランドマーク)
 *  - Hugeicons     — 訴求面の見出しで、面を持つ Duotone を使って階層をつける箇所のみ
 *
 * 同じ行や同じクラスタの中で複数ファミリーを混ぜないこと(光学サイズがばらつく)。
 */
import type { ComponentType, SVGProps } from "react";
import {
  ArrowRight,
  Bell,
  ChatBubble,
  Check,
  Clock,
  ClockRotateRight,
  Coins,
  Copy,
  Database,
  Eye,
  Filter,
  Folder,
  GraphUp,
  Community,
  Home,
  InfoCircle,
  Lock,
  Mail,
  Medal,
  Menu,
  MultiplePages,
  Minus,
  MoreVert,
  NavArrowDown,
  NavArrowLeft,
  NavArrowRight,
  Pause,
  Play,
  Plus,
  Refresh,
  Search,
  Send,
  Settings,
  ShareAndroid,
  Star,
  StatsUpSquare,
  Suggestion,
  Table2Columns,
  Trophy,
  Upload,
  User,
  UserPlus,
  WarningCircle,
  WarningTriangle,
  Xmark,
} from "iconoir-react";
import {
  AppleLogo,
  Backspace,
  Cards,
  InstagramLogo,
  PokerChip,
  Ticket,
  XLogo,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon as PhosphorGlyph } from "@phosphor-icons/react";

/**
 * 絵柄コンポーネント。
 *
 * Iconoir は素の SVG プロパティを取る。Phosphor はそれに加えて太さを決める `weight` を取るので、
 * 両方を受けられる形にしておく(呼び分けは Icon 側で行う)。
 */
type IconoirGlyph = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * 名前 → 絵柄。
 *
 * `solid` を持つ名前は `filled` で塗り表現に切り替わる(お気に入りの星など)。
 * `phosphor` は Phosphor 由来で、viewBox が 256 のため線幅の指定単位が Iconoir と異なる。
 */
type Entry =
  | { glyph: IconoirGlyph; phosphor?: false }
  /** Phosphor 製。太さは weight で決まるので、fill/stroke を外から渡してはいけない。 */
  | { glyph: PhosphorGlyph; phosphor: true };

const REGISTRY = {
  // --- ナビゲーション / 画面移動 ---
  home: { glyph: Home },
  stats: { glyph: StatsUpSquare },
  trophy: { glyph: Trophy },
  layers: { glyph: MultiplePages },
  history: { glyph: ClockRotateRight },
  seat: { glyph: User },
  settings: { glyph: Settings },
  db: { glyph: Database },
  star: { glyph: Star },
  menu: { glyph: Menu },
  more: { glyph: MoreVert },

  // --- 方向 ---
  "arrow-right": { glyph: ArrowRight },
  "chevron-right": { glyph: NavArrowRight },
  "chevron-left": { glyph: NavArrowLeft },
  "chevron-down": { glyph: NavArrowDown },
  "arrow-up": { glyph: Upload },

  // --- 操作 ---
  check: { glyph: Check },
  close: { glyph: Xmark },
  plus: { glyph: Plus },
  minus: { glyph: Minus },
  search: { glyph: Search },
  copy: { glyph: Copy },
  refresh: { glyph: Refresh },
  play: { glyph: Play },
  filter: { glyph: Filter },
  send: { glyph: Send },
  pause: { glyph: Pause },
  backspace: { glyph: Backspace, phosphor: true },

  // --- 状態 / 通知 ---
  info: { glyph: InfoCircle },
  warning: { glyph: WarningTriangle },
  error: { glyph: WarningCircle },
  bell: { glyph: Bell },
  clock: { glyph: Clock },
  eye: { glyph: Eye },
  lock: { glyph: Lock },
  chat: { glyph: ChatBubble },
  mail: { glyph: Mail },
  idea: { glyph: Suggestion },

  // --- 人 ---
  user: { glyph: User },
  "user-plus": { glyph: UserPlus },
  group: { glyph: Community },

  // --- 数値 / 分析 ---
  "graph-up": { glyph: GraphUp },
  "bar-chart": { glyph: StatsUpSquare },
  table: { glyph: Table2Columns },
  share: { glyph: ShareAndroid },
  medal: { glyph: Medal },

  // --- ポーカー固有(Iconoir に無いので Phosphor) ---
  chip: { glyph: PokerChip, phosphor: true },
  cards: { glyph: Cards, phosphor: true },

  // --- その他 ---
  coins: { glyph: Coins },
  ticket: { glyph: Ticket, phosphor: true },
  folder: { glyph: Folder },

  // --- ブランドマーク(Phosphor のロゴセット) ---
  "logo-x": { glyph: XLogo, phosphor: true },
  "logo-instagram": { glyph: InstagramLogo, phosphor: true },
  "logo-apple": { glyph: AppleLogo, phosphor: true },
} as const satisfies Record<string, Entry>;

/** 使えるアイコン名。存在しない名前は `tsc` で落ちる(以前は実行時に無言で空になっていた)。 */
export type IconName = keyof typeof REGISTRY;

/**
 * Iconoir の線幅。従来の自作SVGが 1.8 だったので、Iconoir の既定(1.5)ではなく 1.8 に揃えて
 * 重心を保つ。
 *
 * Phosphor はここでは指定しない。Phosphor のアイコンは太さを `weight` で切り替える設計で、
 * 外から fill="none" stroke=... を渡すと本来の描き分けを壊して塗り潰しになってしまう
 * (実際、ポーカーチップとチケットが真っ黒な面になっていた)。太さは weight="regular" に任せる。
 */
const STROKE_ICONOIR = 1.8;

export function Icon({
  name,
  className = "h-5 w-5",
  filled = false,
  strokeWidth,
  ...rest
}: {
  name: IconName;
  className?: string;
  /** 塗りつぶし表現(お気に入りの星、ブランドマークなど)。 */
  filled?: boolean;
  /** 既定の線幅を上書きしたいときだけ渡す。 */
  strokeWidth?: number;
} & Omit<SVGProps<SVGSVGElement>, "name" | "className" | "filled" | "strokeWidth">) {
  const entry: Entry = REGISTRY[name];

  // Phosphor は自前の描画に任せる(weight で太さが決まる)。ブランドマークだけは面で描く。
  if (entry.phosphor) {
    const Glyph = entry.glyph;
    return (
      <Glyph
        className={className}
        weight={name.startsWith("logo-") || filled ? "fill" : "regular"}
        aria-hidden
        {...rest}
      />
    );
  }

  const Glyph = entry.glyph;
  if (filled) {
    return <Glyph className={className} fill="currentColor" stroke="none" aria-hidden {...rest} />;
  }

  return (
    <Glyph
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? STROKE_ICONOIR}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    />
  );
}

// ---------------------------------------------------------------------------
// 訴求面の見出しアイコン(Hugeicons)
//
// 上の Icon が線1本の均質な絵柄なのに対し、こちらは面を持つ Duotone。
// 「この1つだけ大きく出す」箇所でだけ使い、階層をつける。本文中の小さいアイコンには
// 使わないこと(同じ大きさで線画と混ざると、面のぶんだけ重く見えて揃わない)。
// ---------------------------------------------------------------------------
import { HugeiconsIcon } from "@hugeicons/react";
import { AnalyticsUpIcon, Award01Icon, Rocket01Icon } from "@hugeicons/core-free-icons";

const HERO_ICONS = {
  analytics: AnalyticsUpIcon,
  award: Award01Icon,
  rocket: Rocket01Icon,
} as const;

export type HeroIconName = keyof typeof HERO_ICONS;

/** 訴求面の見出しに置く大きめのアイコン。既定 40px。 */
export function HeroIcon({
  name,
  size = 40,
  className = "",
}: {
  name: HeroIconName;
  size?: number;
  className?: string;
}) {
  return (
    <HugeiconsIcon
      icon={HERO_ICONS[name]}
      size={size}
      strokeWidth={1.6}
      className={className}
      aria-hidden
    />
  );
}
