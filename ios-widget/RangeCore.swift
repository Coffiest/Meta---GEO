// ウィジェット(iPhone)と Apple Watch のアプリで共通に使う、レンジのデータと表の描画。
// データは PokerARTRanges.json(scripts/widget-ranges.py で書き出す)を同梱して読む。通信はしない。
// このファイルは PokerARTWidget と PokerARTWatch の両方のターゲットに入れる。

import SwiftUI

// MARK: - データ

struct RangeAction: Decodable, Hashable {
    let c: String      // "F" / "C" / "X" / "R2.5" / "RAI"
    let s: [Int]       // 169 の手ごとの頻度(0-100)
}

struct RangeSpot: Decodable {
    let actions: [RangeAction]
}

struct RangeMode: Decodable {
    let stacks: [Int]
    let spots: [String: [String: RangeSpot]]   // スタック → "オープンした席|自分の席"(オープンは "|自分の席")
}

struct RangeFile: Decodable {
    let positions: [String]
    let modes: [String: RangeMode]

    static let shared: RangeFile? = {
        guard let url = Bundle.main.url(forResource: "PokerARTRanges", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(RangeFile.self, from: data)
    }()
}

let allPositions = ["UTG", "UTG1", "LJ", "HJ", "CO", "BTN", "SB", "BB"]

/// 見る場面。opener が空ならオープン(RFI)、入っていればその席のオープンに対する hero の対応。
struct RangeSelection: Hashable {
    var mode: String = "mtt"     // "mtt" / "cash"
    var stack: Int = 100
    var opener: String = ""
    var hero: String = "BTN"

    /// データにある組み合わせへ直す(キャッシュは 100bb だけ、hero は opener より後ろ、オープンは BB 以外)。
    func normalized(_ file: RangeFile?) -> RangeSelection {
        var s = self
        guard let file, let m = file.modes[s.mode] ?? file.modes["mtt"] else { return s }
        if file.modes[s.mode] == nil { s.mode = "mtt" }
        if !m.stacks.contains(s.stack) { s.stack = m.stacks.first ?? 100 }
        let oi = allPositions.firstIndex(of: s.opener) ?? -1
        if s.opener == "BB" { s.opener = ""; }
        var hi = allPositions.firstIndex(of: s.hero) ?? 5
        if s.opener.isEmpty {
            if hi >= 7 { hi = 6 }
        } else if hi <= oi {
            hi = min(oi + 1, 7)
        }
        s.hero = allPositions[hi]
        return s
    }

    var key: String { "\(opener)|\(hero)" }

    func spot(_ file: RangeFile?) -> RangeSpot? {
        file?.modes[mode]?.spots[String(stack)]?[key]
    }

    var title: String { opener.isEmpty ? "\(hero) オープン" : "\(hero) vs \(opener)" }
    var modeLabel: String { mode == "cash" ? "Cash" : "MTT" }

