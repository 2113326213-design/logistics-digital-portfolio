export const split=v=>String(v??'').split(';').map(x=>x.trim()).filter(x=>x&&!/^(empty|n\/a)$/i.test(x));
export const norm=v=>String(v??'').toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]/g,'');
// Process records end with their level: L0–L3, and L3V, which is Level 3 (owner decision 2026-10-19).
// Natural order (B.06.2 before B.06.10); identical to a.localeCompare(b,undefined,{numeric:true}) with one shared collator.
export const compareNatural=new Intl.Collator(undefined,{numeric:true}).compare;
export const PROCESS_LEVEL=/\bL([0-3])V?\s*$/i;
// HC codes belong to another company (owner, 2026-10-22: "HC的开头的都不需要了，那个是其他公司的"; on 2026-10-19 the HC
// entries had already been left out of the catalogue). One rule for the catalogue import and the applications' records.
export const OTHER_COMPANY_CODE=/^HC\./;
export const otherCompanyRecord=raw=>OTHER_COMPANY_CODE.test(String(raw??'').trim());
export function capCode(s){const m=String(s).match(/^([A-Z]+\.\d+(?:\.\d+)*)\b/);return m?m[1].split('.').map((x,i)=>i<2?x:String(Number(x))).join('.'):null;}
