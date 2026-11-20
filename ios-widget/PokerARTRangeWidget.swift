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

// MARK: - ウィジェットの上で押して進める(大。GTO タブの席の帯と同じ使い方)

/// 押して選んだ値。ボタンの処理はウィジェットの中で動くので、ウィジェット自身の保存先に置く。
/// 一度でも押して選んだら、「ウィジェットを編集」の設定よりこちらを優先する。
enum Picked {
    static let d = UserDefaults.standard
    static func get(_ k: String) -> String? { d.string(forKey: "picked.\(k)") }
    static func set(_ k: String, _ v: String) { d.set(v, forKey: "picked.\(k)") }
}

/// 場面を丸ごと決める(席の帯の行動を押したとき)。
struct SetLineIntent: AppIntent {
    static var title: LocalizedStringResource = "レンジの場面を選ぶ"
    @Parameter(title: "オープンした席") var opener: String
    @Parameter(title: "自分の席") var hero: String
    init() {}
    init(opener: String, hero: String) {
        self.opener = opener
        self.hero = hero
    }
    func perform() async throws -> some IntentResult {
        Picked.set("opener", opener)
        Picked.set("hero", hero)
        return .result()
    }
}

/// 先頭の板: スタックを順に切り替える / MTT とキャッシュを切り替える。
struct SetSettingIntent: AppIntent {
    static var title: LocalizedStringResource = "スタック・種類を変える"
    @Parameter(title: "項目") var field: String
    @Parameter(title: "値") var value: String
    init() {}
    init(_ field: String, _ value: String) {
        self.field = field
        self.value = value
    }
    func perform() async throws -> some IntentResult {
        Picked.set(field, value)
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

// GTO タブと同じ色(席の帯)。
let stripBg = hex(0x1B1B1D)
let cardBg = hex(0x252528)
let activeGreen = hex(0x8FE388)

func optionLabel(_ c: String, stack: Int) -> String {
    if c == "F" { return "Fold" }
    if c == "C" { return "Call" }
    if c == "X" { return "Check" }
    if c == "RAI" { return "Allin \(stack)" }
    return "Raise \(c.dropFirst())"
}

/// 席の帯の1枚(席名と、選べる行動。選んだ行動は白、手番の席は緑の枠)。
struct SeatCard: View {
    let pos: String
    let options: [String]
    let chosen: String?
    let current: Bool
    let future: Bool
    let stack: Int
    let action: (String) -> SetLineIntent?

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(pos)
                .font(.system(size: 10, weight: .black, design: .monospaced))
                .foregroundStyle(current ? activeGreen : hex(0xCFCFCF))
            ForEach(options, id: \.self) { o in
                let label = Text(optionLabel(o, stack: stack))
                    .font(.system(size: 8.5, weight: chosen == o ? .bold : .regular, design: .monospaced))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .foregroundStyle(chosen == o ? Color.white : current ? hex(0xE6E6E6) : hex(0x8A8A8A))
                    .frame(maxWidth: .infinity, alignment: .leading)
                if let intent = action(o) {
                    Button(intent: intent) { label }.buttonStyle(.plain)
                } else {
                    label
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 3)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(cardBg, in: RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(current ? activeGreen : .clear, lineWidth: 1.5))
        .opacity(future ? 0.9 : 1)
    }
}

/// GTO タブの上の「席の帯」と同じもの。先頭の板(MTT 100bb / ChipEV)と、8席の板を2段に並べる。
/// 押した行動で場面が進む: 前の席の Raise → その席のオープンに対する次の席 / 手番の Fold → 次の席 / この先の席 → その席まで進める。
/// 手番が Call・3ベットを選んだ先の場面はデータに無いので押せない。
struct SeatStrip: View {
    let sel: RangeSelection

    var body: some View {
        let file = RangeFile.shared
        let spots = file?.modes[sel.mode]?.spots[String(sel.stack)] ?? [:]
        let stacks = file?.modes[sel.mode]?.stacks ?? [100]
        let oi = allPositions.firstIndex(of: sel.opener) ?? -1
        let hi = allPositions.firstIndex(of: sel.hero) ?? 5
        let nextStack = stacks[((stacks.firstIndex(of: sel.stack) ?? 0) + 1) % stacks.count]

        func opts(_ key: String) -> [String] {
            (spots[key]?.actions.map(\.c) ?? ["F"]).sorted { actionOrder($0) > actionOrder($1) }
        }
        func card(_ i: Int) -> some View {
            let p = allPositions[i]
            if sel.opener.isEmpty {
                // オープンの場面: 前の席は Fold、手番は自分、後ろはこの先。
                if i < hi {
                    return SeatCard(pos: p, options: opts("|\(p)"), chosen: "F", current: false, future: false, stack: sel.stack) { o in
                        o.hasPrefix("R") && o != "RAI" && i < 7 ? SetLineIntent(opener: p, hero: allPositions[i + 1]) : nil
                    }
                } else if i == hi {
                    return SeatCard(pos: p, options: opts("|\(p)"), chosen: nil, current: true, future: false, stack: sel.stack) { o in
                        if o == "F" { return i + 1 < 7 ? SetLineIntent(opener: "", hero: allPositions[i + 1]) : nil }
                        if o.hasPrefix("R") && o != "RAI" { return SetLineIntent(opener: p, hero: allPositions[i + 1]) }
                        return nil
                    }
                } else {
                    let o2 = i < 7 ? opts("|\(p)") : []
                    return SeatCard(pos: p, options: o2, chosen: nil, current: false, future: true, stack: sel.stack) { _ in
                        i < 7 ? SetLineIntent(opener: "", hero: p) : nil
                    }
                }
            } else {
                // 相手のオープンへの対応の場面。
                if i < oi {
                    return SeatCard(pos: p, options: opts("|\(p)"), chosen: "F", current: false, future: false, stack: sel.stack) { o in
                        o.hasPrefix("R") && o != "RAI" ? SetLineIntent(opener: p, hero: allPositions[i + 1]) : nil
                    }
                } else if i == oi {
                    let o = opts("|\(p)")
                    let raise = o.first { $0.hasPrefix("R") && $0 != "RAI" }
                    return SeatCard(pos: p, options: o, chosen: raise, current: false, future: false, stack: sel.stack) { x in
                        x == "F" ? SetLineIntent(opener: "", hero: allPositions[i + 1]) : nil
                    }
                } else if i < hi {
                    return SeatCard(pos: p, options: opts("\(sel.opener)|\(p)"), chosen: "F", current: false, future: false, stack: sel.stack) { _ in nil }
                } else if i == hi {
                    return SeatCard(pos: p, options: opts("\(sel.opener)|\(p)"), chosen: nil, current: true, future: false, stack: sel.stack) { o in
                        o == "F" && i < 7 ? SetLineIntent(opener: sel.opener, hero: allPositions[i + 1]) : nil
                    }
                } else {
                    return SeatCard(pos: p, options: opts("\(sel.opener)|\(p)"), chosen: nil, current: false, future: true, stack: sel.stack) { _ in
                        SetLineIntent(opener: sel.opener, hero: p)
                    }
                }
            }
        }

        return VStack(spacing: 3) {
            HStack(spacing: 3) {
                // 先頭の板: 上を押すとスタックが順に変わる、下を押すと MTT / キャッシュが変わる。
                VStack(alignment: .leading, spacing: 2) {
                    Button(intent: SetSettingIntent("stack", String(nextStack))) {
                        Text("\(sel.modeLabel) \(sel.stack)bb")
                            .font(.system(size: 9.5, weight: .bold, design: .monospaced))
                            .foregroundStyle(hex(0xCFCFCF))
                            .lineLimit(1).minimumScaleFactor(0.6)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }.buttonStyle(.plain)
                    Button(intent: SetSettingIntent("mode", sel.mode == "mtt" ? "cash" : "mtt")) {
                        Text(sel.mode == "mtt" ? "→ Cash" : "→ MTT")
                            .font(.system(size: 8.5, design: .monospaced))
                            .foregroundStyle(hex(0x9A9A9A))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }.buttonStyle(.plain)
                    Text("ChipEV").font(.system(size: 8.5, design: .monospaced)).foregroundStyle(hex(0x9A9A9A))
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 4).padding(.vertical, 3)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .background(cardBg, in: RoundedRectangle(cornerRadius: 6))
                ForEach(0..<4, id: \.self) { card($0) }
            }
            HStack(spacing: 3) {
                ForEach(4..<8, id: \.self) { card($0) }
                Color.clear.frame(maxWidth: .infinity)
            }
        }
        .padding(3)
        .frame(height: 118)
        .background(stripBg, in: RoundedRectangle(cornerRadius: 9))
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
                    SeatStrip(sel: entry.sel)
                    RangeGrid(spot: spot, showLabels: true)
                    FrequencyBar(spot: spot)
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Header(sel: entry.sel)
                if family == .systemLarge || family == .systemExtraLarge { SeatStrip(sel: entry.sel) }
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
