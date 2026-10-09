// このファイルは生成物です。手で書き換えないこと。
// 元: packages/engine/knowledge/*.md / 作り直し: pnpm --filter @meta-geo/engine run knowledge
import type { ArticleRule } from "./articleRules.js";

export const ARTICLE_RULES: readonly ArticleRule[] = [
  {
    "id": "icm-bvb-sb-limp-good",
    "article": "ICM とブラインドバトル: SB の戦い方",
    "sourceUrl": "https://blog.gtowizard.com/icm-and-blind-battles-the-small-blind/",
    "title": "ICM 下の BvB: SB はリンプでポットを小さく",
    "summary": "プレッシャーのかかる場面の BvB で SB リンプ、いい選択だよ。ICM が強いほど SB はレイズを減らして、リンプでポットを小さく保つのが GTO でも主流なんだ。",
    "body": "ICM は全体の打ち方を保守的にするから、SB まで全員降りてくる BvB が増えて、ここの打ち方が成績に直結する。均衡の柱は2つ。リンプ/チェックでポットを小さく保つことと、オールインで降ろすこと。リスクプレミアムが大きいほど、SB のオープンレイズは大きく減って、バブルや最終卓ではほぼ「リンプかフォールド」になる。小さめのオフスートのブロードウェイや中くらいのスーテッドは、レイズからリンプへ移るよ。OOP の SB がポットを大きくするのは特に損なんだ。",
    "grade": "good",
    "keepGto": true,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "SB"
      ],
      "blindVsBlind": true,
      "preflopSpot": [
        "unopened"
      ],
      "icmStage": [
        "nearBubble",
        "bubble",
        "finalTable"
      ],
      "effStackBb": {
        "min": 22
      },
      "action": [
        "call"
      ]
    }
  },
  {
    "id": "icm-bvb-sb-raise-polar",
    "article": "ICM とブラインドバトル: SB の戦い方",
    "sourceUrl": "https://blog.gtowizard.com/icm-and-blind-battles-the-small-blind/",
    "title": "ICM 下の BvB: SB のレイズは狭くポラライズ",
    "summary": "ICM 下の BvB で SB からレイズするなら、レンジは狭くポラライズに。バリューは大きいペア・スーテッドエース・スーテッドブロードウェイ、ブラフは低めのスーテッド。中くらいの手はリンプに回そうね。",
    "body": "40bb・ICM 下の SB のレイズは狭くてポラライズ。バリューは一番大きいペア、スーテッドエース、スーテッドブロードウェイだけで、ブラフには低めのスーテッドと高めのオフスートを混ぜる。たとえば T3s は T6s より良いブラフ。コールされたときは弱いけど、3ベットされたときに迷わず降りられるからだよ。小さめのオフスートのブロードウェイと中くらいのスーテッドはリンプへ、レイズ→フォールドには強すぎる中くらいの手は、浅くなったらオールインへ移る。",
    "grade": null,
    "keepGto": true,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "SB"
      ],
      "blindVsBlind": true,
      "preflopSpot": [
        "unopened"
      ],
      "icmStage": [
        "nearBubble",
        "bubble",
        "finalTable"
      ],
      "effStackBb": {
        "min": 22
      },
      "action": [
        "raise2-5",
        "raise5+"
      ]
    }
  },
  {
    "id": "icm-bvb-sb-short-shove",
    "article": "ICM とブラインドバトル: SB の戦い方",
    "sourceUrl": "https://blog.gtowizard.com/icm-and-blind-battles-the-small-blind/",
    "title": "20bb 前後の BvB: SB のオープンシャブは主力",
    "summary": "{effBb}bb の BvB で SB からシャブ、理にかなってるよ。この深さだとオープンシャブが SB の主な武器で、ICM で BB は降りやすいんだ。",
    "body": "スタックが 20bb 前後まで浅くなると、SB はコールや小さいレイズより、シャブかフォールドを選ぶ。直感に反して、オープンシャブは低リスクな選択なんだ。シャブのレンジの中心は、ブロッカーを持つ中くらいの強さの手。3bb のレイズはよりポラライズ(大きいペア・スーテッドエース・小さいスーテッド・大きめのオフスート)、リンプはややポラライズ。カバーされている側でも、BB の方がリスクプレミアムで降りやすいから、積極的にシャブっていいよ。",
    "grade": "good",
    "keepGto": true,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "SB"
      ],
      "blindVsBlind": true,
      "preflopSpot": [
        "unopened"
      ],
      "effStackBb": {
        "min": 12,
        "max": 26
      },
      "action": [
        "allIn"
      ]
    }
  },
  {
    "id": "icm-bvb-sb-aa-limp",
    "article": "ICM とブラインドバトル: SB の戦い方",
    "sourceUrl": "https://blog.gtowizard.com/icm-and-blind-battles-the-small-blind/",
    "title": "BvB の AA はリンプに向かない",
    "summary": "AA のリンプはもったいないよ。AA は BB のレイズのレンジをブロックしちゃうから、リンプしてもレイズしてもらいにくいんだ。",
    "body": "ICM 下の BvB では SB のリンプが増えるけど、AA はリンプに向かない手。BB が SB のリンプにレイズしてくるレンジを AA がブロックしてしまうので、リンプ→レイズでチップを増やす機会が減る。AA はレイズ(浅ければオールイン)で、自分からポットを作ろう。",
    "grade": "inaccuracy",
    "keepGto": true,
    "priority": 5,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "SB"
      ],
      "blindVsBlind": true,
      "preflopSpot": [
        "unopened"
      ],
      "heroHand": [
        "AA"
      ],
      "action": [
        "call"
      ]
    }
  },
  {
    "id": "icm-bvb-bb-vs-limp-keep-raising",
    "article": "ICM とブラインドバトル: SB の戦い方",
    "sourceUrl": "https://blog.gtowizard.com/icm-and-blind-battles-the-small-blind/",
    "title": "SB のリンプには、BB はしっかりレイズを混ぜる",
    "summary": "SB のリンプに対して、BB は ICM 下でもレイズをあまり減らさなくていいよ。コールと3ベットを混ぜて、SB に手を読ませないようにしよう。",
    "body": "ICM がかかると SB のレイズ頻度は大きく下がるけど、BB のレイズ頻度はそれほど下がらない。BB はどの段階でもしっかりレイズする。BB がコールとレイズを混ぜることで、SB はリンプするかどうかを単純な基準で決められなくなる。強い手はもちろん、ブロッカーのある手もアイソレートに使おう。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "BB"
      ],
      "blindVsBlind": true,
      "preflopSpot": [
        "vsLimp"
      ],
      "action": [
        "raise2-5",
        "raise5+",
        "allIn"
      ]
    }
  },
  {
    "id": "icm-bvb-sb-oop-big-pot",
    "article": "ICM とブラインドバトル: SB の戦い方",
    "sourceUrl": "https://blog.gtowizard.com/icm-and-blind-battles-the-small-blind/",
    "title": "OOP の SB は大きいポットを作らない",
    "summary": "BvB の SB は OOP。ポストフロップで大きく打ってポットを膨らませるのは、エクイティを実現しにくい SB には特に損だよ。",
    "body": "OOP の SB にとって、ポットを大きくするのは特に悪い。後から行動する BB の方がエクイティを実現しやすく、SB はポットをコントロールしにくいから。ICM がかかればなおさら。大きく打つのは、ナッツ級か、相手を確実に降ろしたいはっきりした理由があるときだけにしよう。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop",
        "turn"
      ],
      "heroPos": [
        "SB"
      ],
      "blindVsBlind": true,
      "inPosition": false,
      "icmStage": [
        "nearBubble",
        "bubble",
        "finalTable"
      ],
      "action": [
        "bet80-100",
        "bet100+"
      ]
    }
  },
  {
    "id": "bvb-bb-defend-wide",
    "article": "MTT のブラインドヘッズ(BvB)をうまく制する",
    "sourceUrl": "https://note.com/kakip4952/n/n59ddeabb2cd5",
    "title": "BvB の BB は広く守る",
    "summary": "{hand} を BvB の BB で降りるのはもったいないかも。SB のオープンは広いから、ポジションのある BB は広めに守るのが基本だよ。",
    "body": "BvB は SB が OOP で、お互いのレンジがとても広い特殊な局面。BB は IP を活かして多くのハンドでアクションできる。目安として、SB のオープン 25% に対して BB は 45% 前後をコールし、11% 前後を3ベットする(40bb・プライズの目安)。スーテッドエース、ブロードウェイ、ポケットペア、スーテッドコネクターのような手は、ポジションがある分だけ守る価値が高いよ。",
    "grade": null,
    "keepGto": true,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "BB"
      ],
      "blindVsBlind": true,
      "preflopSpot": [
        "vsOpen"
      ],
      "effStackBb": {
        "min": 20
      },
      "action": [
        "fold"
      ],
      "heroHand": [
        "22+",
        "A2s+",
        "K7s+",
        "Q8s+",
        "J8s+",
        "T8s+",
        "97s+",
        "86s+",
        "75s+",
        "65s",
        "54s",
        "A8o+",
        "KTo+",
        "QTo+",
        "JTo"
      ]
    }
  },
  {
    "id": "bvb-sb-postflop-small-pot",
    "article": "MTT のブラインドヘッズ(BvB)をうまく制する",
    "sourceUrl": "https://note.com/kakip4952/n/n59ddeabb2cd5",
    "title": "BvB の SB はポストフロップを小さく",
    "summary": "BvB の SB は OOP。アンティでポットが大きい後半ほど、OOP のミスは高くつくよ。C ベットは小さめと、チェックを増やして、ポットをコントロールしよう。",
    "body": "BvB は SB が OOP で、アンティ込みでポットが大きく、お互いのレンジがとても広い。アンティが上がる後半ほど OOP でのミスのコストが大きくなるので、C ベットの頻度を少し落として、チェックで小さいポットを保つのが基本。打つなら 1/3 ポットくらいの小さいサイズが中心になるよ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "heroPos": [
        "SB"
      ],
      "blindVsBlind": true,
      "inPosition": false,
      "potType": [
        "srp",
        "limped"
      ],
      "action": [
        "bet60-80",
        "bet80-100",
        "bet100+"
      ]
    }
  },
  {
    "id": "bvb-sb-vs-big-3bet-jam-or-fold",
    "article": "MTT のブラインドヘッズ(BvB)をうまく制する",
    "sourceUrl": "https://note.com/kakip4952/n/n59ddeabb2cd5",
    "title": "BvB で大きい3ベットを受けたら、4ベットシャブかフォールド",
    "summary": "BvB で大きい3ベットを受けたら、コールして OOP でポストフロップを戦うより、4ベットシャブかフォールドで決着させる方がいいよ。",
    "body": "BB の3ベットが 7bb を超えるような大きさなら、コミットしているかブラフかの二極になりやすい。OOP の SB がコールすると、低い SPR で難しいポストフロップを OOP で戦うことになる。強い手は4ベットシャブ、それ以外はフォールドで決着させよう。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "SB"
      ],
      "blindVsBlind": true,
      "preflopSpot": [
        "vs3bet"
      ],
      "facingSizeBb": {
        "min": 7
      },
      "effStackBb": {
        "max": 45
      },
      "action": [
        "call"
      ]
    }
  },
  {
    "id": "river-bluffcatch-bluff-ratio",
    "article": "ブラフキャッチとブロッカー(ブロッカーより大事なこと)",
    "sourceUrl": "https://kihara-poker.hatenablog.com/entry/2021/05/24/112024",
    "title": "リバーのブラフキャッチは「相手のブラフの割合」で決める",
    "summary": "リバーの大きいベットへのブラフキャッチは、ブロッカーより「相手がどれくらいブラフを打つか」が本質だよ。ブラフ:バリューが 1:2 より多い相手ならコール、少ない相手ならフォールドが基本。",
    "body": "ポットサイズのベットにコールするなら、相手のベットのうち 33% 以上がブラフである必要がある(ブラフ:バリュー = 1:2)。上手い相手はほぼこの割合でブラフを打つけど、多くの相手はここから外れる。ブロッカーを持っていても、相手のブラフの割合は 2〜4% 上がる程度。相手のレンジにそもそも何のコンボがあるか、バリューのレンジはどこまでか、そして過去のプレイからブラフを打つ人かどうか。この3つでコールかフォールドかを決めよう。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "river"
      ],
      "facingBet": true,
      "facingPotPct": {
        "min": 60
      },
      "made": [
        "topPair",
        "middlePair",
        "bottomPair",
        "pocketPairBelow",
        "highCard",
        "overPair"
      ]
    }
  },
  {
    "id": "comfy-bets-top-pair-third-barrel",
    "article": "心地よいベット数を意識しよう",
    "sourceUrl": "https://kihara-poker.hatenablog.com/entry/2020/10/30/151503",
    "title": "トップペアの心地よいベット数は2回",
    "summary": "トップペアの心地よいベット数はだいたい2回。リバーまで3回打つと、コールしてくるのは勝っている手ばかりになりやすいよ。リバーはチェックしてショーダウンを目指そう。",
    "body": "KT を K-5-3 で持っているようなトップペア(キッカーがトップではない)は、フロップとターンの2回打つのが心地よい。3回目のベットにコールしてくる相手のレンジに対しては、勝っている確率が 50% を切ってしまう。リバーはチェックして、相手のベットには状況に応じて対応しよう。逆に AA のようなオーバーペアやセットなら、3回打ち切っていいよ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "river"
      ],
      "role": [
        "riverBarrel"
      ],
      "made": [
        "topPair"
      ],
      "kicker": [
        "good",
        "low"
      ],
      "action": [
        "bet40-60",
        "bet60-80",
        "bet80-100",
        "bet100+",
        "allIn"
      ]
    }
  },
  {
    "id": "comfy-bets-overpair-three-streets",
    "article": "心地よいベット数を意識しよう",
    "sourceUrl": "https://kihara-poker.hatenablog.com/entry/2020/10/30/151503",
    "title": "オーバーペアは3回打ち切る",
    "summary": "オーバーペアの心地よいベット数は3回。ここでリバーも打ち切って、相手のトップペアからしっかりバリューを取ろう。",
    "body": "AA を K-5-3 で持つようなオーバーペアは、3回打って全部コールされても、相手の K から大きなバリューが取れる。相手にレイズされて4回目に直面しても「心地よい数 +1」なので、コールは有力。ボードが大きく変わらない限り、3ストリートのバリューを狙おう。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "river"
      ],
      "role": [
        "riverBarrel"
      ],
      "made": [
        "overPair"
      ],
      "boardPaired": false,
      "boardFlushPossible": false
    }
  },
  {
    "id": "comfy-bets-overcard-turn-check",
    "article": "心地よいベット数を意識しよう",
    "sourceUrl": "https://kihara-poker.hatenablog.com/entry/2020/10/30/151503",
    "title": "ターンのオーバーカードで、心地よいベット数が減る",
    "summary": "ターンにオーバーカードが落ちて、自分の手は2番手のペアになった。心地よいベット数が1回に減ったから、ここはチェックでポットを小さく保とう。",
    "body": "KT を K-6-4 で持っていてターンに A が落ちると、心地よいベット数は 2 回から 1 回に減る。打っても降りてくれるのは弱い手ばかりで、コールしてくるのは勝っている手が多くなる。ボードが変わったら、手の相対的な強さを見直そう。逆に T が落ちてツーペアになれば、心地よいベット数は 4 回に増えるよ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "turn"
      ],
      "boardChange": [
        "overcard"
      ],
      "made": [
        "middlePair"
      ],
      "facingBet": false,
      "action": [
        "bet40-60",
        "bet60-80",
        "bet80-100",
        "bet100+"
      ]
    }
  },
  {
    "id": "comfy-bets-draw-raise-vs-one-bet",
    "article": "心地よいベット数を意識しよう",
    "sourceUrl": "https://kihara-poker.hatenablog.com/entry/2020/10/30/151503",
    "title": "ドローのレイズは、相手の心地よいベット数を外すため",
    "summary": "ドローでのレイズは、相手の「心地よいベット数」を外すためのもの。1回しか打ちたくない手(AQ のようなトップペア未満)にはよく効くよ。",
    "body": "75 を K-6-4 で持つようなドローには、自分の心地よいベット数の考え方は当てはまらない。代わりに相手の心地よいベット数を外す。相手が AQ のように1回しか打ちたくない手なら、レイズで相手の手の価値を最小にできる。相手が 44(セット)のように何回でも打ちたい手なら、レイズはせずにドローの完成を待とう。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop",
        "turn"
      ],
      "facingBet": true,
      "made": [
        "highCard"
      ],
      "anyDraw": [
        "openEnded",
        "flushDraw",
        "nutFlushDraw"
      ],
      "action": [
        "bet40-60",
        "bet60-80",
        "bet80-100",
        "bet100+",
        "allIn"
      ]
    }
  },
  {
    "id": "cold-3bet-bb-call-weak",
    "article": "3ベットにコールドコールすべき場面はあるのか(コールド4ベットの考え方)",
    "sourceUrl": "https://blog.gtowizard.com/should-you-ever-cold-call-a-3-bet/",
    "title": "レイズ+3ベットの前でのコールドコール",
    "summary": "オープンと3ベットが両方入ってるところに、このハンドでコールはしんどいよ。4ベットするほど強くないなら、ポットを争うほど強くもないんだ。",
    "body": "前にレイズと3ベットがある場面では、ポジションやスタックに関係なく極めてタイトに打つのが基本。条件が一番良いBTNでも90%以上、悪ければ97%弱をフォールドする。BBのコールドコールは、100bbでもスーテッドブロードウェイと99〜QQのようなミドルポケットペアが中心で、それ以外はほとんど出てこない。キャップされていないオリジナルレイザーがまだ後ろに控えているし、スクイーズされても降りるしかない。続行するなら基本は4ベット、そうでなければフォールドしようね。",
    "grade": "inaccuracy",
    "keepGto": true,
    "priority": 10,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "BB"
      ],
      "preflopSpot": [
        "vs3bet"
      ],
      "action": [
        "call"
      ],
      "heroHand": [
        "22-88",
        "A2s-ATs",
        "A2o-AJo",
        "K2s-KJs",
        "K2o-KQo",
        "Q2s-QJs",
        "Q2o-QJo",
        "J2s-JTs",
        "J2o-JTo",
        "T9s",
        "98s",
        "87s",
        "76s",
        "65s",
        "54s"
      ],
      "heroFirstAction": true
    }
  },
  {
    "id": "cold-3bet-call-not-low-variance-icm",
    "article": "3ベットにコールドコールすべき場面はあるのか(コールド4ベットの考え方)",
    "sourceUrl": "https://blog.gtowizard.com/should-you-ever-cold-call-a-3-bet/",
    "title": "ICM下の3ベットへのコールは低分散ではない",
    "summary": "3ベットにコールするのは安全策に見えるけど、実はショーダウンが増える分だけ荒れるんだ。ICMが効く場面はレイズかフォールドで考えようね。",
    "body": "4ベットすべきハンドをコールで済ませる理由として多いのが「大きいポットやプリフロップのオールインを避けたい」というもの。でもICMシミュレーションでは、コールが減ってレイズかフォールドが増えるのが普通。分散の最大の源はショーダウンで、コールするとショーダウンに行く可能性が上がるからだよ。フォールドは結果が確定していて、レイズは相手を降ろせれば確定した結果になる。強いハンドのコールは大きいポットを狙ってポットを失うリスクを増やし、弱いハンドのコールは小〜中のポットを頻繁に失って時々大勝ちする形になるので、どちらもICMの方向と逆なんだ。",
    "grade": null,
    "keepGto": false,
    "priority": 5,
    "when": {
      "street": [
        "preflop"
      ],
      "preflopSpot": [
        "vs3bet"
      ],
      "action": [
        "call"
      ],
      "icmStage": [
        "nearBubble",
        "bubble",
        "finalTable"
      ],
      "heroFirstAction": true
    }
  },
  {
    "id": "cold-4bet-premium-good",
    "article": "3ベットにコールドコールすべき場面はあるのか(コールド4ベットの考え方)",
    "sourceUrl": "https://blog.gtowizard.com/should-you-ever-cold-call-a-3-bet/",
    "title": "3ベットに直面したら強いハンドは4ベット",
    "summary": "このハンドなら4ベットがいいね。続行するときは主に4ベット、相手に安くドローさせる理由はないよ。",
    "body": "レイズや3ベットに直面して続行するときは、主に4ベットで行くのが基本。続行するほど強さを見せるなら、相手にタダや安い値段で逆転のチャンスを与えたくない。4ベットはオリジナルレイザーの広いオープンレンジも押し出せて、そのフォールドエクイティは4ベットのサイズにほとんど関係しない。サイズは小さくてよく、100bbなら8bbの3ベットに対してIPで20bb、OOPで21bb程度。小さい4ベットでもフロップのSPRは十分低くなるので、ハイポケットペアは多くのフロップで楽にスタックオフできるんだ。",
    "grade": "good",
    "keepGto": true,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "preflopSpot": [
        "vs3bet"
      ],
      "action": [
        "raise5+",
        "allIn"
      ],
      "heroHand": [
        "QQ+",
        "AKs",
        "AKo"
      ],
      "heroFirstAction": true
    }
  },
  {
    "id": "cold-4bet-small-sizing-shallow",
    "article": "3ベットにコールドコールすべき場面はあるのか(コールド4ベットの考え方)",
    "sourceUrl": "https://blog.gtowizard.com/should-you-ever-cold-call-a-3-bet/",
    "title": "浅めのスタックでの4ベットは小さく",
    "summary": "40bb前後なら4ベットは12〜13bbくらいの小さめで十分だよ。オールインに降りられる余地を残すのがポイントなんだ。",
    "body": "4ベットを3ベットと同じく3〜4倍で打つ必要はない。40bbでは6.3bbの3ベットに対してIPで12bb、OOPで13bbが目安。これは「オールインに降りられる最大のサイズ」で、それ以上入れるとオールインへのコールにプライスインされ、AQoのような薄い4ベットが打てなくなる。OOPでは、レンジの中間をオールイン・最強ハンドと最弱部分を小さい4ベットに分ける分割戦略もよく使われる。コールド4ベットのレンジはリニアで、オールインに降りるハンドもブラフではなく、コールされたときに戦えるエクイティを持つハンドだよ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "preflopSpot": [
        "vs3bet"
      ],
      "action": [
        "raise5+"
      ],
      "effStackBb": {
        "min": 25,
        "max": 60
      },
      "heroFirstAction": true
    }
  },
  {
    "id": "cold-4bet-icm-small-fold-to-shove",
    "article": "3ベットにコールドコールすべき場面はあるのか(コールド4ベットの考え方)",
    "sourceUrl": "https://blog.gtowizard.com/should-you-ever-cold-call-a-3-bet/",
    "title": "ICM下では小さい4ベット→オールインに降りる選択肢がある",
    "summary": "ICMが効く場面だと、小さく4ベットしてオールインにはフォールドするラインも成立するんだ。手元に残るチップの方が価値が高いからだよ。",
    "body": "25bb・フィールド残り25%の例では、SBが10bbに4ベットして25bbのオールインにはフォールドするレンジを持つ。cEVならどのハンドでもオールインへのコールにプライスインされるので、このレイズはせず自分からオールインする。ICMではスタックに残るチップの方がポット内のチップより価値が高く、ICMの現金価値で見るとコールオッズはそれほど良くないので、降りる余地が残る。これらはブラフではなく、4ベットがコールされたときに戦えるハンドだよ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "preflopSpot": [
        "vs3bet"
      ],
      "action": [
        "raise5+"
      ],
      "effStackBb": {
        "min": 15,
        "max": 40
      },
      "icmStage": [
        "nearBubble",
        "bubble",
        "itm",
        "finalTable"
      ],
      "heroFirstAction": true
    }
  },
  {
    "id": "cold-3bet-bb-aa-trap-mid-stack",
    "article": "3ベットにコールドコールすべき場面はあるのか(コールド4ベットの考え方)",
    "sourceUrl": "https://blog.gtowizard.com/should-you-ever-cold-call-a-3-bet/",
    "title": "60bb前後のBBはAAでコールドコールもある",
    "summary": "60bbくらいならAAでコールドコールしてもいいね。SPRが低いからほとんどのフロップでナッツとして扱えるんだ。",
    "body": "BTNオープン+SB 3ベットに対するBBのコールドコールは、100bbではスーテッドブロードウェイやミドルポケットペアが中心だけど、60bbではAAが中心になる。これは弱めのハンドでエクイティを実現するためではなく、ナッツで相手をポットから追い出したくないから。60bbならコール後のSPRが十分低く、ほとんどのフロップでAAをナッツとして扱える(100bbではそうはいかない)。30bbでもAAが最有力のコールドコール候補になるよ。",
    "grade": "good",
    "keepGto": true,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "BB"
      ],
      "preflopSpot": [
        "vs3bet"
      ],
      "action": [
        "call"
      ],
      "heroHand": [
        "AA"
      ],
      "effStackBb": {
        "min": 50,
        "max": 75
      },
      "heroFirstAction": true
    }
  },
  {
    "id": "cold-3bet-bb-deep-suited-pairs",
    "article": "3ベットにコールドコールすべき場面はあるのか(コールド4ベットの考え方)",
    "sourceUrl": "https://blog.gtowizard.com/should-you-ever-cold-call-a-3-bet/",
    "title": "100bbのBBのコールドコールはスーテッドブロードウェイとミドルポケットペア",
    "summary": "100bbのBBでコールドコールするなら、スーテッドブロードウェイや99〜QQみたいなハンドが中心だよ。マルチウェイでもエクイティを保ちやすいからなんだ。",
    "body": "100bbでBTNオープン+SB 3ベットに対するBBのコールドコールは、BTNのそれと似ていて、スーテッドブロードウェイとミドルポケットペアが中心。これらは生のエクイティが高く、マルチウェイポットでもエクイティを保ちやすい。その他の低頻度のコールはボードカバレッジのため。最強ハンドは基本4ベットに回り、ブロッカーの良い一部のハンドも4ベットに回る。相手のオープン位置が早くなるほど(COやHJのオープンにSBが3ベットなど)、コールドコールはすぐに減るよ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "BB"
      ],
      "preflopSpot": [
        "vs3bet"
      ],
      "action": [
        "call"
      ],
      "heroHand": [
        "99-QQ",
        "AQs",
        "AJs",
        "KQs",
        "KJs",
        "QJs"
      ],
      "effStackBb": {
        "min": 75
      },
      "heroFirstAction": true
    }
  },
  {
    "id": "ss-icm-weak-shove-to-minraise-fold",
    "article": "MTTのショートスタック戦略(ICM下のオープン・ブラインド防衛・BTNでの対応)",
    "sourceUrl": "https://blog.gtowizard.com/short-stacked-play-in-mtts/",
    "title": "ICM下の弱いオールイン候補はミニレイズ・フォールド",
    "summary": "ICMが効く10〜13bbなら、この手はオールインよりミニレイズして再レイズに降りる形がいいね。最後のチップを守れるんだ。",
    "body": "フィールド残り25%のICM(BTN 10bb・SB 21bb・BB 53bb)では、BTNのVPIPはcEVとほぼ同じ(60.6% vs 60.1%)なのに、オールインは33.9%→30.2%に減り、ミニレイズが5.5%→9.7%に増える。J7s・Q6s・Q9oのようにcEVでほぼオールインするハンドが、ICMではミニレイズして再レイズに降りる側に回る。最後のチップが特に価値が高いので、降りる余地を残す方が得なんだ。13bbでもミニレイズ13.1%→18.4%、オールイン25%→20.6%と同じ方向に動く。",
    "grade": "good",
    "keepGto": true,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "CO",
        "BTN"
      ],
      "preflopSpot": [
        "unopened"
      ],
      "action": [
        "raise2-5"
      ],
      "effStackBb": {
        "min": 9,
        "max": 15
      },
      "icmStage": [
        "nearBubble",
        "bubble"
      ],
      "heroHand": [
        "J7s",
        "Q6s",
        "Q9o"
      ]
    }
  },
  {
    "id": "ss-icm-minraise-induce-strong",
    "article": "MTTのショートスタック戦略(ICM下のオープン・ブラインド防衛・BTNでの対応)",
    "sourceUrl": "https://blog.gtowizard.com/short-stacked-play-in-mtts/",
    "title": "ICM下の強いハンドはミニレイズで誘う",
    "summary": "99やAQsみたいな強い手は、ミニレイズしてドミネートしてる手のオールインを誘うのもアリだよ。ミニレイズ・フォールドが増える分、強い手も混ぜられるんだ。",
    "body": "ICM下ではレンジ下限の弱いハンドがミニレイズ・フォールドに回るので、ミニレイズのレンジに強いハンドを混ぜて価値を取る余地が生まれる。99やAQsはミニレイズして、ドミネートしているハンドのオールインを誘い出せる。さらにBBが大きいスタックだと、SBは簡単にオールインできず、コールや小さい3ベットならこちらのエクイティ実現が楽になる。13bbでは77・88・AJo・AQo・ATs・AJsも、ブラインドの1人とならオールインしたいがSB 3ベット+BBオールインなら降りる、という形でレイズするよ。",
    "grade": "good",
    "keepGto": true,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "CO",
        "BTN"
      ],
      "preflopSpot": [
        "unopened"
      ],
      "action": [
        "raise2-5"
      ],
      "effStackBb": {
        "min": 9,
        "max": 15
      },
      "icmStage": [
        "nearBubble",
        "bubble"
      ],
      "heroHand": [
        "99",
        "AQs",
        "77-88",
        "AJo",
        "AQo",
        "ATs",
        "AJs"
      ]
    }
  },
  {
    "id": "ss-icm-utg-10bb-raise-fold",
    "article": "MTTのショートスタック戦略(ICM下のオープン・ブラインド防衛・BTNでの対応)",
    "sourceUrl": "https://blog.gtowizard.com/short-stacked-play-in-mtts/",
    "title": "UTG 10bbはICM下でミニレイズが増える",
    "summary": "UTGの10bbは後ろに人が多いから、ICM下だとオールインを減らしてミニレイズで降りられる余地を作るんだ。",
    "body": "アーリーポジションでは、後ろの複数人が参加してきたときに本来強いハンドでも降りられることを、ICMモデルがさらに重視する。UTG 10bbで、対称スタックのcEVはオールイン11.4%・レイズ4.2%だけど、混合スタック・フィールド残り25%のICMではオールイン8%・ミニレイズ7.1%になる。スタックの20%を入れて降りるのは損に見えるけど、残った80%と最後の1枚の価値を守れる機会と考えようね。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "UTG",
        "HJ"
      ],
      "preflopSpot": [
        "unopened"
      ],
      "action": [
        "raise2-5",
        "allIn"
      ],
      "effStackBb": {
        "min": 8,
        "max": 13
      },
      "icmStage": [
        "nearBubble",
        "bubble"
      ]
    }
  },
  {
    "id": "ss-icm-sb-call-vs-open",
    "article": "MTTのショートスタック戦略(ICM下のオープン・ブラインド防衛・BTNでの対応)",
    "sourceUrl": "https://blog.gtowizard.com/short-stacked-play-in-mtts/",
    "title": "ICM下のSBのショートはコールしない",
    "summary": "ICMが効く場面のSBショートで、オープンにコールするのはロングショット狙いになっちゃうよ。争うならオールイン、そうでなければフォールドしようね。",
    "body": "cEVではSB 11bbがCOの2.1bbオープンに対してかなりコールする。安くフロップが見られるポットオッズのコールだけど、勝つより負ける方が多いロングショットなんだ。ICMでは得るチップより失うチップの価値が高いので、少しずつ頻繁に失って時々大きく勝つ形は割に合わない。フィールド残り25%のICMではSBはほぼ一切コールせず、cEVと同じハンド(+いくつか)をオールインし、投機的なハンドは単に降りる。",
    "grade": "inaccuracy",
    "keepGto": true,
    "priority": 10,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "SB"
      ],
      "preflopSpot": [
        "vsOpen"
      ],
      "action": [
        "call"
      ],
      "effStackBb": {
        "min": 6,
        "max": 16
      },
      "icmStage": [
        "nearBubble",
        "bubble"
      ]
    }
  },
  {
    "id": "ss-icm-bb-call-small-offsuit",
    "article": "MTTのショートスタック戦略(ICM下のオープン・ブラインド防衛・BTNでの対応)",
    "sourceUrl": "https://blog.gtowizard.com/short-stacked-play-in-mtts/",
    "title": "ICM下のBBはハイ+ローのオフスート(Qx・Jx)を降ろす",
    "summary": "BBでもICMが効くなら、小さいオフスートのQxやJxのコールは減らしたいね。勝つ頻度の低いコールは割に合わないんだ。",
    "body": "BBではICMでもポットオッズを無視できないけど、フィールド残り25%のICMはcEVよりコールが少ない。BB 14bb vs COオープンで、増えるフォールドは主にハイ+ローのオフスート(Qx・Jx)。一方でcEVがトラップとしてコールするスーテッドAxやブロードウェイの一部は、ICMではオールインに回してその場でポットを取りに行く。",
    "grade": "inaccuracy",
    "keepGto": true,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "BB"
      ],
      "preflopSpot": [
        "vsOpen"
      ],
      "action": [
        "call"
      ],
      "effStackBb": {
        "min": 8,
        "max": 18
      },
      "icmStage": [
        "nearBubble",
        "bubble"
      ],
      "heroHand": [
        "Q2o-Q7o",
        "J2o-J7o"
      ]
    }
  },
  {
    "id": "ss-icm-bb-shove-instead-of-trap",
    "article": "MTTのショートスタック戦略(ICM下のオープン・ブラインド防衛・BTNでの対応)",
    "sourceUrl": "https://blog.gtowizard.com/short-stacked-play-in-mtts/",
    "title": "ICM下のBBはトラップより今ポットを取る",
    "summary": "このハンドはICM下ならオールインでその場のポットを取りに行くのがいいね。明日の百より今日の五十なんだ。",
    "body": "cEVではBB 14bbがCOのオープンに対し、スーテッドAxやブロードウェイの多くをコールする。COのレンジにドミネートされたハンドを残すためのトラップだね。ICM(フィールド残り25%)ではこれらをオールインに回し、フロップ後にもっと勝てる可能性を手放してでもその場でポットを取る。得るチップより失うチップの価値が高いので、確実に小さく勝つ方が良いんだ。",
    "grade": "good",
    "keepGto": true,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "BB"
      ],
      "preflopSpot": [
        "vsOpen"
      ],
      "action": [
        "allIn"
      ],
      "effStackBb": {
        "min": 8,
        "max": 18
      },
      "icmStage": [
        "nearBubble",
        "bubble"
      ],
      "heroHand": [
        "A2s-AKs",
        "KTs+",
        "QTs+",
        "JTs"
      ]
    }
  },
  {
    "id": "ss-icm-btn-call-vs-ep-open",
    "article": "MTTのショートスタック戦略(ICM下のオープン・ブラインド防衛・BTNでの対応)",
    "sourceUrl": "https://blog.gtowizard.com/short-stacked-play-in-mtts/",
    "title": "ICM下のBTNはオープンにコールせずリニアにオールイン",
    "summary": "15bbくらいのBTNでICMが効くなら、オープンへのコールは安全策じゃないよ。続行するならオールインで勝つ機会を作ろうね。",
    "body": "cEVではBTN 15bbがアーリーのオープンにコール6.6%・オールイン8.5%とかなりコールする。でもフィールド残り25%のICMではオールイン頻度は同程度のまま、コールはほぼゼロになり、cEVでコールしていたスーテッドブロードウェイが全部オールインに入ってリニアなレンジになる。コールにはその場でポットを勝つ機会がなく、オールインなら降ろせたかショーダウンで勝てたポットを多く失う。cEVのコールはトラップで、安全策ではない。BBのオーバーコールも招きやすく、フロップでの改善やCベットでエクイティを否定されるリスクを抱えるんだ。",
    "grade": "inaccuracy",
    "keepGto": true,
    "priority": 10,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "BTN",
        "CO"
      ],
      "preflopSpot": [
        "vsOpen"
      ],
      "action": [
        "call"
      ],
      "effStackBb": {
        "min": 10,
        "max": 20
      },
      "icmStage": [
        "nearBubble",
        "bubble"
      ]
    }
  },
  {
    "id": "ss-extreme-short-push-or-fold",
    "article": "MTTのショートスタック戦略(ICM下のオープン・ブラインド防衛・BTNでの対応)",
    "sourceUrl": "https://blog.gtowizard.com/short-stacked-play-in-mtts/",
    "title": "4bb前後の極端なショートはオールインかフォールド",
    "summary": "4bbくらいまで短いなら、オープンはオールインかフォールドの二択だよ。ICMの圧力より、チップを増やす機会を逃さないことが大事なんだ。",
    "body": "極端なショートでは、cEVと中程度のICM(フィールド残り25%)の戦略がほとんど変わらない。4bbではどちらのモデルもオールインかフォールドのみで、UTGのオールインはcEV 30.3%、ICM 28.2%。待つ時間がなく、フォールドで入賞に逃げ込めないので、チップを増やす機会を取るしかない。ダブルアップ(ブラインド込みで実質トリプルに近い)できたら、そこから入賞まで保守的に生き残る意識に切り替えようね。",
    "grade": "inaccuracy",
    "keepGto": true,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "preflopSpot": [
        "unopened"
      ],
      "action": [
        "call",
        "raise2-5"
      ],
      "effStackBb": {
        "min": 0,
        "max": 5
      }
    }
  },
  {
    "id": "3bp-oop-cbet-range-advantage",
    "article": "3ベットポットでのOOPからのCベット",
    "sourceUrl": "https://blog.gtowizard.com/c-betting-oop-in-3-bet-pots/",
    "title": "3ベットポットのOOPはCベットが基本",
    "summary": "OOPでも3ベットポットなら、レンジが強いぶん積極的にCベットしていいんだ。SPRが低いからポジションの不利もあまり響かないよ。",
    "body": "OOPの3ベッターは、アクションをクローズできず後ろのオールインのリスクも負うので、IPのコーラーより強いレンジになる。40bbでUTGオープン→BB 3ベット→UTGコールなら、エクイティはBB 54.4% vs UTG 45.6%。SBからの3ベットならBBのコールド4ベットのリスクも負う分さらに強く、56.3% vs 43.7%。SPRが低いほど後のストリートの難しさが減り、IPのコールの価値も下がるので、小さいベットでもフォールドエクイティが取れる。SBはBBより少し強いレンジなので、小さいベットをより広く使えるよ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "heroPos": [
        "SB",
        "BB"
      ],
      "potType": [
        "threeBet"
      ],
      "heroPreflopAggressor": true,
      "inPosition": false,
      "multiway": false,
      "role": [
        "cbet"
      ]
    }
  },
  {
    "id": "3bp-oop-low-board-shallow-weak-pair-shove",
    "article": "3ベットポットでのOOPからのCベット",
    "sourceUrl": "https://blog.gtowizard.com/c-betting-oop-in-3-bet-pots/",
    "title": "浅い3ベットポットのローボードは脆いペアでオールイン",
    "summary": "SPRが1.5くらいのローボードなら、このペアはそのままオールインでいいよ。後のストリートを打つ必要がなくなるんだ。",
    "body": "40bbの3ベットポットでは654rのフロップでSPRが約1.5になり、OOPの3ベッターはほぼどんなペアもナッツとして扱える。K6のような脆いペアはそのままオールインして、ターン以降の難しい判断を消してしまえばいい。40bbではBBはBTN相手でもチェックレンジを持たないくらい、ベットが基本になるよ。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "potType": [
        "threeBet"
      ],
      "heroPreflopAggressor": true,
      "inPosition": false,
      "multiway": false,
      "spr": {
        "min": 0,
        "max": 2.5
      },
      "boardHighBand": [
        "L",
        "M"
      ],
      "boardPaired": false,
      "action": [
        "allIn",
        "bet80-100",
        "bet100+"
      ],
      "made": [
        "topPair",
        "middlePair",
        "bottomPair"
      ]
    }
  },
  {
    "id": "3bp-oop-low-board-shallow-overpair-small",
    "article": "3ベットポットでのOOPからのCベット",
    "sourceUrl": "https://blog.gtowizard.com/c-betting-oop-in-3-bet-pots/",
    "title": "浅い3ベットポットのローボードは強いペアで小さく",
    "summary": "SPRが低いローボードのオーバーペアは、小さくベットして相手のブラフレイズやフロートを誘うのがいいね。多くのターンでナッツとしてベットできるんだ。",
    "body": "40bbの3ベットポットの654rではSPRが約1.5で、OOPの3ベッターはほぼどんなペアもナッツ扱いできる。脆いペアはオールインで済ませ、より強いペアは小さくベットして相手のブラフレイズやフロートを誘う。そうしたアクションに対しても多くのターンでナッツとしてベットできるので、OOPでもプレイが単純になるよ。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "potType": [
        "threeBet"
      ],
      "heroPreflopAggressor": true,
      "inPosition": false,
      "multiway": false,
      "spr": {
        "min": 0,
        "max": 2.5
      },
      "boardHighBand": [
        "L",
        "M"
      ],
      "action": [
        "bet20-40"
      ],
      "made": [
        "overPair",
        "twoPair",
        "trips"
      ]
    }
  },
  {
    "id": "3bp-oop-low-board-shallow-check",
    "article": "3ベットポットでのOOPからのCベット",
    "sourceUrl": "https://blog.gtowizard.com/c-betting-oop-in-3-bet-pots/",
    "title": "浅い3ベットポットのローボードでチェックは少ない",
    "summary": "40bbくらいの3ベットポットでローボードなら、OOPでもチェックはほとんど出てこないよ。SPRが低くて打ちやすいんだ。",
    "body": "40bbの3ベットポット、654rでは、BBはBTN相手でもチェックレンジを持たない。SBもオールインこそ無いがチェックも無く、弱いペアは主に大きくベットする。SPRが約1.5なのでほぼどんなペアもナッツとして扱え、ポットを大きくするリスクが小さい。チェックで回すより、ベットでエクイティ優位を押し出そうね。",
    "grade": null,
    "keepGto": false,
    "priority": 5,
    "when": {
      "street": [
        "flop"
      ],
      "potType": [
        "threeBet"
      ],
      "heroPreflopAggressor": true,
      "inPosition": false,
      "multiway": false,
      "facingBet": false,
      "spr": {
        "min": 0,
        "max": 2.5
      },
      "boardHighBand": [
        "L",
        "M"
      ],
      "action": [
        "checkOrCall"
      ]
    }
  },
  {
    "id": "3bp-oop-low-board-deep-check-small",
    "article": "3ベットポットでのOOPからのCベット",
    "sourceUrl": "https://blog.gtowizard.com/c-betting-oop-in-3-bet-pots/",
    "title": "ディープな3ベットポットのローボードはチェックと小さいベット",
    "summary": "100bbの3ベットポットでローボードだと、SPRが4を超えるからチェックやごく小さいベットでポットを抑えるのが基本だよ。",
    "body": "100bbでは654rのフロップでSPRが4を超え、弱いペアでスタックオフするのは危うい。後のストリートも全般に打ちにくくなるので、BBはチェックとポット10%ベットを多用してポットを大きくしすぎない。SBは3ベットレンジがBBよりリニアなのでディープのローボードは苦手で、79%をチェックし、10%だけポットベットする。非常にディープなときだけ、ポジションの不利がチェックレンジを強いるんだ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "potType": [
        "threeBet"
      ],
      "heroPreflopAggressor": true,
      "inPosition": false,
      "multiway": false,
      "facingBet": false,
      "spr": {
        "min": 3.5
      },
      "boardHighBand": [
        "L",
        "M"
      ],
      "action": [
        "checkOrCall",
        "bet20-40"
      ]
    }
  },
  {
    "id": "3bp-oop-sb-deep-low-board-pot-bet",
    "article": "3ベットポットでのOOPからのCベット",
    "sourceUrl": "https://blog.gtowizard.com/c-betting-oop-in-3-bet-pots/",
    "title": "ディープなSB 3ベットポットのローボードのポットベットは分極",
    "summary": "100bbのSB 3ベットでローボードに大きく打つなら、脆いオーバーペアかバックドア付きのオーバーカードが中心なんだ。",
    "body": "100bbのSB 3ベットポットのローボード(654r)では、SBは79%チェックし、10%をポットベットする。そのポットベットのレンジは、強いが脆いオーバーペアと、バックドアドローのあるオーバーカードに分極している。40bbになるとチェックが消え、BBと似た戦略になるよ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "heroPos": [
        "SB"
      ],
      "potType": [
        "threeBet"
      ],
      "heroPreflopAggressor": true,
      "inPosition": false,
      "multiway": false,
      "spr": {
        "min": 3.5
      },
      "boardHighBand": [
        "L",
        "M"
      ],
      "action": [
        "bet80-100",
        "bet100+"
      ]
    }
  },
  {
    "id": "3bp-oop-ace-high-shallow-range-small",
    "article": "3ベットポットでのOOPからのCベット",
    "sourceUrl": "https://blog.gtowizard.com/c-betting-oop-in-3-bet-pots/",
    "title": "浅い3ベットポットのAハイはレンジで小さく",
    "summary": "40bbくらいの3ベットポットでAハイなら、レンジ全体で小さくベットしていいよ。3ベッターに有利なボードなんだ。",
    "body": "A64rのようなAハイは3ベッターにより有利なボードで、40bbではSBもBBも単純にレンジ全体で小さくベットできる。3ベッターはプリフロップのエクイティ優位をそのまま持ち込め、SPRが低いのでOOPでもポジションの不利はほとんど響かない。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "heroPos": [
        "SB",
        "BB"
      ],
      "potType": [
        "threeBet"
      ],
      "heroPreflopAggressor": true,
      "inPosition": false,
      "multiway": false,
      "spr": {
        "min": 0,
        "max": 2.5
      },
      "boardHighBand": [
        "H"
      ],
      "boardBroadwayCount": {
        "min": 1,
        "max": 2
      },
      "action": [
        "bet20-40"
      ]
    }
  },
  {
    "id": "3bp-oop-ace-high-deep-check-pairs",
    "article": "3ベットポットでのOOPからのCベット",
    "sourceUrl": "https://blog.gtowizard.com/c-betting-oop-in-3-bet-pots/",
    "title": "ディープな3ベットポットのAハイはペアやウィークキッカーのAxでチェック",
    "summary": "100bbの3ベットポットでAハイなら、ポケットペアやウィークキッカーのAxはチェックに回すのも自然だよ。ディープだとOOPの不利が効いてくるんだ。",
    "body": "40bbのA64rではレンジ全体で小さくベットできるけど、100bbではSBもBBもポケットペアとウィークキッカーのAxを中心とした大きなチェックレンジを持つ。SPRが高いと後のストリートでOOPが打ちにくく、ポットを大きくしすぎないことが大事になる。それでも最悪のフロップ以外は、アグレッシブなベットで利益を出せるよ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "heroPos": [
        "SB",
        "BB"
      ],
      "potType": [
        "threeBet"
      ],
      "heroPreflopAggressor": true,
      "inPosition": false,
      "multiway": false,
      "facingBet": false,
      "spr": {
        "min": 3.5
      },
      "boardHighBand": [
        "H"
      ],
      "action": [
        "checkOrCall"
      ],
      "heroHand": [
        "22-KK",
        "A2s-ATs",
        "A2o-ATo"
      ]
    }
  },
  {
    "id": "sub10-cev-open-shove-not-minraise",
    "article": "10bb未満のプレイ(1): チップEV編",
    "sourceUrl": "https://blog.gtowizard.com/playing-under-10bb-part-1-cev/",
    "title": "7bb以下のオープンはミニレイズせずオールイン",
    "summary": "7bbくらいまで浅いなら、オープンはミニレイズじゃなくオールインにしようね。オープンしてオールインされて降りる形は避けたいんだ。",
    "body": "9bb以下ではミニレイズがオールインに変わる。オールインでフォールドエクイティを最大化し、ベット・フォールドを強いられる状況を避けるためだよ。9bbではAAと様々なブラフだけがミニレイズに回るけど、7bb以下ではAAでもミニレイズのレンジは無い。7bbはフォールドエクイティがずっと少ないので、AAをオールインレンジに入れることで、より多くのハンドを利益的にブラフでオールインできるんだ。",
    "grade": "inaccuracy",
    "keepGto": true,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "preflopSpot": [
        "unopened"
      ],
      "heroPos": [
        "UTG",
        "HJ",
        "CO",
        "BTN"
      ],
      "action": [
        "raise2-5"
      ],
      "effStackBb": {
        "min": 0,
        "max": 8
      },
      "icmStage": [
        "early"
      ]
    }
  },
  {
    "id": "sub10-cev-9bb-aa-minraise",
    "article": "10bb未満のプレイ(1): チップEV編",
    "sourceUrl": "https://blog.gtowizard.com/playing-under-10bb-part-1-cev/",
    "title": "9bbのAAはミニレイズ",
    "summary": "9bbあるならAAはミニレイズでいいね。再レイズや複数のコーラーを呼び込みたいハンドなんだ。",
    "body": "9bbのオープンはほぼオールインだけど、小さいミニレイズのレンジが残っていて、AAは常にミニレイズする。アクションが欲しく、再レイズや複数のコーラーを歓迎できるからだね。ミニレイズには様々なハンドが時々ブラフとして混ざり、コールされたときのボードカバレッジを確保している。7bb以下になるとAAもオールインに回るよ。",
    "grade": "good",
    "keepGto": true,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "preflopSpot": [
        "unopened"
      ],
      "action": [
        "raise2-5"
      ],
      "effStackBb": {
        "min": 8,
        "max": 10.5
      },
      "icmStage": [
        "early"
      ],
      "heroHand": [
        "AA"
      ]
    }
  },
  {
    "id": "sub10-cev-shove-shape-pairs-offsuit-ax",
    "article": "10bb未満のプレイ(1): チップEV編",
    "sourceUrl": "https://blog.gtowizard.com/playing-under-10bb-part-1-cev/",
    "title": "浅いオールインレンジは生のエクイティとブロッカー",
    "summary": "浅いオールインはスモールポケットペアやオフスートのAxが主役になるんだ。オールインならポストフロップのプレイアビリティは関係ないからだよ。",
    "body": "30bbと比べると、浅いオールインレンジは形が変わる。ディープでは降りるスモールポケットペアが利益の出るオールインになり、ブロッカーの価値も大きくなる。ディープでは広がるのはスーテッド部分だけど、浅いオールインではオフスートのAxが好まれる。生のエクイティとAのブロッカーが重要だからね。スタックが浅いほどレンジは広がり、2.5bbのポットを取れば9bbで約28%、5bbなら50%もスタックが増える。ただしBTNは30bbのときよりタイトで、ポストフロップのポジション優位を活かせないからなんだ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "preflopSpot": [
        "unopened"
      ],
      "action": [
        "allIn"
      ],
      "effStackBb": {
        "min": 0,
        "max": 10
      },
      "icmStage": [
        "early"
      ],
      "heroHand": [
        "22-66",
        "A2o-A9o"
      ]
    }
  },
  {
    "id": "sub10-cev-steal-fold-equity",
    "article": "10bb未満のプレイ(1): チップEV編",
    "sourceUrl": "https://blog.gtowizard.com/playing-under-10bb-part-1-cev/",
    "title": "大きいスタックの脅威でフォールドエクイティを盗む",
    "summary": "後ろに大きいスタックが残っているなら、ショートでも広めにオールインできるよ。中くらいのスタックは簡単にコールできないんだ。",
    "body": "8bbのUTG1(他は最大32bb、平均20bb)は、全員8bbの卓よりずっと広くオールインする。非対称の卓では、コールしたHJにもまだ18bb残り、後ろのCOに再レイズで追い込まれるリスクがあるので、コールかアイソレーションかを考えなければならない。その結果HJの続行は減り、対称なら常にコールする55を非対称では常にフォールドする。3bbのHJならオールインレンジは39.2%から47.8%に広がる。ICMが無ければ、ショートは後ろの大きいスタックの脅威を借りてレバレッジを持てるんだ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "preflopSpot": [
        "unopened"
      ],
      "action": [
        "allIn"
      ],
      "effStackBb": {
        "min": 0,
        "max": 10
      },
      "heroCovers": false,
      "icmStage": [
        "early"
      ]
    }
  },
  {
    "id": "sub10-cev-call-shove-half-range",
    "article": "10bb未満のプレイ(1): チップEV編",
    "sourceUrl": "https://blog.gtowizard.com/playing-under-10bb-part-1-cev/",
    "title": "オールインへのコールは「レンジの半分超に勝つか」",
    "summary": "オールインにコールするなら、相手レンジの半分以上に勝てるかで考えようね。一部に勝てるだけじゃ足りないんだ。",
    "body": "9bbのUTGオールイン16.3%に対しLJのコールは9.5%、6bbのLJオールイン30.1%に対しBTNのコールは19.3%と、コールレンジはオールインレンジと似た形で半分強の大きさになる。目安は「コールがオールインレンジの半分超に勝つなら利益が出る」。22はペア以外の全ハンドに先行しているけど、それだけでは良いコールにならない。後ろに残る人数が少ないほど相対的に広くコールできるよ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "HJ",
        "CO",
        "BTN"
      ],
      "preflopSpot": [
        "vsOpen"
      ],
      "facingBet": true,
      "facingSizeBb": {
        "min": 4,
        "max": 11
      },
      "action": [
        "call",
        "allIn"
      ],
      "effStackBb": {
        "min": 0,
        "max": 11
      },
      "icmStage": [
        "early"
      ]
    }
  },
  {
    "id": "sub10-cev-bb-call-shove-wide",
    "article": "10bb未満のプレイ(1): チップEV編",
    "sourceUrl": "https://blog.gtowizard.com/playing-under-10bb-part-1-cev/",
    "title": "BBはオールインに対してオールインレンジより広くコールできる",
    "summary": "BBでショートのオールインに直面したら、思ったより広くコールしていいよ。すでにお金が入ってて、後ろに誰もいないんだ。",
    "body": "「オールインレンジの半分超に勝つならコール」という目安は、遅く行動するほど、特にSBやBBでは崩れる。HJの5bbオールインに対して、BBはオールインレンジより広くコールする。すでにポットにお金を入れているのでコールの価格がずっと良く、後ろに行動するプレイヤーもいないからだね。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "BB"
      ],
      "preflopSpot": [
        "vsOpen"
      ],
      "facingBet": true,
      "facingSizeBb": {
        "min": 3,
        "max": 7
      },
      "action": [
        "call",
        "allIn"
      ],
      "effStackBb": {
        "min": 0,
        "max": 7
      },
      "icmStage": [
        "early"
      ]
    }
  },
  {
    "id": "sub10-cev-bb-defend-call-not-shove",
    "article": "10bb未満のプレイ(1): チップEV編",
    "sourceUrl": "https://blog.gtowizard.com/playing-under-10bb-part-1-cev/",
    "title": "7bbのBB防衛はオールインよりコール",
    "summary": "7bbのBBでも、96sみたいな手はオールインじゃなくコールで守るのがいいよ。オールインとコールで1bb以上もEVが違うんだ。",
    "body": "昔は浅いBBなら「ここで勝負」とオールインする風潮があったけど、ソルバーによれば浅くても防衛は大いにある。UTG 19bbの2xオープンに対するBB 7bbのコールレンジは非常に広い。96sならコールは非常に利益的で、オールインは非常に非利益的、その差は1bb以上。7bbしかないときの1bbは巨大だよ。コールしてフロップで意味のある当たり方をしたら勝負する、フィット・オア・フォールドで打とうね。",
    "grade": "mistake",
    "keepGto": true,
    "priority": 10,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "BB"
      ],
      "preflopSpot": [
        "vsOpen"
      ],
      "facingSizeBb": {
        "min": 1.5,
        "max": 2.6
      },
      "action": [
        "allIn"
      ],
      "effStackBb": {
        "min": 5,
        "max": 9
      },
      "icmStage": [
        "early"
      ],
      "heroHand": [
        "96s",
        "95s",
        "86s",
        "85s",
        "75s",
        "74s",
        "64s",
        "63s",
        "53s"
      ]
    }
  },
  {
    "id": "sub10-cev-flat-suited-multiway",
    "article": "10bb未満のプレイ(1): チップEV編",
    "sourceUrl": "https://blog.gtowizard.com/playing-under-10bb-part-1-cev/",
    "title": "7bbでもスーテッドブロードウェイやスーテッドエースはフラット",
    "summary": "7bbくらいでも、QTsやA5sみたいな手は大きいスタックのオープンにフラットしてマルチウェイを狙えるんだ。何倍にも増やせる一番のチャンスだよ。",
    "body": "LJ 21bbのオープンに対し、BTN 7bbは純粋なオールイン戦略を取らず、コールして5bb残すハンドがある。フラットするのは主にQTsのようなスーテッドブロードウェイとA5sのようなスーテッドエースで、マルチウェイで非常によく機能する。ブラインドは他の大きいスタックが怖くて再レイズしにくいので、ショートでもマルチウェイに持ち込みやすい。後ろがオールインしてきても価格がつくので降りない。一方でAAはフラットに含まれないよ。",
    "grade": "good",
    "keepGto": true,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "HJ",
        "CO",
        "BTN"
      ],
      "preflopSpot": [
        "vsOpen"
      ],
      "action": [
        "call"
      ],
      "effStackBb": {
        "min": 5,
        "max": 9
      },
      "icmStage": [
        "early"
      ],
      "heroHand": [
        "QTs",
        "KTs",
        "JTs",
        "QJs",
        "KJs",
        "KQs",
        "A2s-A5s"
      ]
    }
  },
  {
    "id": "sub10-cev-postflop-low-spr-call-ax",
    "article": "10bb未満のプレイ(1): チップEV編",
    "sourceUrl": "https://blog.gtowizard.com/playing-under-10bb-part-1-cev/",
    "title": "超低SPRで小さいCベットにはAxでコール",
    "summary": "SPRが1を切るような浅いポットで小さく打たれたら、Axは素直にコールでいいね。相手にもう1回ブラフさせよう。",
    "body": "BTN 7bbがLJのオープンにコールしてA82rのフロップ(ポット6.5bb、有効5bb)。LJはレンジ全体で20%ポットの小さいベットを打つ。BTNはほぼコールかフォールドで、レイズはほとんど無い。LJはレイズされたらほぼ全部コールするし、Axは大きく勝っているか大きく負けているかの状況なので、コールして相手にもう1ストリートブラフさせるのが最善なんだ。ターンでは相手はほぼオールインかチェックの二択になるよ。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "facingBet": true,
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": false,
      "spr": {
        "min": 0,
        "max": 1.5
      },
      "boardHighBand": [
        "H"
      ],
      "facingPotPct": {
        "min": 10,
        "max": 40
      },
      "made": [
        "topPair"
      ],
      "action": [
        "checkOrCall"
      ]
    }
  },
  {
    "id": "icm-sub10-bubble-short-open-tight",
    "article": "10bb未満のプレイ(2): ICM編(バブルと最終卓)",
    "sourceUrl": "https://blog.gtowizard.com/playing-under-10bb-part-2-icm/",
    "title": "バブルのショートはオールインのオープンをタイトに",
    "summary": "バブルで8bbくらいのショートなら、オールインはChipEVよりずっと絞ろうね。ミニキャッシュを守る価値が大きいんだ。",
    "body": "バブルでHJ 8bbの例だと、ChipEVでは30%オールインするところ、ICMでは12%しかオールインしない。レンジはスーテッドAxに寄り、Aのブロッカー効果と、強いハンドにコールされたときのスーテッドの保険が効く。バブルのショートはダブルしても優勝確率が0.5%から0.8%程度にしか上がらないので、チップを増やすよりミニキャッシュの確保がずっと大事なんだ。",
    "grade": null,
    "keepGto": false,
    "priority": 5,
    "when": {
      "street": [
        "preflop"
      ],
      "preflopSpot": [
        "unopened"
      ],
      "heroPos": [
        "UTG",
        "HJ",
        "CO"
      ],
      "action": [
        "allIn"
      ],
      "effStackBb": {
        "min": 6,
        "max": 10
      },
      "icmStage": [
        "bubble",
        "nearBubble"
      ]
    }
  },
  {
    "id": "icm-sub10-bubble-aa-minraise",
    "article": "10bb未満のプレイ(2): ICM編(バブルと最終卓)",
    "sourceUrl": "https://blog.gtowizard.com/playing-under-10bb-part-2-icm/",
    "title": "バブルの8bbはAAでミニレイズもある",
    "summary": "バブルの8bbでも、AAはミニレイズでアクションを誘っていいよ。オールインの中に小さいオープンのレンジがあるんだ。",
    "body": "バブルのHJ 8bbには、オールインレンジの中に小さいオープンのレンジがある。AAは当然アクションを誘いたいし、ブラフ側は主にAを含むハンドでブロッカー効果を活かす。生き残りが鍵のバブルでは、オープンしておけばブラフはレイズされたときに降りられる。それも好ましくはないけど、オールインしてコールされるよりはましなんだ。",
    "grade": "good",
    "keepGto": true,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "preflopSpot": [
        "unopened"
      ],
      "action": [
        "raise2-5"
      ],
      "effStackBb": {
        "min": 6,
        "max": 10
      },
      "icmStage": [
        "bubble",
        "nearBubble"
      ],
      "heroHand": [
        "AA"
      ]
    }
  },
  {
    "id": "icm-sub10-bubble-very-short-open-wider",
    "article": "10bb未満のプレイ(2): ICM編(バブルと最終卓)",
    "sourceUrl": "https://blog.gtowizard.com/playing-under-10bb-part-2-icm/",
    "title": "バブルの4bbは8bbより少し広くオールイン",
    "summary": "バブルで4bbまで減ったら、8bbのときより少し広くオールインしていいんだ。通ったときの増え方が倍違うからだよ。",
    "body": "バブルのCO 4bbはICMでやはりタイトだけど、HJ 8bbより広くオールインする。リスクプレミアムは4bbで19.2%、8bbで18.9%と少し高いのに、遅いポジションで気にする人数が少なく、オールインが通ったときの増加が8bbの31.25%に対して4bbは62.5%と大きい。コールされてもデッドマネーの価値が相対的に大きい。しかも行動しなければ次に飛ぶ可能性が高いので、ソルバーより広くオールインする根拠すらあるよ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "preflopSpot": [
        "unopened"
      ],
      "action": [
        "allIn"
      ],
      "effStackBb": {
        "min": 0,
        "max": 5.5
      },
      "icmStage": [
        "bubble",
        "nearBubble"
      ]
    }
  },
  {
    "id": "icm-sub10-ft-short-open-wider",
    "article": "10bb未満のプレイ(2): ICM編(バブルと最終卓)",
    "sourceUrl": "https://blog.gtowizard.com/playing-under-10bb-part-2-icm/",
    "title": "最終卓のショートはバブルよりずっと広くオールイン",
    "summary": "最終卓のショートなら、バブルよりずっと広くオールインしていいよ。最終卓で一番ICMの圧力がかかるのはミドルスタックなんだ。",
    "body": "最終卓のUTG 8bbはChipEVよりはタイトだけど、バブルのレンジよりずっと広く、2つ後ろで約2倍のチップを持つLJ 15bbとほぼ同じ形と頻度になる。UTGのリスクプレミアムは最低8.3%で、バブルのショートの19.2%よりずっと低い。最終卓ではショートはすでに賞金を確保していて、ダブルで順位を上げる確率が大きく上がる。2bbまで減ればリスクプレミアムは1.6%とほぼChipEVで、次のBBで強制的にオールインになることも考えるとChipEVより広くオールインできるんだ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "preflopSpot": [
        "unopened"
      ],
      "action": [
        "allIn"
      ],
      "effStackBb": {
        "min": 0,
        "max": 10
      },
      "icmStage": [
        "finalTable"
      ]
    }
  },
  {
    "id": "icm-sub10-bubble-call-shove-too-loose",
    "article": "10bb未満のプレイ(2): ICM編(バブルと最終卓)",
    "sourceUrl": "https://blog.gtowizard.com/playing-under-10bb-part-2-icm/",
    "title": "バブルのショートはオールインへのコールを極端に絞る",
    "summary": "バブルの8bbなら、このハンドでもオールインへのコールは降りなんだ。リスクプレミアム約15%で、65%くらいのエクイティが必要になるよ。",
    "body": "バブルでショート8bbのLJが11bbのオールインに直面すると、コールレンジは極端にタイトで、TTやAQsでも降りる。99やAJsで広くコールしがちだけど、すべきではない。リスクプレミアムが卓の全員に対して約15%で、ポットのお金を考慮する前でコールに65%のエクイティが必要になる。相手のオールインレンジがタイトならそんなハンドはほとんど無いよ。最終卓なら少し広くコールできるけど、それでも大きくは広がらないんだ。",
    "grade": "mistake",
    "keepGto": true,
    "priority": 10,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "HJ",
        "CO",
        "BTN",
        "SB"
      ],
      "preflopSpot": [
        "vsOpen"
      ],
      "facingBet": true,
      "facingSizeBb": {
        "min": 6,
        "max": 15
      },
      "action": [
        "call",
        "allIn"
      ],
      "effStackBb": {
        "min": 5,
        "max": 10
      },
      "icmStage": [
        "bubble"
      ],
      "heroHand": [
        "99-TT",
        "AQs",
        "AJs",
        "ATs",
        "AQo",
        "AJo"
      ]
    }
  },
  {
    "id": "icm-sub10-bubble-8bb-vs-open-shove",
    "article": "10bb未満のプレイ(2): ICM編(バブルと最終卓)",
    "sourceUrl": "https://blog.gtowizard.com/playing-under-10bb-part-2-icm/",
    "title": "バブルの8bbはオープンに対してコールせずオールイン",
    "summary": "バブルの8bbでオープンに続行するなら、コールじゃなくオールインにしようね。フォールドエクイティを最大にできるんだ。",
    "body": "バブルでHJ 8bbが2bbオープンに直面すると、続行するときは常にオールインでフォールドエクイティを最大化する。レンジは最強ハンドを並べたリニアなものだけど、その場でポットを取れれば満足なんだ。コールはその場でポットを勝つ機会を捨て、最後のチップを危険にさらすことになるよ。",
    "grade": "inaccuracy",
    "keepGto": true,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "HJ",
        "CO",
        "BTN"
      ],
      "preflopSpot": [
        "vsOpen"
      ],
      "facingSizeBb": {
        "min": 1.8,
        "max": 3
      },
      "action": [
        "call"
      ],
      "effStackBb": {
        "min": 6,
        "max": 10
      },
      "icmStage": [
        "bubble",
        "nearBubble"
      ]
    }
  },
  {
    "id": "icm-sub10-bubble-4bb-vs-open-tight",
    "article": "10bb未満のプレイ(2): ICM編(バブルと最終卓)",
    "sourceUrl": "https://blog.gtowizard.com/playing-under-10bb-part-2-icm/",
    "title": "バブルの4bbはオープンに対してむしろタイト",
    "summary": "バブルで4bbだと、オープンへの続行はむしろ絞るんだ。フォールドエクイティがほぼ無いから、コールに値するハンドだけで行こうね。",
    "body": "通説に反して、バブルのCO 4bbが2bbオープンに直面したときのレンジは8bbのときよりずっとタイト。バブルでは浅いほどICMプレッシャーが強く、ミニキャッシュの確保がずっと重要になる。決定的なのは4bbではフォールドエクイティがほぼ無いことで、8bbのときと違い、実質的にはコールレンジになる。最終卓では逆に4bbの方が広くなるので、ステージの違いに注意しようね。",
    "grade": null,
    "keepGto": false,
    "priority": 5,
    "when": {
      "street": [
        "preflop"
      ],
      "preflopSpot": [
        "vsOpen"
      ],
      "facingSizeBb": {
        "min": 1.8,
        "max": 3
      },
      "action": [
        "call",
        "allIn"
      ],
      "effStackBb": {
        "min": 0,
        "max": 5.5
      },
      "icmStage": [
        "bubble",
        "nearBubble"
      ]
    }
  },
  {
    "id": "icm-sub10-ft-4bb-vs-open-wide",
    "article": "10bb未満のプレイ(2): ICM編(バブルと最終卓)",
    "sourceUrl": "https://blog.gtowizard.com/playing-under-10bb-part-2-icm/",
    "title": "最終卓の4bbはオープンに対して広く勝負",
    "summary": "最終卓で4bbなら、オープンに対して広く勝負していいよ。ダブルの上振れがバブルよりずっと大きいんだ。",
    "body": "最終卓でLJ 8bbが2bbオープンに直面すると、バブルとよく似た強いハンドのレンジで、降りてもらえれば満足という形。でも4bbになるとずっと広くなる。バブルでは浅くなるほどレンジが縮んだけど、最終卓では広がる。フォールドではなくダブルアップを狙っていて、最終卓のショートはすでに賞金を確保しているから失うものが少なく、上の順位に上がる上振れが大きいんだ。BBの4bbでも、UTGの2bbオープンに対して非常に広く防衛するよ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "preflopSpot": [
        "vsOpen"
      ],
      "facingSizeBb": {
        "min": 1.8,
        "max": 3
      },
      "action": [
        "call",
        "allIn"
      ],
      "effStackBb": {
        "min": 0,
        "max": 5.5
      },
      "icmStage": [
        "finalTable"
      ]
    }
  },
  {
    "id": "icm-sub10-ft-bb-8bb-weak-suited-defend",
    "article": "10bb未満のプレイ(2): ICM編(バブルと最終卓)",
    "sourceUrl": "https://blog.gtowizard.com/playing-under-10bb-part-2-icm/",
    "title": "最終卓の8bb BBは弱いスーテッドで防衛しない",
    "summary": "最終卓の8bbのBBなら、弱いスーテッドでのコールは控えようね。ChipEVならコールする手でもICMでは抜けるんだ。",
    "body": "最終卓でBB 8bbがUTGの2bbオープンに直面したときの防衛レンジは、ChipEVよりずっとタイト。ChipEVなら普通コールする弱いスーテッドハンドが全部抜けている。ICM下では得るチップより失うチップの価値が高いので、勝つ頻度の低いコールは割に合わない。ただし4bbまで減ると逆に非常に広く防衛し、フロップで何かしら当たったら残りを入れてダブルを狙うよ。",
    "grade": "inaccuracy",
    "keepGto": true,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "BB"
      ],
      "preflopSpot": [
        "vsOpen"
      ],
      "facingSizeBb": {
        "min": 1.8,
        "max": 3
      },
      "action": [
        "call"
      ],
      "effStackBb": {
        "min": 6,
        "max": 10
      },
      "icmStage": [
        "finalTable"
      ],
      "heroHand": [
        "T2s-T6s",
        "92s-95s",
        "82s-85s",
        "72s-74s",
        "62s-63s",
        "52s",
        "42s-43s",
        "32s"
      ]
    }
  },
  {
    "id": "icm-sub10-ft-short-postflop-fold-no-pair",
    "article": "10bb未満のプレイ(2): ICM編(バブルと最終卓)",
    "sourceUrl": "https://blog.gtowizard.com/playing-under-10bb-part-2-icm/",
    "title": "超ショートでもペアが無ければ降りる",
    "summary": "スタックがほとんど残ってなくても、ペアが無いならオールインには降りていいんだ。少しのエクイティだけでコールしちゃダメだよ。",
    "body": "最終卓で4bbのBBがUTGのオープンを防衛し、フロップA82r。BBがチェックするとUTGは100%ベットし、36%ポット(約1/3)のオールインに対してBBは71.5%をフォールドする。ペアができていればコール、そうでなければフォールド。KJsのように、わずかなエクイティ(バックドアフラッシュドローがあっても)だけでコールしたくなるハンドも降りるのが正解だよ。なおBB側から先にオールインでリードするストップ・アンド・ゴーもよく使われ、この例ではUTGが100%コールするので実質バリューベットなんだ。",
    "grade": "inaccuracy",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "heroPos": [
        "BB"
      ],
      "potType": [
        "srp"
      ],
      "facingBet": true,
      "inPosition": false,
      "spr": {
        "min": 0,
        "max": 1
      },
      "made": [
        "highCard"
      ],
      "action": [
        "checkOrCall",
        "allIn"
      ],
      "icmStage": [
        "finalTable"
      ]
    }
  },
  {
    "id": "icm-bubble-short-flop-jam-vulnerable-pair",
    "article": "ICMスポットでフロップに「ただ押し込む」べきとき",
    "sourceUrl": "https://blog.gtowizard.com/when-to-just-shove-post-flop-in-icm-spots/",
    "title": "バブルのショートは脆いペアで押し込む",
    "summary": "バブルの短いスタックで、今は勝ってるけど後のカードが怖いペアなら、フロップで全部押し込むのが一番だよ。ターン・リバーを戦わずに済むからね。",
    "body": "マネーバブルで20bb前後の短いスタックがプリフロップのレイザーのとき、Q87ttのようなボードでは、チェック頻度が約85%に増え、ベットするときは5.5bbのポットに20bbを入れる約364%のオールインになる。バリューはAA/KK/AQ/KQのような、今は大抵勝っているが多くのターンを嫌う強いペアだ。バブルのショートはダブルアップしてもトーナメントエクイティが約33%しか増えないのに、負けると最低入賞のエクイティを丸ごと失う。だから多くのフォールドを生んでハンドをすぐ終わらせるオールインは、見た目と違って低分散の戦略になる。",
    "grade": "good",
    "keepGto": false,
    "priority": 10,
    "when": {
      "street": [
        "flop"
      ],
      "icmStage": [
        "nearBubble",
        "bubble"
      ],
      "heroCovers": false,
      "heroPreflopAggressor": true,
      "potType": [
        "srp"
      ],
      "effStackBb": {
        "min": 12,
        "max": 30
      },
      "made": [
        "overPair",
        "topPair"
      ],
      "boardPaired": false,
      "boardSuit": [
        "twotone",
        "rainbow"
      ],
      "action": [
        "allIn"
      ]
    }
  },
  {
    "id": "icm-bubble-short-small-cbet-trap",
    "article": "ICMスポットでフロップに「ただ押し込む」べきとき",
    "sourceUrl": "https://blog.gtowizard.com/when-to-just-shove-post-flop-in-icm-spots/",
    "title": "バブルのショートの小さいCベット",
    "summary": "バブルの短いスタックで小さいCベットをすると、相手のチェックレイズにさらされて後で苦しくなるよ。打つなら押し込み、そうでなければチェックしようね。",
    "body": "最終卓ではショートのCベットが47%から25%ポットに小さくなるのが正解だったが、マネーバブルで同じ25%戦略を使うと、相手のチェックレイズ頻度が2倍以上に増える。しかもレイズサイズが少し小さくなるので続行しやすくなり、続行するとターン・リバーでひどい状況に置かれる。バブルのショートはチップ1枚の価値が非常に高く、ソルバーは約85%チェックし、打つときは約364%のオールインという『小さくか、オールインか』の形になる。『ICMプレッシャーはどこでも同じ』と思い込むのはよくある間違いだよ。",
    "grade": "inaccuracy",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "icmStage": [
        "nearBubble",
        "bubble"
      ],
      "heroCovers": false,
      "heroPreflopAggressor": true,
      "potType": [
        "srp"
      ],
      "role": [
        "cbet"
      ],
      "effStackBb": {
        "min": 12,
        "max": 30
      },
      "action": [
        "bet20-40"
      ]
    }
  },
  {
    "id": "icm-bubble-short-cbet-check-mostly",
    "article": "ICMスポットでフロップに「ただ押し込む」べきとき",
    "sourceUrl": "https://blog.gtowizard.com/when-to-just-shove-post-flop-in-icm-spots/",
    "title": "バブルのショートはほぼチェック",
    "summary": "バブルの短いスタックなら、強いペア以外はフロップでチェックして大丈夫だよ。ソルバーも約85%チェックしてるんだ。",
    "body": "チップEVや最終卓ではLJのチェック頻度は約25%だったが、マネーバブルの類似スポット(LJ 22bb vs BB 64bb)では約85%に跳ね上がる。バブルのショートはエクイティの大半が最低入賞に結びついていて、生き残ることの価値が倍にすることより大きい。ベットするのはAA/KK/AQ/KQのような脆い強いペアと、相手の継続ハンドをブロックするブラフに絞られ、それらはオールインで打つ。それ以外のハンドはチェックしてポットを大きくしないのが基本だよ。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "icmStage": [
        "nearBubble",
        "bubble"
      ],
      "heroCovers": false,
      "heroPreflopAggressor": true,
      "potType": [
        "srp"
      ],
      "inPosition": true,
      "facingBet": false,
      "effStackBb": {
        "min": 12,
        "max": 30
      },
      "made": [
        "middlePair",
        "bottomPair",
        "pocketPairBelow",
        "highCard"
      ],
      "action": [
        "checkOrCall"
      ]
    }
  },
  {
    "id": "icm-ft-short-cbet-small",
    "article": "ICMスポットでフロップに「ただ押し込む」べきとき",
    "sourceUrl": "https://blog.gtowizard.com/when-to-just-shove-post-flop-in-icm-spots/",
    "title": "最終卓のショートは小さくCベット",
    "summary": "最終卓でカバーされている側なら、Cベットは25%くらいの小さいサイズでいいよ。打つハンドはチップEVとほぼ同じなんだ。",
    "body": "有効20bbでLJがオープン・BBコールのQ87ttでは、チップEVなら1サイズで47%ポットが選ばれる。最終卓(LJ 21bb vs BB 65bb)では、ベットするハンドの数と種類はほぼ同じまま、サイズだけが25%ポットに下がる。ICMが効くと大きいベットは小さく、小さいベットはチェックになるのが全体の傾向だ。小さいベットは少ないリスクでポットを狙うだけでなく、ICMプレッシャーで降りやすい相手に難しい判断を迫る意味もある。ただしマネーバブルのショートでは事情が違い、オールインかチェックの両極になる。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "icmStage": [
        "finalTable"
      ],
      "heroCovers": false,
      "heroPreflopAggressor": true,
      "potType": [
        "srp"
      ],
      "role": [
        "cbet"
      ],
      "effStackBb": {
        "min": 12,
        "max": 30
      },
      "action": [
        "bet20-40"
      ]
    }
  },
  {
    "id": "icm-bubble-short-monster-plays-passive",
    "article": "ICMスポットでフロップに「ただ押し込む」べきとき",
    "sourceUrl": "https://blog.gtowizard.com/when-to-just-shove-post-flop-in-icm-spots/",
    "title": "バブルのショートでもモンスターは急がない",
    "summary": "セットや強いドローは、バブルでも押し込まずにチェックやコールでゆっくり進めていいんだ。急いで終わらせたいのは脆いビッグペアの方だよ。",
    "body": "マネーバブルのショートのオールインレンジは、AA/KK/AQ/KQのような脆い強いペアと、相手の継続ハンドをブロックするブラフで作られる。一方でセットのような非常に強いメイドハンド、ナッツフラッシュドロー、T♦9♦のようなコンボドローは、チェックバックや相手のドンクへのコールでパッシブにプレイする。これらのハンドはプロテクションをあまり必要としないからだ。ビッグペアは多くのターンカードを嫌うので早く終わらせたいが、モンスターにはその必要がないんだ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "icmStage": [
        "nearBubble",
        "bubble"
      ],
      "heroCovers": false,
      "heroPreflopAggressor": true,
      "potType": [
        "srp"
      ],
      "effStackBb": {
        "min": 12,
        "max": 30
      },
      "made": [
        "trips",
        "straight",
        "twoPair"
      ]
    }
  },
  {
    "id": "icm-bubble-short-jam-static-board",
    "article": "ICMスポットでフロップに「ただ押し込む」べきとき",
    "sourceUrl": "https://blog.gtowizard.com/when-to-just-shove-post-flop-in-icm-spots/",
    "title": "静的なボードではオールインの出番は少ない",
    "summary": "ペアボードではアグレッサーの強いハンドが後でも前に居やすいから、バブルでもフロップのオールインはあまり使わないよ。",
    "body": "バブルのショートがフロップで先にオールインするのは、今は前にいるがボードが進むと抜かれやすいペアを守るためだ。だから典型的にはドローやオーバーカードの多いダイナミックなボードで起きる。ペアボード、モノトーンボード、Aハイボードでは、アグレッサーのレンジの上位が後のストリートでも前に居続けやすく、急いでハンドを終わらせる理由が薄い。こうしたボードではオールインの頻度はずっと下がるよ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "icmStage": [
        "nearBubble",
        "bubble"
      ],
      "heroCovers": false,
      "heroPreflopAggressor": true,
      "potType": [
        "srp"
      ],
      "boardPaired": true,
      "effStackBb": {
        "min": 12,
        "max": 30
      },
      "action": [
        "allIn"
      ]
    }
  },
  {
    "id": "icm-bubble-big-stack-no-flop-jam",
    "article": "ICMスポットでフロップに「ただ押し込む」べきとき",
    "sourceUrl": "https://blog.gtowizard.com/when-to-just-shove-post-flop-in-icm-spots/",
    "title": "ビッグスタックはフロップでオールインする戦略をまねない",
    "summary": "バブルで押し込みが正解になるのは短いスタックの話なんだ。カバーしている側なら、倍にする価値が大きいから同じ打ち方はしなくていいよ。",
    "body": "マネーバブルのショートがフロップでオールインするのは、ダブルアップしても$EVが33.1%しか増えない一方、負けると最低入賞のエクイティを失うからだ。ミドルやビッグスタックにとってはバブルでダブルアップする価値がずっと大きく、この『生き残り最優先』の論理は当てはまらない。ちなみに最終卓のバブルでは、ショートでもダブルアップで$EVが83.8%増えるので、オールイン一辺倒にはならない。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "icmStage": [
        "nearBubble",
        "bubble"
      ],
      "heroCovers": true,
      "heroPreflopAggressor": true,
      "potType": [
        "srp"
      ],
      "action": [
        "allIn"
      ]
    }
  },
  {
    "id": "icm-covering-bb-donk-q87",
    "article": "ICMスポットでフロップに「ただ押し込む」べきとき",
    "sourceUrl": "https://blog.gtowizard.com/when-to-just-shove-post-flop-in-icm-spots/",
    "title": "カバーしているBBはリードもある",
    "summary": "大きく相手をカバーしているBBなら、自分向きでないボードでも小さくリードする手があるよ。ICMで相手が降りやすいからなんだ。",
    "body": "有効約20bbでLJがオープンし、3倍以上のチップを持つBBがコールしたQ87ttでは、チップEVだとBBは100%チェックする。ところが最終卓(LJ 21bb vs BB 65bb)ではBBのエクイティが39.6%しかないのにドンクベットが出てきて、マネーバブル(LJ 22bb vs BB 64bb)ではさらに少し増える。これはICMプレッシャーが戦略を形作っている表れで、カバーされている側は大きなポットを避けたいからだ。リードのサイズは25%ポット程度の小さいものになる。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "heroPos": [
        "BB"
      ],
      "icmStage": [
        "nearBubble",
        "bubble",
        "finalTable"
      ],
      "heroCovers": true,
      "heroPreflopAggressor": false,
      "potType": [
        "srp"
      ],
      "role": [
        "donk"
      ],
      "action": [
        "bet20-40"
      ]
    }
  },
  {
    "id": "ft-oop-vs-cover-flop-check",
    "article": "ICMサバイバルガイド: 最終卓でカバーしてくる相手にOOPで戦う",
    "sourceUrl": "https://blog.gtowizard.com/icm-survival-guide-how-to-play-oop-vs-a-covering-stack-at-the-final-table/",
    "title": "カバーされてOOPならまずチェック",
    "summary": "最終卓でカバーしている相手にポジションを取られたら、フロップはまずチェックだよ。迷ったらチェック、迷わなくてもたぶんチェックしようね。",
    "body": "8人の最終卓でCO(30bb)がオープンし、63bbのチップリーダーのBTNにコールされた例では、COのリスクプレミアムは18.1%と非常に高い。様々なフロップを調べると、COがベットするのはほぼ常にミスで、まれに打つときも小さいサイズだった。COの最大の関心はポットのエクイティではなく、スタックにあるトーナメントエクイティを守ることだ。ATTのように60%以上のエクイティがあるフロップでもほぼベットしない。チェックすれば相手のブラフも誘えるよ。",
    "grade": "good",
    "keepGto": false,
    "priority": 5,
    "when": {
      "street": [
        "flop"
      ],
      "icmStage": [
        "finalTable"
      ],
      "heroCovers": false,
      "heroPreflopAggressor": true,
      "inPosition": false,
      "potType": [
        "srp"
      ],
      "multiway": false,
      "facingBet": false,
      "action": [
        "checkOrCall"
      ]
    }
  },
  {
    "id": "ft-oop-vs-cover-flop-big-bet",
    "article": "ICMサバイバルガイド: 最終卓でカバーしてくる相手にOOPで戦う",
    "sourceUrl": "https://blog.gtowizard.com/icm-survival-guide-how-to-play-oop-vs-a-covering-stack-at-the-final-table/",
    "title": "カバーされてOOPで大きく打つのはミス",
    "summary": "最終卓でカバーしている相手にOOPでフロップを打つのは、ほぼ常にミスなんだ。大きいサイズならなおさら避けようね。",
    "body": "リスクプレミアム約18%のCOは、多くのマージナルなハンドをチェック&フォールドする必要があり、ポットにお金を入れたいほど強いハンドはごくわずかだ。ソルバーはほぼベットせず、まれに打つときも小さいサイズを選ぶ。ダイナミックなボードでOOPからポットを大きくすると、今強くても後のストリートで強いままかわからない。ベットの基本頻度がとても低いので、打つべきでないときに打つミスの方がずっと起きやすいんだ。",
    "grade": "inaccuracy",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "icmStage": [
        "finalTable"
      ],
      "heroCovers": false,
      "heroPreflopAggressor": true,
      "inPosition": false,
      "potType": [
        "srp"
      ],
      "multiway": false,
      "facingBet": false,
      "action": [
        "bet40-60",
        "bet60-80",
        "bet80-100",
        "bet100+"
      ]
    }
  },
  {
    "id": "ft-oop-vs-cover-monster-check-first",
    "article": "ICMサバイバルガイド: 最終卓でカバーしてくる相手にOOPで戦う",
    "sourceUrl": "https://blog.gtowizard.com/icm-survival-guide-how-to-play-oop-vs-a-covering-stack-at-the-final-table/",
    "title": "モンスターでもまずチェック",
    "summary": "トリップスみたいな強いハンドでも、カバーされてOOPならまずチェックでいいよ。打つと相手のハンドをブロックしてて降りられちゃうんだ。",
    "body": "A♠T♥T♦フロップでBTNの4倍ポットのオールインに対し、COはAKでフォールドと無差別になり、スタックオフが利益になるのはトリップス以上だけだった。トリップスは残り2枚のTの片方を持つので、相手がTを持つ確率が半分になり、ベットすると降りられやすい。しかも降りるハンドはどうせ逆転の見込みがほぼない。COは最終的に降りる多くのハンドもチェックするので、相手にはブラフする動機が大きく、チェックで誘える。相手がベットしてきたら、そこでレイズを考えよう。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "icmStage": [
        "finalTable"
      ],
      "heroCovers": false,
      "heroPreflopAggressor": true,
      "inPosition": false,
      "potType": [
        "srp"
      ],
      "facingBet": false,
      "made": [
        "trips",
        "fullHouse",
        "quads",
        "straight",
        "flush"
      ],
      "action": [
        "checkOrCall"
      ]
    }
  },
  {
    "id": "ft-oop-vs-cover-tp-fold-vs-small",
    "article": "ICMサバイバルガイド: 最終卓でカバーしてくる相手にOOPで戦う",
    "sourceUrl": "https://blog.gtowizard.com/icm-survival-guide-how-to-play-oop-vs-a-covering-stack-at-the-final-table/",
    "title": "小さいベットにトップペアは降りない",
    "summary": "カバーされていても、25%くらいの小さいベットにトップペアを降りるのはやりすぎだよ。ここはコールしようね。",
    "body": "最終卓でカバーしているBTNの25%ポットベットに対し、ATTのCOはトップペアを絶対に降りない。BTNの小さいベットは線形で、COの弱いハンドを狙ったドローや自分のトップペアも含むからだ。いくらかレイズもあるが、純粋にレイズを好むハンドはなく、ピュアコールで十分と考えてよい。大きいベットとは事情がまったく違うんだ。",
    "grade": "mistake",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "icmStage": [
        "finalTable"
      ],
      "heroCovers": false,
      "heroPreflopAggressor": true,
      "inPosition": false,
      "potType": [
        "srp"
      ],
      "facingBet": true,
      "facingPotPct": {
        "min": 0,
        "max": 40
      },
      "made": [
        "topPair"
      ],
      "action": [
        "fold"
      ]
    }
  },
  {
    "id": "ft-oop-vs-cover-weak-tp-fold-vs-big",
    "article": "ICMサバイバルガイド: 最終卓でカバーしてくる相手にOOPで戦う",
    "sourceUrl": "https://blog.gtowizard.com/icm-survival-guide-how-to-play-oop-vs-a-covering-stack-at-the-final-table/",
    "title": "大きいベットに弱いトップペアは降りてもいい",
    "summary": "カバーされてOOPで大きく打たれたら、キッカーの弱いトップペアは降りても大丈夫だよ。大きなポットに耐えられないなら早く抜けようね。",
    "body": "BTNの68%ポットのような大きいベットは両極化していて、COの中くらいのハンドに圧力をかける狙いだ。リスクプレミアムが高いと『中くらい』にはトップペアまで含まれ、ATTではCOが一部のトップペアを即フォールドする。弱いキッカーのトップペアはエクイティがあっても、ショーダウンまで2つのベットストリートが残り、すでに大きなポットができつつあるのでうまく実現できない。スタックを失う危険を考えると、すぐ降りるのは合理的な選択だ。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "icmStage": [
        "finalTable"
      ],
      "heroCovers": false,
      "heroPreflopAggressor": true,
      "inPosition": false,
      "potType": [
        "srp"
      ],
      "facingBet": true,
      "facingPotPct": {
        "min": 55,
        "max": 120
      },
      "made": [
        "topPair"
      ],
      "kicker": [
        "low"
      ],
      "action": [
        "fold"
      ]
    }
  },
  {
    "id": "ft-oop-vs-cover-dynamic-jam-vulnerable",
    "article": "ICMサバイバルガイド: 最終卓でカバーしてくる相手にOOPで戦う",
    "sourceUrl": "https://blog.gtowizard.com/icm-survival-guide-how-to-play-oop-vs-a-covering-stack-at-the-final-table/",
    "title": "ダイナミックなボードでは脆い強ハンドでオールイン",
    "summary": "ドローの多いボードで打たれたら、強いけど抜かれやすいハンドはオールインで返すのがいいよ。OOPで後の通りを戦わずに済むんだ。",
    "body": "COの懸念はポットを大きくすることより、大きなポットでショーダウンまで行くことだ。それを避ける一番確実な方法はフォールド、次がレイズで、レイズはエクイティを否定し、OOPで後のストリートをプレイする負担を消す。T86ttで68%ポットベットを受けると、COはATTより多く降りるが、降りないときはオールインへの関心が高い。オールインするのは最強ハンドではなく、AT・JJ・QQのような強いが脆いハンドと強いドローだ。よりダイナミックなT85ttでもほぼ同じハンドでオールインするよ。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "icmStage": [
        "finalTable"
      ],
      "heroCovers": false,
      "heroPreflopAggressor": true,
      "inPosition": false,
      "potType": [
        "srp"
      ],
      "facingBet": true,
      "boardDraws": [
        "drawHeavy"
      ],
      "made": [
        "overPair",
        "topPair",
        "twoPair"
      ],
      "action": [
        "allIn"
      ]
    }
  },
  {
    "id": "ft-oop-vs-cover-slowplay-risky",
    "article": "ICMサバイバルガイド: 最終卓でカバーしてくる相手にOOPで戦う",
    "sourceUrl": "https://blog.gtowizard.com/icm-survival-guide-how-to-play-oop-vs-a-covering-stack-at-the-final-table/",
    "title": "ベットされたらモンスターはレイズを検討",
    "summary": "チェックして相手が打ってきたら、一番強いハンドはレイズを真剣に考えようね。最終卓でのスロープレイは危ないんだ。",
    "body": "最終卓では、今勝っているポットを確保する方が、たとえ大きく有利でもポットにさらにチップを入れるより一般に重要だ。チェックで誘った後に相手がベットしてきたら、最強ハンドはレイズを検討する。QT9ttのような静的なボードでもフロップのストレートを中心に控えめなレイズレンジがある。ただしATTのような静的なボードで小さいベットを受けた場合は、純粋にレイズを好むハンドはなく、コールでも大差はない。タイト(チェック&フォールド)とアグレッシブ(降りないならレイズ)の組み合わせが最終卓で一番安全なんだ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "icmStage": [
        "finalTable"
      ],
      "heroCovers": false,
      "heroPreflopAggressor": true,
      "inPosition": false,
      "potType": [
        "srp"
      ],
      "facingBet": true,
      "made": [
        "trips",
        "straight",
        "fullHouse",
        "flush",
        "quads"
      ],
      "action": [
        "checkOrCall"
      ]
    }
  },
  {
    "id": "ft-oop-vs-cover-paired-low-raise-or-fold",
    "article": "ICMサバイバルガイド: 最終卓でカバーしてくる相手にOOPで戦う",
    "sourceUrl": "https://blog.gtowizard.com/icm-survival-guide-how-to-play-oop-vs-a-covering-stack-at-the-final-table/",
    "title": "722型はレイズかフォールド",
    "summary": "722みたいなローペアボードで大きく打たれたら、レイズかフォールドで決めようね。コールで粘るのは77みたいな守られたハンドだけだよ。",
    "body": "722rはストレートやフラッシュのドローがないのに非常にダイナミックなボードだ。多くのターンで両者に新しいトップペアができ、フロップでペアだったハンドの価値が下がる。そのため大きいベット(68%ポット)を受けたCOは、ほぼレイズかフォールドの戦略になる。小さなコールレンジはよく守られていて、最も高頻度でコールするのは77だ。中途半端なペアでコールして後のストリートをOOPで戦うのは避けたいんだ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "icmStage": [
        "finalTable"
      ],
      "heroCovers": false,
      "heroPreflopAggressor": true,
      "inPosition": false,
      "potType": [
        "srp"
      ],
      "facingBet": true,
      "facingPotPct": {
        "min": 55,
        "max": 120
      },
      "boardPaired": true,
      "boardHighBand": [
        "M"
      ],
      "made": [
        "overPair",
        "pocketPairBelow",
        "topPair"
      ],
      "action": [
        "checkOrCall"
      ]
    }
  },
  {
    "id": "dcs-icm-covering-bb-donk-small-pair",
    "article": "MTTでカバーしている側のドンクベット",
    "sourceUrl": "https://blog.gtowizard.com/donk-betting-as-the-covering-stack-in-mtts/",
    "title": "カバー側BBはローボードで小さくドンク",
    "summary": "FTやバブルで相手をカバーしてるBBなら、ローボードでペアを持ったら小さくドンクしていいよ。相手のオーバーカードからエクイティを奪おうね。",
    "body": "cEVではBBがOOPでフロップをドンクすることはほとんど無いけど、カバーされているPFRは大きなポットを避けたいのでCベット頻度が落ちるんだ。だからカバー側のBBが主導権を取る価値が上がる。53bbのBBが20bbのHJのオープンにコールしたFTの 742r(SPR約3)では、BBは最小サイズ(20%ポット)だけで幅広くドンクする。標的はボードに絡まないオーバーカードで、降りればエクイティを奪え、コールされれば有利な状態でお金を入れられるwin-winなんだ。最も強い手ほど高頻度で、最も弱い手は打たない、が目安だよ。",
    "grade": "good",
    "keepGto": false,
    "priority": 10,
    "when": {
      "street": [
        "flop"
      ],
      "heroPos": [
        "BB"
      ],
      "role": [
        "donk"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": false,
      "inPosition": false,
      "heroCovers": true,
      "icmStage": [
        "bubble",
        "finalTable"
      ],
      "boardHighBand": [
        "L",
        "M"
      ],
      "boardPaired": false,
      "made": [
        "overPair",
        "topPair",
        "middlePair",
        "bottomPair",
        "pocketPairBelow",
        "twoPair"
      ],
      "action": [
        "bet20-40"
      ],
      "multiway": false
    }
  },
  {
    "id": "dcs-icm-covering-bb-high-board-check",
    "article": "MTTでカバーしている側のドンクベット",
    "sourceUrl": "https://blog.gtowizard.com/donk-betting-as-the-covering-stack-in-mtts/",
    "title": "ハイボードはドンクしない",
    "summary": "Aやブロードウェイが落ちたハイボードは相手のレンジにぴったりだから、カバーしていてもまずはチェックしようね。",
    "body": "オープンしたHJのレンジはブロードウェイ、特に Ax が多いので、ハイボードのフロップではBBのドンクに良い標的(ボードに絡まないオーバーカード)がほとんど無いんだ。T73 でさえHJはペアとバックドアドローで十分ディフェンスできる。さらにHJのレンジは全体に強くハイポケットペアも多いので、トリップスやストレートの脅威が無いボードで薄くドンクすると、レイズされて苦しくなる。カバーしているBBでも、こうしたボードはほぼチェックだよ。",
    "grade": null,
    "keepGto": false,
    "priority": 5,
    "when": {
      "street": [
        "flop"
      ],
      "heroPos": [
        "BB"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": false,
      "inPosition": false,
      "facingBet": false,
      "heroCovers": true,
      "icmStage": [
        "bubble",
        "finalTable"
      ],
      "boardHighBand": [
        "H"
      ],
      "boardPaired": false,
      "action": [
        "checkOrCall"
      ],
      "multiway": false
    }
  },
  {
    "id": "dcs-icm-covering-bb-paired-polar-donk",
    "article": "MTTでカバーしている側のドンクベット",
    "sourceUrl": "https://blog.gtowizard.com/donk-betting-as-the-covering-stack-in-mtts/",
    "title": "ローペアボードはトリップスで大きめにドンク",
    "summary": "T55みたいなローペアボードでトリップスを持ったら、50%ポットくらいでドンクしようね。トリップスの脅威がこのベットを支えるんだ。",
    "body": "T♦5♦5♥ はBBにとって 742(エクイティ43%)や T76(45%)よりずっと悪いフロップで、エクイティは38%しかない。だから弱いペアの保護よりも、トリップスかブラフのポラライズしたレンジで打つ形になり、ソルバーは20%ではなく50%ポットを好むんだ。5ならBBがトリップスを信憑性をもって表現できるので、HJはビッグペアでもブラフでもレイズしにくい(T73 ではこれができないのでドンクしない)。40bbに深くなると、ベット頻度が上がり一部さらに大きいサイズも使うよ。",
    "grade": "good",
    "keepGto": false,
    "priority": 15,
    "when": {
      "street": [
        "flop"
      ],
      "heroPos": [
        "BB"
      ],
      "role": [
        "donk"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": false,
      "inPosition": false,
      "heroCovers": true,
      "icmStage": [
        "bubble",
        "finalTable"
      ],
      "boardPaired": true,
      "boardPairBand": [
        "L",
        "M"
      ],
      "made": [
        "trips",
        "fullHouse",
        "quads"
      ],
      "action": [
        "bet40-60",
        "bet60-80"
      ],
      "multiway": false
    }
  },
  {
    "id": "dcs-icm-covering-bb-connected-draw-bluff",
    "article": "MTTでカバーしている側のドンクベット",
    "sourceUrl": "https://blog.gtowizard.com/donk-betting-as-the-covering-stack-in-mtts/",
    "title": "コネクトボードのドンクのブラフはガットショット",
    "summary": "T76みたいなコネクトボードでドンクのブラフを混ぜるなら、ガットショットやバックドアのフラッシュドローくらいの手を使おうね。",
    "body": "20bbのFT(BB 53bb vs HJ 20bb)の T♦7♦6♥ では、BBはレンジの38%を常に最小サイズでドンクするんだ。742r よりややポラライズしていて、ブラフはエクイティ40〜50%のダイヤのドローより、20〜30%のガットショットやバックドアフラッシュドローから来ることが多い。最強の手が高頻度でベットし、最弱の手は打たない点は同じ。均衡的に打つにはランダム化が必要で、強い手ほど高頻度、中くらいは低頻度、最弱は打たない、を目安にしよう。",
    "grade": null,
    "keepGto": false,
    "priority": 5,
    "when": {
      "street": [
        "flop"
      ],
      "heroPos": [
        "BB"
      ],
      "role": [
        "donk"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": false,
      "inPosition": false,
      "heroCovers": true,
      "icmStage": [
        "bubble",
        "finalTable"
      ],
      "boardPaired": false,
      "made": [
        "highCard"
      ],
      "anyDraw": [
        "gutshot",
        "backdoorFlushDraw"
      ],
      "action": [
        "bet20-40"
      ],
      "multiway": false
    }
  },
  {
    "id": "dcs-icm-covering-bb-deep-big-donk-nuts",
    "article": "MTTでカバーしている側のドンクベット",
    "sourceUrl": "https://blog.gtowizard.com/donk-betting-as-the-covering-stack-in-mtts/",
    "title": "深いときはナッツ級を大きめにドンク",
    "summary": "40bbくらいあってナッツ級を作ったなら、ドンクを大きめにしてスタックを取りにいこうね。小さく打ってレイズを誘うのも混ぜていいよ。",
    "body": "スタックが深いほど、ナッツアドバンテージがあるボードでそれを活かす機会が増えるんだ。T55 では40bbでHJにエクイティ実現のためポットの6倍超をリスクさせられ、トップペアでさえ無差別になる。T76 を40bbにすると、BBはより頻繁に、大きいサイズも使ってドンクする(20bbでは38%を常に最小サイズ)。浅いときはスタックを入れるのに大きいサイズが要らないので、強い手も薄いバリュー用の小さいサイズに「妥協」していた。深いときもコンボドローなどは小さな「トラップベット」でレイズを誘う候補になるよ。",
    "grade": null,
    "keepGto": false,
    "priority": 10,
    "when": {
      "street": [
        "flop"
      ],
      "heroPos": [
        "BB"
      ],
      "role": [
        "donk"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": false,
      "inPosition": false,
      "heroCovers": true,
      "icmStage": [
        "bubble",
        "finalTable"
      ],
      "effStackBb": {
        "min": 30,
        "max": 60
      },
      "made": [
        "trips",
        "straight",
        "twoPair",
        "fullHouse"
      ],
      "action": [
        "bet40-60",
        "bet60-80",
        "bet80-100"
      ],
      "multiway": false
    }
  },
  {
    "id": "dcs-icm-covering-bb-deep-low-dry-less-donk",
    "article": "MTTでカバーしている側のドンクベット",
    "sourceUrl": "https://blog.gtowizard.com/donk-betting-as-the-covering-stack-in-mtts/",
    "title": "深いとドライなローボードのドンクは減る",
    "summary": "742rみたいにストレートもトリップスも無いローボードは、深いとドンクを減らして、打つなら小さく打とうね。",
    "body": "742r ではBBにストレートやトリップスが無く、HJのオーバーペアが実質ナッツなんだ(BBのセットは少なすぎて戦略を動かさない)。BBもペアが多く薄いバリューと保護の動機はあるけど、深いスタックのレバレッジで得をするのはHJの側で、BBは弱いペアをショーダウンまで持っていきにくくなる。だから40bbでは最小サイズのみのまま、ベット頻度が下がるよ。20bbの cEV でもドンクがある 742r で、深くするとドンクが減るのはこのためなんだ。",
    "grade": null,
    "keepGto": false,
    "priority": 5,
    "when": {
      "street": [
        "flop"
      ],
      "heroPos": [
        "BB"
      ],
      "role": [
        "donk"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": false,
      "inPosition": false,
      "heroCovers": true,
      "effStackBb": {
        "min": 30,
        "max": 60
      },
      "boardHighBand": [
        "M"
      ],
      "boardPaired": false,
      "boardDraws": [
        "dry",
        "normal"
      ],
      "made": [
        "middlePair",
        "bottomPair",
        "pocketPairBelow",
        "highCard"
      ],
      "multiway": false
    }
  },
  {
    "id": "dcs-icm-covered-pfr-overcards-vs-donk",
    "article": "MTTでカバーしている側のドンクベット",
    "sourceUrl": "https://blog.gtowizard.com/donk-betting-as-the-covering-stack-in-mtts/",
    "title": "カバーされた側はオーバーカードで粘りすぎない",
    "summary": "カバーされたPFRでボードに絡まないオーバーカードだけなら、ドンクに無理して付いていかなくていいよ。リスクプレミアムが重いんだ。",
    "body": "カバーされているPFRは大きなポットを避ける動機が最も強く、相手のカバー側BBはそこを突いてドンクしてくるんだ。標的になるのがボードと絡まないオーバーカードで、エクイティはそれなりにあるけど、ベットと大きなリスクプレミアムの前では守りにくい。BBは弱いペアでこうした手に打ってくるので、降りればエクイティを奪われ、コールすると不利な状態でお金を入れることになる。ICMの圧が高いFTやバブルでは、守るハンドを選ぼうね。",
    "grade": null,
    "keepGto": false,
    "priority": 5,
    "when": {
      "street": [
        "flop"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": true,
      "inPosition": true,
      "heroCovers": false,
      "facingBet": true,
      "icmStage": [
        "bubble",
        "finalTable"
      ],
      "made": [
        "highCard"
      ],
      "anyDraw": [
        "twoOverCards"
      ],
      "multiway": false
    }
  },
  {
    "id": "pes-paired-flop-small-range-cbet",
    "article": "小さなベットでエクイティを押し込む",
    "sourceUrl": "https://blog.gtowizard.com/pushing-equity-with-small-bets/",
    "title": "ペアボードは小さくレンジベット",
    "summary": "TT2みたいなペアボードは、20%ポットくらいの小さいCベットをレンジ全体で打っていいよ。弱い手でもOKなんだ。",
    "body": "30bbのMTTでCOがオープン、BBがコールして T♥T♦2♥ のとき、ソルバーはCOのレンジ全体で20%ポットのCベットを打つんだ。COはほぼ全域でBBより強いけど、トリップス以上の最上位は互角なので、エクイティアドバンテージはあってもナッツアドバンテージは無い。だから有利なポットを育てつつ、育てすぎないサイズが小さいベットになる。大きく打つと降りなかった相手のレンジが強くなり、リスクとリターンの比率が悪化するよ。この利益はBBの反応ではなく、プリフロップでBBが割引価格でコールして弱い手が多く残っていることから来ているんだ。",
    "grade": "good",
    "keepGto": false,
    "priority": 10,
    "when": {
      "street": [
        "flop"
      ],
      "role": [
        "cbet"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": true,
      "inPosition": true,
      "boardPaired": true,
      "action": [
        "bet20-40"
      ],
      "multiway": false
    }
  },
  {
    "id": "pes-paired-flop-small-cbet-weak-hand",
    "article": "小さなベットでエクイティを押し込む",
    "sourceUrl": "https://blog.gtowizard.com/pushing-equity-with-small-bets/",
    "title": "小さいCベットは弱い手でも利益になる",
    "summary": "このペアボードならエアーでも小さく打っていいよ。降りてくれれば得、コールされてもレンジで勝ってるんだ。",
    "body": "フロップの小さなレンジベットは、BBの反応ではなくプリフロップで起きたことに乗じているんだ。COは複数の相手にレイズするリスクを取り、BBは割引価格でコールしてアクションを閉じたので、BBのほうがずっと多くの弱い手でフロップを見ている。だからCOはどんな2枚でも利益的にベットでき、BBはライブな2枚をよく降りる。全く降りなくても、レンジの強いCOにとって両者がお金を入れるのは得なんだ。これが「エクイティを押し込む」ということだよ。",
    "grade": "good",
    "keepGto": false,
    "priority": 5,
    "when": {
      "street": [
        "flop"
      ],
      "role": [
        "cbet"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": true,
      "inPosition": true,
      "boardPaired": true,
      "made": [
        "highCard"
      ],
      "action": [
        "bet20-40"
      ],
      "multiway": false
    }
  },
  {
    "id": "pes-broadway-connected-larger-cbet",
    "article": "小さなベットでエクイティを押し込む",
    "sourceUrl": "https://blog.gtowizard.com/pushing-equity-with-small-bets/",
    "title": "QJTはレンジでも大きめに打つ",
    "summary": "QJTみたいに自分がナッツも多く持つボードは、レンジで打つにしてもサイズを大きめにしようね。",
    "body": "Q♥J♥T♦ はCOがエクイティアドバンテージとナッツアドバンテージの両方を持つフロップなんだ。ソルバーはやはりレンジ全体でベットするけど、ポットをできるだけ大きくしたい手がずっと多いので、主に大きいサイズ(55%ポット)を使う。TT2 のようにエクイティだけが優位なときは小さく、ナッツ級の手が相手より多いときは大きくしてポラライズする、というのがサイズの決め方だよ。",
    "grade": "good",
    "keepGto": false,
    "priority": 10,
    "when": {
      "street": [
        "flop"
      ],
      "role": [
        "cbet"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": true,
      "inPosition": true,
      "boardPaired": false,
      "boardBroadwayCount": {
        "min": 3
      },
      "action": [
        "bet40-60",
        "bet60-80"
      ],
      "multiway": false
    }
  },
  {
    "id": "pes-vs-small-cbet-checkraise-modest",
    "article": "小さなベットでエクイティを押し込む",
    "sourceUrl": "https://blog.gtowizard.com/pushing-equity-with-small-bets/",
    "title": "小さいCベットには中程度の手でもチェックレイズ",
    "summary": "相手がレンジで小さく打ってくるなら、こっちも弱めや中くらいの手でチェックレイズを混ぜていいよ。",
    "body": "TT2tt のように相手が弱い手や中程度の手で多く小さく打ってくると、BB側にも弱い手・中程度の手でチェックレイズする理由が生まれるんだ。逆に言えば、相手の最強の手が小さいCベットで最も成績が良いのは、こうしたチェックレイズを誘えるから。強い手だけでレイズすると読まれやすいので、レンジを混ぜて相手の小さいベットに圧をかけよう。",
    "grade": null,
    "keepGto": false,
    "priority": 5,
    "when": {
      "street": [
        "flop"
      ],
      "heroPos": [
        "BB"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": false,
      "inPosition": false,
      "facingBet": true,
      "facingPotPct": {
        "max": 30
      },
      "role": [
        "checkRaise"
      ],
      "multiway": false
    }
  },
  {
    "id": "pes-river-probe-thin-value-small",
    "article": "小さなベットでエクイティを押し込む",
    "sourceUrl": "https://blog.gtowizard.com/pushing-equity-with-small-bets/",
    "title": "ターンが回ったリバーは薄いバリューを小さく",
    "summary": "フロップでコールしてターンが回ってきたなら、リバーはこのくらいのペアで小さく打とうね。大きく打つと強い手にしか呼ばれないんだ。",
    "body": "Q♥J♥T♦ でCOの55%ポットCベットにBBがコールし、ターン 2♠ が両者チェック、リバー 4♠ のとき、BBのリバーの先打ちには小さいベットが多いんだ。COはフロップを最悪の手まで含めてレンジで打ち、BBは最悪の手を降りた。さらにCOはターンをチェックバックしてレンジを弱めたので、BBの中程度の手がCOより強くなる。T9 のような手はよく勝っているけど大きいベットに劣る手は呼ばないので、小さく打ってCOに弱い手でコールする動機を与えよう。BBの小さいベットはエクイティ50〜80%の薄いバリューから主に来るよ。",
    "grade": "good",
    "keepGto": false,
    "priority": 10,
    "when": {
      "street": [
        "river"
      ],
      "role": [
        "probe"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": false,
      "inPosition": false,
      "made": [
        "topPair",
        "middlePair",
        "bottomPair"
      ],
      "action": [
        "bet20-40"
      ],
      "multiway": false
    }
  },
  {
    "id": "pes-river-probe-strong-shove",
    "article": "小さなベットでエクイティを押し込む",
    "sourceUrl": "https://blog.gtowizard.com/pushing-equity-with-small-bets/",
    "title": "ターンが回ったリバーの強い手は大きく",
    "summary": "ターンがチェックで回ってきたリバーは、Q7くらいの手でも十分強いから、大きく打ってスタックを取りにいこうね。",
    "body": "Q♥J♥T♦ 2♠ 4♠ でターンがチェックで回った後は、BBが文字通りのナッツでなくてもナッツアドバンテージを持てるんだ。Q4 や Q7 のようなBBの最強クラスの手は主にオールインしたい。COはターンのチェックバックでレンジを弱めていて、強い手でそうする動機は小さいからね。リバーではレンジの部分ごとに目的が違うので、強い手は大きく、薄いバリューは小さく、とサイズを使い分けよう。",
    "grade": "good",
    "keepGto": false,
    "priority": 10,
    "when": {
      "street": [
        "river"
      ],
      "role": [
        "probe"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": false,
      "inPosition": false,
      "made": [
        "topPair",
        "twoPair",
        "trips",
        "straight",
        "flush",
        "fullHouse"
      ],
      "action": [
        "bet80-100",
        "bet100+",
        "allIn"
      ],
      "multiway": false
    }
  },
  {
    "id": "pes-river-probe-small-trap",
    "article": "小さなベットでエクイティを押し込む",
    "sourceUrl": "https://blog.gtowizard.com/pushing-equity-with-small-bets/",
    "title": "小さいリバーベットに強い手を混ぜる",
    "summary": "リバーを小さく打つなら、強い手もときどき混ぜておこうね。ブラフレイズしてくる相手を捕まえられるよ。",
    "body": "小さく打つリスクの一つはブラフレイズされること。だから Q♥J♥T♦ 2♠ 4♠ のリバーでBBは、非常に強い手でもトラップとして時々小さく打つんだ。小さいベットが薄いバリューだけだと、相手はレイズで簡単に降ろせてしまう。強い手が混ざっていれば、相手のレイズはリスクを伴うようになるよ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "river"
      ],
      "role": [
        "probe"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": false,
      "inPosition": false,
      "made": [
        "twoPair",
        "trips",
        "straight",
        "flush",
        "fullHouse"
      ],
      "action": [
        "bet20-40"
      ],
      "multiway": false
    }
  },
  {
    "id": "pes-turn-overcard-promotes-top-pair-small",
    "article": "小さなベットでエクイティを押し込む",
    "sourceUrl": "https://blog.gtowizard.com/pushing-equity-with-small-bets/",
    "title": "自分を押し上げるターンはトップペアで小さく",
    "summary": "ペアボードでKが落ちてトップペアになったなら、33〜55%ポットくらいの控えめなサイズでバリューを取ろうね。",
    "body": "UTG(30bb)がオープンしてBBがコール、T♥4♥4♦ で20%ポットのCベットにコールされた後、K♥ ターンはUTGの中程度の手を不釣り合いに押し上げるんだ。UTGのフロップの弱めのベットハンドには Kx が多いけど、BBは Kx をほぼ降りていて、一貫してコールする K♥ はターンに見えているので持てない。それでもトリップス・フラッシュ・フルハウスにぶつかるのが怖いので大きくは打てず、33%か55%ポットで打つ(平均的なターンの最頻サイズは83%ポット)。有利なカードが自分の中程度の手を押し上げたときは小さいベットが合うよ。",
    "grade": "good",
    "keepGto": false,
    "priority": 10,
    "when": {
      "street": [
        "turn"
      ],
      "role": [
        "turnBarrel"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": true,
      "inPosition": true,
      "boardPaired": true,
      "boardChange": [
        "overcard"
      ],
      "made": [
        "topPair"
      ],
      "action": [
        "bet20-40",
        "bet40-60"
      ],
      "multiway": false
    }
  },
  {
    "id": "pes-bb-check-flop-no-advantage",
    "article": "小さなベットでエクイティを押し込む",
    "sourceUrl": "https://blog.gtowizard.com/pushing-equity-with-small-bets/",
    "title": "優位が無いならBBはフロップでチェック",
    "summary": "BBでコールしたフロップは、まずはレイザーにチェックするのが普通だよ。優位が無いのにベットする理由は無いんだ。",
    "body": "ベットは本質的に相手に対する優位から利益を得る行為なんだ。優位の無いプレイヤーにはベットする動機が無いので、BBのコーラーがフロップでプリフロップレイザーにチェックするのはごく普通。優位の性質がサイズも決めて、ナッツ級が多ければ大きく、中程度の手で優位があれば小さく打つ。自分のレンジがどこで勝っているかを見極めよう。",
    "grade": null,
    "keepGto": false,
    "priority": -10,
    "when": {
      "street": [
        "flop"
      ],
      "heroPos": [
        "BB"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": false,
      "inPosition": false,
      "facingBet": false,
      "action": [
        "checkOrCall"
      ],
      "multiway": false
    }
  },
  {
    "id": "tcr-brick-turn-no-checkraise",
    "article": "ターンのチェックレイズ・ヒューリスティクス",
    "sourceUrl": "https://blog.gtowizard.com/turn-check-raise-heuristics/",
    "title": "ブランクのターンはチェックレイズ不要",
    "summary": "ブランクのターンで大きく打たれたら、チェックレイズはほぼ要らないよ。コールかフォールドで考えようね。",
    "body": "ターンがブランクだと、IPの相手はトップペア以上のバリューと低エクイティのブラフという強くポラライズしたレンジで大きく打てるんだ。ポラライズしたレンジはオールインに迷わない(ブラフは降り、バリューはコールする)ので、レイズで相手を苦しめられない。30bbのBTN vs BB(K♦7♥5♥ 2♣、ポットサイズのベット)ではBBのチェックレイズオールインはわずか2%で、消してもEVは全く減らなかった。100bbでもチェックレイズを全面禁止したときのEV低下はポットの0.2%(約1.82bb/100)だけ。スタックの深さに関係なく「チェックレイズしない」に単純化して大丈夫だよ。",
    "grade": null,
    "keepGto": false,
    "priority": 10,
    "when": {
      "street": [
        "turn"
      ],
      "potType": [
        "srp"
      ],
      "inPosition": false,
      "heroPreflopAggressor": false,
      "facingBet": true,
      "facingPotPct": {
        "min": 80,
        "max": 200
      },
      "boardChange": [
        "blank"
      ],
      "multiway": false
    }
  },
  {
    "id": "tcr-shallow-wet-turn-jam-vulnerable-value",
    "article": "ターンのチェックレイズ・ヒューリスティクス",
    "sourceUrl": "https://blog.gtowizard.com/turn-check-raise-heuristics/",
    "title": "浅いウェットなターンは脆いバリューでオールイン",
    "summary": "浅いスタックで状況が変わるターンなら、ツーペアや低いストレートみたいな脆い強い手はチェックレイズオールインがいいよ。",
    "body": "30bbで K♦7♥5♥ 8♦ のように2つ目のフラッシュドローが付きストレートも完成するターンでは、相手の67%ポットベットに対してBBは11%チェックレイズオールインするんだ。そのオールインレンジのほぼ半分は K8・K5・87・85 のような脆いツーペアで、低いストレート(64)もリバーの悪いカードに弱いからオールインに回す。相手のベットレンジの52%がドロー持ちなので、保護の価値が大きいんだ。逆に高いストレートはコールしてスロープレイする。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "turn"
      ],
      "inPosition": false,
      "facingBet": true,
      "effStackBb": {
        "min": 15,
        "max": 45
      },
      "boardChange": [
        "straightMove",
        "flushCompleted",
        "overcard"
      ],
      "made": [
        "twoPair",
        "straight",
        "trips"
      ],
      "action": [
        "allIn"
      ],
      "multiway": false
    }
  },
  {
    "id": "tcr-shallow-jam-draw-bluffs",
    "article": "ターンのチェックレイズ・ヒューリスティクス",
    "sourceUrl": "https://blog.gtowizard.com/turn-check-raise-heuristics/",
    "title": "浅いターンのオールインのブラフはコンボドロー",
    "summary": "浅いときにターンでチェックレイズオールインするなら、ブラフ側はコンボドローやペア+ドローを使おうね。",
    "body": "30bbのターンのチェックレイズオールインは、ブラフが少なくエクイティの高い手が中心なんだ。ブラフ枠は T4s や 62s のようなコンボドローと、86o・76o のようなペア+ドロー。オールインでもう次のストリートが無いので、コールされたときに勝てるエクイティが必要なんだ。こうした手を混ぜることで、相手のトップペア・トップキッカー(AKsなど)をコールとフォールドの間で無差別にできるよ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "turn"
      ],
      "inPosition": false,
      "facingBet": true,
      "effStackBb": {
        "min": 15,
        "max": 45
      },
      "anyDraw": [
        "flushDraw",
        "nutFlushDraw",
        "openEnded",
        "gutshot"
      ],
      "action": [
        "allIn"
      ],
      "multiway": false
    }
  },
  {
    "id": "tcr-shallow-slowplay-nuts",
    "article": "ターンのチェックレイズ・ヒューリスティクス",
    "sourceUrl": "https://blog.gtowizard.com/turn-check-raise-heuristics/",
    "title": "浅いときはレンジ最上位をスロープレイ",
    "summary": "浅いスタックのターンで一番強いストレートを持ってたら、オールインせずコールで待つのもアリだよ。",
    "body": "30bbのウェットなターンでは、BBは低いストレートをオールインし、高いストレートはコールしているんだ。リバーのSPRが低いので、あとでスタックを入れるのに困らないし、コールレンジを守ることにもなる。脆い手は保護のためにオールイン、ナッツ級は遅らせる、という使い分けを覚えておこうね。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "turn"
      ],
      "inPosition": false,
      "facingBet": true,
      "effStackBb": {
        "min": 15,
        "max": 45
      },
      "made": [
        "straight",
        "flush",
        "fullHouse"
      ],
      "action": [
        "checkOrCall"
      ],
      "multiway": false
    }
  },
  {
    "id": "tcr-deep-raise-top-of-range",
    "article": "ターンのチェックレイズ・ヒューリスティクス",
    "sourceUrl": "https://blog.gtowizard.com/turn-check-raise-heuristics/",
    "title": "深いターンのチェックレイズは最上位で",
    "summary": "深いスタックでターンをチェックレイズするなら、まずはストレートみたいな最上位でポットを大きくしようね。",
    "body": "100bbだと、ウェットなターン(K♦7♥5♥ 8♦)でBBのチェックレイズは約42コンボと浅いときと同程度だけど、中身が違うんだ。深いときは最上位でポットを育てないと相手のスタックを十分な頻度で取れないので、ストレートがバリューの主体になる。ブラフはオールインではない分、コールされてもリバーでもう一度打てるから、オールイン時より低いエクイティの手でも成り立つ。コンボドローやOESDが中心で、単純なフラッシュドローは少しだけ。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "turn"
      ],
      "inPosition": false,
      "facingBet": true,
      "effStackBb": {
        "min": 60
      },
      "role": [
        "checkRaise"
      ],
      "made": [
        "straight",
        "flush",
        "fullHouse",
        "trips"
      ],
      "action": [
        "bet60-80",
        "bet80-100",
        "bet100+"
      ],
      "multiway": false
    }
  },
  {
    "id": "tcr-deep-ip-one-pair-vs-checkraise",
    "article": "ターンのチェックレイズ・ヒューリスティクス",
    "sourceUrl": "https://blog.gtowizard.com/turn-check-raise-heuristics/",
    "title": "深いターンのチェックレイズにワンペアは降りる",
    "summary": "深いスタックでターンにベットしてチェックレイズされたら、ドローの無いワンペアはほぼ降りでいいよ。",
    "body": "100bbの K♦7♥5♥ 8♦ でBTNが67%ポットを打ってBBにポットサイズでチェックレイズされると、ドロー無しのトップペアはピュアフォールドなんだ。AKoのコールはポットの約4%(約2bb)を失う。ワンペア・ノードローでいくらかでもコールするのはAAだけで、99はペア+ガットショットだからちょうど無差別(ポットの-0.8%〜+0.2%)。相手は中途半端なドローを無差別にするのを狙ってるので、ドロー無しのワンペアは手放そうね。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "turn"
      ],
      "inPosition": true,
      "heroPreflopAggressor": true,
      "facingBet": true,
      "facingPotPct": {
        "min": 70
      },
      "effStackBb": {
        "min": 60
      },
      "made": [
        "topPair",
        "overPair",
        "middlePair",
        "pocketPairBelow"
      ],
      "potType": [
        "srp"
      ],
      "multiway": false
    }
  },
  {
    "id": "tcr-ip-barrel-shallow-wet",
    "article": "ターンのチェックレイズ・ヒューリスティクス",
    "sourceUrl": "https://blog.gtowizard.com/turn-check-raise-heuristics/",
    "title": "浅いウェットターンの薄いバレルは慎重に",
    "summary": "浅いスタックで状況が変わるターンは、ドロー無しのトップペアや単純なドローでのバレルを厳選しようね。",
    "body": "相手がターンのチェックレイズオールインを持っていると、ドロー無しのトップペアや中程度のドローはベットしてオールインされると苦しい立場になるんだ。30bbの K♦7♥5♥ 8♦ では、BBがオールインを持つときBTNのペア系とドロー系はどちらも半分強しかベットできない。オールインが無ければ薄いバリューも幅広いドローも打てるけど、正しく打ってくる相手には厳選が必要なんだ。OESD+フラッシュドローのような高エクイティの手はオールインされても困らないよ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "turn"
      ],
      "inPosition": true,
      "heroPreflopAggressor": true,
      "role": [
        "turnBarrel"
      ],
      "effStackBb": {
        "min": 15,
        "max": 45
      },
      "boardChange": [
        "straightMove",
        "flushCompleted"
      ],
      "made": [
        "topPair",
        "middlePair",
        "highCard"
      ],
      "potType": [
        "srp"
      ],
      "multiway": false
    }
  },
  {
    "id": "sbcb-small-bet-default",
    "article": "SBのフロップCベット総合戦略(SRP・BB相手)",
    "sourceUrl": "https://blog.gtowizard.com/aggregate-flop-strategy-sb-c-betting-in-srp/",
    "title": "SBのCベットは小さく打つのが基本",
    "summary": "SBからBB相手のCベットは小さいサイズが一番よく使う選択だよ。弱い手が多いBBから安くフォールドを取ろうね。",
    "body": "BBは0.5bb多く入っていてアクションを閉じるので、SBのオープンよりかなり弱いレンジでフロップを見るんだ。だからどのフロップでもBBは弱い手を多く持ち、SBは小さいベットで安くフォールドエクイティを取れる。どのスタック深さでも小さいベットが圧倒的に最多のサイズなんだ。ただしレンジベットはどの深さでも最適ではなく、チェックも戦略の大きな部分を占めることは覚えておこうね。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "heroPos": [
        "SB"
      ],
      "blindVsBlind": true,
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": true,
      "role": [
        "cbet"
      ],
      "action": [
        "bet20-40"
      ],
      "multiway": false
    }
  },
  {
    "id": "sbcb-60bb-overbet-dynamic-middle",
    "article": "SBのフロップCベット総合戦略(SRP・BB相手)",
    "sourceUrl": "https://blog.gtowizard.com/aggregate-flop-strategy-sb-c-betting-in-srp/",
    "title": "深いSBはダイナミックな中くらいのボードでオーバーベット",
    "summary": "60bbくらいの深さでT〜7ハイのコネクトボードなら、トップペアやオーバーペアで125%のオーバーベットが効くよ。",
    "body": "ペアもストレート完成も無く最高位がT/9/8/7のフロップは、どのターンでもペア・ストレート・オーバーカードのどれかが来るほどダイナミックなんだ。OOPのSBは後のストリートが危険なので、チェックかオーバーベットに二極化する。9♥6♦3♣ではSBがベストハンドの18%を持ちBBは3%未満とナッツアドバンテージも大きい。オーバーベットはBBのエクイティとIPで戦うEVを奪い、コールされてもSPRが大きく下がるよ。打つのは強いが脆いトップペアやオーバーペアが中心で、ハイポケットペアほど頻度は下がるんだ。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "heroPos": [
        "SB"
      ],
      "blindVsBlind": true,
      "potType": [
        "srp"
      ],
      "role": [
        "cbet"
      ],
      "effStackBb": {
        "min": 45,
        "max": 80
      },
      "boardPaired": false,
      "boardHighBand": [
        "M",
        "H"
      ],
      "boardBroadwayCount": {
        "max": 2
      },
      "made": [
        "overPair",
        "topPair"
      ],
      "action": [
        "bet100+"
      ],
      "multiway": false
    }
  },
  {
    "id": "sbcb-aa-no-overbet",
    "article": "SBのフロップCベット総合戦略(SRP・BB相手)",
    "sourceUrl": "https://blog.gtowizard.com/aggregate-flop-strategy-sb-c-betting-in-srp/",
    "title": "最強の手は大きく打たずトラップ",
    "summary": "AAみたいなレンジ最上位は、オーバーベットよりチェックや小さいベットで残しておく方がいいんだ。",
    "body": "SBの大きいベットのバリューは最強の手ではなく、悪いターンに弱い強いが脆いペアが中心なんだ。60bbの963rではハイポケットペアほどオーバーベット頻度が下がり、AAは一度もオーバーベットしない。30bbの333rでもクワッズやフルハウスは小さいベットでトラップしている。最強の手はチェックや小さいベットのレンジを守る役目があるよ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "heroPos": [
        "SB"
      ],
      "blindVsBlind": true,
      "potType": [
        "srp"
      ],
      "role": [
        "cbet"
      ],
      "heroHand": [
        "AA"
      ],
      "action": [
        "bet80-100",
        "bet100+"
      ],
      "multiway": false
    }
  },
  {
    "id": "sbcb-30bb-low-paired-large",
    "article": "SBのフロップCベット総合戦略(SRP・BB相手)",
    "sourceUrl": "https://blog.gtowizard.com/aggregate-flop-strategy-sb-c-betting-in-srp/",
    "title": "30bbのローペアボードは75%で大きく",
    "summary": "30bbくらいで333みたいなローペアボードなら、グッドキッカーのAxや脆いポケットペアで75%を打っていこうね。",
    "body": "30bbでSBが大きいベットを一番使うのはローペアボード/トリップスボードなんだ。SBはハイポケットペアとAxが多く、BBは3ベットでそれらを抜いているので、エクイティもナッツも優位。333rの75%ベットはグッドキッカーのAxと脆いポケットペアが中心で、AxやKQ/KJはセミブラフではなくバリュー(BBはAxを全部、Kxをほぼ全部コールしてくる)。クワッズやフルハウスは小さいベットでトラップするよ。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "heroPos": [
        "SB"
      ],
      "blindVsBlind": true,
      "potType": [
        "srp"
      ],
      "role": [
        "cbet"
      ],
      "effStackBb": {
        "min": 22,
        "max": 45
      },
      "boardPaired": true,
      "boardPairBand": [
        "L"
      ],
      "action": [
        "bet60-80"
      ],
      "multiway": false
    }
  },
  {
    "id": "sbcb-30bb-ace-broadway-large",
    "article": "SBのフロップCベット総合戦略(SRP・BB相手)",
    "sourceUrl": "https://blog.gtowizard.com/aggregate-flop-strategy-sb-c-betting-in-srp/",
    "title": "30bbのAハイ・ブロードウェイは大きくセミブラフ",
    "summary": "30bbでAJTみたいなAハイのブロードウェイボードなら、ドローで75%のセミブラフを打っていこうね。",
    "body": "Aハイのブロードウェイ3枚ボードはSBが強いAxを多く持つので大きく有利なんだ。A♥J♥T♦では小さいベットはほぼ使わず、打たないときはチェック。強いAxを背景に、ストレートドローやフラッシュドローで75%のセミブラフを多く打つ。BBのガットショットやセカンド・サードペアに即座に圧力をかけ、後のストリートの大きなブラフにもつながるよ。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "heroPos": [
        "SB"
      ],
      "blindVsBlind": true,
      "potType": [
        "srp"
      ],
      "role": [
        "cbet"
      ],
      "effStackBb": {
        "min": 22,
        "max": 45
      },
      "boardHighBand": [
        "H"
      ],
      "boardBroadwayCount": {
        "min": 3
      },
      "anyDraw": [
        "flushDraw",
        "nutFlushDraw",
        "openEnded",
        "gutshot"
      ],
      "action": [
        "bet60-80"
      ],
      "multiway": false
    }
  },
  {
    "id": "sbcb-20bb-underpair-large",
    "article": "SBのフロップCベット総合戦略(SRP・BB相手)",
    "sourceUrl": "https://blog.gtowizard.com/aggregate-flop-strategy-sb-c-betting-in-srp/",
    "title": "浅いSBはトップ未満のペアでも大きく",
    "summary": "20bbくらいの浅さなら、トップカード未満のポケットペアやグッドキッカーのセカンドペアでも75%で打っていいよ。",
    "body": "20bbではBBがレンジ広くコールしてくるので、弱いペアでも多く続行し、一部は即座にスタックオフしてくるんだ。J♦8♥6♥ではトップペアやオーバーペアに加えて TT・99・A8 も75%の高頻度ベットになる。20bbで75%が一番多いのはKハイやJハイの、ドローはあるが完成していないペア無しボード。大きいベットは最強の手ではなく、悪いターンに弱い次の段の手で打つのがポイントだよ。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "heroPos": [
        "SB"
      ],
      "blindVsBlind": true,
      "potType": [
        "srp"
      ],
      "role": [
        "cbet"
      ],
      "effStackBb": {
        "min": 12,
        "max": 25
      },
      "boardPaired": false,
      "made": [
        "pocketPairBelow",
        "middlePair"
      ],
      "action": [
        "bet60-80"
      ],
      "multiway": false
    }
  },
  {
    "id": "sbcb-20bb-flop-shove-rare",
    "article": "SBのフロップCベット総合戦略(SRP・BB相手)",
    "sourceUrl": "https://blog.gtowizard.com/aggregate-flop-strategy-sb-c-betting-in-srp/",
    "title": "浅いSBのフロップのオールインはローコネクトボード専用",
    "summary": "浅いからってSBでフロップのオールインはそうそうしないよ。654みたいなローコネクトボード専用の選択なんだ。",
    "body": "20bbでSBがフロップで先にオールインするのは総合Cベット戦略の1%未満なんだ。654のツートーンのようなローコネクトのフロップでは、ほぼ純粋に「チェックか243%ポットのオールイン」になるけど、それは特定のフロップだけ。ストレートが可能なフロップはSBが最もチェックするボードでもある。OOPで低SPRだとオールインしたくなるけど、普段は小さいベットやチェックを中心に考えようね。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "heroPos": [
        "SB"
      ],
      "blindVsBlind": true,
      "potType": [
        "srp"
      ],
      "role": [
        "cbet"
      ],
      "effStackBb": {
        "min": 10,
        "max": 25
      },
      "action": [
        "allIn"
      ],
      "multiway": false
    }
  },
  {
    "id": "lcp-bb-vs-limp-polar-raise",
    "article": "BBとしてリンプ→コールされたポットの戦い方",
    "sourceUrl": "https://blog.gtowizard.com/limp-called-pot-as-bb/",
    "title": "SBのリンプにはポラライズしてレイズ",
    "summary": "SBのリンプに対するBBのアイソレートは、強い手と92o・84oみたいな弱い手でやるんだ。中くらいの手はチェックでいいよ。",
    "body": "BBにとってレイズの代わりはフォールドではなくチェックで、チェックはタダで必ずフロップを見られる利益の大きい選択肢なんだ。一方レイズはアクションを再開させ、SBの3ベットのリスクを生む。だから3ベットされると困る中くらいの手はチェックし、92oや84oのような弱い手はフォールドエクイティを狙ってレイズする。弱い手は支配されている手を降ろせるうえ、3ベットされてもチェックしていた場合にめったに勝てなかったので失うものが少ないんだ。大事なのは『どの手がレイズのEVが高いか』ではなく『どの手がチェックと比べてレイズでEVを得るか』だよ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "BB"
      ],
      "preflopSpot": [
        "vsLimp"
      ],
      "blindVsBlind": true,
      "action": [
        "raise2-5",
        "raise5+"
      ],
      "effStackBb": {
        "min": 60
      }
    }
  },
  {
    "id": "lcp-bb-vs-limp-check-medium",
    "article": "BBとしてリンプ→コールされたポットの戦い方",
    "sourceUrl": "https://blog.gtowizard.com/limp-called-pot-as-bb/",
    "title": "中くらいの手とスモールAxはチェック",
    "summary": "深いスタックでSBのリンプに対しては、Q7sやオフスートのスモールAxはチェックで十分なんだ。",
    "body": "100bbのシムでQ7sはピュアチェック。Q7sはレイズのEVも84oより高いけど、チェックのEVもずっと高いので、レイズで得るものが無いんだ。オフスートのスモールAxもBBのチェックレンジの目立つ構成要素で、SBのリンプコールレンジにはAxが多いため、レイズすると支配されている手を降ろし、支配している手に対してだけポットを大きくしてしまう。チェックしてリンプポットでこうした手を持っておくことが、BBのチェックレンジを守ることにもつながるよ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "BB"
      ],
      "preflopSpot": [
        "vsLimp"
      ],
      "blindVsBlind": true,
      "effStackBb": {
        "min": 60
      },
      "heroHand": [
        "A7o-A2o",
        "Q7s"
      ]
    }
  },
  {
    "id": "lcp-bb-vs-limp-shallow-raise-ax",
    "article": "BBとしてリンプ→コールされたポットの戦い方",
    "sourceUrl": "https://blog.gtowizard.com/limp-called-pot-as-bb/",
    "title": "浅いときはAxもアイソレート",
    "summary": "スタックが浅いなら、SBのリンプに対してAxもどんどんレイズしていいよ。",
    "body": "浅いスタックでは、Axはお互いにプリフロップでオールインしても安全な手になるんだ。だからBBもSBもAxをより多くレイズし、BBのレイズレンジにはAxが増え、SBのリンプコールレンジのAxは減る(30bbのシム)。深いときにスモールAxをチェックしていた『支配している手にポットを大きくされる』という懸念が、浅いときはあまり問題にならないよ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "BB"
      ],
      "preflopSpot": [
        "vsLimp"
      ],
      "blindVsBlind": true,
      "effStackBb": {
        "max": 40
      },
      "heroHand": [
        "A9o-A2o",
        "A9s-A2s"
      ],
      "action": [
        "raise2-5",
        "raise5+"
      ]
    }
  },
  {
    "id": "lcp-bb-flop-cbet-less-often",
    "article": "BBとしてリンプ→コールされたポットの戦い方",
    "sourceUrl": "https://blog.gtowizard.com/limp-called-pot-as-bb/",
    "title": "SBのリンプコールにはCベットを控えめに",
    "summary": "SBのリンプコールに対するBBのCベットは、BTNのCベットほど打てないんだ。レンジの40〜50%はチェックバックでいいよ。",
    "body": "BBのプリフロップのレイズレンジは92oや84oのような弱い手を含み、中くらいの手やウィークキッカーのAxはチェックに回すので、強くポラライズしているんだ。そのぶんポストフロップのエクイティ優位が小さく、どのスタックの深さでも平均40〜50%の手をチェックバックする。BTN vs BBの感覚で高頻度にCベットすると打ちすぎになるよ。スタックが浅くなるほど、小さいサイズで高頻度に打つ方向へ寄っていく。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "heroPos": [
        "BB"
      ],
      "potType": [
        "srp"
      ],
      "blindVsBlind": true,
      "heroPreflopAggressor": true,
      "inPosition": true,
      "facingBet": false,
      "multiway": false
    }
  },
  {
    "id": "lcp-bb-flop-high-card-board-check",
    "article": "BBとしてリンプ→コールされたポットの戦い方",
    "sourceUrl": "https://blog.gtowizard.com/limp-called-pot-as-bb/",
    "title": "AハイなどのハイボードはCベットしにくい",
    "summary": "深いスタックのリンプ→コールのポットでは、AハイみたいなハイカードのフロップほどBBはCベットしにくいんだ。",
    "body": "IPのレイザーがBBに打つ普通の構図ではAハイのフロップが理想的だけど、BB vs SBのリンプコールでは100bbのときAハイのフロップがCベット頻度最低になるんだ。BBはウィークキッカーのAxをプリフロップでチェックしているので、レイズレンジがAハイのボードに強くない。リニアに上位42%でレイズするカスタムシムだと AJ5r で80%近くベットするのに、GTOのポラライズしたレンジでは約半分しか打たない。100bbではディスコネクトのボードを特に好む傾向も無く、40bbでもハイカードほどCベットに向かない傾向は残るよ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "heroPos": [
        "BB"
      ],
      "potType": [
        "srp"
      ],
      "blindVsBlind": true,
      "heroPreflopAggressor": true,
      "inPosition": true,
      "facingBet": false,
      "boardHighBand": [
        "H"
      ],
      "effStackBb": {
        "min": 30
      },
      "multiway": false
    }
  },
  {
    "id": "lcp-bb-flop-shallow-small-cbet",
    "article": "BBとしてリンプ→コールされたポットの戦い方",
    "sourceUrl": "https://blog.gtowizard.com/limp-called-pot-as-bb/",
    "title": "浅いときは小さく高頻度にCベット",
    "summary": "20bbくらいの浅いスタックなら、BBは小さいサイズで広くCベットしていいよ。",
    "body": "スタックが浅くなるほど、BBのCベットはポラライズが弱まり、小さいサイズで高頻度になるんだ。20bbではBBのプリフロップのレイズサイズがやや小さく、SBはオッズが良いぶん広く弱いレンジでフロップを見に来るので、小さいベットで効率よく攻められる。20bbになって初めてBBのCベット戦略はBTNに似てきて、ミドルのコネクトボードを嫌うようになるよ。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "heroPos": [
        "BB"
      ],
      "potType": [
        "srp"
      ],
      "blindVsBlind": true,
      "heroPreflopAggressor": true,
      "inPosition": true,
      "facingBet": false,
      "role": [
        "cbet"
      ],
      "action": [
        "bet20-40"
      ],
      "effStackBb": {
        "max": 25
      },
      "multiway": false
    }
  },
  {
    "id": "lcp-sb-flop-rarely-donk-deep",
    "article": "BBとしてリンプ→コールされたポットの戦い方",
    "sourceUrl": "https://blog.gtowizard.com/limp-called-pot-as-bb/",
    "title": "リンプコールしたSBはほぼドンクしない",
    "summary": "リンプしてBBのレイズにコールしたSBは、深いスタックならフロップでドンクベットはほとんど要らないよ。チェックから始めようね。",
    "body": "SBはプリフロップで2回攻撃の機会を見送っているので、オーバーペアや強いキッカーのトップペアのような、40bb以上のスタックを入れられる頑丈な手をほとんど持っていないんだ。だからドンクベットで大きなポットを作る理由が乏しい。ドンクが戦略上意味を持つのは最も浅いスタックのときだけだよ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "heroPos": [
        "SB"
      ],
      "potType": [
        "srp"
      ],
      "blindVsBlind": true,
      "heroPreflopAggressor": false,
      "inPosition": false,
      "role": [
        "donk"
      ],
      "effStackBb": {
        "min": 40
      },
      "multiway": false
    }
  },
  {
    "id": "lcp-sb-flop-shallow-donk-top-pair",
    "article": "BBとしてリンプ→コールされたポットの戦い方",
    "sourceUrl": "https://blog.gtowizard.com/limp-called-pot-as-bb/",
    "title": "浅いときはトップペアでドンクもアリ",
    "summary": "20〜30bbくらいの浅いスタックなら、リンプコールしたSBがトップペアでドンクベットするのもアリだよ。",
    "body": "40bb以上だとSBのトップペアはスタックを入れるには頑丈さが足りないけど、20〜30bbならどんなトップペアでもスタックを入れるのは妥当なんだ。だから浅いスタックではSBもドンクベットを戦略に取り入れ始める。深いときと同じ感覚でチェックだけに固めなくていいよ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "heroPos": [
        "SB"
      ],
      "potType": [
        "srp"
      ],
      "blindVsBlind": true,
      "heroPreflopAggressor": false,
      "inPosition": false,
      "role": [
        "donk"
      ],
      "made": [
        "topPair",
        "twoPair",
        "trips"
      ],
      "effStackBb": {
        "max": 35
      },
      "multiway": false
    }
  },
  {
    "id": "wns-turn-small-raise-not-shove",
    "article": "なぜシャブしないのか(ターンの小さいレイズの価値)",
    "sourceUrl": "https://blog.gtowizard.com/why-not-shove/",
    "title": "小さいドンクにはオールインより小さいレイズ",
    "summary": "浅いスタックでターンの小さいドンクにオールインしたけど、半ポットくらいの小さいレイズのほうが良かったんだ。",
    "body": "30bb前後のSRPで、CO 99 が 7♠4♥2♦ 5♦ のターンでBBの25%ポットのドンク(ポット15.6bb、有効24.5bb)に直面した場面では、ソルバーは半ポットのレイズとオールイン(114%ポット)の選択肢があると、レイズしたい手は実質すべて半ポットを選ぶんだ。小さいレイズは相手に『フォールドエクイティがある』と錯覚させ、悪い手からのオールインを誘う。99では半ポットのレイズがオールインより約1%良く、A♦7♦では4%も良い。『スタックの1/3を入れたら降りないからオールイン』はプリフロップのヒューリスティクスで、ポストフロップでは成り立たないよ。",
    "grade": "inaccuracy",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "turn"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": true,
      "inPosition": true,
      "facingBet": true,
      "facingPotPct": {
        "max": 40
      },
      "effStackBb": {
        "max": 40
      },
      "action": [
        "allIn"
      ],
      "multiway": false
    }
  },
  {
    "id": "wns-turn-small-raise-value",
    "article": "なぜシャブしないのか(ターンの小さいレイズの価値)",
    "sourceUrl": "https://blog.gtowizard.com/why-not-shove/",
    "title": "強い手は小さいレイズで相手のオールインを誘う",
    "summary": "ターンの小さいドンクに半ポットくらいでレイズしたのはナイスだよ。相手のオールインを誘えるんだ。",
    "body": "オールインには逃げ道が無く、オールインしかないとレイズレンジは強いメイドハンドと強いドローだけのリニアなレンジになるんだ。半ポットのレイズならエアーのブラフも混ぜられるので、相手はこちらを降ろせると思ってオールインしてくる。これは20bbでの5bbの小さい3ベットと同じ発想。99では半ポットのレイズがオールインより約1%良く、A♦7♦は悪い手のオールインを誘ううえ支配しているフラッシュドローやペア+ガットショットにもコールさせられるので4%良いよ。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "turn"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": true,
      "inPosition": true,
      "facingBet": true,
      "facingPotPct": {
        "max": 40
      },
      "effStackBb": {
        "max": 40
      },
      "made": [
        "overPair",
        "topPair",
        "twoPair",
        "trips",
        "straight"
      ],
      "action": [
        "bet40-60",
        "bet60-80"
      ],
      "multiway": false
    }
  },
  {
    "id": "wns-turn-airball-small-raise-bluff",
    "article": "なぜシャブしないのか(ターンの小さいレイズの価値)",
    "sourceUrl": "https://blog.gtowizard.com/why-not-shove/",
    "title": "エアーは小さいレイズでブラフ",
    "summary": "QJやT9みたいなエアーは、ターンの小さいドンクに小さくレイズしてブラフし、オールインされたら降りればいいよ。",
    "body": "7♠4♥2♦ 5♦ のドンクに対するソルバーのレイズフォールドレンジには、QJやT9のような完全なエアーが入るんだ。リバーでペアになるのは約12%で、なっても負けうるので、オールイン返しには4:1のオッズでも降りて構わない。この安いブラフがあるからBBはK2やQ4のような弱いペアでドンクしにくくなり、小さいレイズの脅威だけでBBのドンク頻度は50%から12%まで下がる。COのターンEVも5.6bbから5.7bbに上がるよ。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "turn"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": true,
      "inPosition": true,
      "facingBet": true,
      "facingPotPct": {
        "max": 40
      },
      "effStackBb": {
        "max": 40
      },
      "made": [
        "highCard"
      ],
      "action": [
        "bet40-60",
        "bet60-80"
      ],
      "multiway": false
    }
  },
  {
    "id": "wns-turn-draw-raise-fold",
    "article": "なぜシャブしないのか(ターンの小さいレイズの価値)",
    "sourceUrl": "https://blog.gtowizard.com/why-not-shove/",
    "title": "ドローも小さいレイズの候補",
    "summary": "AQや33みたいにアウツのある手も、ターンの小さいドンクには小さくレイズするのが候補になるよ。",
    "body": "ソルバーのレイズフォールドレンジには、時々リードしていて負けていてもアウツがあるAQや33のような手も入っているんだ。オールインかコールの二択ならコールのほうが良いけど、半ポットのレイズがあると、相手の弱いペアを降ろしつつ、オールインされたら降りるという安い選択ができる。半ポットのレイズを禁止してもレイズ/コール/フォールドの頻度は33%/44%/23%とほぼ同じに見えるけど、EVと相手のドンク戦略は大きく変わるんだ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "turn"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": true,
      "inPosition": true,
      "facingBet": true,
      "facingPotPct": {
        "max": 40
      },
      "effStackBb": {
        "max": 40
      },
      "anyDraw": [
        "openEnded",
        "gutshot",
        "flushDraw",
        "nutFlushDraw",
        "twoOverCards"
      ],
      "action": [
        "bet40-60",
        "bet60-80"
      ],
      "multiway": false
    }
  },
  {
    "id": "wns-bb-turn-donk-weak-pair",
    "article": "なぜシャブしないのか(ターンの小さいレイズの価値)",
    "sourceUrl": "https://blog.gtowizard.com/why-not-shove/",
    "title": "小さいレイズがある相手に弱いペアのドンクは控える",
    "summary": "ターンでK2やQ4みたいな弱いペアをドンクするのは、相手に小さくレイズされると苦しいんだ。頻度は抑えようね。",
    "body": "相手が半ポットのレイズを使えないとBBはレンジの半分でドンクでき、エクイティ50〜70%の弱いペアも打てるんだ。でも小さいレイズの脅威があると、BBのドンクは12%まで減り、高頻度で打てるのはエクイティ70〜80%の手だけになる。弱いペアは小さいレイズにも必ずフォールドするし、小さいレイズのほうがオールインよりポラライズしているので、勝っている手でブラフに降ろされやすいんだ。オールインしか返してこない相手なら、弱いペアのベットフォールドは成り立ちやすいよ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "turn"
      ],
      "heroPos": [
        "BB"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": false,
      "inPosition": false,
      "role": [
        "donk"
      ],
      "made": [
        "middlePair",
        "bottomPair",
        "pocketPairBelow"
      ],
      "effStackBb": {
        "max": 40
      },
      "multiway": false
    }
  },
  {
    "id": "wns-preflop-shallow-small-3bet",
    "article": "なぜシャブしないのか(ターンの小さいレイズの価値)",
    "sourceUrl": "https://blog.gtowizard.com/why-not-shove/",
    "title": "浅いときの3ベットは小さく",
    "summary": "20bbくらいなら3ベットは5bbくらいの小さいサイズがいいよ。オールインされても降りる余地が残るんだ。",
    "body": "スタックが浅いほどリレイズのサイズも小さくなり、20bbでの典型的な3ベットは5bbなんだ。もっと大きくレイズするとオールインへのコールに縛られるけど、小さいサイズなら逃げる余地が残るので軽い3ベットもできる。さらに『フォールドするかも』と思わせて、こちらのオールインにはコールできない程度の手でも相手にオールインさせられるので、強い3ベットにとって大きな得になるよ。",
    "grade": "good",
    "keepGto": true,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "preflopSpot": [
        "vsOpen"
      ],
      "effStackBb": {
        "max": 25
      },
      "action": [
        "raise2-5"
      ]
    }
  },
  {
    "id": "tiny3bet-premium-4bet-shove",
    "article": "小さい3ベットへのディフェンス(25bb MTT)",
    "sourceUrl": "https://blog.gtowizard.com/defending-against-tiny-three-bets/",
    "title": "浅い3ベットには最強の手で4ベット",
    "summary": "25bb前後で小さい3ベットを受けたら、AAやKK・AKsはコールより4ベットオールインが基本だよ。今エクイティを否定するほうが大きいんだ。",
    "body": "25bb・フィールド残り50%の例では、UTGの2bbオープンにUTG1が5bbへ3ベットしたとき、KKやAKsでさえコールではなく4ベットを選ぶ。ポットがスタックに対して大きいので、相手の軽い3ベットが持つ20〜25%のエクイティを今すぐ否定する価値が大きいからだ。AAですらコールより4ベットの頻度が高い。OOPでエクイティを実現しにくいことも4ベットを選ぶ理由になる。トラップに近いのはAQsとKQsくらいで、支配している手を降ろせず、自分が支配している手にもコールされない手だ。",
    "grade": "good",
    "keepGto": true,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "preflopSpot": [
        "vs3bet"
      ],
      "effStackBb": {
        "min": 15,
        "max": 35
      },
      "heroHand": [
        "KK+",
        "AKs"
      ],
      "action": [
        "allIn",
        "raise5+"
      ]
    }
  },
  {
    "id": "tiny3bet-call-range-capped",
    "article": "小さい3ベットへのディフェンス(25bb MTT)",
    "sourceUrl": "https://blog.gtowizard.com/defending-against-tiny-three-bets/",
    "title": "小さい3ベットへのコールは「おまけ」",
    "summary": "小さい3ベットにコールするのは、オッズが良いからコールしているだけのキャップされた手だよ。フロップ以降は不利が前提で、チェックフォールドが多くなると覚えておこうね。",
    "body": "25bbで2bbオープン→5bbの3ベットを受けると、コールに必要なオッズは9.5:3と良い。コールレンジはオールインするほど強くない手が中心で、キャップされている。3ベッターのレンジはほぼ大きなブロードウェイとポケットペアで、フロップ以降はエクイティ優位とナッツ優位の両方を持つ。コールした側はチェックフォールドが多くなるのが当然で、目標は悪い状況から最善を引き出すこと。フロップ以降で取れるものは、本来フォールドしていた手のおまけと考えよう。ICMが強まる(フィールド残り25%など)とほぼオールインかフォールドになる。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "preflopSpot": [
        "vs3bet"
      ],
      "effStackBb": {
        "min": 15,
        "max": 35
      },
      "facingSizeBb": {
        "min": 3,
        "max": 7
      },
      "action": [
        "call"
      ]
    }
  },
  {
    "id": "tiny3bet-low-flop-pocket-pair-get-in",
    "article": "小さい3ベットへのディフェンス(25bb MTT)",
    "sourceUrl": "https://blog.gtowizard.com/defending-against-tiny-three-bets/",
    "title": "ローボードのポケットペアは早く入れる",
    "summary": "3ベットをコールしてローボードが来たら、66みたいなポケットペアは最良クラスだよ。降りないなら、ドンクかチェックレイズで早くチップを入れようね。",
    "body": "9♥5♦2♦のようなダイナミックなローボードは、両者のアンペアの手のほぼ全てを外す。SPRが非常に低いので、相手のレンジにオーバーペアが厚くても、66でチェックレイズオールイン、あるいはドンクしてコールオフのどちらも十分成り立つ。カードが増えるほど逆転されたりブラフで降ろされたりする機会が増えるので、早く入れる価値が大きい。セットにならないポケットペアはフラッシュドローを持つときのほうがベットを好む。ただしセットはチェックしたら純粋にスロープレイでよい。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "potType": [
        "threeBet"
      ],
      "heroPreflopAggressor": false,
      "inPosition": false,
      "boardHighBand": [
        "L",
        "M"
      ],
      "spr": {
        "min": 0,
        "max": 2.5
      },
      "made": [
        "pocketPairBelow",
        "overPair",
        "middlePair",
        "bottomPair"
      ]
    }
  },
  {
    "id": "tiny3bet-low-flop-pair-fold-mistake",
    "article": "小さい3ベットへのディフェンス(25bb MTT)",
    "sourceUrl": "https://blog.gtowizard.com/defending-against-tiny-three-bets/",
    "title": "低SPRでペアを降りすぎない",
    "summary": "3ベットポットのローボード、SPRが小さいのにペアを降りるのはもったいないよ。このボードではペアがほぼ最良クラスなんだ。",
    "body": "浅いスタックで3ベットをコールし、9-5-2のようなローボードが来ると、相手の大きなブロードウェイの多くは外れている。ソルバーは66のようなポケットペアでもチェックレイズオールインやドンク後のコールオフを選ぶ。キャップされたレンジでできるのは相手レンジ下位の利益を削ることだけで、そのためには自分のレンジ上位を降りないことが必要だ。",
    "grade": "inaccuracy",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "potType": [
        "threeBet"
      ],
      "heroPreflopAggressor": false,
      "inPosition": false,
      "facingBet": true,
      "boardHighBand": [
        "L",
        "M"
      ],
      "spr": {
        "min": 0,
        "max": 2.5
      },
      "made": [
        "pocketPairBelow",
        "middlePair"
      ],
      "action": [
        "fold"
      ]
    }
  },
  {
    "id": "tiny3bet-strong-hand-checkraise",
    "article": "小さい3ベットへのディフェンス(25bb MTT)",
    "sourceUrl": "https://blog.gtowizard.com/defending-against-tiny-three-bets/",
    "title": "強い手はチェックレイズで否定",
    "summary": "3ベットポットでスタックを入れる強さの手を引いたら、コールで待つよりチェックレイズで入れようね。浅いとエクイティ否定が一番大事なんだ。",
    "body": "浅いスタックでは騙しの余地がほとんど無く、スタックを入れる強さの手は主にチェックレイズする。SPRが非常に低いので、相手の強いレンジに支配されうる手でも同様だ。Q♦9♥5♦ではAAは純レイズ、AQは高頻度レイズで、純粋なトラップはセットだけ。コールで待つのは「後で引き出せるチップ」が「今否定できるエクイティ」を上回るという賭けで、大きいポットではそのハードルが高い。レイズしないと相手に逆転と後のストリートで上回る機会を与える。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "potType": [
        "threeBet"
      ],
      "heroPreflopAggressor": false,
      "inPosition": false,
      "facingBet": true,
      "spr": {
        "min": 0,
        "max": 3
      },
      "made": [
        "overPair",
        "twoPair",
        "topPair"
      ],
      "action": [
        "allIn",
        "bet100+",
        "bet80-100",
        "bet60-80"
      ]
    }
  },
  {
    "id": "tiny3bet-high-flop-small-pair-bluff-or-fold",
    "article": "小さい3ベットへのディフェンス(25bb MTT)",
    "sourceUrl": "https://blog.gtowizard.com/defending-against-tiny-three-bets/",
    "title": "ハイボードのスモールポケットペアはブラフかフォールド",
    "summary": "3ベットポットでAやQのボードなら、スモールポケットペアは最弱クラスだよ。チェックレイズのブラフに回すか、素直に降りようね。",
    "body": "Q♦9♥5♦のようにブロードウェイと噛み合うボードでは、スモールポケットペアはバックドアフラッシュドローが無ければフォールドかブラフになる。A♠9♥5♦では3ベッターのエクイティが約61%まで上がり、コール側のレンジの60%近くがエクイティ0〜25%の帯に入る。ここではポケットペアが最良のブラフで、相手のフォールドレンジ(ブロードウェイ)をブロックせず、後のストリートでのプレイアビリティも悪い。チェックレイズのブラフはEV0でフォールドと無差別なので、どちらでもよい。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "potType": [
        "threeBet"
      ],
      "heroPreflopAggressor": false,
      "inPosition": false,
      "facingBet": true,
      "boardHighBand": [
        "H"
      ],
      "spr": {
        "min": 0,
        "max": 3
      },
      "made": [
        "pocketPairBelow"
      ]
    }
  },
  {
    "id": "tiny3bet-ace-flop-call-with-board-pairs",
    "article": "小さい3ベットへのディフェンス(25bb MTT)",
    "sourceUrl": "https://blog.gtowizard.com/defending-against-tiny-three-bets/",
    "title": "Aハイボードはボードペアでコール",
    "summary": "A-9-5みたいな静的なボードで小さいCベットを受けたら、コールするのはボードとペアになった手だよ。MDFより多く降りていいんだ。",
    "body": "A♠9♥5♦では3ベッターのレンジが強く、ブラフに使える手が少ないので、コール側はMDFよりずっと高い頻度でフォールドするのが正しい。コールに回すのはボードとペアになった手で、ポケットペアより後のストリートで改善の見込みがある。トップ・ミドル・ボトムペアが混ざることで、次もベットするかが読みにくくなり、相手のバレルの利益を抑えられる。被害を抑えることがOOPで弱いレンジを持つときの本質だ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "potType": [
        "threeBet"
      ],
      "heroPreflopAggressor": false,
      "inPosition": false,
      "facingBet": true,
      "facingPotPct": {
        "min": 0,
        "max": 40
      },
      "boardHighBand": [
        "H"
      ],
      "boardDraws": [
        "dry",
        "normal"
      ],
      "made": [
        "topPair",
        "middlePair",
        "bottomPair"
      ],
      "action": [
        "checkOrCall"
      ]
    }
  },
  {
    "id": "icm-ep-cbet-small-default",
    "article": "ICMのプリフロップレンジに対するCベット",
    "sourceUrl": "https://blog.gtowizard.com/c-betting-against-icm-preflop-ranges/",
    "title": "EPオープン対BBは小さいCベット",
    "summary": "早い位置からオープンしてBBにコールされたら、25%前後の小さいCベットが基本だよ。BBのレンジより明確に強いからね。",
    "body": "EPのオープンには強い手が必要だが、BBはアクションを閉じて良い価格で広くコールできる。だから多くのフロップでEPのレンジが明確に強く、小さいベットで安いブラフ・薄いバリュー・脆い手のプロテクションを取れる。25bbなら最強の手でも小さいフロップベットを嫌がらず、ターンとリバーの適度なベットで残りを入れきれる。BBはこの小さいベットに想像以上にフォールドすべき。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "role": [
        "cbet"
      ],
      "potType": [
        "srp"
      ],
      "heroPos": [
        "UTG",
        "HJ"
      ],
      "heroPreflopAggressor": true,
      "inPosition": true,
      "multiway": false,
      "boardHighBand": [
        "H"
      ],
      "effStackBb": {
        "min": 15,
        "max": 35
      },
      "action": [
        "bet20-40"
      ]
    }
  },
  {
    "id": "icm-low-board-cbet-less-smaller",
    "article": "ICMのプリフロップレンジに対するCベット",
    "sourceUrl": "https://blog.gtowizard.com/c-betting-against-icm-preflop-ranges/",
    "title": "ICM下のローボードはCベットを控えめに",
    "summary": "ICMがかかっているときのBBはコールレンジが強いんだ。ローボードではCベットの頻度もサイズも下げようね。",
    "body": "ICMでBBのコールは67%から40%まで締まり、ツーギャッパー以上のロースーテッドと、ハイ+ローのオフスートが抜ける。5♥4♦2♣・25bbでは、cEVレンジ相手だとUTGは60%超でCベットし80%ポットが最多だったが、ICMレンジ相手だとCベットはレンジの半分程度で、主に50%ポットになる。8♥7♥4♦でも同じで、80%ポットのレンジはほぼ消える。ポストフロップにICMを入れればさらに小さく少なくなると考えられる。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "potType": [
        "srp"
      ],
      "heroPos": [
        "UTG",
        "HJ",
        "CO"
      ],
      "heroPreflopAggressor": true,
      "inPosition": true,
      "multiway": false,
      "facingBet": false,
      "boardHighBand": [
        "L",
        "M"
      ],
      "icmStage": [
        "nearBubble",
        "bubble",
        "itm",
        "finalTable"
      ]
    }
  },
  {
    "id": "icm-low-board-overpair-half-pot",
    "article": "ICMのプリフロップレンジに対するCベット",
    "sourceUrl": "https://blog.gtowizard.com/c-betting-against-icm-preflop-ranges/",
    "title": "ICM下のオーバーペアは50%ポット",
    "summary": "ICMで締まったBBレンジ相手なら、ローボードのオーバーペアは80%より50%ポットが合うよ。払ってくれる2番手の手が少ないんだ。",
    "body": "88のようなオーバーペアは、今は強いが多くのターン・リバーでベットできなくなるので、今チップを入れたい。cEVの広いBBレンジは弱いペアを多く引いているので80%ポットが合う。しかしICMで締まったBBレンジは2番手の手が少なく、より大きいポケットペアを持つこともあるため、オーバーペアはベットとチェックで無差別に近くなり、主に50%ポットを選ぶ。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "role": [
        "cbet"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": true,
      "inPosition": true,
      "multiway": false,
      "boardHighBand": [
        "L",
        "M"
      ],
      "made": [
        "overPair"
      ],
      "icmStage": [
        "nearBubble",
        "bubble",
        "itm",
        "finalTable"
      ],
      "action": [
        "bet40-60"
      ]
    }
  },
  {
    "id": "icm-low-board-overpair-big-cbet",
    "article": "ICMのプリフロップレンジに対するCベット",
    "sourceUrl": "https://blog.gtowizard.com/c-betting-against-icm-preflop-ranges/",
    "title": "ICM下で大きいCベットは打ちすぎ",
    "summary": "ICMがかかっているときにローボードのオーバーペアで80%以上打つのは、少し入れすぎだよ。50%ポットを基準にしようね。",
    "body": "チップEVではオーバーペアは広いBBレンジに80%ポットを打つ。だがICMではBBのコールレンジが強く、払ってくれる弱いペアが少ない。5♥4♦2♣や8♥7♥4♦の比較では、ICMレンジ相手だと80%ポットのレンジはほぼ消え、オーバーペアは主に50%ポットになる。プリフロップレイザーのレンジ優位は小さくなっているので、ポットに入れる額を減らすのが筋だ。",
    "grade": "inaccuracy",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "role": [
        "cbet"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": true,
      "inPosition": true,
      "multiway": false,
      "boardHighBand": [
        "L",
        "M"
      ],
      "made": [
        "overPair"
      ],
      "icmStage": [
        "nearBubble",
        "bubble",
        "itm",
        "finalTable"
      ],
      "action": [
        "bet80-100",
        "bet100+"
      ]
    }
  },
  {
    "id": "icm-modest-pair-check-more",
    "article": "ICMのプリフロップレンジに対するCベット",
    "sourceUrl": "https://blog.gtowizard.com/c-betting-against-icm-preflop-ranges/",
    "title": "ICM下の控えめなペアはチェック増",
    "summary": "ICMで締まったBBレンジには小さいカードが少ないから、ウィークキッカーのAxやポケットペアはコールしてもらいにくいよ。チェックを増やそうね。",
    "body": "A♥7♥6♦では、cEVレンジ相手だと50%ポットのレンジベット(線形)だったが、ICMレンジ相手だとチェックが17%増え、やや両極寄りに移る。ベットをやめるのはポケットペアやウィークキッカーのAxといった控えめなペアで、悪い手ではないものの、7xや6xにコールされる可能性が下がるからだ。8♥7♥4♦でも変化を主導するのは控えめなワンペアの手だった。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": true,
      "inPosition": true,
      "multiway": false,
      "facingBet": false,
      "made": [
        "pocketPairBelow",
        "middlePair",
        "bottomPair",
        "topPair"
      ],
      "kicker": [
        "low",
        "good"
      ],
      "icmStage": [
        "nearBubble",
        "bubble",
        "itm",
        "finalTable"
      ],
      "action": [
        "checkOrCall"
      ]
    }
  },
  {
    "id": "icm-bb-tighter-defense-vs-ep",
    "article": "ICMのプリフロップレンジに対するCベット",
    "sourceUrl": "https://blog.gtowizard.com/c-betting-against-icm-preflop-ranges/",
    "title": "ICM下のBBはEPオープンへのコールを締める",
    "summary": "ICMがかかると、BBがEPオープンにコールする範囲はぐっと狭くなるよ。ツーギャッパー以上のロースーテッドと、ハイ+ローのオフスートは降りようね。",
    "body": "25bbでUTGのオープンに対し、BBのコールはcEVの67%から、フィールド残り25%のICMで40%まで減る。抜けるのは主に、ツーギャッパー以上のロースーテッドと、ハイ+ローのオフスート。その代わりBBのコールレンジは強くなり、オープナーのCベットの頻度とサイズを抑えられる。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "BB"
      ],
      "preflopSpot": [
        "vsOpen"
      ],
      "effStackBb": {
        "min": 15,
        "max": 45
      },
      "icmStage": [
        "nearBubble",
        "bubble",
        "itm",
        "finalTable"
      ]
    }
  },
  {
    "id": "icm-deeper-still-check-more",
    "article": "ICMのプリフロップレンジに対するCベット",
    "sourceUrl": "https://blog.gtowizard.com/c-betting-against-icm-preflop-ranges/",
    "title": "40bbでもICM下はチェック増",
    "summary": "40bbと少し深くても、ICMで強くなったBBレンジには大きいCベットを減らしてチェックを増やすのが同じ傾向だよ。",
    "body": "5♥4♦2♣を40bbで比べると、深い分だけ大きいサイズにもまだ使い道がある。それでもBBの強いレンジに対しては、UTGはチェックを増やし、大きいベットを減らす。ICMのプレッシャーが高いとオープンでポットを取れる頻度が上がる代わりに、ポストフロップではブラフもバリューも以前ほど取れないことを受け入れよう。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": true,
      "inPosition": true,
      "multiway": false,
      "boardHighBand": [
        "L"
      ],
      "effStackBb": {
        "min": 35,
        "max": 60
      },
      "icmStage": [
        "nearBubble",
        "bubble",
        "itm",
        "finalTable"
      ],
      "action": [
        "bet80-100",
        "bet100+"
      ]
    }
  },
  {
    "id": "mono-flop-cbet-small",
    "article": "モノトーンのフロップで価値を最大化する",
    "sourceUrl": "https://blog.gtowizard.com/maximizing-value-on-monotone-flops/",
    "title": "モノトーンのフロップは小さく高頻度にCベット",
    "summary": "モノトーンのフロップでも、プリフロップレイザーは小さいサイズで広くCベットしていいよ。相手がフラッシュを持ってる可能性は低いんだ。",
    "body": "40bbのSRPのモノトーンの K95 で、BTNがフロップでフラッシュを持つのは5%、BBは6%だけなんだ。フラッシュドローを持つのも多くて25〜30%。プリフロップレイザーはエクイティ優位を活かしたいけど、BBのレンジのほうがフラッシュが多いかもしれないので、普通のフロップ以上に小さいサイズを好む。BTNは K♥9♥5♥ でエクイティの55%超を持ち、どんな2枚でもブラフが利益になるので、33%ポットくらいを高頻度で打とうね。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "boardSuit": [
        "monotone"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": true,
      "inPosition": true,
      "role": [
        "cbet"
      ],
      "action": [
        "bet20-40"
      ],
      "multiway": false
    }
  },
  {
    "id": "mono-flop-check-medium-pair-no-heart",
    "article": "モノトーンのフロップで価値を最大化する",
    "sourceUrl": "https://blog.gtowizard.com/maximizing-value-on-monotone-flops/",
    "title": "モノトーンの中程度のペアはチェックバック",
    "summary": "モノトーンのフロップで、スートを持たない中程度のペアはチェックバックでいいよ。膨らんだポットで一番困る手なんだ。",
    "body": "BTNは K♥9♥5♥ のような良いフロップでは小さいベットを高頻度で打つけど、チェックレンジは『大きなポットで最も成績が悪い手』、つまりハートを持たない中程度のペアが中心なんだ。こうした手はベットしてレイズされると苦しく、フラッシュのブロッカーも無い。ターンでもブランクなら中程度のペアはほぼピュアチェックで、例外は強いハートをキッカーに持つときだけだよ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "boardSuit": [
        "monotone"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": true,
      "inPosition": true,
      "facingBet": false,
      "made": [
        "middlePair",
        "pocketPairBelow"
      ],
      "multiway": false
    }
  },
  {
    "id": "mono-flop-bb-checkraise-two-pair-set",
    "article": "モノトーンのフロップで価値を最大化する",
    "sourceUrl": "https://blog.gtowizard.com/maximizing-value-on-monotone-flops/",
    "title": "モノトーンではツーペアとセットをチェックレイズ",
    "summary": "モノトーンのフロップでツーペアやセットを持ったら、チェックレイズしてすぐにお金を入れようね。",
    "body": "K♥9♥5♥ でBBが最も一貫してチェックレイズする手はツーペアで、フラッシュや強いドローすら上回るんだ。ツーペアとセットは今は強いけど、カードが落ちるほど価値を失う脆い手。さらにフルハウスになれば相手のフラッシュをクーラーにできる。フロップの段階ではフラッシュやフラッシュドローは他の強い手を無意味にするほど多くないので、遠慮せず大きくしていこうね。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "boardSuit": [
        "monotone"
      ],
      "inPosition": false,
      "heroPreflopAggressor": false,
      "facingBet": true,
      "role": [
        "checkRaise"
      ],
      "made": [
        "twoPair",
        "trips"
      ],
      "action": [
        "bet40-60",
        "bet60-80",
        "bet80-100",
        "bet100+",
        "allIn"
      ],
      "multiway": false
    }
  },
  {
    "id": "mono-flop-oop-no-donk",
    "article": "モノトーンのフロップで価値を最大化する",
    "sourceUrl": "https://blog.gtowizard.com/maximizing-value-on-monotone-flops/",
    "title": "モノトーンのフロップでドンクは不要",
    "summary": "モノトーンのフロップでコーラー側からドンクするのはほぼ要らないよ。強い手はチェックレイズに回そうね。",
    "body": "プリフロップレイザーが小さいCベットを高頻度で打ってくるモノトーンのフロップでは、BBは特にドンクベットしないんだ。モンスターを作ったらチェックレイズを好み、フラッシュはBBのフロップのレイズレンジの約20%を占める。チェックしておけば相手のCベットに対してレイズでポットを大きくできるよ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "boardSuit": [
        "monotone"
      ],
      "inPosition": false,
      "heroPreflopAggressor": false,
      "role": [
        "donk"
      ],
      "multiway": false
    }
  },
  {
    "id": "mono-low-flush-dont-fear",
    "article": "モノトーンのフロップで価値を最大化する",
    "sourceUrl": "https://blog.gtowizard.com/maximizing-value-on-monotone-flops/",
    "title": "低いフラッシュを怖がりすぎない",
    "summary": "モノトーンで低いフラッシュを作っても、4枚目のハートを怖がりすぎなくていいよ。来るのは2割弱なんだ。",
    "body": "自分のホールカード2枚とボード3枚が同じスートなら、山に残るそのスートは8枚で、ターンに来るのは約17%なんだ。相手もそのスートを持っていればさらに低く、持っていなければ4枚目が来てもポットを失うとは限らない(ブラフで降ろされる可能性はあるけど)。相手がフラッシュを持つ確率自体も低いので、バリューを取る手として普通にプレイしようね。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop"
      ],
      "boardSuit": [
        "monotone"
      ],
      "made": [
        "flush"
      ],
      "multiway": false
    }
  },
  {
    "id": "mono-turn-blank-check-medium-pair",
    "article": "モノトーンのフロップで価値を最大化する",
    "sourceUrl": "https://blog.gtowizard.com/maximizing-value-on-monotone-flops/",
    "title": "ブランクのターンは中程度のペアをチェック",
    "summary": "モノトーンでブランクのターンなら、中程度のペアはチェックバックでいいよ。バレルはポラライズしたレンジで打とうね。",
    "body": "40bbの K♥9♥5♥ 2♦ のようなブランクのターンでは、BTNはポラライズしたレンジでバレルし、中程度のペアはほぼピュアチェックなんだ(強いハートのキッカーがあるときだけ例外)。バリュー側はフラッシュだけでなく、セット、ツーペア、AA、トップペアもかなり含み、Kxはハートのキッカーならほぼピュアベット、それ以外はベットとチェックが半々に近い。ブラフは9より上のオーバーカードとハートのドロー/ブロッカーを持つ手が好まれるよ。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "turn"
      ],
      "boardSuit": [
        "monotone"
      ],
      "boardChange": [
        "blank"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": true,
      "inPosition": true,
      "facingBet": false,
      "made": [
        "middlePair",
        "pocketPairBelow"
      ],
      "action": [
        "checkOrCall"
      ],
      "multiway": false
    }
  },
  {
    "id": "mono-turn-4flush-small-block-bet",
    "article": "モノトーンのフロップで価値を最大化する",
    "sourceUrl": "https://blog.gtowizard.com/maximizing-value-on-monotone-flops/",
    "title": "4フラッシュのターンはツーペア・セットで小さく打つ",
    "summary": "ターンで4枚目のスートが落ちたら、ツーペアやセットは20%ポットくらいの小さいベットで少しだけバリューを取ろうね。",
    "body": "K♥9♥5♥ 2♥ のターンで、BTNの20%ポットのベットはツーペア、セット、一部のAKやAAで構成される先制のブロックベットなんだ。少しバリューを搾って、リバーはチェックバックで安くショーダウンを目指す。値段が良いのでブラフはほとんど無いけど、A♥Q♥やQ♥J♥のような大きいハート2枚のトラップを混ぜる。この20%に対してBBはサードペア以下しか降りないので、薄いバリューが取れるよ。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "turn"
      ],
      "boardSuit": [
        "monotone"
      ],
      "boardChange": [
        "flushCompleted"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": true,
      "inPosition": true,
      "facingBet": false,
      "made": [
        "twoPair",
        "trips",
        "overPair"
      ],
      "action": [
        "bet20-40"
      ],
      "multiway": false
    }
  },
  {
    "id": "mono-turn-4flush-vs-big-bet",
    "article": "モノトーンのフロップで価値を最大化する",
    "sourceUrl": "https://blog.gtowizard.com/maximizing-value-on-monotone-flops/",
    "title": "4フラッシュのターンの大きいベットにはツーペア未満は降りる",
    "summary": "4枚目のスートが落ちたターンで大きく打たれたら、ツーペア未満はほぼ降りていいよ。小さいベットならもっと粘ろうね。",
    "body": "K♥9♥5♥ 2♥ のターンでBTNの83%ポットのベットはポラライズしていて、Q♥やA♥のコンボの大半と最も弱い手で構成されるんだ。これに対してBBはコールかフォールドのみで、ツーペアとフラッシュはピュアコール、MDFを満たすためにトップペアを少し混ぜるだけで、ツーペア未満は大半フォールド。ツーペアはフルハウスに改善できるので平均以上のブラフキャッチャーなんだ。逆に20%ポットの小さいベットにはサードペア以下だけを降ろそうね。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "turn"
      ],
      "boardSuit": [
        "monotone"
      ],
      "boardChange": [
        "flushCompleted"
      ],
      "inPosition": false,
      "heroPreflopAggressor": false,
      "facingBet": true,
      "facingPotPct": {
        "min": 70
      },
      "made": [
        "topPair",
        "middlePair",
        "bottomPair",
        "pocketPairBelow",
        "highCard"
      ],
      "action": [
        "fold"
      ],
      "multiway": false
    }
  },
  {
    "id": "mono-river-blank-value-shove",
    "article": "モノトーンのフロップで価値を最大化する",
    "sourceUrl": "https://blog.gtowizard.com/maximizing-value-on-monotone-flops/",
    "title": "ドライなランアウトはワンペア超でバリューのオールイン",
    "summary": "モノトーンでもリバーまでスートが増えなかったなら、ワンペアより強い手は迷わずオールインでいいよ。",
    "body": "K♥9♥5♥ 2♦ 6♣ のようなドライなランアウトでは、BBがフラッシュを持つ可能性はそれほど高くないんだ。BTNはオールインかチェックの戦略で、ワンペアより強い手は全部100%オールイン、AKでもAがハートなら100%オールインする。3バレル目でもバリューのオールインにフラッシュやブロッカーは必須ではないよ。ブラフはA♥4x・A♥3x・A♥2xのような手がAQやAJより向いていて、QJのような高めの手はBBのフォールドレンジをブロックするので向かないんだ。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "river"
      ],
      "boardSuit": [
        "monotone"
      ],
      "boardChange": [
        "blank"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": true,
      "inPosition": true,
      "facingBet": false,
      "made": [
        "twoPair",
        "trips",
        "straight",
        "flush",
        "fullHouse"
      ],
      "action": [
        "allIn"
      ],
      "multiway": false
    }
  },
  {
    "id": "mono-river-4flush-no-flush-fold",
    "article": "モノトーンのフロップで価値を最大化する",
    "sourceUrl": "https://blog.gtowizard.com/maximizing-value-on-monotone-flops/",
    "title": "4フラッシュのリバーはフラッシュが無ければ降りる",
    "summary": "リバーで同じスートが4枚になって大きく打たれたら、フラッシュが無い手は基本フォールドでいいよ。",
    "body": "K♥9♥5♥ 2♦ 6♥ のようなリバーでは、BBはフラッシュならコール、無ければフォールドが基本なんだ(ブラフを特に多く/少なくブロックする手でまれに例外)。BTNはバリューのオールインにJ♥(3番目のナッツ)クラスを要求し、低いフラッシュはチェックバックが多い。ボードに4枚あると自分がフラッシュを持たない限りブロッカーも効かないので、フラッシュ無しの手に粘る理由は乏しいよ。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "river"
      ],
      "boardSuit": [
        "monotone"
      ],
      "boardChange": [
        "flushCompleted"
      ],
      "inPosition": false,
      "heroPreflopAggressor": false,
      "facingBet": true,
      "facingPotPct": {
        "min": 60
      },
      "made": [
        "twoPair",
        "overPair",
        "topPair",
        "middlePair",
        "bottomPair",
        "pocketPairBelow",
        "highCard"
      ],
      "action": [
        "fold"
      ],
      "multiway": false
    }
  },
  {
    "id": "tdb-low-pair-turn-donk-default",
    "article": "ターンのドンクベットの使い方と理由",
    "sourceUrl": "https://blog.gtowizard.com/how-and-why-you-should-use-turn-donk-bets/",
    "title": "低いカードがペアになったターンはドンク",
    "summary": "フロップでコールして、ターンで9以下のボードカードがペアになったら、20%ポットくらいで小さくドンクするのが基本だよ。",
    "body": "Cベットにチェックコールすると、BBのレンジは弱い手が削れて強くなる一方、強い手もレイズに回ってキャップされ、中程度の手が中心になるんだ。そこへ9以下のカードがペアになるターンが来ると、UTGのCベットレンジに少ない中程度のペアがトリップスに化ける。40bbのUTG vs BB、J♠5♣3♦ では、BBのドンクはほぼ全部 2・3・4・5・6 のターン。サイズは20%ポット程度にすれば、ナッツ級だけでなく薄いバリューと保護が欲しい中程度のペアも一緒に打てるよ。",
    "grade": "good",
    "keepGto": false,
    "priority": 15,
    "when": {
      "street": [
        "turn"
      ],
      "heroPos": [
        "BB"
      ],
      "role": [
        "donk"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": false,
      "inPosition": false,
      "boardChange": [
        "paired"
      ],
      "boardPairBand": [
        "L",
        "M"
      ],
      "action": [
        "bet20-40"
      ],
      "multiway": false
    }
  },
  {
    "id": "tdb-high-pair-turn-check",
    "article": "ターンのドンクベットの使い方と理由",
    "sourceUrl": "https://blog.gtowizard.com/how-and-why-you-should-use-turn-donk-bets/",
    "title": "トップカードがペアになったターンはチェック",
    "summary": "フロップの一番上のカードがターンでペアになっても、相手のほうがそのカードを多く持ってるから、基本はチェックしようね。",
    "body": "J53 で J がペアになるターンはドンクに良いカードではないんだ。UTGもプリフロップのオープンとフロップのCベットに Jx を多く持ち、平均してキッカーも良いので、ナッツアドバンテージがコーラーに移らない。KQ9 の Q や K も同じ。ドンクに向くのは、一番下や2番目のカードがペアになるターンだよ。ただし100bbではBBが Jx をフロップでチェックレイズしにくい分、Jのターンのドンクが少し増える。",
    "grade": null,
    "keepGto": false,
    "priority": 5,
    "when": {
      "street": [
        "turn"
      ],
      "heroPos": [
        "BB"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": false,
      "inPosition": false,
      "facingBet": false,
      "boardChange": [
        "paired"
      ],
      "boardPairBand": [
        "H"
      ],
      "action": [
        "checkOrCall"
      ],
      "multiway": false
    }
  },
  {
    "id": "tdb-blank-turn-default-check",
    "article": "ターンのドンクベットの使い方と理由",
    "sourceUrl": "https://blog.gtowizard.com/how-and-why-you-should-use-turn-donk-bets/",
    "title": "ブランクのターンはチェックが基本",
    "summary": "フロップでコールした後、ターンがブランクならチェックでいいよ。レイザーのほうがナッツを多く持ってるんだ。",
    "body": "Cベットにコールした後、BBのエクイティはレイザーと同等以上になるけど、レイザーは最も強い手の大半をフロップでベットし、BBは最も強い手をレイズに回すので、ナッツアドバンテージはむしろレイザーに広がるんだ。コールしたBBのレンジは中程度の手が中心で、ポットを育てたいわけではない。だから迷ったら大半のターンはチェックがデフォルトだよ。",
    "grade": "good",
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "turn"
      ],
      "heroPos": [
        "BB"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": false,
      "inPosition": false,
      "facingBet": false,
      "boardChange": [
        "blank",
        "overcard"
      ],
      "action": [
        "checkOrCall"
      ],
      "multiway": false
    }
  },
  {
    "id": "tdb-trips-low-kicker-donk",
    "article": "ターンのドンクベットの使い方と理由",
    "sourceUrl": "https://blog.gtowizard.com/how-and-why-you-should-use-turn-donk-bets/",
    "title": "トリップスは弱いキッカーでドンク",
    "summary": "ターンでトリップスになってキッカーが弱いならドンクしよう。AやKのキッカーならチェックしてブラフを誘うのもアリだよ。",
    "body": "BB vs BTN、40bb、J♠5♣3♦3♥ でBBはレンジの約40%をドンクするんだ。トリップスを作ったら主にドンクするけど、AかKのキッカーのときは別。低いキッカーは、BTNがチェックされたらブラフしてくる手(T9o や 87s)をブロックしないので、打って降ろしても損が小さい。A3 で打つと、チェックすればブラフしてきた手を多く降ろしてしまうんだ。ちなみに Q3s は2コンボしか無いので、トリップスはベットレンジの大部分ではないよ。",
    "grade": "good",
    "keepGto": false,
    "priority": 15,
    "when": {
      "street": [
        "turn"
      ],
      "heroPos": [
        "BB"
      ],
      "role": [
        "donk"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": false,
      "inPosition": false,
      "boardChange": [
        "paired"
      ],
      "made": [
        "trips"
      ],
      "kicker": [
        "low"
      ],
      "action": [
        "bet20-40",
        "bet40-60"
      ],
      "multiway": false
    }
  },
  {
    "id": "tdb-trips-top-kicker-check",
    "article": "ターンのドンクベットの使い方と理由",
    "sourceUrl": "https://blog.gtowizard.com/how-and-why-you-should-use-turn-donk-bets/",
    "title": "トップキッカーのトリップスはチェックで誘う",
    "summary": "Aキッカーのトリップスなら、ターンはチェックして相手のブラフを待つのもいい選択だよ。",
    "body": "J♠5♣3♦3♥ のようなターンでBBはトリップスの多くをドンクするけど、AかKのキッカーのときは例外なんだ。強いキッカーは相手のフォールドレンジをブロックしないので、打つと T9o や 87s のような、チェックすればブラフしてきた手を降ろしてしまう。チェックして相手に打たせたほうが、その手から多く取れるよ。",
    "grade": null,
    "keepGto": false,
    "priority": 10,
    "when": {
      "street": [
        "turn"
      ],
      "heroPos": [
        "BB"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": false,
      "inPosition": false,
      "facingBet": false,
      "boardChange": [
        "paired"
      ],
      "made": [
        "trips"
      ],
      "kicker": [
        "top"
      ],
      "action": [
        "checkOrCall"
      ],
      "multiway": false
    }
  },
  {
    "id": "tdb-second-pair-donk-protection",
    "article": "ターンのドンクベットの使い方と理由",
    "sourceUrl": "https://blog.gtowizard.com/how-and-why-you-should-use-turn-donk-bets/",
    "title": "セカンドペアは小さくドンクで保護",
    "summary": "ボードがペアになったターンでセカンドペアを持ってるなら、小さくドンクして相手のオーバーカードを降ろそうね。",
    "body": "セカンドペアはBBのドンクレンジの大きな部分なんだ。よく勝っていて、劣る手にコールされ(BTNはAハイを決して降りず、Kハイも最悪のものしか降りない)、T7s のような手のエクイティを奪える。J♠5♣3♦3♥ では 52s のほうが T5s より高頻度でベットする。T5 は自分が支配する手からのブラフを誘えるけど、52 はライブな2枚のオーバーカードを降ろしたいからね。レイズされると苦しいけど、BBのナッツアドバンテージが相手のレイズを抑えてくれるよ。",
    "grade": "good",
    "keepGto": false,
    "priority": 10,
    "when": {
      "street": [
        "turn"
      ],
      "heroPos": [
        "BB"
      ],
      "role": [
        "donk"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": false,
      "inPosition": false,
      "boardChange": [
        "paired"
      ],
      "boardPairBand": [
        "L",
        "M"
      ],
      "made": [
        "middlePair",
        "bottomPair"
      ],
      "action": [
        "bet20-40"
      ],
      "multiway": false
    }
  },
  {
    "id": "tdb-flush-complete-turn-donk",
    "article": "ターンのドンクベットの使い方と理由",
    "sourceUrl": "https://blog.gtowizard.com/how-and-why-you-should-use-turn-donk-bets/",
    "title": "フラッシュ完成のターンはドンク",
    "summary": "フロップでフラッシュドローを付いていって完成したなら、ターンは自分から小さく打っていこうね。",
    "body": "K♠Q♥5♥ では、ボードのペアに加えてフラッシュ完成カードが新たなドンク候補になるんだ。UTGもいくらかフラッシュを作るけど、BBのレンジのほうがこうしたドローに集中しているので、特に良いターンになる。ナッツ級の手が自分のレンジに多く入るターンでは、20%ポット程度のドンクでポットを育て始めよう。ただし深いスタックではフロップで強いドローをチェックレイズに回す分、完成カードでのドンクは減るよ。",
    "grade": "good",
    "keepGto": false,
    "priority": 10,
    "when": {
      "street": [
        "turn"
      ],
      "heroPos": [
        "BB"
      ],
      "role": [
        "donk"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": false,
      "inPosition": false,
      "boardChange": [
        "flushCompleted"
      ],
      "made": [
        "flush"
      ],
      "action": [
        "bet20-40",
        "bet40-60"
      ],
      "multiway": false
    }
  },
  {
    "id": "tdb-straight-turn-donk",
    "article": "ターンのドンクベットの使い方と理由",
    "sourceUrl": "https://blog.gtowizard.com/how-and-why-you-should-use-turn-donk-bets/",
    "title": "自分のレンジのストレートが完成するターンはドンク",
    "summary": "低いストレートやツーペアが完成するターンなら、小さくドンクしていいよ。相手のオープンレンジには少ない手なんだ。",
    "body": "J♠5♣3♦ では2・4・6のターンが、UTGがオープンしにくいストレートドローを完成させるのでドンク候補になるんだ。K♠7♦5♥ でも6のターンは、BBに 76o・65o のツーペアも与えるので頻度が高い。逆に 9・8・3 は、98 はBBのレンジに多いけどOESDはフロップで高頻度にチェックレイズしているので、ターンでストレートになっている可能性はそれほど高くない。KQ9 の J・T のように、UTGが AJ・AT をフル頻度で持つ完成カードは向かないよ。",
    "grade": "good",
    "keepGto": false,
    "priority": 5,
    "when": {
      "street": [
        "turn"
      ],
      "heroPos": [
        "BB"
      ],
      "role": [
        "donk"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": false,
      "inPosition": false,
      "boardChange": [
        "straightMove"
      ],
      "made": [
        "straight",
        "twoPair"
      ],
      "action": [
        "bet20-40",
        "bet40-60"
      ],
      "multiway": false
    }
  },
  {
    "id": "tdb-deep-stack-donk-less",
    "article": "ターンのドンクベットの使い方と理由",
    "sourceUrl": "https://blog.gtowizard.com/how-and-why-you-should-use-turn-donk-bets/",
    "title": "深いスタックではターンのドンクは少し減る",
    "summary": "100bbくらい深いと、OOPでポットを育てるリスクが大きいから、ターンのドンクは少し控えめにしようね。",
    "body": "ターンのドンク戦略はスタックであまり変わらないけど、深いとOOPからポットを育てるリスクが大きいので、ドンクはやや減るんだ。K75r ではBBのドンクが40bbで約16%、100bbで約11%。深いとBBはフロップで強いドローをチェックレイズに回すので、ストレート完成のターンでドンクする手が残っていない。逆に非常に浅いと、中程度のペアでドンクするリスクが減って頻度は少し上がるよ。どのターンで打つかのヒューリスティクス自体はどの深さでも使える。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "turn"
      ],
      "heroPos": [
        "BB"
      ],
      "role": [
        "donk"
      ],
      "potType": [
        "srp"
      ],
      "heroPreflopAggressor": false,
      "inPosition": false,
      "effStackBb": {
        "min": 70
      },
      "multiway": false
    }
  },
  {
    "id": "spot-bb-vs-limp",
    "article": "プリフロップ: リンプが入っている(対象外の理由「リンプポット」)",
    "sourceUrl": null,
    "title": "BB でリンプに直面",
    "summary": "リンプされたBBは、強い手と相手のリンプレンジに強い手でレイズ(アイソレート)、それ以外はチェックでフロップを見ようね。{hand}はタダでフロップが見られるのも大きいよ。",
    "body": "リンプは「オープンするほど強くない手」が多いので、リンプしたプレイヤーのレンジはキャップされていて弱い。BB はポジションが無いので、レイズするのはバリューになる強い手(ブロードウェイ、ミドル以上のポケットペア、スーテッドエース)と、相手を降ろしやすいブロッカーのある手。それ以外はチェックしてフロップを安く見る。\nBvB(SB のリンプに BB)では、SB のリンプレンジは広いので、BB はかなり広くレイズでき、浅いスタック(40bb 以下)ではレイズを多めにして、レイズするならポットを取りに行くサイズ(3〜4bb)にする。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "BB"
      ],
      "preflopSpot": [
        "vsLimp"
      ]
    }
  },
  {
    "id": "spot-vs-limp-iso",
    "article": "プリフロップ: リンプが入っている(対象外の理由「リンプポット」)",
    "sourceUrl": null,
    "title": "リンプに直面(アイソレートの判断)",
    "summary": "前にリンプがいるなら、オープンレンジより少し強い手でアイソレート(3〜4bb+リンプ1人ごとに1bb)してヘッズアップに持ち込もうね。{hand}は、アイソするか降りるかで考えて、オーバーリンプは控えめに。",
    "body": "リンプしたプレイヤーのレンジはキャップされていて弱いので、ポジションを取って大きめにレイズ(アイソレート)し、ヘッズアップで主導権を握るのが基本。サイズはオープンの額+リンプ1人ごとに1bb くらい。\nオーバーリンプ(後ろからリンプで付いていく)は、ポットがマルチウェイになり、主導権も無いので、スモールポケットペアやスーテッドコネクターのように「安くセットやドローを狙える手」に限る。それ以外は降りる。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "UTG",
        "HJ",
        "CO",
        "BTN",
        "SB"
      ],
      "preflopSpot": [
        "vsLimp"
      ]
    }
  },
  {
    "id": "spot-sb-limp-vs-raise",
    "article": "プリフロップ: 自分のリンプにレイズが返ってきた / 自分のオープンに 3ベット(対象外の理由「自分のオープンにリレイズ」)",
    "sourceUrl": null,
    "title": "SB のリンプに BB がレイズ",
    "summary": "SBからリンプしてBBにレイズされたら、ポットオッズが良いぶん広めにコールしていいよ。浅いスタックなら、強い手はオールインで返そうね。",
    "body": "SB のリンプレンジは広いので、BB のレイズにすぐ降りすぎると、BB に毎回レイズされて損をする。リンプした額がもうポットに入っているぶん、コールに必要な勝率は低い。\nスタックが浅い(20bb 前後以下)ときは、ポケットペアやスーテッドエース、ブロードウェイはオールインで返す(リシャブ)。深いときは、ポジションが無いので、コールするのはプレイしやすい手(ポケットペア、スーテッドの手)を中心にする。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "heroPos": [
        "SB"
      ],
      "preflopSpot": [
        "vsOpen"
      ],
      "heroFirstAction": false
    }
  },
  {
    "id": "spot-open-vs-3bet",
    "article": "プリフロップ: 自分のリンプにレイズが返ってきた / 自分のオープンに 3ベット(対象外の理由「自分のオープンにリレイズ」)",
    "sourceUrl": null,
    "title": "オープンに 3ベットが返ってきた",
    "summary": "オープンに3ベットされたら、レンジの上(QQ+やAK)は4ベット、ポジションのあるプレイしやすい手はコール、それ以外は降りようね。{effBb}bbなら、4ベットするならオールインも考えよう。",
    "body": "3ベットに対しては、オープンしたレンジのうち 4ベット(バリュー)・コール・フォールドに分ける。4ベットはプレミアム(QQ+ / AK)と、一部のブロッカーのある手(A5s など)をブラフに混ぜる。コールはポジションがあり、ポストフロップでプレイしやすい手(ポケットペア、スーテッドブロードウェイ、スーテッドコネクター)。\nスタックが浅い(30bb 以下)と、4ベットするとほぼコミットするので、4ベットはオールインにして、コールで中途半端に入れない。ハイ+ローのオフスートや弱いオフスートのブロードウェイは降りる。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "preflopSpot": [
        "vs3bet"
      ],
      "heroFirstAction": false
    }
  },
  {
    "id": "spot-vs-4bet",
    "article": "プリフロップ: 自分のリンプにレイズが返ってきた / 自分のオープンに 3ベット(対象外の理由「自分のオープンにリレイズ」)",
    "sourceUrl": null,
    "title": "4ベット以上に直面",
    "summary": "4ベットに直面したら、コールかオールインするのはほぼプレミアム(QQ+、AK)だけだよ。それ以外は降りて、参加するならオールインでいこうね。",
    "body": "4ベットのレンジは強いので、コールかオールインできる手はかなり絞られる。KK+ と AK はオールイン、QQ・JJ はスタックの深さと相手次第。4ベットにコールするとスタックの多くがポットに入るので、参加するならオールインで、相手の残りのフォールドエクイティも使う。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "preflopSpot": [
        "vs4bet"
      ]
    }
  },
  {
    "id": "spot-squeeze-raise",
    "article": "プリフロップ: オープン+コーラーがいる(対象外の理由「スクイーズ」)",
    "sourceUrl": null,
    "title": "スクイーズ",
    "summary": "オープンとコーラーがいる所への3ベット(スクイーズ)は、オープンの3ベットより大きいサイズで、強い手とブロッカーのある手で打とうね。",
    "body": "コーラーのレンジは「3ベットするほど強くない手」でキャップされているので、スクイーズは通りやすい。ただし相手が2人いるので、サイズは通常の 3ベットより大きく(オープン額の4〜5倍+コーラー1人ごとにオープン額1つ)。\nバリューはプレミアムとハイポケットペア、ブラフはスーテッドエース(A5s〜A2s)のようなブロッカーのある手。浅いスタックでは、スクイーズはオールイン(リシャブ)にする。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "squeezeSpot": true,
      "action": [
        "raise2-5",
        "raise5+",
        "allIn"
      ]
    }
  },
  {
    "id": "spot-squeeze-call",
    "article": "プリフロップ: オープン+コーラーがいる(対象外の理由「スクイーズ」)",
    "sourceUrl": null,
    "title": "オープン+コーラーにオーバーコール",
    "summary": "オープンとコーラーがいる所でのオーバーコールは、マルチウェイでも勝ちやすい手(スモールポケットペア、スーテッドコネクター、スーテッドエース)に絞ろうね。",
    "body": "オーバーコールするとマルチウェイのポットになり、トップペア程度では勝ちにくい。セットやフラッシュ・ストレートのような強い役になりやすい手がオーバーコールに向いている。オフスートのブロードウェイやハイ+ローのオフスートは、ドミネートされやすく、マルチウェイで勝ちにくいので降りる。BB はポットオッズが良いので少し広くコールしてよい。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "squeezeSpot": true,
      "action": [
        "call"
      ]
    }
  },
  {
    "id": "spot-squeeze-fold",
    "article": "プリフロップ: オープン+コーラーがいる(対象外の理由「スクイーズ」)",
    "sourceUrl": null,
    "title": "オープン+コーラーに降りる",
    "summary": "オープンとコーラーがいる所では、強い手と、マルチウェイで勝ちやすい手以外は降りていいよ。{hand}は、ここではコールしにくいハンドだね。",
    "body": "相手が2人以上いると、勝つために必要な手の強さが上がる。参加するのは、スクイーズできる強い手と、オーバーコールで強い役を狙える手(スモールポケットペア、スーテッドコネクター、スーテッドエース)。それ以外は降りる。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "squeezeSpot": true,
      "action": [
        "fold"
      ]
    }
  },
  {
    "id": "spot-cold-vs-3bet",
    "article": "プリフロップ: コールドで 3ベットに直面(対象外の理由「3ベット以降のライン」)",
    "sourceUrl": null,
    "title": "コールドで 3ベットに直面",
    "summary": "オープンと3ベットが入った所では、参加するならプレミアム(QQ+、AK)のコールド4ベットがほとんどだよ。コールドコールはほぼしないで、それ以外は降りようね。",
    "body": "3ベットされたポットに後ろから入ると、オープナーと 3ベッターの両方のレンジに挟まれる。コールドコールは、後ろのオープナーにスクイーズされたり、マルチウェイになったりして不利なので、ほとんど使わない。参加する手はコールド 4ベット(プレミアム)が中心。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "preflopSpot": [
        "vs3bet"
      ],
      "heroFirstAction": true
    }
  },
  {
    "id": "spot-short-vs-open-call",
    "article": "プリフロップ: 15bb 未満でオープンに直面(対象外の理由「未対応スポット」)",
    "sourceUrl": null,
    "title": "15bb 未満でオープンにコール",
    "summary": "{effBb}bbくらいの浅いスタックでは、オープンへのコールより、オールイン(リシャブ)かフォールドの二択で考えようね。コールすると、フロップで降りにくい中途半端なポットになっちゃう。",
    "body": "15bb を切ると、オープンにコールしたあとフロップでスタックのかなりの割合を賭けることになり、ポジションが無ければなおさら難しい。リシャブ(3ベットオールイン)なら、相手のオープンを降ろせるフォールドエクイティがある。BB はポットオッズが良いので、プレイしやすい手(ポケットペア、スーテッドの手)のコールも混ぜてよい。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "preflopSpot": [
        "vsOpen"
      ],
      "effStackBb": {
        "max": 15
      },
      "action": [
        "call"
      ]
    }
  },
  {
    "id": "spot-short-vs-open-jam",
    "article": "プリフロップ: 15bb 未満でオープンに直面(対象外の理由「未対応スポット」)",
    "sourceUrl": null,
    "title": "15bb 未満でリシャブ",
    "summary": "{effBb}bbでのリシャブ(3ベットオールイン)は、オープナーを降ろせるフォールドエクイティが武器だよ。ポケットペア、スーテッドエース、強いブロードウェイが中心だね。",
    "body": "リシャブのレンジは、オープナーのポジションが遅いほど広げられる(BTN や SB のオープンはレンジが広いので、こちらも広くリシャブできる)。コールされても勝負になる手(ポケットペア、Ax)と、ブロッカーのある手を選ぶ。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "preflopSpot": [
        "vsOpen"
      ],
      "effStackBb": {
        "max": 15
      },
      "action": [
        "allIn"
      ]
    }
  },
  {
    "id": "spot-short-vs-open-fold",
    "article": "プリフロップ: 15bb 未満でオープンに直面(対象外の理由「未対応スポット」)",
    "sourceUrl": null,
    "title": "15bb 未満でオープンに降りる",
    "summary": "{effBb}bbで、リシャブできない手は降りていいよ。{hand}は、コールで入っても勝ちにくい手だね。",
    "body": "浅いスタックでオープンに直面したら、参加するのはリシャブできる手が中心。コールで中途半端に入ると、フロップで外したときに降りるしかなくなる。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "preflop"
      ],
      "preflopSpot": [
        "vsOpen"
      ],
      "effStackBb": {
        "max": 15
      },
      "action": [
        "fold"
      ]
    }
  },
  {
    "id": "spot-vs-allin-call",
    "article": "ポストフロップ: 相手のオールインに直面(対象外の理由「相手のオールインへの対応」)",
    "sourceUrl": null,
    "title": "オールインにコール",
    "summary": "オールインへのコールは、勝率が{potOdds}%以上あるかで決めようね(ポットオッズ)。相手のオールインのレンジに対して、{hand}がそれだけ勝てるかがポイントだよ。",
    "body": "コールに必要な勝率 = コール額 ÷(コール後のポット)。この局面では約 {potOdds}% 勝てればコールが得になる。相手のオールインのレンジ(強い役+ドローのセミブラフ)を想像して、自分の手の勝率がそれを上回るかで決める。ドローなら、残りのカードで完成する確率(アウツ)も数える。",
    "grade": null,
    "keepGto": false,
    "priority": 10,
    "when": {
      "street": [
        "flop",
        "turn",
        "river"
      ],
      "facingAllIn": true,
      "action": [
        "checkOrCall"
      ]
    }
  },
  {
    "id": "spot-vs-allin-fold",
    "article": "ポストフロップ: 相手のオールインに直面(対象外の理由「相手のオールインへの対応」)",
    "sourceUrl": null,
    "title": "オールインに降りる",
    "summary": "このオールインには勝率が{potOdds}%以上必要だよ。{hand}がそれに届かないと思うなら、降りるのが正解だね。",
    "body": "コールに必要な勝率 = コール額 ÷(コール後のポット)。この局面では約 {potOdds}%。相手のオールインのレンジに対して、それ以上勝てる手(強い役や、アウツの多いドロー)だけでコールする。届かない手を降りるのは損ではない。",
    "grade": null,
    "keepGto": false,
    "priority": 10,
    "when": {
      "street": [
        "flop",
        "turn",
        "river"
      ],
      "facingAllIn": true,
      "action": [
        "fold"
      ]
    }
  },
  {
    "id": "spot-multiway-bet",
    "article": "ポストフロップ: マルチウェイ(対象外の理由「多人数のため対象外」)",
    "sourceUrl": null,
    "title": "マルチウェイでベット",
    "summary": "マルチウェイでは、誰か1人は強い手を持っていることが多いから、ベットは強い手(トップペアの良いキッカー以上)と強いドローに絞ろうね。ブラフは控えめに。",
    "body": "相手が2人以上いると、全員が降りる確率が下がるので、ブラフの成功率が大きく落ちる。バリューも、2人のうち1人に強い手がある前提で、より強い手で打つ。Cベットの頻度もヘッズアップより下げる。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop",
        "turn",
        "river"
      ],
      "multiway": true,
      "action": [
        "bet20-40",
        "bet40-60",
        "bet60-80",
        "bet80-100",
        "bet100+",
        "allIn"
      ]
    }
  },
  {
    "id": "spot-multiway-check",
    "article": "ポストフロップ: マルチウェイ(対象外の理由「多人数のため対象外」)",
    "sourceUrl": null,
    "title": "マルチウェイでチェック/コール",
    "summary": "マルチウェイでは、ベットにコールするのも強めの手に絞ろうね。後ろにまだ人がいるなら、コールしても挟まれやすいよ。",
    "body": "マルチウェイでベットされた場合、ベッターは複数人に打っているぶん強いことが多い。さらに後ろにプレイヤーがいると、コールしたあとにレイズされることもある。コールするのは、強い役か、アウツの多いドロー(フラッシュドロー、OESD)。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop",
        "turn",
        "river"
      ],
      "multiway": true,
      "action": [
        "checkOrCall"
      ]
    }
  },
  {
    "id": "spot-multiway-fold",
    "article": "ポストフロップ: マルチウェイ(対象外の理由「多人数のため対象外」)",
    "sourceUrl": null,
    "title": "マルチウェイで降りる",
    "summary": "マルチウェイでのベットには、弱いペアやバックドアだけの手は降りていいよ。勝つのに必要な手の強さが上がるからね。",
    "body": "相手が2人以上いると、セカンドペア以下やドローの無い手が勝つ確率は低い。ベットにコールするのは強い役と強いドローに絞る。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop",
        "turn",
        "river"
      ],
      "multiway": true,
      "action": [
        "fold"
      ]
    }
  },
  {
    "id": "spot-limped-pot-postflop",
    "article": "ポストフロップ: リンプポット・3ベットポット・4ベットポット(対象外の理由「未対応スポット」)",
    "sourceUrl": null,
    "title": "リンプポットのポストフロップ",
    "summary": "リンプポットはお互いのレンジが広くてキャップされているから、小さいベットでポットを取りに行く場面が多いよ。トップペアでも大きく打ちすぎないようにね。",
    "body": "リンプポットにはプリフロップのレイザーがいないので、Cベットの考え方は使わない。お互いに強い手(プレミアム)が少ないレンジなので、ペアができた側が小さめのベット(ポットの33〜50%)でバリューと保護を取り、外した側は簡単に降りる。ポットが小さいので、大きなブラフは割に合わない。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop",
        "turn",
        "river"
      ],
      "potType": [
        "limped"
      ],
      "multiway": false
    }
  },
  {
    "id": "spot-3bet-pot-postflop",
    "article": "ポストフロップ: リンプポット・3ベットポット・4ベットポット(対象外の理由「未対応スポット」)",
    "sourceUrl": null,
    "title": "3ベットポットのポストフロップ",
    "summary": "3ベットポットはSPRが低い(いまは約{spr})から、トップペア以上ならスタックを入れる前提で考えようね。小さいベットで少しずつ入れるのが基本だよ。",
    "body": "3ベットポットはポットが大きくスタックが少ない(SPR が低い)ので、トップペアやオーバーペアでもオールインまで行くことが多い。3ベッターはレンジが強いので、Cベットは小さいサイズ(33% 前後)で高頻度に打てる。コールした側は、トップペア以上・強いドローでコールし、SPR が低いならチェックレイズでオールインも選択肢。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop",
        "turn",
        "river"
      ],
      "potType": [
        "threeBet"
      ],
      "multiway": false
    }
  },
  {
    "id": "spot-4bet-pot-postflop",
    "article": "ポストフロップ: リンプポット・3ベットポット・4ベットポット(対象外の理由「未対応スポット」)",
    "sourceUrl": null,
    "title": "4ベットポットのポストフロップ",
    "summary": "4ベットポットはSPRが1前後しかないから、ペア以上ならほぼオールインまで行く場面だよ。降りるのは完全に外したときだけ。",
    "body": "4ベットポットは残りのスタックがポットとほぼ同じ(SPR 1 前後)。ここで降りると、すでに入れたチップに対して割に合わないことが多い。ペアや強いドローがあれば、オールインまで行く前提でプレイする。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop",
        "turn",
        "river"
      ],
      "potType": [
        "fourBetPlus"
      ]
    }
  },
  {
    "id": "spot-short-srp-postflop",
    "article": "ポストフロップ: スタックが浅い SRP(対象外の理由「未対応スポット」)",
    "sourceUrl": null,
    "title": "浅いスタックのポストフロップ",
    "summary": "SPRが約{spr}と低いから、トップペアやオーバーペア、強いドローなら、オールインまで行く前提で考えようね。",
    "body": "スタックが浅く SPR が低いと、ワンペアでもスタックを入れるのが正解になりやすい(相手のレンジに弱いペアやドローも多いため)。ベットするなら、残りを2回に分けず、一度で入るサイズかオールインにして、相手のドローに安くカードを見せない。",
    "grade": null,
    "keepGto": false,
    "priority": 0,
    "when": {
      "street": [
        "flop",
        "turn",
        "river"
      ],
      "potType": [
        "srp"
      ],
      "effStackBb": {
        "max": 15
      },
      "multiway": false
    }
  },
  {
    "id": "spot-general-preflop",
    "article": "どこにも当たらない決定の一般論(最後の受け皿)",
    "sourceUrl": null,
    "title": "プリフロップの考え方",
    "summary": "{pos}の{hand}。プリフロップは、ポジションとスタックの深さで参加する手の範囲(レンジ)を決めるのが基本だよ。",
    "body": "前にいるポジションほど後ろに多くのプレイヤーが残っているので、参加する手を絞る。BTN や SB は後ろが少ないので広く参加できる。スタックが浅くなるほど、コールよりもオールインかフォールドの二択が増える。",
    "grade": null,
    "keepGto": false,
    "priority": -50,
    "when": {
      "street": [
        "preflop"
      ]
    }
  },
  {
    "id": "spot-general-postflop",
    "article": "どこにも当たらない決定の一般論(最後の受け皿)",
    "sourceUrl": null,
    "title": "ポストフロップの考え方",
    "summary": "ボードと自分の手の強さ、相手のレンジを比べて、バリュー・ブラフ・チェックを決めようね。いまのSPRは約{spr}だよ。",
    "body": "ポストフロップは、自分の手が相手のレンジに対してどのくらい強いか(バリュー / ショーダウンバリュー / エアー)と、ボードがどちらのレンジに有利か(レンジアドバンテージ)で考える。SPR が低いほど、ペア以上ならスタックを入れる前提になる。",
    "grade": null,
    "keepGto": false,
    "priority": -50,
    "when": {
      "street": [
        "flop",
        "turn",
        "river"
      ]
    }
  }
];
