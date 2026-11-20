// Apple Watch のアプリ。iPhone のウィジェットと同じレンジ(RangeCore.swift・PokerARTRanges.json を同梱)を、時計の上で見る。
// 上に表、その下で「MTT / Cash・スタック・誰のオープンに対して・自分の席」を選ぶ(Digital Crown でスクロール)。
// 通信しないので、iPhone が近くになくても見られる。最後に見た場面を覚えておく。
// watchOS 10 以上。

import SwiftUI

@main
struct PokerARTWatchApp: App {
    var body: some Scene {
        WindowGroup { WatchRangeView() }
    }
}

struct WatchRangeView: View {
    @AppStorage("w.mode") private var mode = "mtt"
    @AppStorage("w.stack") private var stack = 100
    @AppStorage("w.opener") private var opener = ""
    @AppStorage("w.hero") private var hero = "BTN"

    private var sel: RangeSelection {
        RangeSelection(mode: mode, stack: stack, opener: opener, hero: hero).normalized(RangeFile.shared)
    }

    var body: some View {
        let s = sel
        let spot = s.spot(RangeFile.shared)
        let stacks = RangeFile.shared?.modes[s.mode]?.stacks ?? [100]
        let oi = allPositions.firstIndex(of: s.opener) ?? -1
        let heroes = allPositions.enumerated().filter { s.opener.isEmpty ? $0.offset < 7 : $0.offset > oi }.map(\.element)

        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                Text(s.title).font(.system(size: 14, weight: .black, design: .monospaced))
                Text("\(s.modeLabel) \(s.stack)bb").font(.system(size: 11, weight: .bold, design: .monospaced)).opacity(0.65)
                if let spot {
                    RangeGrid(spot: spot, showLabels: false, gap: 0.5)
                        .aspectRatio(1, contentMode: .fit)
                    FrequencyBar(spot: spot)
                } else {
                    Text("この場面のデータはありません").font(.footnote)
                }

                Picker("種類", selection: Binding(get: { s.mode }, set: { mode = $0 })) {
                    Text("MTT").tag("mtt")
                    Text("Cash").tag("cash")
                }
                Picker("スタック", selection: Binding(get: { s.stack }, set: { stack = $0 })) {
                    ForEach(stacks, id: \.self) { Text("\($0)bb").tag($0) }
                }
                Picker("相手のオープン", selection: Binding(get: { s.opener }, set: { opener = $0 })) {
                    Text("なし").tag("")
                    ForEach(allPositions.dropLast(), id: \.self) { Text($0).tag($0) }
                }
                Picker("自分の席", selection: Binding(get: { s.hero }, set: { hero = $0 })) {
                    ForEach(heroes, id: \.self) { Text($0).tag($0) }
                }
            }
            .foregroundStyle(ivory)
        }
        .background(inkBlack)
    }
}
