// public/english.mjs
var labels = new Map(Object.entries({
  "\u5F85\u6838\u5BF9": "Pending review",
  "\u5F85\u8865\u5145": "More information needed",
  "\u5DF2\u786E\u8BA4": "Confirmed",
  "\u6D41\u7A0B\u5339\u914D": "Process mapping",
  "\u80FD\u529B\u5339\u914D": "Capability mapping",
  "\u6D41\u7A0B\u5C42\u7EA7\u8868": "Process taxonomy",
  "\u672A\u586B\u5199\u6D41\u7A0B": "Missing process",
  "\u80FD\u529B\u7F16\u7801\u7F3A\u5931": "Missing capability code",
  "\u4E1A\u52A1\u80FD\u529B\u65E0\u6CD5\u8BC6\u522B": "Capability code could not be identified",
  "\u6D41\u7A0B\u672A\u6807\u6CE8\u6807\u51C6\u5C42\u7EA7": "Process level not specified",
  "\u6D41\u7A0B\u540D\u79F0\u5BF9\u5E94\u591A\u4E2A\u7F16\u53F7": "Process name matches multiple codes",
  "\u6D41\u7A0B\u94FE\u7F16\u53F7\u5B58\u5728\u5DEE\u5F02": "Process chain code needs confirmation",
  "\u6D41\u7A0B\u672A\u5339\u914D\u5C42\u7EA7\u8868": "No confirmed match in the current process catalogue",
  "\u540C\u4E00\u6D41\u7A0B\u7F16\u53F7\u5BF9\u5E94\u4E0D\u540C\u540D\u79F0": "Different names recorded for the same process code",
  "\u6D41\u7A0B\u7F3A\u5C11\u7236\u7EA7\u8BB0\u5F55": "Process parent record missing",
  "\u6807\u51C6\u8868\u672A\u627E\u5230\u552F\u4E00\u5BF9\u5E94\u9879": "No unique match in the taxonomy",
  "\u9700\u8865\u5145\u6807\u51C6\u8BB0\u5F55": "Standard record required",
  "\u672A\u586B\u5199": "Not provided",
  "\u9700\u7531\u4E1A\u52A1\u65B9\u786E\u8BA4\u6D41\u7A0B\u94FE\u3001\u540D\u79F0\u548C\u5C42\u7EA7": "Business owner to confirm the process chain, name and level",
  "\u5E94\u7528\u6E05\u5355\u672A\u586B\u5199 Process": "Process is not provided in the application inventory",
  "\u5F53\u524D\u5206\u7C7B\u8868\u672A\u6536\u5F55\u6B64\u7F16\u53F7": "Code not found in the current catalogue; coverage needs confirmation",
  "\u4FDD\u7559\u539F\u59CB\u7F16\u53F7\uFF0C\u8BF7\u786E\u8BA4\u5206\u7C7B\u8868\u662F\u5426\u9700\u8981\u8865\u5145": "Original code retained; confirm whether the taxonomy needs updating",
  "\u5206\u7C7B\u8868\u6CA1\u6709\u53EF\u786E\u8BA4\u7684\u6807\u51C6\u7F16\u53F7": "No confirmed standard code in the taxonomy",
  "\u5BF9\u65B9\u767B\u8BB0\u6DF1\u5EA6\u4E0D\u8DB3\u3002": "Peer records are not detailed enough.",
  "\u5BF9\u65B9\u5728\u6B64\u5206\u652F\u53EA\u767B\u8BB0\u5230\u66F4\u7C97\u5C42\u7EA7\u3002": "Peer records cover this branch only at a broader level.",
  "\u5BF9\u65B9\u5728\u6B64\u5206\u652F\u4ECD\u6709\u672A\u786E\u8BA4\u7684\u5206\u7C7B\u3002": "Peer classifications in this branch are not yet confirmed.",
  "\u76EE\u6807\u5E94\u7528\u4ECD\u6709\u672A\u786E\u8BA4\u7684\u5206\u7C7B\u3002": "Target classifications are not yet confirmed.",
  "\u76EE\u6807\u6CA1\u6709\u53EF\u6BD4\u8F83\u7684\u767B\u8BB0\u3002": "Target has no comparable records.",
  "\u5BF9\u65B9\u6CA1\u6709\u53EF\u6BD4\u8F83\u7684\u767B\u8BB0\u3002": "Peer has no comparable records.",
  "\u90E8\u5206\u5206\u652F\u4FE1\u606F\u4E0D\u8DB3\uFF0C\u4FDD\u7559\u5DF2\u77E5\u5206\u652F\u7ED3\u679C\u3002": "Some branches have insufficient information; known branch results are retained.",
  "\u4EC5\u586B\u5230\u603B\u7C7B / \u672A\u5339\u914D": "Top-level only / Unmapped",
  "\u672A\u5339\u914D / \u672A\u586B\u5199\u6D41\u7A0B": "Unmapped / Process not provided",
  "\u5168\u90E8\u5E94\u7528": "All applications",
  "A/B \u9A8C\u6536\u6837\u4F8B": "A/B demo",
  "A/B \u9A8C\u6536\u6837\u4F8B \xB7 2 \u4E2A\u6A21\u62DF\u5E94\u7528": "A/B demo \xB7 2 sample applications",
  "\u5BFC\u5165\u7684\u5DE5\u4F5C\u533A": "Imported workspace",
  "\u5DE5\u4F5C\u533A\u5206\u7C7B\u8868": "Workspace taxonomy",
  "\u5DE5\u4F5C\u533A\u7F3A\u5C11\u5E94\u7528\u6E05\u5355\u6216\u5206\u7C7B\u8868": "Workspace is missing the application inventory or taxonomy.",
  "\u5DE5\u4F5C\u533A\u6570\u636E\u7ED3\u6784\u65E0\u6548": "Invalid workspace data structure.",
  "\u5DE5\u4F5C\u533A JSON \u5185\u5BB9\u65E0\u6CD5\u8BFB\u53D6": "Unable to read the workspace JSON.",
  "\u8BF7\u9009\u62E9\u672C\u7A0B\u5E8F\u5BFC\u51FA\u7684\u5DE5\u4F5C\u533A JSON \u6587\u4EF6": "Select a workspace JSON exported from this application.",
  "\u5F53\u524D\u5206\u7C7B\u8868\u6CA1\u6709 A/B \u6837\u4F8B\u6240\u9700\u7684 B.06.1.2\u3001.3\u3001.4\uFF0C\u8BF7\u5148\u4F7F\u7528\u539F\u59CB\u5206\u7C7B\u8868": "The A/B demo requires B.06.1.2, B.06.1.3 and B.06.1.4. Import the original taxonomy first.",
  "\u6587\u4EF6\u8D85\u8FC7 30 MB\uFF0C\u8BF7\u5BFC\u51FA\u6240\u9700\u5DE5\u4F5C\u8868\u540E\u91CD\u8BD5\u3002": "File exceeds 30 MB. Export only the required worksheets and try again.",
  "\u65E0\u6CD5\u8BFB\u53D6\u6B64\u6587\u4EF6\uFF0C\u8BF7\u4F7F\u7528\u672A\u52A0\u5BC6\u7684 .xlsx \u6587\u4EF6\u3002": "Unable to read this file. Use an unencrypted .xlsx file.",
  "Excel \u538B\u7F29\u76EE\u5F55\u4E0D\u5B8C\u6574\u3002": "The Excel archive directory is incomplete.",
  "\u89E3\u538B\u540E\u7684\u6587\u4EF6\u8FC7\u5927\uFF0C\u8BF7\u4EC5\u4FDD\u7559\u5FC5\u8981\u5DE5\u4F5C\u8868\u3002": "The extracted file is too large. Keep only the required worksheets.",
  "\u4E0D\u652F\u6301\u52A0\u5BC6 Excel\u3002": "Encrypted Excel files are not supported.",
  "\u8BF7\u7528\u65B0\u7248 Chrome \u6216 Edge \u6253\u5F00\u6B64\u7F51\u9875\u4EE5\u5BFC\u5165 Excel\u3002": "Use a recent version of Chrome or Edge to import Excel files.",
  "\u4E0D\u652F\u6301\u6B64 Excel \u538B\u7F29\u683C\u5F0F\u3002": "This Excel compression format is not supported.",
  "Excel XML \u5185\u5BB9\u6709\u8BEF\u3002": "Invalid XML in the Excel file.",
  "\u672A\u627E\u5230\u5E94\u7528\u6E05\u5355\u5DE5\u4F5C\u8868\u3002": "Application inventory worksheet not found.",
  "\u5E94\u7528\u6E05\u5355\u6CA1\u6709\u6570\u636E\u3002": "The application inventory is empty.",
  "\u5C42\u7EA7\u8868\u9700\u5305\u542B Business Capability \u548C Data_RBW Process Structure \u5DE5\u4F5C\u8868\u3002": "Taxonomy must contain the Business Capability and Data_RBW Process Structure worksheets.",
  "\u672A\u627E\u5230 Process ID \u8868\u5934\u3002": "Process ID column header not found.",
  "\u8BF7\u9009\u62E9\u4E1A\u52A1\u80FD\u529B\u6216\u6D41\u7A0B": "Select Business Capability or Process.",
  "\u8BF7\u9009\u62E9\u4E24\u4E2A\u4E0D\u540C\u5E94\u7528": "Select two different applications.",
  "\u8BF7\u9009\u62E9\u6709\u6548\u5E94\u7528": "Select valid applications.",
  "\u8BF7\u767B\u5F55 ChatGPT \u540E\u4F7F\u7528\u81EA\u52A8\u4FDD\u5B58\u3002": "Sign in to save changes.",
  "\u4E0D\u652F\u6301\u6B64\u64CD\u4F5C": "Operation not supported.",
  "\u8BF7\u6C42\u6765\u6E90\u4E0D\u5339\u914D": "Request origin does not match.",
  "\u9700\u8981 JSON \u5DE5\u4F5C\u533A": "A JSON workspace is required.",
  "\u81EA\u52A8\u4FDD\u5B58\u6682\u65F6\u4E0D\u53EF\u7528\uFF0C\u8BF7\u5148\u5BFC\u51FA\u5DE5\u4F5C\u533A\u5907\u4EFD\u3002": "Autosave is unavailable. Export a workspace backup.",
  "\u5DE5\u4F5C\u533A\u8F83\u5927\uFF0C\u65E0\u6CD5\u81EA\u52A8\u4FDD\u5B58\uFF0C\u8BF7\u5BFC\u51FA\u5DE5\u4F5C\u533A\u5907\u4EFD\u3002": "Workspace is too large to autosave. Export a backup.",
  "\u5DE5\u4F5C\u533A\u5185\u5BB9\u4E3A\u7A7A": "Workspace is empty.",
  "\u5DE5\u4F5C\u533A\u7248\u672C\u65E0\u6548": "Invalid workspace revision.",
  "\u9A8C\u6536\u6837\u4F8B\u4E0D\u8986\u76D6\u5DF2\u4FDD\u5B58\u7684\u5DE5\u4F5C\u533A": "Demo data cannot replace the saved workspace.",
  "\u5DE5\u4F5C\u533A\u5185\u5BB9\u65E0\u6548": "Invalid workspace content.",
  "\u53E6\u4E00\u4E2A\u9875\u9762\u5DF2\u4FDD\u5B58\u4E86\u66F4\u65B0\u3002\u8BF7\u5148\u5BFC\u51FA\u5F53\u524D\u5DE5\u4F5C\u533A\uFF0C\u518D\u91CD\u65B0\u52A0\u8F7D\u6700\u65B0\u8BB0\u5F55\u3002": "Changes were saved in another tab. Export this workspace before reloading the latest version.",
  "\u81EA\u52A8\u4FDD\u5B58\u6682\u65F6\u5931\u8D25\uFF0C\u8BF7\u5148\u5BFC\u51FA\u5DE5\u4F5C\u533A\u5907\u4EFD\uFF0C\u7A0D\u540E\u91CD\u8BD5\u3002": "Autosave failed. Export a workspace backup and try again later.",
  "\u672A\u627E\u5230\u6B64\u529F\u80FD": "Endpoint not found."
}));
function english(value2) {
  const text2 = String(value2 ?? "");
  const legacySuffix = " \xB7 \u4EC5\u586B\u5230\u6B64\u5C42";
  if (text2.endsWith(legacySuffix)) return english(text2.slice(0, -legacySuffix.length)) + " \xB7 recorded at this level";
  if (labels.has(text2)) return labels.get(text2);
  return text2.replace(/^第 (\d+) 行缺少 ID 或 Name$/, "Row $1 is missing ID or Name.").replace(/^应用 ID 重复：(.+)$/, "Duplicate application ID: $1").replace(/^Excel 中缺少 (.+)$/, "Missing Excel entry: $1").replace(/^应用清单缺少列：(.+)$/, "Missing inventory column: $1").replace(/^层级表缺少 (.+)$/, "Missing taxonomy column: $1").replace(/ 名称存在差异（(\d+) 种）$/, " \u2014 $1 name variants");
}

