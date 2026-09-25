import { describe, expect, it } from "vitest";
import { draftReply } from "../src/reply.js";

/**
 * 返信は運営の言葉として残り、取り消せない。
 * 「機械が勝手に断定しないこと」「危ないものを人へ回すこと」を最優先で確かめる。
 */
describe("draftReply", () => {
  it("法務に関わる内容は下書きを出さず、人へ回す", () => {
    const r = draftReply("これ詐欺じゃないの？返金してほしい");
    expect(r.kind).toBe("escalate");
    expect(r.needsHuman).toBe(true);
    // 定型文を当ててはいけない類なので、送れる本文を出さない。
    expect(r.draft).toContain("下書きを出しません");
  });

  it("苦情は下書きを出すが、人の確認を必須にする", () => {
    const r = draftReply("重いしすぐ落ちる。最悪");
    expect(["complaint", "bug"]).toContain(r.kind);
    expect(r.needsHuman).toBe(true);
    expect(r.checklist.length).toBeGreaterThan(0);
  });

  it("不具合報告は再現条件を聞く下書きにする", () => {
    const r = draftReply("ログインできないんですけど");
    expect(r.kind).toBe("bug");
    expect(r.draft).toContain("バージョン");
    // 直っていないのに直したと書かせない、という注意を必ず添える。
    expect(r.checklist.join("")).toContain("修正しました");
  });

  it("質問は回答欄を空けた下書きにする", () => {
    const r = draftReply("GEOのデータってどうやって見るんですか？");
    expect(r.kind).toBe("question");
    expect(r.draft).toContain("【回答】");
    expect(r.needsHuman).toBe(false);
  });

  it("好意的な言及は短く返す", () => {
    const r = draftReply("GEO面白い！ありがとう");
    expect(r.kind).toBe("praise");
    expect(r.needsHuman).toBe(false);
  });

  it("判別できないものは定型文を当てず人へ回す", () => {
    const r = draftReply("ふーん");
    expect(r.kind).toBe("unknown");
    expect(r.needsHuman).toBe(true);
  });

  it("どの型でも、そのまま送れる完成文は返さない", () => {
    // 埋める箇所を残すことで、人が必ず一度目を通す。
    for (const text of ["ログインできない", "使い方教えて", "最悪", "詐欺"]) {
      const r = draftReply(text);
      const isTemplate = r.draft.includes("【") || r.draft.includes("下書きを出しません");
      expect(isTemplate, `"${text}" の下書きが完成文になっている`).toBe(true);
    }
  });

  it("判断理由を必ず添える", () => {
    expect(draftReply("バグです").reason.length).toBeGreaterThan(0);
  });
});

describe("相手の感情を型より優先する", () => {
  it("怒っている人からの不具合報告は、型がbugでも人が読んでから送る", () => {
    // 型だけで決めると、落ち着いた定型文をそのまま当てて突き放して見える。
    const calm = draftReply("ログインできないんですけど");
    const angry = draftReply("ログインできない。最悪、もう使わない");
    expect(calm.kind).toBe("bug");
    expect(angry.kind).toBe("bug");
    expect(calm.needsHuman).toBe(false);
    expect(angry.needsHuman).toBe(true);
    // なぜ人が要るのかが分かる注意を先頭に足す。
    expect(angry.checklist[0]).toContain("苛立って");
  });

  it("落ち着いた質問は機械の下書きのままでよい", () => {
    expect(draftReply("使い方を教えてください").needsHuman).toBe(false);
  });
});
