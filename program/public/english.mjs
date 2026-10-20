// Translate presentation labels while preserving legacy review keys and values.
const labels = new Map(Object.entries({
 '待核对':'Pending review','待补充':'More information needed','已确认':'Confirmed',
 '流程匹配':'Process mapping','能力匹配':'Capability mapping','流程层级表':'Process taxonomy',
 '未填写流程':'Missing process','能力编码缺失':'Missing capability code',
 '业务能力无法识别':'Capability code could not be identified',
 '流程未标注标准层级':'Process level not specified',
 '流程名称对应多个编号':'Process name matches multiple codes',
 '流程链编号存在差异':'Process chain code needs confirmation',
 '流程未匹配层级表':'No confirmed match in the current process catalogue',
 '同一流程编号对应不同名称':'Different names recorded for the same process code',
 '流程缺少父级记录':'Process parent record missing',
 '标准表未找到唯一对应项':'No unique match in the taxonomy',
 '需补充标准记录':'Standard record required',
 '未填写':'Not provided',
 '需由业务方确认流程链、名称和层级':'Business owner to confirm the process chain, name and level',
 '应用清单未填写 Process':'Process is not provided in the application inventory',
 '当前分类表未收录此编号':'Code not found in the current catalogue; coverage needs confirmation',
 '保留原始编号，请确认分类表是否需要补充':'Original code retained; confirm whether the taxonomy needs updating',
 '分类表没有可确认的标准编号':'No confirmed standard code in the taxonomy',
 '对方登记深度不足。':'Peer records are not detailed enough.',
 '对方在此分支只登记到更粗层级。':'Peer records cover this branch only at a broader level.',
 '对方在此分支仍有未确认的分类。':'Peer classifications in this branch are not yet confirmed.',
 '目标应用仍有未确认的分类。':'Target classifications are not yet confirmed.',
 '目标没有可比较的登记。':'Target has no comparable records.',
 '对方没有可比较的登记。':'Peer has no comparable records.',
 '部分分支信息不足，保留已知分支结果。':'Some branches have insufficient information; known branch results are retained.',
 '仅填到总类 / 未匹配':'Top-level only / Unmapped',
 '未匹配 / 未填写流程':'Unmapped / Process not provided',
 '全部应用':'All applications','A/B 验收样例':'A/B demo',
 'A/B 验收样例 · 2 个模拟应用':'A/B demo · 2 sample applications',
 '导入的工作区':'Imported workspace','工作区分类表':'Workspace taxonomy',
 '工作区缺少应用清单或分类表':'Workspace is missing the application inventory or taxonomy.',
 '工作区数据结构无效':'Invalid workspace data structure.',
 '工作区 JSON 内容无法读取':'Unable to read the workspace JSON.',
 '请选择本程序导出的工作区 JSON 文件':'Select a workspace JSON exported from this application.',
 '当前分类表没有 A/B 样例所需的 B.06.1.2、.3、.4，请先使用原始分类表':'The A/B demo requires B.06.1.2, B.06.1.3 and B.06.1.4. Import the original taxonomy first.',
 '文件超过 30 MB，请导出所需工作表后重试。':'File exceeds 30 MB. Export only the required worksheets and try again.',
 '无法读取此文件，请使用未加密的 .xlsx 文件。':'Unable to read this file. Use an unencrypted .xlsx file.',
 'Excel 压缩目录不完整。':'The Excel archive directory is incomplete.',
 '解压后的文件过大，请仅保留必要工作表。':'The extracted file is too large. Keep only the required worksheets.',
 '不支持加密 Excel。':'Encrypted Excel files are not supported.',
 '请用新版 Chrome 或 Edge 打开此网页以导入 Excel。':'Use a recent version of Chrome or Edge to import Excel files.',
 '不支持此 Excel 压缩格式。':'This Excel compression format is not supported.',
 'Excel XML 内容有误。':'Invalid XML in the Excel file.',
 '未找到应用清单工作表。':'Application inventory worksheet not found.',
 '应用清单没有数据。':'The application inventory is empty.',
 '层级表需包含 Business Capability 和 Data_RBW Process Structure 工作表。':'Taxonomy must contain the Business Capability and Data_RBW Process Structure worksheets.',
 '未找到 Process ID 表头。':'Process ID column header not found.',
 '请选择业务能力或流程':'Select Business Capability or Process.',
 '请选择两个不同应用':'Select two different applications.',
 '请选择有效应用':'Select valid applications.',
 '请登录 ChatGPT 后使用自动保存。':'Sign in to save changes.',
 '不支持此操作':'Operation not supported.',
 '请求来源不匹配':'Request origin does not match.',
 '需要 JSON 工作区':'A JSON workspace is required.',
 '自动保存暂时不可用，请先导出工作区备份。':'Autosave is unavailable. Export a workspace backup.',
 '工作区较大，无法自动保存，请导出工作区备份。':'Workspace is too large to autosave. Export a backup.',
 '工作区内容为空':'Workspace is empty.',
 '工作区版本无效':'Invalid workspace revision.',
 '验收样例不覆盖已保存的工作区':'Demo data cannot replace the saved workspace.',
 '工作区内容无效':'Invalid workspace content.',
 '另一个页面已保存了更新。请先导出当前工作区，再重新加载最新记录。':'Changes were saved in another tab. Export this workspace before reloading the latest version.',
 '自动保存暂时失败，请先导出工作区备份，稍后重试。':'Autosave failed. Export a workspace backup and try again later.',
 '未找到此功能':'Endpoint not found.'
}));

export function english(value){
 const text=String(value??'');
 const legacySuffix=' · 仅填到此层';
 if(text.endsWith(legacySuffix))return english(text.slice(0,-legacySuffix.length))+' · recorded at this level';
 if(labels.has(text))return labels.get(text);
 return text
  .replace(/^第 (\d+) 行缺少 ID 或 Name$/, 'Row $1 is missing ID or Name.')
  .replace(/^应用 ID 重复：(.+)$/, 'Duplicate application ID: $1')
  .replace(/^Excel 中缺少 (.+)$/, 'Missing Excel entry: $1')
  .replace(/^应用清单缺少列：(.+)$/, 'Missing inventory column: $1')
  .replace(/^层级表缺少 (.+)$/, 'Missing taxonomy column: $1')
  .replace(/ 名称存在差异（(\d+) 种）$/, ' — $1 name variants');
}