// public/annual-benefit.mjs
function cleanAnnualBenefit(value2) {
  if (value2 == null || typeof value2 === "string" && value2.trim() === "") return null;
  if (!["number", "string"].includes(typeof value2) || !Number.isFinite(Number(value2)) || Number(value2) < 0) throw Error("Annual benefit must be a non-negative CNY amount, or blank.");
  return Number(value2);
}

// public/roi.mjs
function cleanROIScore(value2) {
  if (value2 == null || typeof value2 === "string" && value2.trim() === "") return null;
  if (!["string", "number"].includes(typeof value2) || !Number.isInteger(Number(value2)) || Number(value2) < 1 || Number(value2) > 5) throw Error("ROI score must be 1 to 5, or blank.");
  return Number(value2);
}
var ROI_PAYBACK = Object.freeze({ 1: "> 2 years", 3: "> 1 year", 5: "< 1 year" });

// public/codes.mjs
var split = (v) => String(v ?? "").split(";").map((x) => x.trim()).filter((x) => x && !/^(empty|n\/a)$/i.test(x));
var norm = (v) => String(v ?? "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
var compareNatural = new Intl.Collator(void 0, { numeric: true }).compare;
var PROCESS_LEVEL = /\bL([0-3])V?\s*$/i;
function capCode(s) {
  const m = String(s).match(/^([A-Z]+\.\d+(?:\.\d+)*)\b/);
  return m ? m[1].split(".").map((x, i) => i < 2 ? x : String(Number(x))).join(".") : null;
}

// public/semantic-review.mjs
var SEMANTIC_CASES = [
  { code: "B.06.2.10", sourceName: "Customer Order Planning", standardName: "Order Planning Simulation", suggestedCode: "B.06.2" },
  { code: "B.06.4", sourceName: "Inventory Management", standardName: "Storage Management", suggestedCode: "B.06.4" },
  { code: "B.06.4.1", sourceName: "Commercial Inventory Management", standardName: "Stock Putaway Management", suggestedCode: null },
  { code: "B.06.4.2", sourceName: "Physical Inventory", standardName: "Stock Removal/Picking Management", suggestedCode: "B.06.4.4" },
  { code: "B.06.5.2", sourceName: "Material Flow and Storage Management", standardName: "Goods Replenishment Management", suggestedCode: "B.06.4" },
  { code: "B.06.5.3", sourceName: "Production Logistics", standardName: "Goods Issue Management", suggestedCode: "B.06.5.2" },
  { code: "B.06.7.1", sourceName: "Complaint Management Supplier / LSP / Internal", standardName: "Supply Chain\u2026\u2026Traceability Management", suggestedCode: "B.06.7.4" }
];
var casesByCode = new Map(SEMANTIC_CASES.map((item) => [item.code, item]));

// public/weighted.mjs
var DEFAULT_WEIGHTS = Object.freeze({ name: 0.1, description: 0.2, cap: 0.3, process: 0.4 });
function cleanWeights(value2 = DEFAULT_WEIGHTS) {
  const result = Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map((k) => [k, value2?.[k]]));
  if (Object.values(result).some((n) => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1) || !Object.values(result).some((n) => n > 0)) throw Error("Weights must be between 0 and 1, with at least one greater than 0.");
  return result;
}
function normalizeWeights(value2) {
  const raw = cleanWeights(value2), sum = Object.values(raw).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v / sum]));
}
var DESCRIPTION_STOP_WORDS = new Set("a an and are as at be been being by can for from has have in is it of on or that the this to was were which with".split(" "));

