import type {Hunk} from '../diff.ts';
import {esc} from './html.ts';

/** The same committed, numbered source listing is used in reports and reading exercises. */
export function renderHunk(hunk: Hunk, anchor = false) {
  const lines = [
    ...hunk.removed.map((line,index)=>`<span class="del">−${String(hunk.oldStart+index).padStart(5)}  ${esc(line)}</span>`),
    ...hunk.added.map((line,index)=>`<span class="add">+${String(hunk.newStart+index).padStart(5)}  ${esc(line)}</span>`),
  ].join('');
  return `<div class="hunk"${anchor ? ` id="${esc(hunk.id)}"` : ''} role="group" aria-label="${esc(hunk.id)}: ${esc(hunk.file)}"><div class="hunk-heading"><code>${esc(hunk.id)} · ${esc(hunk.file)}</code><span>Base ${hunk.oldStart} · Head ${hunk.newStart}</span></div><pre>${lines}</pre></div>`;
}