    /// アプリの GTO タブをこの場面で開くリンク(アプリ側で https://meta-geo-poker.vercel.app/geo?... に直して開く)。
    var link: URL? {
        var codes: [String] = []
        if opener.isEmpty {
            codes = Array(repeating: "F", count: allPositions.firstIndex(of: hero) ?? 0)
        } else if let oi = allPositions.firstIndex(of: opener), let hi = allPositions.firstIndex(of: hero),
                  let file = RangeFile.shared,
                  let open = file.modes[mode]?.spots[String(stack)]?["|\(opener)"]?.actions
                    .first(where: { $0.c.hasPrefix("R") && $0.c != "RAI" })?.c {
            codes = Array(repeating: "F", count: oi) + [open] + Array(repeating: "F", count: hi - oi - 1)
        }
        let pa = codes.joined(separator: "-")
        return URL(string: "pokerart://geo?tab=gto&mode=\(mode)&stack=\(stack)&pa=\(pa)")
    }
}

let ranks = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"]

func handName(_ idx: Int) -> String {
    let r = idx / 13, c = idx % 13
    if r == c { return ranks[r] + ranks[c] }
    return r < c ? "\(ranks[r])\(ranks[c])s" : "\(ranks[c])\(ranks[r])o"
}

// MARK: - 色(GTO タブと同じ: フォールド 青 / コール 緑 / レイズ 赤 / オールイン 濃い赤)

func hex(_ v: UInt32) -> Color {
    Color(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
}

let inkBlack = hex(0x031211)
let ivory = hex(0xE8E4D3)
let accent = hex(0x00AEBB)

func actionColor(_ c: String) -> Color {
    if c == "F" { return hex(0x4D7AB3) }
    if c == "C" || c == "X" { return hex(0x7CB570) }
    if c == "RAI" { return hex(0x722722) }
    return hex(0xDD4D45)
}

/// 表の中で左から塗る順(GTO タブと同じ: 強い行動から)。
func actionOrder(_ c: String) -> Int {
    if c == "RAI" { return 0 }
    if c.hasPrefix("R") { return 1 }
    if c == "C" || c == "X" { return 2 }
    return 3
}

func actionLabel(_ c: String) -> String {
    if c == "F" { return "Fold" }
    if c == "C" { return "Call" }
    if c == "X" { return "Check" }
    if c == "RAI" { return "Allin" }
    return "Raise \(c.dropFirst())"
}

// MARK: - 表(13×13。1マスの中を行動の頻度で左から塗り分ける)

struct RangeGrid: View {
    let spot: RangeSpot
    let showLabels: Bool
    var gap: CGFloat = 1

    var body: some View {
        let actions = spot.actions.sorted { actionOrder($0.c) < actionOrder($1.c) }
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            let cell = (side - gap * 12) / 13
            VStack(spacing: gap) {
                ForEach(0..<13, id: \.self) { r in
                    HStack(spacing: gap) {
                        ForEach(0..<13, id: \.self) { c in
                            let i = r * 13 + c
                            ZStack(alignment: .topLeading) {
                                Color.white.opacity(0.08)
                                HStack(spacing: 0) {
                                    ForEach(actions, id: \.c) { a in
                                        actionColor(a.c).frame(width: cell * CGFloat(a.s[i]) / 100)
                                    }
                                    Spacer(minLength: 0)
                                }
                                if showLabels {
                                    Text(handName(i))
                                        .font(.system(size: cell * 0.3, weight: .semibold, design: .monospaced))
                                        .foregroundStyle(.white)
                                        .padding(.leading, 1)
                                }
                            }
                            .frame(width: cell, height: cell)
                            .clipShape(RoundedRectangle(cornerRadius: max(1, cell * 0.06)))
                        }
                    }
                }
            }
            .frame(width: side, height: side)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

/// 全体の頻度(169 の手の組み合わせ数で重みづけ: ペア 6、スーテッド 4、オフスート 12)。
func overallFrequency(_ spot: RangeSpot) -> [(String, Double)] {
    var total = 0.0
    var sums = Array(repeating: 0.0, count: spot.actions.count)
    for i in 0..<169 {
        let r = i / 13, c = i % 13
        let combos: Double = r == c ? 6 : (r < c ? 4 : 12)
        total += combos
        for (k, a) in spot.actions.enumerated() { sums[k] += combos * Double(a.s[i]) / 100 }
    }
    return spot.actions.enumerated()
        .map { ($0.element.c, total > 0 ? sums[$0.offset] / total : 0) }
        .sorted { actionOrder($0.0) < actionOrder($1.0) }
}

/// 全体の頻度の帯と凡例。
struct FrequencyBar: View {
    let spot: RangeSpot
    var body: some View {
        let freqs = overallFrequency(spot)
        VStack(alignment: .leading, spacing: 2) {
            GeometryReader { g in
                HStack(spacing: 0) {
                    ForEach(freqs, id: \.0) { f in actionColor(f.0).frame(width: g.size.width * f.1) }
                }
            }
            .frame(height: 6)
            .clipShape(RoundedRectangle(cornerRadius: 2))
            HStack(spacing: 6) {
                ForEach(freqs.filter { $0.1 >= 0.005 }, id: \.0) { f in
                    Text("\(actionLabel(f.0)) \(Int((f.1 * 100).rounded()))%")
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundStyle(actionColor(f.0) == hex(0x722722) ? ivory.opacity(0.8) : actionColor(f.0))
                        .lineLimit(1)
                }
            }
        }
    }
}