// public/pair-status.mjs
var PAIR_STATES = Object.freeze(["Potential overlap", "Below threshold", "No complete score", "No shared registrations", "Data missing", "Needs confirmation", "More detail needed", "Out of scope"]);
var DATA_TO_CONFIRM = Object.freeze(["Data missing", "Needs confirmation", "More detail needed"]);
var oneDecimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

// public/costs.mjs
var ANNUAL_COST_BANDS = Object.freeze({ 1: 2e5, 2: 1e5, 3: 5e4, 4: 2e4, 5: 1e4 });
function cleanCostScore(value2) {
  if (value2 === null || value2 === void 0) return null;
  if (!["string", "number"].includes(typeof value2)) throw Error("App operation cost must be a score from 1 to 5, or blank.");
  if (typeof value2 === "string" && value2.trim() === "") return null;
  const score = Number(value2);
  if (!Number.isInteger(score) || score < 1 || score > 5) throw Error("App operation cost must be a score from 1 to 5, or blank.");
  return score;
}

// public/similarity-guide.mjs
var PAIR_REVIEW_STATUSES = Object.freeze(["Pending review", "Overlap confirmed", "Complementary", "Different purposes", "Related environments"]);
function cleanPairReviews(value2) {
  const out = {};
  for (const [key, review] of Object.entries(value2 && typeof value2 === "object" && !Array.isArray(value2) ? value2 : {})) {
    if (!/::/.test(key) || !review || typeof review !== "object" || !PAIR_REVIEW_STATUSES.includes(review.status)) continue;
    out[key] = { status: review.status, reason: String(review.reason ?? "").slice(0, 500), reviewer: String(review.reviewer ?? "").slice(0, 100), date: String(review.date ?? "").slice(0, 10) };
  }
  return out;
}

// public/weight-controls.mjs
var keys = Object.keys(DEFAULT_WEIGHTS);
function weightPercentages(rawWeights) {
  const normalized = normalizeWeights(rawWeights);
  const quotas = keys.map((key) => normalized[key] * 1e3);
  const units = quotas.map(Math.floor);
  let remaining = 1e3 - units.reduce((sum, value2) => sum + value2, 0);
  const order = keys.map((_, index) => index).sort((a, b) => quotas[b] - units[b] - (quotas[a] - units[a]) || a - b);
  for (const index of order) {
    if (remaining <= 0) break;
    units[index]++;
    remaining--;
  }
  return Object.fromEntries(keys.map((key, index) => [key, units[index] / 10]));
}

// public/score-settings.mjs
var numeric = /^\s*\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\s*$/i;
function cleanThreshold(value2) {
  const number = typeof value2 === "number" ? value2 : typeof value2 === "string" && numeric.test(value2) ? Number(value2) : NaN;
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number + 0 : null;
}
function thresholdField(data) {
  const value2 = cleanThreshold(data?.similarityThreshold);
  return value2 === null ? {} : { similarityThreshold: value2 };
}

// public/corrections.mjs
var sourceFields = ["ID", "Name", "Division", "Entity", "Description", "Business Capabilities", "Processes", "Lifecycle: Current Lifecycle"];
var recordKey = (c) => JSON.stringify([String(c.appId).trim(), c.dimension, c.raw]);
var appSnapshot = (a) => JSON.stringify(sourceFields.map((k) => String(a[k] ?? "")));
function standardTargets(data, dimension) {
  const targets = /* @__PURE__ */ new Map();
  if (dimension === "cap") for (const value2 of data.capabilityRows.flat()) {
    const id = capCode(value2);
    if (id) {
      const label = String(value2);
      const old = targets.get(id);
      targets.set(id, { id, label, ambiguous: !!old && (old.ambiguous || old.label !== label) });
    }
  }
  else if (dimension === "process") for (const [chain, level2, id, label] of data.processRows) {
    if (!id || !/^L[0-3]$/.test(level2)) continue;
    const key = String(id), old = targets.get(key), node = { id: key, label: String(label), level: level2, chain: String(chain) };
    node.ambiguous = !!old && (old.ambiguous || old.label !== node.label || old.level !== node.level || old.chain !== node.chain);
    targets.set(key, node);
  }
  return targets;
}
function targetSnapshot(data, dimension, targetId) {
  const targets = standardTargets(data, dimension), target = targets.get(targetId);
  if (!target || target.ambiguous) return null;
  return JSON.stringify([...targets.values()].filter((n) => targetId === n.id || targetId.startsWith(n.id + ".")).sort((a, b) => a.id.localeCompare(b.id)));
}
function cleanCorrections(value2) {
  if (!Array.isArray(value2)) return [];
  return value2.filter((c) => c && typeof c === "object" && ["cap", "process"].includes(c.dimension) && typeof c.id === "string" && c.id && typeof c.appId === "string" && typeof c.raw === "string" && typeof c.targetId === "string" && typeof c.appSnapshot === "string" && typeof c.taxonomySnapshot === "string" && String(c.reviewer || "").trim() && String(c.reason || "").trim()).map((c) => Object.fromEntries(["id", "appId", "dimension", "raw", "targetId", "appSnapshot", "taxonomySnapshot", "reviewKey", "reviewer", "reason", "createdAt", "revokedAt"].map((k) => [k, String(c[k] ?? "")])));
}
function correctionStates(data) {
  const records = cleanCorrections(data.corrections), active = records.filter((c) => !c.revokedAt), counts = /* @__PURE__ */ new Map();
  for (const c of active) counts.set(recordKey(c), (counts.get(recordKey(c)) || 0) + 1);
  return records.map((c) => {
    if (c.revokedAt) return { ...c, state: "Revoked" };
    const a = data.apps.find((a2) => String(a2.ID).trim() === c.appId);
    const values = a ? split(a[c.dimension === "cap" ? "Business Capabilities" : "Processes"]) : [];
    const valid = a && appSnapshot(a) === c.appSnapshot && (values.includes(c.raw) || c.raw === "" && !values.length) && targetSnapshot(data, c.dimension, c.targetId) === c.taxonomySnapshot && counts.get(recordKey(c)) === 1;
    return { ...c, state: valid ? "Applied" : "Needs review" };
  });
}

