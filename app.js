// 鑑別アシスト — 入力（タップ）するたびにその場で鑑別を並べ替える。
// 入力内容はどこにも保存・送信しない（画面を閉じれば消える）。
"use strict";

const APP_VERSION = "0.1.0";
const AGES = ["child", "young", "middle", "elderly"];

const state = { age: null, sex: null, trauma: null, region: null, sub: null, findings: new Set() };
let regions = [];
const cache = {}; // region id -> 読み込んだデータ

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- 入力ボタン ----------
function chipHTML(v, label) {
  return `<button type="button" data-v="${esc(v)}">${esc(label)}</button>`;
}

function syncChips() {
  document.querySelectorAll(".chips[data-key]").forEach((box) => {
    const key = box.dataset.key;
    box.querySelectorAll("button").forEach((b) => b.classList.toggle("on", state[key] === b.dataset.v));
  });
  $("#findings").querySelectorAll("button").forEach((b) => b.classList.toggle("on", state.findings.has(b.dataset.v)));
}

// 単一選択：同じボタンをもう一度押すと解除
document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".chips button");
  if (!btn || btn.disabled) return;
  const box = btn.parentElement;
  const v = btn.dataset.v;
  if (box.classList.contains("multi")) {
    state.findings.has(v) ? state.findings.delete(v) : state.findings.add(v);
  } else {
    const key = box.dataset.key;
    state[key] = state[key] === v ? null : v;
    if (key === "region") {
      state.sub = null;
      state.findings.clear();
      await loadRegion();
    }
  }
  syncChips();
  render();
});

$("#reset").addEventListener("click", () => {
  Object.assign(state, { age: null, sex: null, trauma: null, region: null, sub: null });
  state.findings.clear();
  $("#subrow").hidden = true;
  $("#findrow").hidden = true;
  syncChips();
  render();
  window.scrollTo({ top: 0 });
});

// ---------- データ読み込み ----------
async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + " " + r.status);
  return r.json();
}

async function loadRegion() {
  const sub = $("#subregions"), fnd = $("#findings");
  if (!state.region) {
    $("#subrow").hidden = true;
    $("#findrow").hidden = true;
    return;
  }
  const meta = regions.find((r) => r.id === state.region);
  if (!cache[state.region]) cache[state.region] = await fetchJSON(meta.file);
  const d = cache[state.region];
  sub.innerHTML = d.subregions.map((s) => chipHTML(s.id, s.name)).join("");
  fnd.innerHTML = d.findings.map((f) => chipHTML(f.id, f.label)).join("");
  $("#subrow").hidden = false;
  $("#findrow").hidden = false;
}

// ---------- 判定 ----------
let myStars = {}; // Kento自身の★（data/my_stars.json）

function myStarsFor(dx) {
  const s = ((myStars[state.region] || {})[dx.id]) || {};
  if (state.age) return typeof s[state.age] === "number" ? s[state.age] : null;
  const nums = AGES.map((a) => s[a]).filter((x) => typeof x === "number" && x > 0);
  return nums.length ? Math.max(...nums) : null;
}

function starsFor(dx) {
  const s = dx.stars_by_age || {};
  if (state.age) return s[state.age];
  // 年齢未選択：全年齢帯の最大値（0とnullだけなら null）
  const nums = AGES.map((a) => s[a]).filter((x) => typeof x === "number" && x > 0);
  return nums.length ? Math.max(...nums) : null;
}

function applies(dx) {
  if (state.trauma && dx.trauma !== "any" && dx.trauma !== state.trauma) return false;
  // 詳細部位での絞り込み：見逃し厳禁は絞らない／「全体」の疾患はどこを選んでも残す
  const subs = dx.subregions || [];
  if (state.sub && state.sub !== "diffuse" && !dx.red_flag && !subs.includes(state.sub) && !subs.includes("diffuse")) return false;
  if (state.age && (dx.stars_by_age || {})[state.age] === 0) return false; // その年齢ではまず考えない
  return true;
}

