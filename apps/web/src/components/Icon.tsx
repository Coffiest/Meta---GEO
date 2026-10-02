/**
 * アプリ唯一のアイコン入口。絵柄は **Phosphor Icons 1本** に統一している。
 *
 * 以前は各コンポーネントが `<svg viewBox="0 0 24 24">` を直書きしており、33ファイル・101箇所に
 * 散らばっていた。線幅が 1.6 / 1.7 / 1.8 / 2 / 2.2 / 2.4 / 2.6 とばらばらで、同じ意味のアイコン
 * (矢印・情報・トロフィー等)が場所ごとに微妙に違う絵柄になっていた。ここへ集約する。
 *
 * なぜ Phosphor 1本なのか(Iconoir / Hugeicons と比較して):
 *  - **ポーカー固有の絵柄を持つ唯一のセット**。PokerChip / Cards / Spade があり、
 *    このアプリの主題をそのまま描ける。Iconoir にはどれも無い
 *  - **ブランドマークを持つ**。共有(X)・ログイン(Apple)・導線(Instagram)に必要で、
 *    これも Iconoir には無い
 *  - **太さが6段階**(thin/light/regular/bold/fill/duotone)。強弱を別ファミリーで作らずに
 *    済むので、光学サイズがばらつかない
 *
 * 複数セットを混ぜると、同じ大きさでも線の太さと角の丸みが揃わず寄せ集めに見える。
 * 1セットに絞ることが見た目の統一に一番効く。
 */
import {
  AppleLogo,
  ArrowClockwise,
  ArrowLineUp,
  ArrowRight,
  Backspace,
  Bell,
  Cards,
  CaretDown,
  CaretLeft,
  CaretRight,
  ChartBar,
  ChatCircleDots,
  Check,
  Clock,
  ClockCounterClockwise,
  Coins,
  Copy,
  Database,
  DotsThreeVertical,
  Envelope,
  Eye,
  Folder,
  Funnel,
  Gear,
  House,
  Info,
  InstagramLogo,
  Lightbulb,
  List,
  Lock,
  MagnifyingGlass,
  Medal,
  Minus,
  PaperPlaneTilt,
  Pause,
  Play,
  Plus,
  PokerChip,
  ShareNetwork,
  Stack,
  Star,
  Table,
  Ticket,
  TrendUp,
  Trophy,
  User,
  UserPlus,
  UsersThree,
  Warning,
  WarningCircle,
  X,
  XLogo,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon as PhosphorGlyph } from "@phosphor-icons/react";

const REGISTRY = {
  // --- ナビゲーション / 画面移動 ---
  home: House,
  stats: ChartBar,
  trophy: Trophy,
  layers: Stack,
  seat: User,
  settings: Gear,
  db: Database,
  star: Star,
  menu: List,
  more: DotsThreeVertical,
  history: ClockCounterClockwise,

  // --- 方向 ---
  "arrow-right": ArrowRight,
  "chevron-right": CaretRight,
  "chevron-left": CaretLeft,
  "chevron-down": CaretDown,
  "arrow-up": ArrowLineUp,

  // --- 操作 ---
  check: Check,
  close: X,
  plus: Plus,
  minus: Minus,
  search: MagnifyingGlass,
  copy: Copy,
  refresh: ArrowClockwise,
  play: Play,
  pause: Pause,
  filter: Funnel,
  send: PaperPlaneTilt,
  backspace: Backspace,

  // --- 状態 / 通知 ---
  info: Info,
  error: WarningCircle,
  warning: Warning,
  bell: Bell,
  clock: Clock,
  eye: Eye,
  lock: Lock,
  chat: ChatCircleDots,
  mail: Envelope,
  idea: Lightbulb,

  // --- 人 ---
  user: User,
  "user-plus": UserPlus,
  group: UsersThree,

  // --- 数値 / 分析 ---
  "graph-up": TrendUp,
  "bar-chart": ChartBar,
  table: Table,
  share: ShareNetwork,
  medal: Medal,

  // --- ポーカー / 物品 ---
  chip: PokerChip,
  cards: Cards,
  coins: Coins,
  ticket: Ticket,
  folder: Folder,

  // --- ブランドマーク ---
  "logo-x": XLogo,
  "logo-instagram": InstagramLogo,
  "logo-apple": AppleLogo,
} as const satisfies Record<string, PhosphorGlyph>;

/** 使えるアイコン名。存在しない名前は `tsc` で落ちる(以前は実行時に無言で空になっていた)。 */
export type IconName = keyof typeof REGISTRY;

/** ブランドマークは輪郭ではなく面で描くもの。線画で出すと別物に見える。 */
const BRAND_NAMES: ReadonlySet<string> = new Set(["logo-x", "logo-instagram", "logo-apple"]);

export type IconWeight = "thin" | "light" | "regular" | "bold" | "fill" | "duotone";

export function Icon({
  name,
  className = "h-5 w-5",
  filled = false,
  weight,
}: {
  name: IconName;
  className?: string;
  /** 塗りつぶし表現(お気に入りの星など)。ブランドマークは指定不要で常に塗り。 */
  filled?: boolean;
  /** 太さの上書き。既定は "regular"。強調したい箇所だけ "bold" / "duotone" を渡す。 */
  weight?: IconWeight;
  /** アイコンの色は親の text-* から currentColor で継承する(個別指定は不要)。 */
  style?: React.CSSProperties;
}) {
  const Glyph = REGISTRY[name];
  const resolved: IconWeight = weight ?? (filled || BRAND_NAMES.has(name) ? "fill" : "regular");
  return <Glyph className={className} weight={resolved} aria-hidden />;
}

/**
 * 訴求面の見出しに置く大きめのアイコン。
 *
 * 本文中と同じ絵柄のまま太さだけ duotone(面+線)にして階層をつける。
 * 別ファミリーを持ち込まずに強弱を作れるのが、Phosphor 1本に寄せた理由のひとつ。
 */
export function HeroIcon({
  name,
  size = 30,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const Glyph = REGISTRY[name];
  return <Glyph size={size} weight="duotone" className={className} aria-hidden />;
}
