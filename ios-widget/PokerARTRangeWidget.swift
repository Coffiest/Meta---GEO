// Poker ART のプリフロップのレンジ(GTO の計算済みの解)をホーム画面・スマートスタックに出すウィジェット。
// データと表の描画は RangeCore.swift(このターゲットにも入れる)。
// - 大(と iPad の特大)は、ウィジェットの上のボタンで「MTT / Cash・スタック・誰のオープンに対して・自分の席」を切り替える(iOS 17 の押せるウィジェット)。
// - 小・中は長押し →「ウィジェットを編集」で選ぶ。
// - 押すとアプリの GTO タブがその場面で開く(pokerart:// のリンク)。

import AppIntents
import SwiftUI
import WidgetKit

// MARK: - 「ウィジェットを編集」の設定

enum ModeOption: String, AppEnum {
    case mtt, cash
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "種類"
    static var caseDisplayRepresentations: [ModeOption: DisplayRepresentation] = [.mtt: "トーナメント", .cash: "キャッシュ"]
}

enum StackOption: Int, AppEnum {
    case s100 = 100, s60 = 60, s40 = 40, s30 = 30, s20 = 20, s12 = 12
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "スタック"
    static var caseDisplayRepresentations: [StackOption: DisplayRepresentation] = [
        .s100: "100bb", .s60: "60bb", .s40: "40bb", .s30: "30bb", .s20: "20bb", .s12: "12bb",
    ]
}

enum OpenerOption: String, AppEnum {
    case none, UTG, UTG1, LJ, HJ, CO, BTN, SB
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "オープンした席"
    static var caseDisplayRepresentations: [OpenerOption: DisplayRepresentation] = [
        .none: "なし(自分がオープン)", .UTG: "UTG", .UTG1: "UTG1", .LJ: "LJ", .HJ: "HJ", .CO: "CO", .BTN: "BTN", .SB: "SB",
    ]
}

enum HeroOption: String, AppEnum {
    case UTG, UTG1, LJ, HJ, CO, BTN, SB, BB
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "自分の席"
    static var caseDisplayRepresentations: [HeroOption: DisplayRepresentation] = [
        .UTG: "UTG", .UTG1: "UTG1", .LJ: "LJ", .HJ: "HJ", .CO: "CO", .BTN: "BTN", .SB: "SB", .BB: "BB",
    ]
}

struct RangeConfigIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "プリフロップのレンジ"
    static var description = IntentDescription("GTO のプリフロップのレンジを表示する。")

    @Parameter(title: "種類", default: .mtt) var mode: ModeOption
    @Parameter(title: "スタック", default: .s100) var stack: StackOption
    @Parameter(title: "オープンした席", default: .none) var opener: OpenerOption
    @Parameter(title: "自分の席", default: .BTN) var hero: HeroOption
}

// MARK: - ウィジェットの上のボタン(大・特大)

/// ボタンで選んだ値。ボタンの処理はウィジェットの中で動くので、ウィジェット自身の保存先に置く。
/// 一度でもボタンで選んだら、「ウィジェットを編集」の設定よりこちらを優先する。
enum Picked {
    static let d = UserDefaults.standard
    static func get(_ k: String) -> String? { d.string(forKey: "picked.\(k)") }
    static func set(_ k: String, _ v: String) { d.set(v, forKey: "picked.\(k)") }
}

struct PickIntent: AppIntent {
    static var title: LocalizedStringResource = "レンジの場面を選ぶ"
    @Parameter(title: "項目") var field: String
    @Parameter(title: "値") var value: String
    init() {}
    init(_ field: String, _ value: String) {
        self.field = field
        self.value = value
    }
    func perform() async throws -> some IntentResult {
        Picked.set(field, value)
        // 自分の席を後ろへずらす必要があるとき(オープンした席より前にいる等)は、表示側で直す。
        return .result()
    }
}

// MARK: - タイムライン(中身は変わらないので1件だけ)

struct RangeEntry: TimelineEntry {
    let date: Date
    let sel: RangeSelection
    let spot: RangeSpot?
}

struct RangeProvider: AppIntentTimelineProvider {
    func entry(for c: RangeConfigIntent, interactive: Bool) -> RangeEntry {
        var s = RangeSelection(
            mode: c.mode.rawValue, stack: c.stack.rawValue,
            opener: c.opener == .none ? "" : c.opener.rawValue, hero: c.hero.rawValue)
        if interactive {
            if let v = Picked.get("mode") { s.mode = v }
            if let v = Picked.get("stack"), let n = Int(v) { s.stack = n }
            if let v = Picked.get("opener") { s.opener = v }
            if let v = Picked.get("hero") { s.hero = v }
        }
        s = s.normalized(RangeFile.shared)
        return RangeEntry(date: .now, sel: s, spot: s.spot(RangeFile.shared))
    }
    func placeholder(in context: Context) -> RangeEntry { entry(for: RangeConfigIntent(), interactive: false) }
    func snapshot(for c: RangeConfigIntent, in context: Context) async -> RangeEntry {
        entry(for: c, interactive: context.family == .systemLarge || context.family == .systemExtraLarge)
    }
    func timeline(for c: RangeConfigIntent, in context: Context) async -> Timeline<RangeEntry> {
        Timeline(entries: [entry(for: c, interactive: context.family == .systemLarge || context.family == .systemExtraLarge)], policy: .never)
    }
}

