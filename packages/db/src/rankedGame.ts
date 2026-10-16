/**
 * 成績に数える対局の条件。
 *
 * フレンド対戦(`gameType: "private"`)は、レート・偏差値・ランキング・スタッツ(収支・ROI・インマネ率・
 * VPIP など)・GEO の解放条件・無料体験の区切り・招待の成立には一切数えない(オーナー確定)。
 * 友達どうしで何度でも回せるので、数えると簡単に水増しできてしまう。ハンドは GEO のデータベースには入る。
 *
 * 成績を集計するクエリを新しく足すときは、必ずこの条件を足すこと。
 */
export const RANKED_TOURNAMENT = { gameType: { not: "private" } } as const;

/** フレンド対戦の `gameType`。 */
export const PRIVATE_GAME_TYPE = "private";
