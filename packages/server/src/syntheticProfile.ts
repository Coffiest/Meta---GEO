/**
 * 自動プレイヤー用の擬似プロフィール生成。
 *
 * 対戦相手が自動プレイヤーかどうかは、プレイヤーからは一切分からないようにする。
 * プロフィールAPIが「見つかりません」を返すと、その応答自体が判別材料になってしまうため、
 * userIdをシードにした決定論的な擬似スタッツを返し、通常のプレイヤーと同じ形で応答する。
 * 決定論なので、同じ相手を何度開いても常に同じ数字が出る。
 */

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** シード固定の擬似乱数(mulberry32)。 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SyntheticProfile {
  id: string;
  displayName: string;
  avatarKey: string | null;
  stats: {
    tournamentsPlayed: number;
    itmCount: number;
    itmRate: number;
    totalBuyIns: number;
    totalPayouts: number;
    profit: number;
    roi: number;
    nationalRank: number;
    totalRankedPlayers: number;
    vpipCount: number;
    vpipOpportunities: number;
    vpipRate: number;
    pfrCount: number;
    pfrOpportunities: number;
    pfrRate: number;
    threeBetCount: number;
    threeBetOpportunities: number;
    threeBetRate: number;
  };
  rrRating: {
    rrRating: number;
    roi: number;
    tournamentsPlayed: number;
    nationalRank: number;
    totalRankedPlayers: number;
  };
}

export function syntheticPlayerProfile(userId: string, displayName: string, avatarKey: string | null): SyntheticProfile {
  const r = mulberry32(hashString(userId || displayName));
  const between = (lo: number, hi: number) => lo + r() * (hi - lo);

  const tournamentsPlayed = Math.floor(between(35, 420));
  const itmRate = between(0.12, 0.34);
  const itmCount = Math.round(tournamentsPlayed * itmRate);
  const roi = between(0.78, 1.55);
  const avgBuyIn = between(1000, 2000);
  const totalBuyIns = Math.round(avgBuyIn * tournamentsPlayed);
  const totalPayouts = Math.round(totalBuyIns * roi);
  const profit = totalPayouts - totalBuyIns;
  const vpipRate = between(0.16, 0.36);
  const pfrRate = Math.min(vpipRate - 0.02, between(0.1, 0.28));
  const threeBetRate = between(0.03, 0.1);
  const rrRating = between(41, 63);
  const totalRankedPlayers = Math.floor(between(1200, 4800));
  // 偏差値が高いほど順位が上(数字が小さい)になるよう素朴にマッピングする。
  const pctile = Math.min(0.99, Math.max(0.01, 1 - (rrRating - 35) / 30));
  const nationalRank = Math.max(1, Math.round(pctile * totalRankedPlayers));
  const vpipOpportunities = Math.max(1, Math.round(tournamentsPlayed * between(18, 42)));
  const pfrOpportunities = vpipOpportunities;
  const threeBetOpportunities = Math.max(1, Math.round(vpipOpportunities * between(0.4, 0.7)));

  return {
    id: userId,
    displayName,
    avatarKey,
    stats: {
      tournamentsPlayed,
      itmCount,
      itmRate,
      totalBuyIns,
      totalPayouts,
      profit,
      roi,
      nationalRank,
      totalRankedPlayers,
      vpipCount: Math.round(vpipOpportunities * vpipRate),
      vpipOpportunities,
      vpipRate,
      pfrCount: Math.round(pfrOpportunities * pfrRate),
      pfrOpportunities,
      pfrRate,
      threeBetCount: Math.round(threeBetOpportunities * threeBetRate),
      threeBetOpportunities,
      threeBetRate,
    },
    rrRating: { rrRating, roi, tournamentsPlayed, nationalRank, totalRankedPlayers },
  };
}
