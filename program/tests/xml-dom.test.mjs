// scripts/xml-dom.mjs: the Node DOMParser that lets scripts/prepare-data.mjs use public/xlsx.mjs readXlsx.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DOMParser,installDOMParser} from '../scripts/xml-dom.mjs';
import {readXlsx} from '../public/xlsx.mjs';
import {english} from '../public/english.mjs';
import {zip} from './source-workbooks.mjs';

const MAIN='http://schemas.openxmlformats.org/spreadsheetml/2006/main',REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const parse=text=>new DOMParser().parseFromString(text,'application/xml');
const parseError=text=>parse(text).getElementsByTagName('parsererror')[0]?.textContent;

test('prefixed and default namespaces resolve like a browser DOMParser',()=>{
 const doc=parse(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<x:worksheet xmlns:x="${MAIN}" xmlns:r="${REL}"><x:sheetData><x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c></x:row></x:sheetData>
<sheets xmlns="${MAIN}"><sheet name="Logistic Apps" r:id="rId7"/><other xmlns="urn:other"><sheet name="inner"/></other></sheets></x:worksheet>`);
 const root=doc.documentElement;
 assert.equal(root.tagName,'x:worksheet');assert.equal(root.localName,'worksheet');assert.equal(root.prefix,'x');assert.equal(root.namespaceURI,MAIN);
 assert.equal(doc.getElementsByTagNameNS('*','row').length,1);
 assert.equal(doc.getElementsByTagNameNS(MAIN,'row').length,1);
 assert.equal(doc.getElementsByTagName('x:row').length,1,'getElementsByTagName matches the qualified name');
 assert.equal(doc.getElementsByTagName('row').length,0);
 const [sheet,inner]=doc.getElementsByTagNameNS('*','sheet');
 assert.equal(sheet.namespaceURI,MAIN,'default namespace is inherited');assert.equal(inner.namespaceURI,'urn:other','and can be redeclared');
 assert.equal(doc.getElementsByTagNameNS(MAIN,'sheet').length,1);
 assert.equal(sheet.getAttributeNS(REL,'id'),'rId7');assert.equal(sheet.getAttribute('r:id'),'rId7');
 assert.equal(sheet.getAttributeNS(MAIN,'name'),null,'unprefixed attributes are in no namespace');
 assert.equal(sheet.getAttributeNS(null,'name'),'Logistic Apps');assert.equal(sheet.getAttribute('missing'),null);
 assert.equal(doc.getElementsByTagNameNS('*','v')[0].parentNode.localName,'c');
 assert.match(parseError('<x:a/>'),/Namespace prefix x on <x:a> is not declared/);
});

test('the five named entities and decimal / hexadecimal references decode in text and attributes',()=>{
 const doc=parse('<t a=\'&lt;&gt;&amp;&quot;&apos; &#65;&#x42;\' b="tab\there&#9;kept">&lt;b&gt; &amp; &quot;q&quot; &apos;s&apos; &#65;&#x42;&#x1F600;&#13;</t>');
 const t=doc.documentElement;
 assert.equal(t.textContent,'<b> & "q" \'s\' AB\u{1F600}\r');
 assert.equal(t.getAttribute('a'),'<>&"\' AB');
 assert.equal(t.getAttribute('b'),'tab here\tkept','literal tabs in attributes become spaces; &#9; is kept');
 assert.equal(parse('<t>a\r\nb\rc</t>').documentElement.textContent,'a\nb\nc','line endings are normalised to LF');
 assert.match(parseError('<t>&nbsp;</t>'),/Unknown entity &nbsp;/);
 assert.match(parseError('<t>fish & chips</t>'),/'&' must start an entity/);
 assert.match(parseError('<t>&#0;</t>'),/invalid character/);
 assert.match(parseError('<t>&#X41;</t>'),/Unknown entity/,'XML requires a lower-case x');
});

test('CDATA sections keep markup characters as text and join the surrounding text',()=>{
 const doc=parse('<si><t>a <![CDATA[<b> & ]] ]>]]> z</t><r><t><![CDATA[]]></t></r></si>');
 const [first,empty]=doc.getElementsByTagName('t');
 assert.equal(first.textContent,'a <b> & ]] ]> z');
 assert.equal(first.childNodes.length,3);assert.equal(first.childNodes[1].nodeType,4);
 assert.equal(empty.textContent,'');assert.equal(doc.documentElement.textContent,'a <b> & ]] ]> z');
 assert.match(parseError('<a><![CDATA[open</a>'),/Unterminated CDATA section/);
});

test('self-closing elements, comments, processing instructions, the declaration, DOCTYPE and BOM',()=>{
 const doc=parse('﻿<?xml version="1.0"?>\n<!DOCTYPE row [<!ELEMENT row ANY>]>\n<!-- before --><row r="1"><c r="A1"/><?pi data?><c r="B1" /><!-- <c r="X"/> --><c r="C1"><v>3</v></c></row><!-- after -->\n');
 const cells=doc.getElementsByTagNameNS('*','c');
 assert.deepEqual(cells.map(c=>c.getAttribute('r')),['A1','B1','C1']);
 assert.equal(cells[0].childNodes.length,0);assert.equal(cells[0].parentNode,doc.documentElement);
 assert.equal(cells[2].textContent,'3');assert.equal(doc.documentElement.textContent,'3','comments and processing instructions are not text');
 assert.equal(doc.childNodes.length,1);assert.equal(doc.textContent,null);
});

test('malformed XML returns a parsererror document instead of throwing',()=>{
 for(const [text,reason] of [['<a><b></a>',/Closing tag <\/a> does not match <b>/],['<a>',/Element <a> is not closed/],['<a/><b/>',/Only one root element/],
  ['<a b=c/>',/must be quoted/],['<a b="1" b="2"/>',/Duplicate attribute b/],['<a b="1"c="2"/>',/separated by whitespace/],['text',/outside the root element/],
  ['',/no root element/],['<a>\n<b>x < y</b></a>',/write &lt;/],['<a>x</a><?xml version="1.0"?>',/only allowed at the very start/]]){
  const message=parseError(text);
  assert.match(message??'',reason,JSON.stringify(text));
  assert.match(message,/^XML parsing error on line \d+, column \d+: /);
 }
 assert.match(parseError('<a>\n<b>x < y</b></a>'),/line 2, column 6/);
 assert.throws(()=>new DOMParser().parseFromString('<p>','text/html'),/only parses XML/);
});

test('installDOMParser keeps an existing DOMParser',()=>{
 class Existing{}
 const host={DOMParser:Existing},empty={};
 assert.equal(installDOMParser(host),Existing);assert.equal(host.DOMParser,Existing);
 assert.equal(installDOMParser(empty),DOMParser);
});

test('readXlsx reads a prefixed workbook with phonetic runs, entities and CDATA through the shim',async()=>{
 installDOMParser();
 const files=[
  ['xl/workbook.xml',`<?xml version="1.0"?><x:workbook xmlns:x="${MAIN}" xmlns:r="${REL}"><x:workbookPr date1904="0"/><x:sheets><x:sheet name="Logistic Apps" sheetId="1" r:id="rId1"/></x:sheets></x:workbook>`],
  ['xl/_rels/workbook.xml.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>'],
  ['xl/sharedStrings.xml',`<x:sst xmlns:x="${MAIN}"><x:si><x:t>ID</x:t></x:si><x:si><x:r><x:t>Ware</x:t></x:r><x:r><x:t xml:space="preserve">house &amp; yard </x:t></x:r><x:rPh sb="0" eb="1"><x:t>ignored</x:t></x:rPh></x:si></x:sst>`],
  ['xl/worksheets/sheet1.xml',`<x:worksheet xmlns:x="${MAIN}"><x:sheetData><x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="C1" t="inlineStr"><x:is><x:t><![CDATA[a<b]]> &#x4E2D;</x:t></x:is></x:c></x:row><x:row r="3"><x:c r="B3" t="s"><x:v>1</x:v></x:c><x:c r="C3"/><x:c r="D3"><x:v>44228</x:v></x:c></x:row></x:sheetData></x:worksheet>`]
 ];
 const sheets=await readXlsx(new File([zip(files)],'prefixed.xlsx'));
 assert.deepEqual(sheets['Logistic Apps'][0],['ID','','a<b 中']);
 assert.equal(sheets['Logistic Apps'][1],undefined,'a missing row stays a hole, as in the browser');
 assert.deepEqual(sheets['Logistic Apps'][2],['','Warehouse & yard ','','44228']);
 const broken=[...files.slice(0,3),['xl/worksheets/sheet1.xml',`<x:worksheet xmlns:x="${MAIN}"><x:sheetData><x:row></x:sheetData></x:worksheet>`]];
 await assert.rejects(readXlsx(new File([zip(broken)],'broken.xlsx')),{message:'Invalid XML in the Excel file (xl/worksheets/sheet1.xml: error on line 1, column 102: Closing tag </x:sheetData> does not match <x:row>).'});
});

