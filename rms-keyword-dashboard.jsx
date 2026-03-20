import { useState, useMemo, useCallback, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";

// ─── Dummy data ───────────────────────────────────────────────────────────────
const DUMMY_DATA = [
  { month: "2023-09", keyword: "モモフル", access: 2241 },
  { month: "2023-09", keyword: "吸水ショーツ", access: 1801 },
  { month: "2023-09", keyword: "モモフル 吸水ショーツ", access: 1123 },
  { month: "2023-09", keyword: "おりもの吸水ショーツ", access: 1041 },
  { month: "2023-09", keyword: "パンツ レディース下着", access: 316 },
  { month: "2023-09", keyword: "momoful", access: 186 },
  { month: "2023-09", keyword: "ももふる", access: 95 },
  { month: "2023-10", keyword: "モモフル", access: 2500 },
  { month: "2023-10", keyword: "吸水ショーツ", access: 1900 },
  { month: "2023-10", keyword: "モモフル 吸水ショーツ", access: 1200 },
  { month: "2023-10", keyword: "おりもの吸水ショーツ", access: 1100 },
];
const DEFAULT_NAMED_KWS = "モモフル, momoful, ももふる";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  blue:      "#1a56db",
  blueDark:  "#1342b0",
  blueLight: "#e8f0fe",
  blueXL:    "#f0f5ff",
  blueMid:   "#4f87f5",
  namedBar:  "#1a56db",
  generalBar:"#93c5fd",
  white:     "#ffffff",
  bg:        "#f4f7fc",
  surface:   "#ffffff",
  border:    "#dde6f5",
  text:      "#0d1b3e",
  textMid:   "#3a4d6b",
  textSub:   "#6b7e99",
  textMute:  "#9aaabf",
  green:     "#0a7c4e",
  greenBg:   "#e6f9f1",
  red:       "#c0392b",
  redBg:     "#fdf0ef",
  navy:      "#0a1f5c",
};

const FONT = "'ヒラギノ角ゴ ProN W3','Hiragino Kaku Gothic ProN','ヒラギノ角ゴシック','Hiragino Sans','Yu Gothic Medium','YuGothic',sans-serif";
const FONT_BOLD = "'ヒラギノ角ゴ ProN W6','Hiragino Kaku Gothic ProN W6','ヒラギノ角ゴシック W6','Hiragino Sans W6','Yu Gothic','YuGothic',sans-serif";

// ─── Utilities ────────────────────────────────────────────────────────────────
const parseAccess = (v) => { if (typeof v === "number") return v; return parseInt(String(v).replace(/,/g, ""), 10) || 0; };
const isNamed = (kw, list) => list.some((n) => n && kw.includes(n));
const classifyRows = (rows, list) => rows.map((r) => ({ ...r, access: parseAccess(r.access), type: isNamed(r.keyword, list) ? "指名" : "一般" }));
const groupByMonth = (rows) => {
  const map = {};
  rows.forEach((r) => {
    if (!map[r.month]) map[r.month] = { month: r.month, named: 0, general: 0 };
    r.type === "指名" ? (map[r.month].named += r.access) : (map[r.month].general += r.access);
  });
  return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
};
const fmt = (n) => n.toLocaleString("ja-JP");
const pct = (a, b) => (b === 0 ? "0.0" : ((a / b) * 100).toFixed(1));
const diffCalc = (curr, prev) => {
  if (prev == null) return null;
  const d = curr - prev;
  return { value: d, pct: pct(Math.abs(d), prev), sign: d >= 0 ? "+" : "−", positive: d >= 0 };
};