// public/leanix-process-export.mjs
var LEANIX_PROCESS_EXPORT = Object.freeze({ "file": "20261020_034219_3GLYW_inventory.xlsx", "sheets": { "new (Export 2026-10-20 11_42)": [["id", "type", "name", "displayName", "description"], ["ID", "Type", "Name", "Display Name", "Description"], ["c96bcd42-975e-439d-b12c-df0cbf323028", "Process", "M.I2D Intralogistics to Demand", "M.I2D Intralogistics to Demand", "all physical processes of the supply chain within plants"], ["701cfb5d-65b2-47a5-b051-d23b6277561a", "Process", "M.I2D.010 Receive to Store", "M.I2D.010 Receive to Store", "physical inbound process from goods receipt to putaway material to first destination "], ["a6d6abe8-efb4-45c8-822e-ec57803eb81e", "Process", "M.I2D.010.010 Pre-Processing", "M.I2D.010.010 Pre-Processing", "Good receipt preprocessing for EDI vendors and non EDI vendors"], ["11420c99-d651-4b51-8bba-f47c4d3a5a6b", "Process", "M.I2D.010.020 Dock & Yard Management", "M.I2D.010.020 Dock & Yard Management", "management of dock&Yard for incomming goods"], ["8f4a8e3c-81f2-4ca2-8950-41e674dbdfd2", "Process", "M.I2D.010.030 Unloading & Check of Transport", "M.I2D.010.030 Unloading & Check of Transport", "incoming goods unloading "], ["878b7f2f-9fc0-4e20-8c62-6fa90fe7493a", "Process", "M.I2D.010.040 Identification & Booking", "M.I2D.010.040 Identification & Booking", "goods receipt posting with the excecution of all required quality steps"], ["69b20bb1-b4c4-49e9-aec0-ef2d3c7df5e6", "Process", "M.I2D.010.050 Putaway", "M.I2D.010.050 Putaway", "putaway of incoming goods incl. all related operations in the goods receipt area "], ["dcd7807f-17d6-4453-8220-6de4312d35c3", "Process", "M.I2D.020 Warehouse to Consume", "M.I2D.020 Warehouse to Consume", "internal physical processes running in the warehouse for components and material supply to shopfloors"], ["acdc85e7-77cd-4d95-8663-f3f7cc6a8b0c", "Process", "M.I2D.020.010 Material Request", "M.I2D.020.010 Material Request", "material requests without production order relation "], ["6f76983a-1913-4cbe-98e4-e8ed5dc0214f", "Process", "M.I2D.020.020 Picking for Material Supply", "M.I2D.020.020 Picking for Material Supply", "Material removal of components from warehouse"], ["0a57b7ee-7a12-49e6-b180-9da33c96081e", "Process", "M.I2D.020.030 Internal Transport", "M.I2D.020.030 Internal Transport", "internal transports between all physical sources and destinations within a plant"], ["fb753134-b8de-4de7-bf29-76f41210ebd8", "Process", "M.I2D.020.040 Material Consumption", "M.I2D.020.040 Material Consumption", "Consumption of goods to different cost elements"], ["e68d39a2-c6c5-47a7-b0d7-d597823d6c70", "Process", "M.I2D.020.050 Returnable Packaging Handling", "M.I2D.020.050 Returnable Packaging Handling", "special processes for managing packaging in a warehouse"], ["96cbd7a4-4d4b-40b3-aea3-1f641aeefa4b", "Process", "M.I2D.020.060 Warehouse Processing", "M.I2D.020.060 Warehouse Processing", "processes running in the warehouse supporting the material supply chain"], ["c1ce107c-b4fa-4671-888a-61363edb609f", "Process", "M.I2D.020.080 Physical Inventory", "M.I2D.020.080 Physical Inventory", "stocktacking of goods in the warehouse area"], ["3dbec80c-f0c1-4075-a169-da257eb3f201", "Process", "M.I2D.020.090 Warehouse Master Data", "M.I2D.020.090 Warehouse Master Data", "all objets and data under responsibility of I2D which you need as prerequisit to run warehouse processes  "], ["b8a27ce4-223a-46d4-98da-1db0d46cb603", "Process", "M.I2D.020.100 Warehouse Monitoring", "M.I2D.020.100 Warehouse Monitoring", "Warehouse process monitoring and Resourcemanagement"], ["2e67763f-2908-4c5a-b732-682bfebb2b7a", "Process", "M.I2D.020.110 Reporting", "M.I2D.020.110 Reporting", "I2D reporting directly in the operational system or based on external data bases"], ["a394d541-891b-43df-b0fd-e1d3c578f973", "Process", "M.I2D.030 Store to Ship", "M.I2D.030 Store to Ship", "physical outbound processes in our warehouse from put away to goods issue"], ["ce8b0947-0f59-4867-886a-0dff6c0a1d70", "Process", "M.I2D.030.010 Putaway from Production", "M.I2D.030.010 Putaway from Production", "finished goods/ semifinished goods receiving and putaway to warehouse or sub-sequent shopfloor"], ["3c1ba598-ca1a-4586-8f0c-f579c8876b79", "Process", "M.I2D.030.020 Repackaging", "M.I2D.030.020 Repackaging", "repacking of finished goods in the outbound area"], ["3ad36bd0-2c35-427e-b3c5-9480d4d24766", "Process", "M.I2D.030.030 Process and Release Outbound Delivery Order", "M.I2D.030.030 Process and Release Outbound Delivery Order", "Outbound delivery Order management "], ["114cd68c-110e-49d4-b7a2-774fa9554a57", "Process", "M.I2D.030.040 Picking for Outbound", "M.I2D.030.040 Picking for Outbound", "Material removal of finished goods from warehouse"], ["d8e4ee98-f381-4d42-8672-d9674018731c", "Process", "M.I2D.030.050 Packing for Outbound", "M.I2D.030.050 Packing for Outbound", "packging of goods for shipment "], ["26957994-e897-4ab6-a122-500f860c1729", "Process", "M.I2D.030.060 Staging", "M.I2D.030.060 Staging", "staging of goods for shipment"], ["494a5384-205c-4d1b-b4d0-edb006c8df6b", "Process", "M.I2D.030.070 Loading", "M.I2D.030.070 Loading", "Truck Loading incl. the excecution of all quality steps"]], "ReadMe": [["LeanIX inventory export created at: 2026-10-20 03:42:20 GMT"], null, ["General notes"], ["Values must not contain the character < (less than) or the list separator ; (semicolon)."], null, ["Special types"], ["List: multiple values separated by ; (semicolon)"], ["Email address: String specifying a user's email address"], ["Fact Sheet: The displayName of a Fact Sheet (its type is inferred by relation name)"], null, ["Column header", "Type", "Mandatory", "Read only", "Remarks"], ["id", "String (UUID)", "mandatory", "read only", "If id is empty, a Fact Sheet is created; otherwise the Fact Sheet is updated."], ["type", "String", "mandatory", "read only", "Import only one Fact Sheet type per Excel file. Application, BuildingBlock, BusinessCapability, DataObject, ITComponent, Interface, Objective, OrganizationalEntity, Platform, Process, Project, Provider, SystemId, TechnicalStack, UserGroup"], ["name", "String", "mandatory", "", ""], ["displayName", "String", "", "read only", "Unique per Fact Sheet type. Calculated by LeanIX according to the Fact Sheet type's naming rules. Needed to reference Fact Sheets when importing relations."], ["description", "String", "", "", ""]] } });