const PACKAGE_REL='http://schemas.openxmlformats.org/package/2006/relationships';
const book=(sheetXml,{sharedTarget='sharedStrings.xml',sharedPart='xl/sharedStrings.xml',strings=['ID','Name'],encode=text=>text}={})=>new File([zip([
 ['xl/workbook.xml',encode(`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="Logistic Apps" sheetId="1" r:id="rId1"/></sheets></workbook>`)],
 ['xl/_rels/workbook.xml.rels',`<?xml version="1.0"?><Relationships xmlns="${PACKAGE_REL}"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/sharedStrings" Target="${sharedTarget}"/></Relationships>`],
 ...(sharedPart?[[sharedPart,encode(`<?xml version="1.0" encoding="UTF-8"?><sst xmlns="${MAIN}">${strings.map(text=>`<si><t>${text}</t></si>`).join('')}</sst>`)]]:[]),
 ['xl/worksheets/sheet1.xml',encode(`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${MAIN}"><sheetData>${sheetXml}</sheetData></worksheet>`)]
])],'book.xlsx');
const header='<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>';

test('readXlsx finds the shared strings through the workbook relationships and reads UTF-16 parts',async()=>{
 installDOMParser();
 const renamed=await readXlsx(book(header,{sharedTarget:'/xl/strings/SharedStrings1.xml',sharedPart:'xl/strings/SharedStrings1.xml'}));
 assert.deepEqual(renamed['Logistic Apps'][0],['ID','Name'],'a shared-strings part with another name is still found');
 const utf16=text=>Buffer.concat([Buffer.from([0xFF,0xFE]),Buffer.from(text.replace('UTF-8','UTF-16'),'utf16le')]);
 const wide=await readXlsx(book(header+'<row r="2"><c r="A2" t="inlineStr"><is><t>仓储 · Lager</t></is></c></row>',{encode:utf16}));
 assert.deepEqual(wide['Logistic Apps'],[['ID','Name'],['仓储 · Lager']]);
 const bigEndian=text=>{const le=Buffer.from(text.replace('UTF-8','UTF-16'),'utf16le');for(let i=0;i<le.length;i+=2)[le[i],le[i+1]]=[le[i+1],le[i]];return Buffer.concat([Buffer.from([0xFE,0xFF]),le]);};
 assert.deepEqual((await readXlsx(book(header,{encode:bigEndian})))['Logistic Apps'][0],['ID','Name']);
});

