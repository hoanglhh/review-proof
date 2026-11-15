import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderDocument} from '../src/ui/document.ts';
import {pageHeader,statusBadge} from '../src/ui/components.ts';
import {renderHunk} from '../src/ui/code.ts';

test('shared document keeps content accessible and escapes untrusted document metadata',()=>{
 const html=renderDocument('<script>title</script>',pageHeader('Case <unsafe>','A real description'),{active:'findings',nonce:'"unsafe',script:'console.log("fixture")'});
 assert.match(html,/<title>&lt;script&gt;title&lt;\/script&gt;/);
 assert.match(html,/Case &lt;unsafe&gt;/);
 assert.match(html,/href="\/evaluation\/findings" aria-current="page"/);
 assert.match(html,/<main class="sheet">/);
 assert.match(html,/Skip to content/);
 assert.match(html,/<script nonce="&quot;unsafe">/);
 assert.equal((html.match(/<!doctype html>/g)??[]).length,1);
});

test('shared code view preserves base/head line numbers, escapes source and only adds requested anchors',()=>{
 const hunk={id:'H1',file:'src/<unsafe>.ts',oldStart:10,oldLines:1,newStart:20,newLines:2,removed:['<before>'],added:['<after>','second']};
 const html=renderHunk(hunk,true);
 assert.match(html,/id="H1"/);assert.match(html,/10.*&lt;before&gt;/);assert.match(html,/20.*&lt;after&gt;/);assert.match(html,/21.*second/);
 assert.doesNotMatch(html,/<before>|<after>|<unsafe>/);
 assert.doesNotMatch(renderHunk(hunk),/id="H1"/);
});

test('saved documents embed their styles and fonts without a frontend server or CDN',()=>{
 const html=renderDocument('Saved report','<h1>Saved report</h1>',{standalone:true});
 assert.match(html,/@font-face/);assert.match(html,/data:font\/woff2;base64,/);
 assert.doesNotMatch(html,/<link[^>]+href="https?:|<script[^>]+src=/);
 assert.doesNotMatch(html,/class="sidebar"/);
 assert.match(html,/Saved assessment/);
 assert.match(statusBadge('blocked','<unsafe>'),/&lt;unsafe&gt;/);
 assert.doesNotMatch(statusBadge('blocked','<unsafe>'),/<unsafe>/);
});