// public/leanix-processes.mjs
var STANDARD_SNAPSHOT = Object.freeze({
  file: "Business Capability + Process.xlsx",
  sheet: "Data_RBW Process Structure",
  date: "21.02.2025",
  note: "Valid version only in Signavio Bosch Process World",
  label: "Standard snapshot (Business Capability + Process.xlsx, 21.02.2025)"
});
var PROCESS_CODE = /^(M\.[A-Z0-9]+(?:\.\d+)*)(?=\s|$)/;
var processCode = (text2) => String(text2 ?? "").trim().match(PROCESS_CODE)?.[1] ?? null;
var withoutCode = (text2) => String(text2 ?? "").trim().replace(PROCESS_CODE, "").trim();
var EXPORTED_AT = /created at:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) GMT/i;
var beijing = (gmt) => {
  const t = Date.parse(gmt.replace(" ", "T") + "Z");
  return Number.isFinite(t) ? new Date(t + 8 * 36e5).toISOString().slice(0, 19).replace("T", " ") : "";
};
function parseLeanixProcessExport(exported = LEANIX_PROCESS_EXPORT) {
  const sheets = exported.sheets || {}, issues = [];
  const readme = Object.entries(sheets).find(([name]) => /^readme$/i.test(name))?.[1] || [];
  const gmt = readme.flat().map(String).map((s) => s.match(EXPORTED_AT)?.[1]).find(Boolean) || "";
  const entry = Object.entries(sheets).find(([name, rows2]) => !/^readme$/i.test(name) && ["id", "type", "name", "displayName"].every((k) => rows2[0]?.includes(k)));
  if (!entry) return { file: exported.file || "", sheet: "", exportedAt: gmt, exportedAtBeijing: gmt ? beijing(gmt) : "", records: [], issues: [{ type: "No LeanIX process sheet found" }], label: "LeanIX export" };
  const [sheet, rows] = entry, head = rows[0], col = (k) => head.indexOf(k);
  const displayHeader = ["ID", "Name"].every((k) => rows[1]?.includes(k));
  const records = rows.slice(displayHeader ? 2 : 1).filter((r) => r.some((v) => String(v ?? "").trim())).map((r, i) => {
    const get = (k) => col(k) < 0 ? "" : String(r[col(k)] ?? "").trim();
    const name = get("name"), displayName2 = get("displayName"), nameCode = processCode(name), displayCode = processCode(displayName2);
    return { row: i + (displayHeader ? 3 : 2), factSheetId: get("id"), type: get("type"), code: nameCode || displayCode, nameCode, displayCode, name, displayName: displayName2, processName: withoutCode(name || displayName2), description: get("description") };
  });
  const count = (key) => records.reduce((m, r) => r[key] ? m.set(r[key], (m.get(r[key]) || 0) + 1) : m, /* @__PURE__ */ new Map());
  const codes = count("code"), ids = count("factSheetId");
  for (const r of records) {
    if (!r.code) issues.push({ type: "Process code not recognised", row: r.row, value: r.name || r.displayName });
    if (r.nameCode && r.displayCode && r.nameCode !== r.displayCode) issues.push({ type: "Name and Display Name codes differ", row: r.row, value: `${r.nameCode} / ${r.displayCode}` });
    if (r.code && codes.get(r.code) > 1) issues.push({ type: "Duplicate process code", row: r.row, value: r.code });
    if (r.factSheetId && ids.get(r.factSheetId) > 1) issues.push({ type: "Duplicate Fact Sheet ID", row: r.row, value: r.factSheetId });
    if (r.type && r.type !== "Process") issues.push({ type: "Not a Process record", row: r.row, value: r.type });
  }
  const exportedAtBeijing = gmt ? beijing(gmt) : "";
  return { file: exported.file || "", sheet, exportedAt: gmt, exportedAtBeijing, records, issues, label: `LeanIX export ${exportedAtBeijing ? exportedAtBeijing.slice(0, 16) + " (Beijing time)" : exported.file || ""}`.trim() };
}
function applyLeanixExport(procs, exported = LEANIX_PROCESS_EXPORT) {
  const parsed = parseLeanixProcessExport(exported), usable = /* @__PURE__ */ new Map();
  const conflicts = new Set(parsed.issues.filter((i) => i.type === "Duplicate process code").map((i) => i.value));
  for (const r of parsed.records) if (r.code && !conflicts.has(r.code) && !(r.nameCode && r.displayCode && r.nameCode !== r.displayCode)) usable.set(r.code, r);
  const chains = /* @__PURE__ */ new Set(), levels = /* @__PURE__ */ new Set(), unknown = [];
  for (const [code, r] of usable) {
    const node = procs.get(code);
    if (!node) {
      unknown.push({ type: "Code not in the standard snapshot", row: r.row, value: code });
      continue;
    }
    const same = r.processName === node.label, equivalent = norm(r.processName) === norm(node.label);
    node.snapshotName = node.label;
    node.leanix = { factSheetId: r.factSheetId, name: r.processName, displayName: r.displayName, description: r.description, source: parsed.label, file: parsed.file };
    node.nameStatus = same ? "same" : equivalent ? "equivalent" : "differs";
    node.exportStatus = "included";
    chains.add(code.split(".").slice(0, 2).join("."));
    levels.add(node.level);
  }
  const notIncluded = [];
  for (const node of procs.values()) {
    if (node.exportStatus || !chains.has(node.id.split(".").slice(0, 2).join("."))) continue;
    node.exportStatus = levels.has(node.level) ? "not-included" : "level-not-covered";
    if (node.exportStatus === "not-included") notIncluded.push(node.id);
  }
  return { ...parsed, issues: [...parsed.issues, ...unknown], covered: [...usable.keys()].filter((code) => procs.has(code)), notIncluded, scope: { chains: [...chains].sort(), levels: [...levels].sort() } };
}
var EXPORT_STATUS_TEXT = Object.freeze({
  "included": "Included in this LeanIX export.",
  "not-included": "Not included in this export. This does not show that the process is retired, deleted or invalid.",
  "level-not-covered": "This LeanIX export has no records at this level; the standard snapshot is the only source."
});

// public/accepted-records.mjs
var acceptedKey = ({ appId, dimension, raw }) => JSON.stringify([String(appId ?? "").trim(), dimension, String(raw ?? "")]);
var text = (value2, max) => String(value2 ?? "").slice(0, max);
function cleanAcceptedRecords(value2) {
  if (!Array.isArray(value2)) return [];
  const seen = /* @__PURE__ */ new Set();
  return value2.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = { appId: text(entry.appId, 200).trim(), dimension: entry.dimension === "cap" ? "cap" : entry.dimension === "process" ? "process" : "", raw: text(entry.raw, 2e3), reviewer: text(entry.reviewer, 200).trim(), reason: text(entry.reason, 2e3).trim(), acceptedAt: text(entry.acceptedAt, 40).trim() };
    if (!record.appId || !record.dimension || !record.raw.trim() || !record.reviewer || !record.reason || !record.acceptedAt || seen.has(acceptedKey(record))) return [];
    seen.add(acceptedKey(record));
    return [record];
  });
}

