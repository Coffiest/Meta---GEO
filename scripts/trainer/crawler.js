// 特訓のデータ取得(GTO Wizard の解の画面で、Claude in Chrome の javascript_tool から実行する)。
// 画面の通信の結果をそのまま受け取り(自分では通信しない)、アプリ内の画面切り替えで場面を順にたどる。
// 進み具合(queue / done / retry)はそのサイトの localStorage の "__pokerart_crawl" に残るので、翌日も続きから動く。
// 使い方: このファイルの中身を実行 → window.__run(99) → 終わったら window.__dl('trainer-YYYYMMDD.json')。
(() => {
  window.__spots = window.__spots || [];
  if (!window.__hooked) {
    window.__hooked = 1;
    const of = window.fetch;
    window.fetch = async function (...a) {
      const r = await of.apply(this, a);
      try {
        const u = String(a[0].url || a[0]);
        if (u.includes("spot-solution")) r.clone().json().then((j) => window.__spots.push({ u, j }));
      } catch (e) {}
      return r;
    };
    const oo = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; return oo.apply(this, arguments); };
    const os = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
      this.addEventListener("load", () => {
        try { if (String(this.__u).includes("spot-solution")) window.__spots.push({ u: this.__u, j: JSON.parse(this.responseText) }); } catch (e) {}
      });
      return os.apply(this, arguments);
    };
  }
  window.__go = (pa, depth) => {
    const st = Array(8).fill(depth).join("-");
    const u = `/solutions?solution_type=gwiz&gametype=MTTGeneral_8m&depth=${depth}&preflop_actions=${pa}&history_spot=${pa ? pa.split("-").length : 0}&stacks=${st}&gmfs_solution_tab=ai_sols`;
    history.pushState({}, "", u);
    dispatchEvent(new PopStateEvent("popstate", { state: {} }));
  };
  const pack = (j) => ({
    actor: j.action_solutions[0]?.action.position,
    usage: j.usage,
    warning: j.warning,
    acts: j.action_solutions.map((a) => ({
      code: a.action.code, freq: +a.total_frequency.toFixed(4),
      s: a.strategy.map((x) => +(+x).toFixed(4)), e: a.evs.map((x) => +(+x).toFixed(3)),
    })),
  });
  window.__fetchNode = async (pa, d) => {
    const n0 = window.__spots.length;
    window.__go(pa, d);
    for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 250)); if (window.__spots.length > n0) break; }
    if (window.__spots.length === n0) return null;
    return { pa, d, ...pack(window.__spots.at(-1).j) };
  };
  const KEY = "__pokerart_crawl";
  const DEPTHS = ["100.125", "60.125", "40.125", "30.125", "20.125", "12.125"];
  const LV = { rfi: 0, vsOpen: 1, vsLimp: 1, vs3bet: 2, limpVsRaise: 2, vs4bet: 3, vs5bet: 4 };
  let st; try { st = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (!st) { st = { queue: [], done: {}, retry: [] }; for (const d of DEPTHS) for (let k = 0; k < 7; k++) st.queue.push({ pa: Array(k).fill("F").join("-"), d, t: "rfi", o: k }); }
  st.retry = st.retry || [];
  // 前日に取れなかった場面(読み込み済みで通信が起きなかったもの)を先頭に戻す。
  st.queue.unshift(...st.retry); st.retry = [];
  window.__st = st; window.__data = window.__data || []; window.__log = window.__log || [];
  const F = (n) => Array(n).fill("F");
  const join = (...p) => p.flat().filter((x) => x !== "").join("-");
  const isR = (c) => c.startsWith("R");
  // 取る場面: 最初のレイズ / それへの対応 / 3ベット・4ベット・5ベットへの対応 / SBのリンプへのBB・その後。多人数は取らない。
  window.__children = (n, x) => {
    const out = [];
    for (const a of x.acts) {
      if (a.freq < 0.0005) continue; // 解が一度も選ばない行動の先は取らない
      const c = a.code;
      if (n.t === "rfi") {
        if (isR(c)) for (let j = n.o + 1; j < 8; j++) out.push({ pa: join(n.pa, c, F(j - n.o - 1)), d: n.d, t: "vsOpen", o: n.o, j });
        else if (c === "C" && n.o === 6) out.push({ pa: join(n.pa, c), d: n.d, t: "vsLimp", o: 6, j: 7 });
      } else if (n.t === "vsOpen" && isR(c)) out.push({ pa: join(n.pa, c, F(7 - n.j)), d: n.d, t: "vs3bet", o: n.o, j: n.j });
      else if (n.t === "vs3bet" && isR(c)) out.push({ pa: join(n.pa, c), d: n.d, t: "vs4bet", o: n.o, j: n.j });
      else if (n.t === "vs4bet" && isR(c)) out.push({ pa: join(n.pa, c), d: n.d, t: "vs5bet", o: n.o, j: n.j });
      else if (n.t === "vsLimp" && isR(c)) out.push({ pa: join(n.pa, c), d: n.d, t: "limpVsRaise", o: 6, j: 7 });
    }
    return out;
  };
  window.__save = () => { try { localStorage.setItem(KEY, JSON.stringify(window.__st)); } catch (e) {} };
  window.__dl = (name) => {
    const b = new Blob([JSON.stringify(window.__data)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  };
  window.__run = async (maxCount) => {
    window.__stop = false; window.__finished = false;
    while (!window.__stop && st.queue.length) {
      st.queue.sort((a, b) => LV[a.t] - LV[b.t]);
      const n = st.queue.shift(); const key = n.d + "|" + n.pa;
      if (st.done[key]) continue;
      const x = await window.__fetchNode(n.pa, n.d);
      if (!x) { window.__log.push("fail " + key); st.retry.push(n); window.__save(); continue; }
      if (x.warning === "ZERO_RANGE") { st.done[key] = 1; window.__save(); continue; }
      if (x.warning || (x.usage && x.usage.count > x.usage.limit)) { window.__log.push("limit"); st.queue.unshift(n); break; }
      window.__data.push({ ...n, actor: x.actor, acts: x.acts });
      st.done[key] = 1;
      for (const c of window.__children(n, x)) if (!st.done[c.d + "|" + c.pa]) st.queue.push(c);
      window.__save(); window.__lastUsage = x.usage && x.usage.count;
      if (x.usage && x.usage.count >= maxCount) break;
    }
    window.__save(); window.__finished = true;
  };
  return "ready queue=" + st.queue.length;
})();
