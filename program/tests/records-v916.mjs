// Test helper (not a test file): public/data.json exactly as released in V9.16 (2026-10-21), before the owner workbook
// 20261021_logistic_inventory.xlsx was merged in V9.17: 76 applications (CGQB_Logistic_system_Q included), no 'Status in
// Oct' values, 71 applications in scope. Tests that pin examples and counts the owner confirmed or that were derived by
// hand on those records (handoff 2026-10-15 to V9.16) read this copy, so their expected values keep their meaning;
// tests/v917-owner-workbook.test.mjs and the current-data tests (costs, ROI, scope, To review) read public/data.json.
export const RECORDS_V916=new URL('./data-v9.16.json',import.meta.url);
