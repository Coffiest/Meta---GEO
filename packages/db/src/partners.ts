import { randomBytes, randomInt } from "node:crypto";
import { prisma } from "./client.js";

/**
 * インフルエンサー(ローンチパートナー)のコード。仕様は docs/HANDOFF_influencer_partner.md。
 *
 * - 1人に1つ、Stripe のプロモーションコードを発行する(初回の支払いが30%OFF。有料会員になったことが無い人だけ)。
 * - コードを決済画面で入れて加入した人の支払いの一部(最初の3回分は80%、以降は解約まで20%)を、そのパートナーに還元する。
 * - ここは DB の台帳だけ。Stripe のコードを作る・止めるのはサーバー(partnerApi)が行う。
 */

/** ランダムに作るコードの文字。読み間違えやすい I/O/0/1 を除く(DM・動画で口頭でも伝わるように)。 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const GENERATED_PREFIX = "ART";
const GENERATED_BODY_LENGTH = 5;

/** Stripe のプロモーションコードに使える文字は英数字だけ。表記の揺れ(小文字・ハイフン)は吸収する。 */
export function normalizePartnerCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** 4〜20文字の大文字英数字。短すぎると総当たりで当たり、長すぎると入力されない。 */
export function isValidPartnerCode(code: string): boolean {
  return /^[A-Z0-9]{4,20}$/.test(code);
}

/** コードの指定が無いときに作る("ART" + 5文字。例 "ARTK7QM2")。 */
export function generatePartnerCode(): string {
  let body = "";
  for (let i = 0; i < GENERATED_BODY_LENGTH; i++) body += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${GENERATED_PREFIX}${body}`;
}

/** 明細ページの秘密の鍵(URL に入れる)。推測されない長さにする。 */
export function newStatementToken(): string {
  return randomBytes(24).toString("base64url");
}

export interface PartnerRow {
  id: string;
  name: string;
  contact: string | null;
  note: string | null;
  code: string;
  stripePromotionCodeId: string;
  statementToken: string;
  userId: string | null;
  active: boolean;
  createdAt: Date;
}

const PARTNER_SELECT = {
  id: true,
  name: true,
  contact: true,
  note: true,
  code: true,
  stripePromotionCodeId: true,
  statementToken: true,
  userId: true,
  active: true,
  createdAt: true,
} as const;

export async function isPartnerCodeTaken(code: string): Promise<boolean> {
  const row = await prisma.partner.findUnique({ where: { code }, select: { id: true } });
  return row !== null;
}

export async function createPartner(params: {
  name: string;
  contact: string | null;
  note: string | null;
  code: string;
  stripePromotionCodeId: string;
  userId: string | null;
}): Promise<PartnerRow> {
  return prisma.partner.create({
    data: { ...params, statementToken: newStatementToken() },
    select: PARTNER_SELECT,
  });
}

/** 管理者画面の一覧。新しい順。パートナーは多くても数百人なので全件でよい(1行は小さい)。 */
export async function listPartners(): Promise<PartnerRow[]> {
  return prisma.partner.findMany({ orderBy: { createdAt: "desc" }, select: PARTNER_SELECT });
}

export async function getPartner(id: string): Promise<PartnerRow | null> {
  return prisma.partner.findUnique({ where: { id }, select: PARTNER_SELECT });
}

export async function setPartnerActive(id: string, active: boolean): Promise<void> {
  await prisma.partner.update({ where: { id }, data: { active }, select: { id: true } });
}

export async function getPartnerByPromotionCodeId(stripePromotionCodeId: string): Promise<PartnerRow | null> {
  return prisma.partner.findUnique({ where: { stripePromotionCodeId }, select: PARTNER_SELECT });
}

export async function getPartnerByStatementToken(statementToken: string): Promise<PartnerRow | null> {
  return prisma.partner.findUnique({ where: { statementToken }, select: PARTNER_SELECT });
}
