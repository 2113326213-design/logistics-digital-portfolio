import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanROIScore,formatROIScore,roiScoresFromSheets} from '../public/roi.mjs';

test('ROI accepts only 1–5 ratings or explicitly blank scalar values',()=>{
 for(const value of [null,undefined,'','  '])assert.equal(cleanROIScore(value),null);
 for(const value of [1,2,3,4,5,' 3 '])assert.equal(cleanROIScore(value),Number(value));
 for(const value of [[],[' '],{},true,false,0,6,2.5,NaN,Infinity,'CNY 100'])assert.throws(()=>cleanROIScore(value),/ROI score/);
 assert.equal(formatROIScore({roiScore:3}),'3 / 5');
 assert.equal(formatROIScore({roiScore:null}),'Not recorded');
});

test('ROI workbook rows join by ID and reject duplicate IDs and malformed ratings',()=>{
 const read=rows=>roiScoresFromSheets({'Parameter Score':[['LeanIX ID','ROI'],...rows]});
 assert.deepEqual([...read([['B',2],['A',5],['C','']])].map(([id,row])=>[id,row.score]),[['B',2],['A',5],['C',null]]);
 assert.throws(()=>read([['A',1],['A',2]]),/Duplicate ROI/);
 assert.throws(()=>read([['A',[]]]),/ROI score/);
 assert.throws(()=>read([['A',1],['B','High']]),{message:'Parameter Score row 3 (LeanIX ID B), ROI: ROI score must be 1 to 5, or blank. Found "High".'});
 // Row numbers are workbook rows, also when a title and a blank row sit above the header.
 assert.throws(()=>roiScoresFromSheets({'Parameter Score':[['Scores'],undefined,['LeanIX ID','ROI'],['A','x']]}),{message:'Parameter Score row 4 (LeanIX ID A), ROI: ROI score must be 1 to 5, or blank. Found "x".'});
 assert.equal(roiScoresFromSheets({}),null);
});