function scored(list) {
  return list.map((dx) => {
    const match = (dx.findings_support || []).filter((f) => state.findings.has(f));
    const against = (dx.findings_against || []).filter((f) => state.findings.has(f));
    return { dx, stars: starsFor(dx), mine: myStarsFor(dx), match, against };
  }).sort((a, b) =>
    (b.match.length - b.against.length) - (a.match.length - a.against.length) ||
    // 並び順は文献の★を優先し、文献が空欄のときだけ自分の★を使う
    (b.stars ?? b.mine ?? -1) - (a.stars ?? a.mine ?? -1) ||
    a.dx.name.localeCompare(b.dx.name, "ja"));
}

// ---------- 表示 ----------
function starHTML(n) {
  if (typeof n !== "number") return `<span class="stars unk">★未確認</span>`;
  return `<span class="stars">${"★".repeat(n)}${"☆".repeat(5 - n)}</span>`;
}

function dxHTML(item, labels) {
  const { dx, stars, mine, match, against } = item;
  const mineHTML = typeof mine === "number" ? `<span class="stars mine">自分${"★".repeat(mine)}</span>` : "";
  const tags = [
    ...match.map((f) => `<span class="tag match">合致: ${esc(labels[f])}</span>`),
    ...against.map((f) => `<span class="tag against">否定的: ${esc(labels[f])}</span>`),
  ].join("");
  const src = (dx.sources || []).map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join("");
  const dim = against.length > match.length ? " dim" : "";
  return `<details class="dx${dim}">
  <summary><span class="name">${esc(dx.name)}</span>${starHTML(stars)}${mineHTML}${tags ? `<span class="tags">${tags}</span>` : ""}</summary>
  <div class="body">
    ${dx.key_points ? `<h3>ポイント</h3><p>${esc(dx.key_points)}</p>` : ""}
    ${dx.tests && dx.tests.length ? `<h3>検査</h3><ol>${dx.tests.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>` : ""}
    ${dx.sex_note ? `<h3>性差</h3><p>${esc(dx.sex_note)}</p>` : ""}
    <h3>★の根拠</h3><p class="basis">${esc(dx.star_basis || "—")}</p>
    ${src ? `<h3>出典</h3><ul>${src}</ul>` : `<h3>出典</h3><p class="basis">出典未確認</p>`}
  </div>
</details>`;
}

function render() {
  const out = $("#results");
  if (!state.region || !cache[state.region]) {
    out.innerHTML = `<p class="hint">部位を選ぶと鑑別が表示されます。</p>`;
    return;
  }
  const d = cache[state.region];
  const labels = Object.fromEntries(d.findings.map((f) => [f.id, f.label]));
  const list = d.diseases.filter(applies);
  const red = scored(list.filter((x) => x.red_flag));
  const normal = scored(list.filter((x) => !x.red_flag));
  const note = state.age ? "" : `<p class="hint">年齢を選ぶと年齢別の★になります（今は全年齢の最大値）。</p>`;
  out.innerHTML =
    (red.length ? `<div class="redbox"><h2>⚠ 見逃し厳禁（${red.length}）</h2>${red.map((i) => dxHTML(i, labels)).join("")}</div>` : "") +
    `<h2>鑑別（${normal.length}）</h2>${note}` +
    (normal.length ? normal.map((i) => dxHTML(i, labels)).join("") : `<p class="hint">条件に合う疾患がありません。</p>`);
}

// ---------- 起動 ----------
(async function init() {
  $("#ver").textContent = "v" + APP_VERSION;
  try {
    regions = await fetchJSON("data/regions.json");
    myStars = await fetchJSON("data/my_stars.json").catch(() => ({}));
  } catch (err) {
    $("#results").innerHTML = `<p class="hint">データを読み込めませんでした（${esc(err.message)}）</p>`;
    return;
  }
  $("#regions").innerHTML = regions.map((r) =>
    `<button type="button" data-v="${esc(r.id)}"${r.file ? "" : " disabled"}>${esc(r.name)}${r.file ? "" : "<small>準備中</small>"}</button>`).join("");
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