// public/model.mjs
var level = (id) => id.split(".").length - 1;
function buildModel(data) {
  const caps = /* @__PURE__ */ new Map(), procs = /* @__PURE__ */ new Map(), capVersions = /* @__PURE__ */ new Map(), taxonomyIssues = [];
  function ensureCap(id, label, reference = false) {
    if (!caps.has(id)) caps.set(id, { id, label: label || id, level: level(id), children: [], parent: id.includes(".") ? id.slice(0, id.lastIndexOf(".")) : null });
    const n = caps.get(id);
    if (label) {
      if (reference) n.reference = label;
      else {
        if (!capVersions.has(id)) capVersions.set(id, /* @__PURE__ */ new Set());
        capVersions.get(id).add(label);
        n.label = label;
      }
    }
    return n;
  }
  for (const row of data.capabilityRows) for (const s of row) {
    const id = capCode(s);
    if (id) ensureCap(id, String(s), true);
  }
  for (const r of data.processRows) {
    const [chain, l, id, label] = r;
    if (!/^L[0-3]$/.test(l) || !id) continue;
    if (procs.has(String(id))) {
      const n = procs.get(String(id));
      if (n.label !== String(label)) {
        n.ambiguous = true;
        taxonomyIssues.push({ id: String(id), type: "\u540C\u4E00\u6D41\u7A0B\u7F16\u53F7\u5BF9\u5E94\u4E0D\u540C\u540D\u79F0", value: n.label + " / " + String(label) });
      }
      continue;
    }
    procs.set(String(id), { id: String(id), label: String(label), level: Number(l[1]), chain: String(chain), children: [], parent: l === "L0" ? null : String(id).slice(0, String(id).lastIndexOf(".")) });
  }
  const leanix = applyLeanixExport(procs, data.leanixProcessExport);
  const leanixIndex = /* @__PURE__ */ new Map();
  for (const n of procs.values()) if (n.nameStatus === "differs" && !n.ambiguous) {
    const k = n.level + "|" + norm(n.leanix.name);
    if (!leanixIndex.has(k)) leanixIndex.set(k, []);
    leanixIndex.get(k).push(n);
  }
  const nameIndex = /* @__PURE__ */ new Map();
  for (const n of procs.values()) {
    if (n.parent && !procs.has(n.parent)) taxonomyIssues.push({ id: n.id, type: "\u6D41\u7A0B\u7F3A\u5C11\u7236\u7EA7\u8BB0\u5F55", value: n.parent });
    if (n.ambiguous) continue;
    const k = n.level + "|" + norm(n.label);
    if (!nameIndex.has(k)) nameIndex.set(k, []);
    nameIndex.get(k).push(n);
  }
  const correctionLog = correctionStates(data), mappings = new Map(correctionLog.filter((c) => c.state === "Applied").map((c) => [recordKey(c), c.targetId]));
  const mapped = (appId, dimension, raw) => mappings.get(recordKey({ appId, dimension, raw }));
  const issues = [];
  const ids = /* @__PURE__ */ new Set();
  const accepted = new Map(cleanAcceptedRecords(data.acceptedRecords).map((d) => [acceptedKey(d), d]));
  const flag = (a, dimension, issue) => {
    const decision = accepted.get(acceptedKey({ appId: a.id, dimension, raw: issue.value }));
    if (decision) a.accepted.push(decision);
    else issues.push(issue);
  };
  const missingFromExport = new Set(data.inventoryExport?.missingIds || []);
  const apps = data.apps.map((raw, i) => {
    const id = String(raw.ID ?? "").trim();
    if (!id || !String(raw.Name ?? "").trim()) throw Error(`\u7B2C ${i + 2} \u884C\u7F3A\u5C11 ID \u6216 Name`);
    if (ids.has(id)) throw Error(`\u5E94\u7528 ID \u91CD\u590D\uFF1A${id}`);
    ids.add(id);
    const a = { ...raw, id, cap: [], process: [], unmatched: [], processMatches: [], accepted: [], notInExport: missingFromExport.has(id) ? data.inventoryExport : null, rawCap: split(raw["Business Capabilities"]), rawProcess: split(raw.Processes) };
    for (const s of a.rawCap) {
      const corrected = mapped(id, "cap", s);
      if (corrected) {
        a.cap.push(corrected);
        continue;
      }
      const code = capCode(s);
      if (code) {
        ensureCap(code, s);
        a.cap.push(code);
      } else {
        a.unmatched.push(s);
        flag(a, "cap", { appId: a.id, app: a.Name, type: "\u4E1A\u52A1\u80FD\u529B\u65E0\u6CD5\u8BC6\u522B", value: s });
      }
    }
    for (const s of a.rawProcess) {
      const corrected = mapped(id, "process", s);
      if (corrected) {
        a.process.push(corrected);
        a.processMatches.push({ raw: s, id: corrected, via: "mapping" });
        continue;
      }
      const code = s.match(/\bM\.[A-Z0-9]+(?:\.\d+)+(?=\s|$)/)?.[0];
      if (code && procs.has(code) && !procs.get(code).ambiguous) {
        a.process.push(code);
        a.processMatches.push({ raw: s, id: code, via: "code" });
        continue;
      }
      const m = s.match(PROCESS_LEVEL);
      if (!m) {
        a.unmatched.push(s);
        flag(a, "process", { appId: a.id, app: a.Name, type: "\u6D41\u7A0B\u672A\u6807\u6CE8\u6807\u51C6\u5C42\u7EA7", value: s });
        continue;
      }
      const l = +m[1], name = s.replace(/^BBM\s+PM\s+[A-Z0-9]+\s+/i, "").replace(/\s+L[0-3]V?\s*$/i, "");
      const snapshotNames = nameIndex.get(l + "|" + norm(name)) || [], leanixNames = (leanixIndex.get(l + "|" + norm(name)) || []).filter((n) => !snapshotNames.includes(n)), byName = [...snapshotNames, ...leanixNames];
      let choices = byName;
      const chain = s.match(/^BBM\s+PM\s+([A-Z0-9]+)/i)?.[1];
      if (chain) choices = choices.filter((n) => n.id.split(".")[1] === chain);
      if (choices.length === 1) {
        a.process.push(choices[0].id);
        a.processMatches.push({ raw: s, id: choices[0].id, via: leanixNames.includes(choices[0]) ? "leanix-name" : "name" });
      } else {
        a.unmatched.push(s);
        flag(a, "process", { appId: a.id, app: a.Name, type: choices.length ? "\u6D41\u7A0B\u540D\u79F0\u5BF9\u5E94\u591A\u4E2A\u7F16\u53F7" : byName.length ? "\u6D41\u7A0B\u94FE\u7F16\u53F7\u5B58\u5728\u5DEE\u5F02" : "\u6D41\u7A0B\u672A\u5339\u914D\u5C42\u7EA7\u8868", value: s, candidates: (choices.length ? choices : byName).map((n) => ({ id: n.id, label: n.label })) });
      }
    }
    if (!a.rawCap.length && mapped(id, "cap", "")) a.cap.push(mapped(id, "cap", ""));
    if (!a.rawProcess.length && mapped(id, "process", "")) a.process.push(mapped(id, "process", ""));
    a.cap = [...new Set(a.cap)];
    a.process = [...new Set(a.process)];
    return a;
  });
  for (const id of [...caps.keys()]) {
    let p = id;
    while (p.includes(".")) {
      p = p.slice(0, p.lastIndexOf("."));
      ensureCap(p);
    }
  }
  for (const map of [caps, procs]) for (const n of map.values()) if (n.parent && map.has(n.parent)) map.get(n.parent).children.push(n.id);
  for (const map of [caps, procs]) for (const n of map.values()) n.children.sort((a, b) => compareNatural(a, b));
  const ancestor = (a, b) => a === b || b.startsWith(a + ".");
  for (const a of apps) for (const dim of ["cap", "process"]) a[dim + "Leaf"] = a[dim].filter((id) => !a[dim].some((other) => other !== id && ancestor(id, other)));
  const conflicts = [];
  for (const [id, labels2] of capVersions) {
    const n = caps.get(id);
    n.labels = [...labels2];
    n.hasNameDifference = !!n.reference && n.labels.some((s) => norm(s.replace(/^\S+\s*/, "")) !== norm(n.reference.replace(/^\S+\s*/, "")));
    if (!n.reference && n.labels.length > 1) n.label = id + " \u540D\u79F0\u5B58\u5728\u5DEE\u5F02\uFF08" + n.labels.length + " \u79CD\uFF09";
    if (n.hasNameDifference) conflicts.push({ id, reference: n.reference, actual: n.labels });
  }
  for (const n of caps.values()) if (n.reference) {
    n.label = n.reference;
    n.nameSource = "reference";
  }
  const standardCatalogue = /^.+? \(capabilities\); /.test(String(data.taxonomySource ?? ""));
  return { apps, caps, procs, issues, conflicts, taxonomyIssues, ancestor, correctionLog, standardCatalogue, leanix, accepted: apps.flatMap((a) => a.accepted.map((d) => ({ ...d, app: a.Name }))) };
}

