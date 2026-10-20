import assert from 'node:assert/strict';
import {test} from 'node:test';
import {escapedCodeEvidenceSummary,escapedSourceCaption} from '../public/similarity-ui.mjs';

const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

test('application names in evidence headings and source captions are escaped',()=>{
 const name='Application < & "Source"';
 assert.equal(escapedCodeEvidenceSummary(name,escape),'Application &lt; &amp; &quot;Source&quot; · Code evidence');
 assert.equal(escapedSourceCaption(name,escape),'Application &lt; &amp; &quot;Source&quot;');
});
