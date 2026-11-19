// Poker ART のオープンレンジ(GTO の計算済みの解)をホーム画面・スマートスタックに出すウィジェット。
// データは同じフォルダの PokerARTRanges.json(scripts/widget-ranges.py で書き出す)をウィジェットに同梱して読む。通信はしない。
// 長押し →「ウィジェットを編集」でスタックとポジションを選ぶ。押すとアプリの GTO タブがその場面で開く(pokerart:// のリンク)。
// iOS 17 以上。

import AppIntents
import SwiftUI
import WidgetKit

// MARK: - データ

struct RangeEntryData: Decodable {
    let raise: [Int]
    let allIn: [Int]
    let raiseSize: String
}

struct RangeFile: Decodable {
    let stacks: [Int]
    let positions: [String]
    let ranges: [String: [String: RangeEntryData]]

    static let shared: RangeFile? = {
        guard let url = Bundle.main.url(forResource: "PokerARTRanges", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(RangeFile.self, from: data)
    }()
}

let ranks = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"]

func handName(_ idx: Int) -> String {
    let r = idx / 13, c = idx % 13
    if r == c { return ranks[r] + ranks[c] }
    return r < c ? "\(ranks[r])\(ranks[c])s" : "\(ranks[c])\(ranks[r])o"
}

// MARK: - 設定(スタックとポジション)

enum StackOption: Int, AppEnum {
    case s100 = 100, s60 = 60, s40 = 40, s30 = 30, s20 = 20, s12 = 12
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "スタック"
    static var caseDisplayRepresentations: [StackOption: DisplayRepresentation] = [
        .s100: "100bb", .s60: "60bb", .s40: "40bb", .s30: "30bb", .s20: "20bb", .s12: "12bb",
    ]
}

enum PositionOption: String, AppEnum {
    case UTG, UTG1, LJ, HJ, CO, BTN, SB
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "ポジション"
    static var caseDisplayRepresentations: [PositionOption: DisplayRepresentation] = [
        .UTG: "UTG", .UTG1: "UTG1", .LJ: "LJ", .HJ: "HJ", .CO: "CO", .BTN: "BTN", .SB: "SB",
    ]
    /// 8人卓で、この席より前に降りる人数(GTO タブの手順 F-F-… の長さ)。
    var foldsBefore: Int { ["UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB"].firstIndex(of: rawValue) ?? 0 }
}

struct RangeConfigIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "オープンレンジ"
    static var description = IntentDescription("GTO のオープンレンジを表示する。")

    @Parameter(title: "スタック", default: .s20) var stack: StackOption
    @Parameter(title: "ポジション", default: .BTN) var position: PositionOption
}

// MARK: - ウィジェットの上で切り替える(iOS 17 の押せるウィジェット。大サイズに出すボタン)

/// ウィジェットの上で選んだ値。ボタンの処理はウィジェットの中で動くので、ウィジェット自身の保存先に置けば足りる。
enum PickedSelection {
    static let defaults = UserDefaults.standard
    static var stack: Int? {
        get { defaults.object(forKey: "pickedStack") as? Int }
        set { defaults.set(newValue, forKey: "pickedStack") }
    }
    static var position: String? {
        get { defaults.string(forKey: "pickedPosition") }
        set { defaults.set(newValue, forKey: "pickedPosition") }
    }
}

struct PickPositionIntent: AppIntent {
    static var title: LocalizedStringResource = "ポジションを選ぶ"
    @Parameter(title: "ポジション") var position: String
    init() {}
    init(_ position: String) { self.position = position }
    func perform() async throws -> some IntentResult {
        PickedSelection.position = position
        return .result()
    }
}

struct PickStackIntent: AppIntent {
    static var title: LocalizedStringResource = "スタックを選ぶ"
    @Parameter(title: "スタック") var stack: Int
    init() {}
    init(_ stack: Int) { self.stack = stack }
    func perform() async throws -> some IntentResult {
        PickedSelection.stack = stack
        return .result()
    }
}

// MARK: - タイムライン(中身は変わらないので1件だけ)

struct RangeEntry: TimelineEntry {
    let date: Date
    let stack: Int
    let position: String
    let data: RangeEntryData?
    let link: URL?
}

struct RangeProvider: AppIntentTimelineProvider {
    func entry(for c: RangeConfigIntent) -> RangeEntry {
        // ウィジェットの上で選んだ値があればそれを、無ければ「ウィジェットを編集」の設定を使う。
        let stack = PickedSelection.stack ?? c.stack.rawValue
        let pos = PickedSelection.position ?? c.position.rawValue
        let folds = PositionOption(rawValue: pos)?.foldsBefore ?? 0
        let pa = Array(repeating: "F", count: folds).joined(separator: "-")
        return RangeEntry(
            date: .now, stack: stack, position: pos,
            data: RangeFile.shared?.ranges[String(stack)]?[pos],
            link: URL(string: "pokerart://geo?tab=gto&stack=\(stack)&pa=\(pa)")
        )
    }
    func placeholder(in context: Context) -> RangeEntry { entry(for: RangeConfigIntent()) }
    func snapshot(for c: RangeConfigIntent, in context: Context) async -> RangeEntry { entry(for: c) }
    func timeline(for c: RangeConfigIntent, in context: Context) async -> Timeline<RangeEntry> {
        Timeline(entries: [entry(for: c)], policy: .never)
    }
}