// MARK: - 見た目

struct Chip: View {
    let label: String
    let on: Bool
    let dim: Bool
    let intent: PickIntent
    var body: some View {
        Button(intent: intent) {
            Text(label)
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .frame(maxWidth: .infinity, minHeight: 19)
                .foregroundStyle(on ? inkBlack : ivory.opacity(dim ? 0.35 : 1))
                .background(on ? accent : Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 5))
        }
        .buttonStyle(.plain)
    }
}

struct Pickers: View {
    let sel: RangeSelection
    var body: some View {
        let stacks = RangeFile.shared?.modes[sel.mode]?.stacks ?? [100]
        let oi = allPositions.firstIndex(of: sel.opener) ?? -1
        VStack(spacing: 3) {
            HStack(spacing: 3) {
                Chip(label: "MTT", on: sel.mode == "mtt", dim: false, intent: PickIntent("mode", "mtt"))
                Chip(label: "Cash", on: sel.mode == "cash", dim: false, intent: PickIntent("mode", "cash"))
                ForEach(stacks, id: \.self) { st in
                    Chip(label: "\(st)", on: sel.stack == st, dim: false, intent: PickIntent("stack", String(st)))
                }
            }
            HStack(spacing: 3) {
                Text("vs").font(.system(size: 9, weight: .bold, design: .monospaced)).foregroundStyle(ivory.opacity(0.6)).frame(width: 16)
                Chip(label: "Open", on: sel.opener.isEmpty, dim: false, intent: PickIntent("opener", ""))
                ForEach(allPositions.dropLast(), id: \.self) { p in
                    Chip(label: p, on: sel.opener == p, dim: false, intent: PickIntent("opener", p))
                }
            }
            HStack(spacing: 3) {
                Text("me").font(.system(size: 9, weight: .bold, design: .monospaced)).foregroundStyle(ivory.opacity(0.6)).frame(width: 16)
                ForEach(Array(allPositions.enumerated()), id: \.element) { i, p in
                    let ok = sel.opener.isEmpty ? i < 7 : i > oi
                    Chip(label: p, on: sel.hero == p, dim: !ok, intent: PickIntent("hero", p))
                }
            }
        }
    }
}

struct Header: View {
    let sel: RangeSelection
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(sel.title).font(.system(size: 14, weight: .black, design: .monospaced))
            Text("\(sel.modeLabel) \(sel.stack)bb").font(.system(size: 11, weight: .bold, design: .monospaced)).opacity(0.65)
            Spacer(minLength: 0)
        }
        .foregroundStyle(ivory)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }
}

struct RangeWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: RangeEntry

    var body: some View {
        content
            .widgetURL(entry.sel.link)
            .containerBackground(inkBlack, for: .widget)
    }

    @ViewBuilder var content: some View {
        if let spot = entry.spot {
            switch family {
            case .systemSmall:
                VStack(alignment: .leading, spacing: 3) {
                    Header(sel: entry.sel)
                    RangeGrid(spot: spot, showLabels: false, gap: 0.5)
                }
            case .systemMedium:
                HStack(spacing: 8) {
                    RangeGrid(spot: spot, showLabels: false, gap: 0.5)
                    VStack(alignment: .leading, spacing: 6) {
                        Header(sel: entry.sel)
                        FrequencyBar(spot: spot)
                        Spacer(minLength: 0)
                    }
                }
            default: // 大・特大(特大は iPad だけ)
                VStack(alignment: .leading, spacing: 4) {
                    Header(sel: entry.sel)
                    Pickers(sel: entry.sel)
                    RangeGrid(spot: spot, showLabels: true)
                    FrequencyBar(spot: spot)
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Header(sel: entry.sel)
                if family == .systemLarge || family == .systemExtraLarge { Pickers(sel: entry.sel) }
                Spacer()
                Text("この場面のデータはありません").font(.caption).foregroundStyle(ivory)
                Spacer()
            }
        }
    }
}

struct PokerARTRangeWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "PokerARTRange", intent: RangeConfigIntent.self, provider: RangeProvider()) { entry in
            RangeWidgetView(entry: entry)
        }
        .configurationDisplayName("GTO レンジ")
        .description("トーナメント・キャッシュのプリフロップのレンジ。オープンと、相手のオープンへの対応。")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .systemExtraLarge])
    }
}

@main
struct PokerARTWidgets: WidgetBundle {
    var body: some Widget { PokerARTRangeWidget() }
}