test('a shared-string reference outside the table stops the import; an empty one is a blank cell',async()=>{
 installDOMParser();
 const empty=await readXlsx(book(header+'<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2" t="s"><v></v></c><c r="C2" t="s"/></row>'));
 assert.deepEqual(empty['Logistic Apps'][1],['Name','',''],'an empty <v> is blank, not shared string 0');
 for(const [index,cell] of [['2','<c r="B2" t="s"><v>2</v></c>'],['-1','<c r="B2" t="s"><v>-1</v></c>'],['1.5','<c r="A2" t="s"><v>0</v></c><c t="s"><v>1.5</v></c>']]){
  const message=`Worksheet 'Logistic Apps' cell B2 refers to shared string "${index}", which does not exist (2 shared strings). The workbook is damaged; open and save it again in Excel.`;
  await assert.rejects(readXlsx(book(`${header}<row r="2">${cell}</row>`)),{message},index);
 }
 await assert.rejects(readXlsx(book(header+'<row><c t="s"><v>0</v></c><c t="s"><v>9</v></c></row>')),{message:/cell B2 refers to shared string "9"/},'a cell without r is named by its position');
});

test('part names match without regard to case, the usual shared-strings name is a fallback, and a missing table is named',async()=>{
 installDOMParser();
 for(const sharedTarget of ['SharedStrings.xml','sharedstrings.xml','strings/missing.xml'])
  assert.deepEqual((await readXlsx(book(header,{sharedTarget})))['Logistic Apps'][0],['ID','Name'],sharedTarget);
 // Only a case-insensitive match finds this part (there is no xl/sharedStrings.xml to fall back to).
 assert.deepEqual((await readXlsx(book(header,{sharedTarget:'strings/shared1.xml',sharedPart:'xl/strings/Shared1.xml'})))['Logistic Apps'][0],['ID','Name']);
 await assert.rejects(readXlsx(book(header,{sharedPart:null})),{message:"Worksheet 'Logistic Apps' cell A1 refers to shared string \"0\", which does not exist (the workbook has no shared-strings table). The workbook is damaged; open and save it again in Excel."});
});

test('a part without a byte-order mark is read in its declared encoding, and invalid UTF-8 stops the import',async()=>{
 installDOMParser();
 const latin=text=>Buffer.from(text.replace('UTF-8','ISO-8859-1'),'latin1'),name='M'+String.fromCharCode(0xFC)+'ller Stra'+String.fromCharCode(0xDF)+'e';
 const row=`<row r="2"><c r="A2" t="inlineStr"><is><t>${name}</t></is></c></row>`;
 assert.deepEqual((await readXlsx(book(header+row,{encode:latin})))['Logistic Apps'][1],[name]);
 const quoted=text=>Buffer.from(text.replace('encoding="UTF-8"',"encoding = 'ISO-8859-1'"),'latin1');
 assert.deepEqual((await readXlsx(book(header+row,{encode:quoted})))['Logistic Apps'][1],[name],'single quotes and spaces in the declaration');
 await assert.rejects(readXlsx(book(header+row,{encode:text=>Buffer.from(text,'latin1')})),{message:'Cannot read xl/worksheets/sheet1.xml in the Excel file as UTF-8 text.'},'Latin-1 bytes declared as UTF-8 are not silently replaced');
});