// public/reviews.mjs
var reviewStatuses = ["\u5F85\u6838\u5BF9", "\u5F85\u8865\u5145", "\u5DF2\u786E\u8BA4"];
function cleanReviews(value2) {
  const out = /* @__PURE__ */ Object.create(null);
  if (!value2 || typeof value2 !== "object" || Array.isArray(value2)) return out;
  for (const [key, n] of Object.entries(value2)) {
    if (!n || typeof n !== "object") continue;
    const note = { status: reviewStatuses.includes(n.status) ? n.status : "\u5F85\u6838\u5BF9", result: String(n.result || "").slice(0, 6e3), reviewer: String(n.reviewer || "").slice(0, 200), updatedAt: String(n.updatedAt || "").slice(0, 40) };
    if (note.status === "\u5DF2\u786E\u8BA4" && (!note.result.trim() || !note.reviewer.trim())) note.status = "\u5F85\u6838\u5BF9";
    out[key] = note;
  }
  return out;
}
function cleanReviewHistory(value2) {
  if (!Array.isArray(value2)) return [];
  return value2.filter((e) => e && typeof e === "object" && ["note", "revoke", "snapshot"].includes(e.action) && e.id && e.at && e.reviewer).map((e) => ({
    id: String(e.id).slice(0, 100),
    action: e.action,
    at: String(e.at).slice(0, 40),
    reviewer: String(e.reviewer).slice(0, 200),
    issueKey: String(e.issueKey || "").slice(0, 2e3),
    appIds: Array.isArray(e.appIds) ? e.appIds.map(String).slice(0, 100) : [],
    appNames: Array.isArray(e.appNames) ? e.appNames.map((x) => String(x).slice(0, 250)).slice(0, 100) : [],
    raw: String(e.raw || "").slice(0, 1e3),
    targetId: String(e.targetId || "").slice(0, 150),
    mappingId: String(e.mappingId || "").slice(0, 100),
    status: reviewStatuses.includes(e.status) ? e.status : "\u5F85\u6838\u5BF9",
    previousStatus: reviewStatuses.includes(e.previousStatus) ? e.previousStatus : "\u5F85\u6838\u5BF9",
    result: String(e.result || "").slice(0, 6e3),
    previousResult: String(e.previousResult || "").slice(0, 6e3),
    reason: String(e.reason || "").slice(0, 6e3)
  }));
}

// public/application-history.mjs
var kinds = ["created", "issue", "fixed", "updated", "uploaded", "note"];
var fields = ["Name", "Division", "Entity", "Description", "Main Business Capability", "Business Capabilities", "Processes", "Lifecycle: Current Lifecycle", "Lifecycle: Active", "operationCostScore", "roiScore", "annualBenefitCNY", "annualBenefitSource", "scopeNote", "statusNote"];
var value = (v, max = 6e3) => String(v ?? "").slice(0, max);
function cleanApplicationEvents(events) {
  if (!Array.isArray(events)) return [];
  return events.filter((e) => e && typeof e === "object" && e.id && e.appId && kinds.includes(e.kind) && e.happenedAt && e.recordedAt && e.recorder && e.details).map((e) => ({
    id: value(e.id, 100),
    appId: value(e.appId, 200),
    kind: e.kind,
    happenedAt: value(e.happenedAt, 40),
    recordedAt: value(e.recordedAt, 40),
    recorder: value(e.recorder, 200),
    details: value(e.details)
  }));
}
function cleanImportHistory(events) {
  if (!Array.isArray(events)) return [];
  return events.filter((e) => e && typeof e === "object" && e.id && e.at && Array.isArray(e.appIds)).map((e) => ({
    id: value(e.id, 100),
    at: value(e.at, 40),
    kind: ["restore", "taxonomy"].includes(e.kind) ? e.kind : "import",
    source: value(e.source, 300),
    taxonomySource: value(e.taxonomySource, 300),
    inventoryFile: value(e.inventoryFile, 300),
    taxonomyFile: value(e.taxonomyFile, 300),
    appIds: e.appIds.map((id) => value(id, 200)),
    // Compact events list only the difference from an earlier event (see importAppIds).
    ...e.appIdsBase ? { appIdsBase: value(e.appIdsBase, 100), removedIds: Array.isArray(e.removedIds) ? e.removedIds.map((id) => value(id, 200)) : [] } : {},
    addedIds: Array.isArray(e.addedIds) ? e.addedIds.map((id) => value(id, 200)) : [],
    changes: Array.isArray(e.changes) ? e.changes.filter((c) => c?.appId && fields.includes(c.field)).map((c) => ({ appId: value(c.appId, 200), field: c.field, before: value(c.before, 850), after: value(c.after, 850), truncated: !!c.truncated })) : [],
    issues: Array.isArray(e.issues) ? e.issues.filter((i) => i?.appId && ["flagged", "cleared"].includes(i.kind)).map((i) => ({ appId: value(i.appId, 200), kind: i.kind, category: value(i.category, 150), record: value(i.record, 1e3) })) : [],
    ...Array.isArray(e.decisions) && e.decisions.length ? { decisions: e.decisions.filter((d) => d?.appId && d.note).map((d) => ({ appId: value(d.appId, 200), field: value(d.field, 100), before: value(d.before, 850), after: value(d.after, 850), note: value(d.note, 300) })) } : {}
  }));
}

// public/workspace.mjs
var fields2 = ["ID", "Name", "Division", "Entity", "Description", "Business Capabilities", "Processes", "Lifecycle: Current Lifecycle", "Lifecycle: Active"];
var mainCapabilityField = "Main Business Capability";
var manufacturingAppId = "a103918e-63a2-4b26-ae5b-a5b1b7af8fd1";
var manufacturingSource = "BBM PM I2D Intralogistics to Demand L0;BBM PM I2D Receive to Store L1;Manufacturing";
var manufacturingDecision = manufacturingSource.replace(/;Manufacturing$/, "");
var needsManufacturingRemoval = (app) => String(app?.ID || "").trim() === manufacturingAppId && String(app?.Processes || "") === manufacturingSource;
function workspaceWeights(data) {
  const weights = cleanWeights(data.similarityWeights), legacy = { name: 0.1, description: 0.4, cap: 0.4, process: 0.1 };
  if (data.similarityWeightsVersion !== 2 && Object.keys(legacy).every((key) => weights[key] === legacy[key])) return { ...DEFAULT_WEIGHTS };
  const shown = weightPercentages(weights);
  return Object.fromEntries(Object.keys(weights).map((key) => [key, shown[key] / 100]));
}
function inventoryExportField(value2) {
  if (!value2 || typeof value2 !== "object" || Array.isArray(value2)) return {};
  const missingIds = [...new Set((Array.isArray(value2.missingIds) ? value2.missingIds : []).map((v) => String(v ?? "").trim()).filter(Boolean))];
  return { inventoryExport: { file: String(value2.file ?? ""), exportedAt: String(value2.exportedAt ?? ""), sheet: String(value2.sheet ?? ""), missingIds } };
}
function workspaceData(data) {
  if (!data || !Array.isArray(data.apps) || !data.apps.length || !Array.isArray(data.capabilityRows) || !Array.isArray(data.processRows)) throw Error("\u5DE5\u4F5C\u533A\u7F3A\u5C11\u5E94\u7528\u6E05\u5355\u6216\u5206\u7C7B\u8868");
  if (!data.apps.every((a) => a && typeof a === "object" && !Array.isArray(a)) || !data.capabilityRows.every(Array.isArray) || !data.processRows.every(Array.isArray)) throw Error("\u5DE5\u4F5C\u533A\u6570\u636E\u7ED3\u6784\u65E0\u6548");
  return { similarityWeights: workspaceWeights(data), similarityWeightsVersion: 2, ...thresholdField(data), source: String(data.source || "Imported workspace"), taxonomySource: String(data.taxonomySource || "Workspace taxonomy"), ...inventoryExportField(data.inventoryExport), isAcceptanceSample: data.isAcceptanceSample === true, apps: data.apps.map((a) => {
    const app = Object.fromEntries(fields2.map((k) => [k, String(a[k] ?? "")]));
    if (Object.hasOwn(a, mainCapabilityField)) app[mainCapabilityField] = String(a[mainCapabilityField] ?? "");
    if (Object.hasOwn(a, "scopeNote")) {
      app.scopeNote = String(a.scopeNote ?? "");
      app.scopeSource = String(a.scopeSource ?? "");
    }
    if (Object.hasOwn(a, "statusNote")) {
      app.statusNote = String(a.statusNote ?? "");
      app.statusSource = String(a.statusSource ?? "");
    }
    if (Object.hasOwn(a, "operationCostScore")) {
      app.operationCostScore = cleanCostScore(a.operationCostScore);
      app.operationCostSource = String(a.operationCostSource || "");
    }
    if (Object.hasOwn(a, "roiScore")) {
      app.roiScore = cleanROIScore(a.roiScore);
      app.roiSource = String(a.roiSource || "");
    }
    if (Object.hasOwn(a, "annualBenefitCNY")) {
      app.annualBenefitCNY = cleanAnnualBenefit(a.annualBenefitCNY);
      app.annualBenefitSource = String(a.annualBenefitSource || "");
    }
    if (needsManufacturingRemoval(app)) app.Processes = manufacturingDecision;
    return app;
  }), capabilityRows: data.capabilityRows.map((r) => r.map((v) => String(v ?? ""))), processRows: data.processRows.map((r) => r.map((v) => String(v ?? ""))), reviews: cleanReviews(data.reviews), reviewHistory: cleanReviewHistory(data.reviewHistory), pairReviews: cleanPairReviews(data.pairReviews), applicationEvents: cleanApplicationEvents(data.applicationEvents), importHistory: cleanImportHistory(data.importHistory), corrections: cleanCorrections(data.corrections), acceptedRecords: cleanAcceptedRecords(data.acceptedRecords) };
}