// ─── CSV Parsers ──────────────────────────────────────────────────────────────
const splitCsvLine = (line) => {
  const result = []; let cur = "", inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === "," && !inQ) { result.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  result.push(cur.trim()); return result;
};
const parseRmsCsv = (text) => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const header = splitCsvLine(lines[0]);
  const sections = [];
  header.forEach((col, idx) => {
    if (col.includes("キーワード")) {
      const raw = col.replace(/キーワード.*/, "").trim();
      const month = /^\d{6}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}` : raw;
      sections.push({ month, kwCol: idx + 1, accessCol: idx + 2 });
    }
  });
  if (!sections.length) return null;
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    sections.forEach(({ month, kwCol, accessCol }) => {
      const kw = cols[kwCol]?.trim() ?? "";
      if (!kw || ["表示", "-", ""].includes(kw) || /^\d+$/.test(kw)) return;
      const access = parseAccess(cols[accessCol]?.trim() ?? "");
      if (access <= 0) return;
      rows.push({ month, keyword: kw, access });
    });
  }
  return rows.length ? rows : null;
};
const parseStandardCsv = (text) => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const headers = splitCsvLine(lines[0]);
  const mi = headers.findIndex((h) => ["月", "month", "Month"].includes(h));
  const ki = headers.findIndex((h) => ["検索キーワード", "keyword", "Keyword", "キーワード"].includes(h));
  const ai = headers.findIndex((h) => ["アクセス人数", "access", "Access", "人数"].includes(h));
  if (ki < 0 || ai < 0) return null;
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const kw = cols[ki]?.trim(); if (!kw) continue;
    rows.push({ month: mi >= 0 ? cols[mi]?.trim() : "", keyword: kw, access: cols[ai]?.trim() });
  }
  return rows.length ? rows : null;
};
const readAs = (file, enc) => new Promise((res, rej) => { const r = new FileReader(); r.onload = (e) => res(e.target.result); r.onerror = rej; r.readAsText(file, enc); });
const parseFile = async (file) => {
  for (const enc of ["Shift-JIS", "UTF-8"]) {
    const text = await readAs(file, enc);
    const isRms = /\d{6}キーワード/.test(text) || /\d{6}参照元/.test(text);
    if (isRms) { const rows = parseRmsCsv(text); if (rows?.length) return { rows, format: `RMS形式(${enc})`, months: [...new Set(rows.map((r) => r.month))].sort() }; }
    const rows = parseStandardCsv(text); if (rows?.length) return { rows, format: `標準形式(${enc})`, months: [...new Set(rows.map((r) => r.month))].sort() };
  }
  return null;
};

// ─── UI Components ────────────────────────────────────────────────────────────

// Blue banner header (parallelogram style from design image)
const SectionHeader = ({ children, sub }) => (
  <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
    <div style={{
      background: C.blue, color: C.white,
      padding: "7px 24px 7px 16px",
      clipPath: "polygon(0 0, calc(100% - 14px) 0, 100% 100%, 0 100%)",
      fontFamily: FONT_BOLD, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em",
      marginRight: 12, whiteSpace: "nowrap",
    }}>{children}</div>
    {sub && <span style={{ fontSize: 12, color: C.textSub, fontFamily: FONT }}>{sub}</span>}
  </div>
);

// Left-border title (like "会社概要" in image)
const SectionTitle = ({ children }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
    <div style={{ width: 4, height: 20, background: C.blue, borderRadius: 2, flexShrink: 0 }} />
    <span style={{ fontFamily: FONT_BOLD, fontSize: 15, fontWeight: 700, color: C.text, letterSpacing: "0.03em" }}>{children}</span>
  </div>
);

const Card = ({ children, style }) => (
  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "20px 24px", ...style }}>
    {children}
  </div>
);

const KPICard = ({ label, value, sub, badge, accentColor = C.blue }) => (
  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "18px 20px", position: "relative", overflow: "hidden" }}>
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accentColor }} />
    <div style={{ fontSize: 11, fontWeight: 600, color: C.textSub, letterSpacing: "0.06em", fontFamily: FONT, marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: 24, fontWeight: 700, color: C.text, fontFamily: FONT_BOLD, letterSpacing: "-0.02em", lineHeight: 1.2 }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: C.textSub, fontFamily: FONT, marginTop: 4 }}>{sub}</div>}
    {badge && (
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 3, marginTop: 6,
        padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, fontFamily: FONT,
        background: badge.positive ? C.greenBg : C.redBg,
        color: badge.positive ? C.green : C.red,
      }}>
        {badge.positive ? "▲" : "▼"} {badge.text}
      </div>
    )}
  </div>
);

// Per-month horizontal stacked ratio bar
const MonthRatioBar = ({ month, named, general }) => {
  const total = named + general;
  const namedPct = total > 0 ? (named / total) * 100 : 0;
  const generalPct = 100 - namedPct;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontFamily: FONT_BOLD, fontSize: 13, fontWeight: 700, color: C.text }}>{month}</span>
        <span style={{ fontFamily: FONT, fontSize: 12, color: C.textSub }}>合計 {fmt(total)}人</span>
      </div>
      {/* Stacked bar */}
      <div style={{ display: "flex", height: 28, borderRadius: 4, overflow: "hidden", boxShadow: `0 0 0 1px ${C.border}` }}>
        <div style={{ width: `${namedPct}%`, background: C.namedBar, display: "flex", alignItems: "center", justifyContent: "center", minWidth: namedPct > 8 ? 0 : 0, transition: "width 0.6s ease" }}>
          {namedPct > 12 && <span style={{ fontFamily: FONT_BOLD, fontSize: 11, fontWeight: 700, color: C.white }}>{namedPct.toFixed(1)}%</span>}
        </div>
        <div style={{ flex: 1, background: C.generalBar, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {generalPct > 12 && <span style={{ fontFamily: FONT_BOLD, fontSize: 11, fontWeight: 700, color: C.blueDark }}>{generalPct.toFixed(1)}%</span>}
        </div>
      </div>
      {/* Numbers below */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 9, height: 9, borderRadius: 2, background: C.namedBar, flexShrink: 0 }} />
          <span style={{ fontFamily: FONT, fontSize: 11, color: C.textMid }}>指名: {fmt(named)}人</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 9, height: 9, borderRadius: 2, background: C.generalBar, flexShrink: 0 }} />
          <span style={{ fontFamily: FONT, fontSize: 11, color: C.textMid }}>一般: {fmt(general)}人</span>
        </div>
      </div>
    </div>
  );
};

// Bar chart tooltip
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)", fontFamily: FONT }}>
      <div style={{ fontWeight: 700, color: C.text, marginBottom: 6, fontSize: 13 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, fontSize: 12, color: C.textMid }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: p.fill, flexShrink: 0 }} />
          {p.name}: <strong style={{ color: C.text }}>{fmt(p.value)}人</strong>
        </div>
      ))}
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [rawData, setRawData] = useState(DUMMY_DATA);
  const [namedInput, setNamedInput] = useState(DEFAULT_NAMED_KWS);
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [activeTab, setActiveTab] = useState("overview");
  const [dragOver, setDragOver] = useState(false);
  const [loadInfo, setLoadInfo] = useState(null);
  const [parseError, setParseError] = useState(null);
  const fileRef = useRef();
  const isDummy = rawData === DUMMY_DATA;

  const namedList    = useMemo(() => namedInput.split(/[,、]/).map((s) => s.trim()).filter(Boolean), [namedInput]);
  const classified   = useMemo(() => classifyRows(rawData, namedList), [rawData, namedList]);
  const allMonths    = useMemo(() => [...new Set(classified.map((r) => r.month))].sort(), [classified]);
  const filtered     = useMemo(() => selectedMonth === "all" ? classified : classified.filter((r) => r.month === selectedMonth), [classified, selectedMonth]);
  const kpis         = useMemo(() => {
    const nt = filtered.filter((r) => r.type === "指名").reduce((s, r) => s + r.access, 0);
    const gt = filtered.filter((r) => r.type === "一般").reduce((s, r) => s + r.access, 0);
    return { namedTotal: nt, generalTotal: gt, total: nt + gt, namedPct: pct(nt, nt + gt) };
  }, [filtered]);
  const momData      = useMemo(() => {
    const m = groupByMonth(classified);
    if (m.length < 2) return null;
    let currRow, prevRow;
    if (selectedMonth === "all") {
      currRow = m[m.length - 1];
      prevRow = m[m.length - 2];
    } else {
      const idx = m.findIndex((r) => r.month === selectedMonth);
      if (idx < 1) return null;
      currRow = m[idx];
      prevRow = m[idx - 1];
    }
    const currTotal = currRow.named + currRow.general;
    const prevTotal = prevRow.named + prevRow.general;
    const currRate  = currTotal > 0 ? (currRow.named / currTotal) * 100 : 0;
    const prevRate  = prevTotal > 0 ? (prevRow.named / prevTotal) * 100 : 0;
    const rateDiff  = currRate - prevRate;
    return {
      nd: diffCalc(currRow.named, prevRow.named),
      gd: diffCalc(currRow.general, prevRow.general),
      td: diffCalc(currTotal, prevTotal),
      rd: { value: rateDiff, pct: Math.abs(rateDiff).toFixed(1), sign: rateDiff >= 0 ? "+" : "−", positive: rateDiff >= 0 },
      currMonth: currRow.month,
      prevMonth: prevRow.month,
    };
  }, [classified, selectedMonth]);
  const monthlyData  = useMemo(() => groupByMonth(classified), [classified]);

  // 比較対象の「今月」「前月」を決定
  const compMonths = useMemo(() => {
    if (allMonths.length < 2) return null;
    if (selectedMonth === "all") {
      return { curr: allMonths[allMonths.length - 1], prev: allMonths[allMonths.length - 2] };
    }
    const idx = allMonths.indexOf(selectedMonth);
    if (idx < 1) return null;
    return { curr: selectedMonth, prev: allMonths[idx - 1] };
  }, [allMonths, selectedMonth]);

  // キーワード別 今月・前月比較テーブル
  const kwComparison = useMemo(() => {
    if (!compMonths) {
      // 前月データなし → 今月単独表示
      return [...filtered]
        .sort((a, b) => b.access - a.access)
        .slice(0, 100)
        .map((r) => ({ keyword: r.keyword, type: r.type, curr: r.access, prev: null, diff: null }));
    }
    const { curr, prev } = compMonths;
    const currRows = classified.filter((r) => r.month === curr);
    const prevRows = classified.filter((r) => r.month === prev);
    const currMap = {}, prevMap = {};
    currRows.forEach((r) => { currMap[r.keyword] = (currMap[r.keyword] || 0) + r.access; });
    prevRows.forEach((r) => { prevMap[r.keyword] = (prevMap[r.keyword] || 0) + r.access; });
    const allKws = [...new Set([...Object.keys(currMap), ...Object.keys(prevMap)])];
    const rows = allKws.map((kw) => {
      const currVal = currMap[kw] || 0;
      const prevVal = prevMap[kw] !== undefined ? prevMap[kw] : null;
      return {
        keyword: kw,
        type: isNamed(kw, namedList) ? "指名" : "一般",
        curr: currVal,
        prev: prevVal,
        diff: prevVal !== null ? diffCalc(currVal, prevVal) : null,
      };
    });
    rows.sort((a, b) => (b.curr - a.curr) || ((b.prev ?? 0) - (a.prev ?? 0)));
    return rows.slice(0, 100);
  }, [classified, filtered, compMonths, namedList]);

  const kwCurrTotal = useMemo(() => kwComparison.reduce((s, r) => s + r.curr, 0), [kwComparison]);

  const handleFiles = useCallback(async (files) => {
    setParseError(null);
    const allRows = [], allFormats = [], allMonthsFound = [];
    for (const file of files) {
      const result = await parseFile(file);
      if (result) { allRows.push(...result.rows); allFormats.push(result.format); allMonthsFound.push(...result.months); }
      else setParseError(`「${file.name}」を解析できませんでした。`);
    }
    if (allRows.length) {
      setRawData(allRows); setSelectedMonth("all");
      setLoadInfo({ count: allRows.length, months: [...new Set(allMonthsFound)].sort(), format: [...new Set(allFormats)].join(", ") });
    }
  }, []);
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); handleFiles([...e.dataTransfer.files]); };
  const onFileChange = (e) => { if (e.target.files?.length) handleFiles([...e.target.files]); };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: FONT, color: C.text }}>
      {/* ── Top header bar ── */}
      <div style={{ background: C.white, borderBottom: `2px solid ${C.blue}`, padding: "0 32px" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Blue accent mark */}
            <div style={{ width: 4, height: 24, background: C.blue, borderRadius: 2 }} />
            <span style={{ fontFamily: FONT_BOLD, fontSize: 16, fontWeight: 700, color: C.text, letterSpacing: "0.04em" }}>
              検索キーワード分析ダッシュボード
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: isDummy ? C.textMute : C.green }} />
            <span style={{ fontSize: 12, color: isDummy ? C.textMute : C.green, fontFamily: FONT }}>
              {isDummy ? "サンプルデータ表示中" : `${fmt(rawData.length)}行 読み込み済み`}
            </span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "28px 24px 60px" }}>

        {/* ── Settings section ── */}
        <SectionHeader>SETTINGS</SectionHeader>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 10 }}>
          {/* Upload */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              background: dragOver ? C.blueXL : C.white,
              border: `2px dashed ${dragOver ? C.blue : C.border}`,
              borderRadius: 10, padding: "18px 22px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 16, transition: "all 0.2s",
            }}
          >
            <div style={{ width: 40, height: 40, borderRadius: 8, background: C.blueLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>📁</div>
            <div>
              <div style={{ fontFamily: FONT_BOLD, fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 3 }}>CSVファイルをアップロード</div>
              <div style={{ fontSize: 11, color: C.textSub, lineHeight: 1.6 }}>
                クリックまたはドラッグ＆ドロップ（複数可）<br />
                対応形式: RMS形式 Shift-JIS / 標準形式 UTF-8
              </div>
            </div>
            <input ref={fileRef} type="file" accept=".csv" multiple onChange={onFileChange} style={{ display: "none" }} />
          </div>

          {/* Named keyword input */}
          <Card>
            <div style={{ fontFamily: FONT_BOLD, fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>
              指名キーワード設定
            </div>
            <input
              value={namedInput}
              onChange={(e) => setNamedInput(e.target.value)}
              placeholder="例: ブランド名, brand, ブランド英語"
              style={{
                width: "100%", fontFamily: FONT, fontSize: 13,
                border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 12px",
                color: C.text, background: C.bg, outline: "none",
                boxSizing: "border-box", transition: "border 0.15s",
              }}
              onFocus={(e) => e.target.style.borderColor = C.blue}
              onBlur={(e) => e.target.style.borderColor = C.border}
            />
            <div style={{ fontSize: 11, color: C.textMute, marginTop: 6 }}>
              カンマ区切り・部分一致で判定 ／ 現在 {namedList.length}語が設定済み
            </div>
          </Card>
        </div>

        {/* Alerts */}
        {loadInfo && !isDummy && (
          <div style={{ background: C.greenBg, border: `1px solid #a7f3d0`, borderRadius: 6, padding: "9px 14px", marginBottom: 12, fontSize: 12, color: C.green, fontFamily: FONT, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>✓</span>
            読み込み完了: <strong>{fmt(loadInfo.count)}行</strong> ／ 月: <strong>{loadInfo.months.join(", ")}</strong> ／ {loadInfo.format}
          </div>
        )}
        {parseError && (
          <div style={{ background: C.redBg, border: `1px solid #fca5a5`, borderRadius: 6, padding: "9px 14px", marginBottom: 12, fontSize: 12, color: C.red, fontFamily: FONT }}>
            ⚠ {parseError}
          </div>
        )}

        {/* ── Period filter ── */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 24, marginTop: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: C.textSub, marginRight: 4, fontWeight: 600, letterSpacing: "0.05em" }}>表示期間</span>
          {["all", ...allMonths].map((m) => {
            const active = selectedMonth === m;
            return (
              <button key={m} onClick={() => setSelectedMonth(m)} style={{
                padding: "5px 14px", borderRadius: 4, fontSize: 12, fontFamily: FONT, fontWeight: active ? 700 : 400,
                cursor: "pointer", border: `1px solid ${active ? C.blue : C.border}`,
                background: active ? C.blue : C.white, color: active ? C.white : C.textMid,
                transition: "all 0.15s",
              }}>
                {m === "all" ? "全期間" : m}
              </button>
            );
          })}
        </div>

        {/* ── KPI Cards ── */}
        <SectionHeader>KPI サマリー</SectionHeader>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
          <KPICard
            label="合計アクセス人数"
            value={`${fmt(kpis.total)}人`}
            accentColor={C.navy}
            badge={momData?.td ? { positive: momData.td.positive, text: `前月比 ${momData.td.sign}${momData.td.pct}%` } : null}
          />
          <KPICard
            label="指名キーワード"
            value={`${fmt(kpis.namedTotal)}人`}
            sub={`全体の ${kpis.namedPct}%`}
            accentColor={C.namedBar}
            badge={momData?.nd ? { positive: momData.nd.positive, text: `前月比 ${momData.nd.sign}${momData.nd.pct}%` } : null}
          />
          <KPICard
            label="一般キーワード"
            value={`${fmt(kpis.generalTotal)}人`}
            sub={`全体の ${pct(kpis.generalTotal, kpis.total)}%`}
            accentColor={C.blueMid}
            badge={momData?.gd ? { positive: momData.gd.positive, text: `前月比 ${momData.gd.sign}${momData.gd.pct}%` } : null}
          />
          <KPICard
            label="指名率"
            value={`${kpis.namedPct}%`}
            sub="指名 ÷（指名 + 一般）"
            accentColor={C.blue}
            badge={momData?.rd ? { positive: momData.rd.positive, text: `前月比 ${momData.rd.sign}${momData.rd.pct}pt` } : null}
          />
        </div>

        {/* ── Tab bar ── */}
        <div style={{ display: "flex", gap: 0, marginBottom: 22, borderBottom: `2px solid ${C.border}` }}>
          {[["overview", "概要・グラフ"], ["keywords", "キーワード詳細"]].map(([id, label]) => {
            const active = activeTab === id;
            return (
              <button key={id} onClick={() => setActiveTab(id)} style={{
                padding: "10px 22px", border: "none", cursor: "pointer", fontFamily: active ? FONT_BOLD : FONT,
                fontSize: 13, fontWeight: active ? 700 : 400, background: "transparent",
                color: active ? C.blue : C.textSub,
                borderBottom: `2px solid ${active ? C.blue : "transparent"}`,
                marginBottom: -2, transition: "all 0.15s",
              }}>{label}</button>
            );
          })}
        </div>

        {/* ════════════════════════════════════════════════════════════
            OVERVIEW TAB
        ════════════════════════════════════════════════════════════ */}
        {activeTab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Row 1: Per-month ratio bars + Trend bar chart */}
            <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 16 }}>

              {/* Per-month ratio bars */}
              <Card>
                <SectionTitle>月別 指名 / 一般 割合</SectionTitle>
                {/* Legend */}
                <div style={{ display: "flex", gap: 14, marginBottom: 18 }}>
                  {[["指名", C.namedBar], ["一般", C.generalBar]].map(([name, color]) => (
                    <div key={name} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                      <span style={{ fontSize: 11, color: C.textMid, fontFamily: FONT }}>{name}</span>
                    </div>
                  ))}
                </div>
                {monthlyData.length === 0
                  ? <div style={{ color: C.textMute, fontSize: 13, textAlign: "center", padding: 24 }}>データなし</div>
                  : monthlyData.map((row) => (
                    <MonthRatioBar key={row.month} month={row.month} named={row.named} general={row.general} />
                  ))
                }
              </Card>

              {/* Stacked bar chart – monthly trend */}
              <Card>
                <SectionTitle>月別 アクセス人数推移</SectionTitle>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={monthlyData} margin={{ top: 4, right: 12, bottom: 4, left: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                    <XAxis dataKey="month" tick={{ fontFamily: FONT, fontSize: 11, fill: C.textSub }} axisLine={{ stroke: C.border }} tickLine={false} />
                    <YAxis tick={{ fontFamily: FONT, fontSize: 10, fill: C.textSub }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      formatter={(v) => <span style={{ fontFamily: FONT, fontSize: 12, color: C.textMid }}>{v}</span>}
                      iconType="square" iconSize={8}
                    />
                    <Bar dataKey="named" name="指名" stackId="a" fill={C.namedBar} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="general" name="一般" stackId="a" fill={C.generalBar} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* Row 2: Monthly summary table */}
            <Card>
              <SectionTitle>月別 サマリーテーブル</SectionTitle>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT, fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: C.blueXL }}>
                      {["月", "指名 (人)", "一般 (人)", "合計 (人)", "指名率", "前月比（指名）", "前月比（一般）"].map((h) => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontFamily: FONT_BOLD, fontWeight: 700, fontSize: 11, color: C.textMid, letterSpacing: "0.04em", borderBottom: `2px solid ${C.border}`, whiteSpace: "nowrap" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.map((row, i) => {
                      const prev = monthlyData[i - 1];
                      const nd = prev ? diffCalc(row.named, prev.named) : null;
                      const gd = prev ? diffCalc(row.general, prev.general) : null;
                      const tot = row.named + row.general;
                      return (
                        <tr key={row.month} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.white : C.bg }}>
                          <td style={{ padding: "11px 14px", fontFamily: FONT_BOLD, fontWeight: 700, color: C.text }}>{row.month}</td>
                          <td style={{ padding: "11px 14px" }}>
                            <span style={{ color: C.namedBar, fontWeight: 700, fontFamily: FONT_BOLD }}>{fmt(row.named)}</span>
                          </td>
                          <td style={{ padding: "11px 14px", color: C.textMid }}>{fmt(row.general)}</td>
                          <td style={{ padding: "11px 14px", color: C.text, fontWeight: 600 }}>{fmt(tot)}</td>
                          <td style={{ padding: "11px 14px" }}>
                            <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, fontFamily: FONT_BOLD, background: C.blueLight, color: C.blue }}>
                              {pct(row.named, tot)}%
                            </span>
                          </td>
                          <td style={{ padding: "11px 14px" }}>
                            {nd ? (
                              <span style={{ fontSize: 12, fontWeight: 600, color: nd.positive ? C.green : C.red }}>
                                {nd.sign}{nd.pct}% ({nd.sign}{fmt(Math.abs(nd.value))})
                              </span>
                            ) : <span style={{ color: C.textMute }}>—</span>}
                          </td>
                          <td style={{ padding: "11px 14px" }}>
                            {gd ? (
                              <span style={{ fontSize: 12, fontWeight: 600, color: gd.positive ? C.green : C.red }}>
                                {gd.sign}{gd.pct}% ({gd.sign}{fmt(Math.abs(gd.value))})
                              </span>
                            ) : <span style={{ color: C.textMute }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════
            KEYWORDS TAB
        ════════════════════════════════════════════════════════════ */}
        {activeTab === "keywords" && (
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <SectionTitle>キーワード別アクセス詳細</SectionTitle>
              <div style={{ textAlign: "right" }}>
                {compMonths ? (
                  <div style={{ fontSize: 12, color: C.textSub, fontFamily: FONT }}>
                    <span style={{ fontWeight: 700, color: C.blue }}>今月: {compMonths.curr}</span>
                    <span style={{ margin: "0 6px", color: C.textMute }}>vs</span>
                    <span style={{ color: C.textMid }}>前月: {compMonths.prev}</span>
                    <span style={{ marginLeft: 12, color: C.textMute }}>／ {kwComparison.length}件</span>
                  </div>
                ) : (
                  <span style={{ fontSize: 11, color: C.textMute, fontFamily: FONT }}>
                    {selectedMonth === "all" ? "全期間" : selectedMonth} ／ {kwComparison.length}件
                    {!compMonths && allMonths.length < 2 && <span style={{ marginLeft: 6, color: C.textMute }}>（前月データなし）</span>}
                  </span>
                )}
              </div>
            </div>

            {/* 凡例 */}
            {compMonths && (
              <div style={{ display: "flex", gap: 20, marginBottom: 14, padding: "8px 12px", background: C.blueXL, borderRadius: 6, fontSize: 12, color: C.textMid, fontFamily: FONT, flexWrap: "wrap" }}>
                <span>📘 今月 = <strong style={{ color: C.blue }}>{compMonths.curr}</strong></span>
                <span>📗 前月 = <strong>{compMonths.prev}</strong></span>
                <span style={{ color: C.textMute, marginLeft: "auto" }}>前月比 ▲増加 ／ ▼減少 ／ <span style={{ color: C.textMute }}>NEW</span> = 今月初登場</span>
              </div>
            )}

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT, fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.blueXL }}>
                    {[
                      { label: "#",           w: 40 },
                      { label: "検索キーワード", w: undefined },
                      { label: "種別",         w: 60 },
                      { label: `今月 (${compMonths?.curr ?? "—"})`, w: 110 },
                      { label: `前月 (${compMonths?.prev ?? "—"})`, w: 110 },
                      { label: "前月比 (人数)", w: 130 },
                      { label: "前月比 (%)",   w: 100 },
                      { label: "今月シェア",   w: 140 },
                    ].map((h) => (
                      <th key={h.label} style={{ padding: "10px 14px", textAlign: "left", fontFamily: FONT_BOLD, fontWeight: 700, fontSize: 11, color: C.textMid, letterSpacing: "0.04em", borderBottom: `2px solid ${C.border}`, whiteSpace: "nowrap", width: h.w }}>
                        {h.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {kwComparison.map((row, i) => {
                    const isN = row.type === "指名";
                    const shareW = kwCurrTotal > 0 ? (row.curr / kwCurrTotal) * 100 : 0;
                    const isNew  = row.prev === null && row.curr > 0;
                    const isGone = row.curr === 0 && row.prev !== null;
                    return (
                      <tr key={`${row.keyword}-${i}`} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.white : C.bg, opacity: isGone ? 0.5 : 1 }}>

                        {/* # */}
                        <td style={{ padding: "10px 14px", color: C.textMute, fontSize: 12, fontWeight: 600 }}>{i + 1}</td>

                        {/* キーワード */}
                        <td style={{ padding: "10px 14px", color: C.text, fontWeight: 500 }}>{row.keyword}</td>

                        {/* 種別 */}
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, fontFamily: FONT_BOLD, background: isN ? C.blueLight : "#e0f2fe", color: isN ? C.blue : "#0369a1" }}>
                            {row.type}
                          </span>
                        </td>

                        {/* 今月 */}
                        <td style={{ padding: "10px 14px", fontFamily: FONT_BOLD, fontWeight: 700, color: row.curr > 0 ? C.text : C.textMute, textAlign: "right" }}>
                          {row.curr > 0 ? fmt(row.curr) : "—"}
                        </td>

                        {/* 前月 */}
                        <td style={{ padding: "10px 14px", color: row.prev !== null ? C.textMid : C.textMute, textAlign: "right" }}>
                          {row.prev !== null ? fmt(row.prev) : "—"}
                        </td>

                        {/* 前月比（人数差） */}
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>
                          {isNew ? (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#fef9c3", color: "#854d0e" }}>NEW</span>
                          ) : isGone ? (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#fef2f2", color: C.red }}>消滅</span>
                          ) : row.diff ? (
                            <span style={{ fontSize: 12, fontWeight: 700, color: row.diff.positive ? C.green : C.red }}>
                              {row.diff.sign}{fmt(Math.abs(row.diff.value))}
                            </span>
                          ) : <span style={{ color: C.textMute }}>—</span>}
                        </td>

                        {/* 前月比（%） */}
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>
                          {isNew ? (
                            <span style={{ color: C.textMute, fontSize: 12 }}>—</span>
                          ) : row.diff ? (
                            <span style={{ fontSize: 12, fontWeight: 700, color: row.diff.positive ? C.green : C.red }}>
                              {row.diff.positive ? "▲" : "▼"} {row.diff.pct}%
                            </span>
                          ) : <span style={{ color: C.textMute }}>—</span>}
                        </td>

                        {/* 今月シェア */}
                        <td style={{ padding: "10px 14px", minWidth: 140 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ flex: 1, height: 6, background: C.border, borderRadius: 99, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${Math.min(shareW * 4, 100)}%`, background: isN ? C.namedBar : C.generalBar, borderRadius: 99 }} />
                            </div>
                            <span style={{ fontSize: 11, color: C.textSub, minWidth: 38, textAlign: "right" }}>
                              {pct(row.curr, kwCurrTotal)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: `1px solid ${C.border}`, padding: "14px 32px", display: "flex", justifyContent: "flex-end", background: C.white }}>
        <span style={{ fontSize: 11, color: C.textMute, fontFamily: FONT, letterSpacing: "0.05em" }}>
          RMS 検索キーワード分析 ／ 指名・一般キーワード分類ツール
        </span>
      </div>
    </div>
  );
}