// MARK: - 見た目(GTO タブと同じ色: レイズ = 赤、オールイン = 濃い赤、フォールド = 青)

let raiseColor = Color(red: 0xDD / 255, green: 0x4D / 255, blue: 0x45 / 255)
let allInColor = Color(red: 0x72 / 255, green: 0x27 / 255, blue: 0x22 / 255)
let foldColor = Color(red: 0x4D / 255, green: 0x7A / 255, blue: 0xB3 / 255)
let inkBlack = Color(red: 0x03 / 255, green: 0x12 / 255, blue: 0x11 / 255)
let ivory = Color(red: 0xE8 / 255, green: 0xE4 / 255, blue: 0xD3 / 255)
let accent = Color(red: 0x00 / 255, green: 0xAE / 255, blue: 0xBB / 255)

struct RangeGrid: View {
    let data: RangeEntryData
    let showLabels: Bool

    var body: some View {
        GeometryReader { geo in
            let gap: CGFloat = 1
            let cell = (min(geo.size.width, geo.size.height) - gap * 12) / 13
            VStack(spacing: gap) {
                ForEach(0..<13, id: \.self) { r in
                    HStack(spacing: gap) {
                        ForEach(0..<13, id: \.self) { c in
                            let i = r * 13 + c
                            let ai = CGFloat(data.allIn[i]) / 100
                            let ra = CGFloat(data.raise[i]) / 100
                            ZStack(alignment: .topLeading) {
                                HStack(spacing: 0) {
                                    raiseColor.frame(width: cell * ra)
                                    allInColor.frame(width: cell * ai)
                                    foldColor
                                }
                                if showLabels {
                                    Text(handName(i))
                                        .font(.system(size: cell * 0.32, weight: .semibold, design: .monospaced))
                                        .foregroundStyle(.white)
                                        .padding(1)
                                }
                            }
                            .frame(width: cell, height: cell)
                            .clipShape(RoundedRectangle(cornerRadius: 1.5))
                        }
                    }
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
    }
}

/// 押して選ぶ小さなボタンの列(選んでいるものはアクセント色)。
struct PickRow<Item: Hashable, I: AppIntent>: View {
    let items: [Item]
    let selected: Item
    let label: (Item) -> String
    let intent: (Item) -> I

    var body: some View {
        HStack(spacing: 3) {
            ForEach(items, id: \.self) { item in
                Button(intent: intent(item)) {
                    Text(label(item))
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity, minHeight: 20)
                        .foregroundStyle(item == selected ? inkBlack : ivory)
                        .background(item == selected ? accent : Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 5))
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct RangeWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: RangeEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(entry.position).font(.system(size: 15, weight: .black, design: .monospaced))
                Text("\(entry.stack)bb").font(.system(size: 13, weight: .bold, design: .monospaced)).opacity(0.7)
                Spacer()
                if let d = entry.data, family != .systemSmall {
                    Text("Open \(d.raiseSize)").font(.system(size: 11, weight: .bold, design: .monospaced)).opacity(0.7)
                }
            }
            .foregroundStyle(ivory)
            if family == .systemLarge {
                // ウィジェットの上でどこのオープンか・スタックを切り替える(アプリは開かない)。
                PickRow(items: ["UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB"], selected: entry.position, label: { $0 }) { PickPositionIntent($0) }
                PickRow(items: [100, 60, 40, 30, 20, 12], selected: entry.stack, label: { "\($0)" }) { PickStackIntent($0) }
            }
            if let d = entry.data {
                RangeGrid(data: d, showLabels: family == .systemLarge)
            } else {
                Text("データがありません").font(.caption).foregroundStyle(ivory)
                Spacer()
            }
        }
        .widgetURL(entry.link)
        .containerBackground(inkBlack, for: .widget)
    }
}

struct PokerARTRangeWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "PokerARTRange", intent: RangeConfigIntent.self, provider: RangeProvider()) { entry in
            RangeWidgetView(entry: entry)
        }
        .configurationDisplayName("GTO オープンレンジ")
        .description("スタックとポジションを選んで、オープンレンジを表示する。")
        .supportedFamilies([.systemSmall, .systemLarge])
    }
}

@main
struct PokerARTWidgets: WidgetBundle {
    var body: some Widget { PokerARTRangeWidget() }
}