// public/autosave.mjs
var autosaveLimitBytes = 15e5;
var warningBytes = autosaveLimitBytes * 0.8;

// worker/index.mjs
var reply = (body, status = 200) => Response.json(body.error ? { ...body, error: english(body.error) } : body, { status, headers: { "Cache-Control": "private, no-store", "Vary": "oai-authenticated-user-id", "X-Content-Type-Options": "nosniff" } });
var maxBytes = autosaveLimitBytes;
async function workspaceAPI(request, env) {
  const user = request.headers.get("oai-authenticated-user-id");
  if (!user) return reply({ error: "\u8BF7\u767B\u5F55 ChatGPT \u540E\u4F7F\u7528\u81EA\u52A8\u4FDD\u5B58\u3002", code: "sign-in" }, 401);
  if (!["GET", "PUT"].includes(request.method)) return reply({ error: "\u4E0D\u652F\u6301\u6B64\u64CD\u4F5C" }, 405);
  if (request.method === "PUT") {
    const origin = request.headers.get("Origin");
    if (!origin || origin !== new URL(request.url).origin) return reply({ error: "\u8BF7\u6C42\u6765\u6E90\u4E0D\u5339\u914D" }, 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "\u9700\u8981 JSON \u5DE5\u4F5C\u533A" }, 415);
  }
  if (!env.DB) return reply({ error: "\u81EA\u52A8\u4FDD\u5B58\u6682\u65F6\u4E0D\u53EF\u7528\uFF0C\u8BF7\u5148\u5BFC\u51FA\u5DE5\u4F5C\u533A\u5907\u4EFD\u3002" }, 503);
  try {
    if (request.method === "GET") {
      const row = await env.DB.prepare("SELECT payload, revision, updated_at FROM portfolio_workspaces WHERE user_id = ?").bind(user).first();
      return reply({ data: row ? JSON.parse(row.payload) : null, revision: row?.revision || 0, updatedAt: row?.updated_at || null });
    }
    if (Number(request.headers.get("content-length")) > maxBytes) return reply({ error: "\u5DE5\u4F5C\u533A\u8F83\u5927\uFF0C\u65E0\u6CD5\u81EA\u52A8\u4FDD\u5B58\uFF0C\u8BF7\u5BFC\u51FA\u5DE5\u4F5C\u533A\u5907\u4EFD\u3002" }, 413);
    const reader = request.body?.getReader();
    let size = 0;
    const chunks = [];
    if (!reader) return reply({ error: "\u5DE5\u4F5C\u533A\u5185\u5BB9\u4E3A\u7A7A" }, 400);
    while (true) {
      const { done, value: value2 } = await reader.read();
      if (done) break;
      size += value2.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return reply({ error: "\u5DE5\u4F5C\u533A\u8F83\u5927\uFF0C\u65E0\u6CD5\u81EA\u52A8\u4FDD\u5B58\uFF0C\u8BF7\u5BFC\u51FA\u5DE5\u4F5C\u533A\u5907\u4EFD\u3002" }, 413);
      }
      chunks.push(value2);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    let input, data;
    try {
      input = JSON.parse(new TextDecoder().decode(bytes));
      if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw Error("\u5DE5\u4F5C\u533A\u7248\u672C\u65E0\u6548");
      data = workspaceData(input.data);
      buildModel(data);
      if (data.isAcceptanceSample) throw Error("\u9A8C\u6536\u6837\u4F8B\u4E0D\u8986\u76D6\u5DF2\u4FDD\u5B58\u7684\u5DE5\u4F5C\u533A");
    } catch (e) {
      return reply({ error: e.message || "\u5DE5\u4F5C\u533A\u5185\u5BB9\u65E0\u6548" }, 400);
    }
    const payload = JSON.stringify(data), now = (/* @__PURE__ */ new Date()).toISOString();
    const result = input.revision === 0 ? await env.DB.prepare("INSERT INTO portfolio_workspaces (user_id,payload,revision,updated_at) VALUES (?,?,1,?) ON CONFLICT(user_id) DO NOTHING RETURNING revision").bind(user, payload, now).first() : await env.DB.prepare("UPDATE portfolio_workspaces SET payload = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ? RETURNING revision").bind(payload, now, user, input.revision).first();
    if (!result) return reply({ error: "\u53E6\u4E00\u4E2A\u9875\u9762\u5DF2\u4FDD\u5B58\u4E86\u66F4\u65B0\u3002\u8BF7\u5148\u5BFC\u51FA\u5F53\u524D\u5DE5\u4F5C\u533A\uFF0C\u518D\u91CD\u65B0\u52A0\u8F7D\u6700\u65B0\u8BB0\u5F55\u3002", code: "conflict" }, 409);
    return reply({ revision: result.revision, updatedAt: now });
  } catch (e) {
    console.error("Workspace storage failure", e?.message || "unknown");
    return reply({ error: "\u81EA\u52A8\u4FDD\u5B58\u6682\u65F6\u5931\u8D25\uFF0C\u8BF7\u5148\u5BFC\u51FA\u5DE5\u4F5C\u533A\u5907\u4EFD\uFF0C\u7A0D\u540E\u91CD\u8BD5\u3002" }, 503);
  }
}
var index_default = { async fetch(request, env) {
  const path = new URL(request.url).pathname;
  if (path === "/api/workspace") return workspaceAPI(request, env);
  if (path.startsWith("/api/")) return reply({ error: "\u672A\u627E\u5230\u6B64\u529F\u80FD" }, 404);
  return env.ASSETS.fetch(request);
} };
export {
  index_default as default,
  workspaceAPI
};
