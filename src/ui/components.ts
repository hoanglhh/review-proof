import {esc} from './html.ts';

const paths = {
  proof: '<path d="M7 3H4v18h3M17 3h3v18h-3M8 12l3 3 5-6"/>',
  list: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h5M8 17h3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12l4 4L19 6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  chart: '<path d="M4 4v16h16M8 15v-4M12 15V7M16 15v-7"/>',
  findings: '<path d="M5 4h14v12H9l-4 4V4Z"/><path d="M9 8h6M9 12h3"/>',
  study: '<path d="M5 4h6v16H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM13 4h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6V4Z"/>',
  code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  git: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10M18 8a8 8 0 0 1-8 8H6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
} as const;
export type IconName = keyof typeof paths;
export const icon = (name: IconName, className = 'size-4') => `<svg class="${esc(className)} shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;

export function actionLink(href: string, label: string, options: {primary?: boolean; icon?: IconName} = {}) {
  return `<a class="${options.primary ? 'button' : 'button secondary'}" href="${esc(href)}">${options.icon ? icon(options.icon) : ''}${esc(label)}</a>`;
}

export function pageHeader(title: string, description = '', actions = '') {
  return `<div class="page-heading"><div class="min-w-0"><h1>${esc(title)}</h1>${description ? `<p class="page-description">${esc(description)}</p>` : ''}</div>${actions ? `<div class="actions page-actions">${actions}</div>` : ''}</div>`;
}

const statusText: Record<string, string> = {full:'Full read',blocked:'Blocked',targeted:'Targeted read',light:'Light review',proven:'Observed in a test',argued:'Argued',not_checked:'Not checked',broken:'Broken',passed:'Passed',failed:'Failed',not_run:'Not run',inconclusive:'Inconclusive',completed:'Completed',running:'Running',awaiting_setup:'Awaiting setup',interrupted:'Interrupted',review:'Needs confirmation',verified:'Verified',detecting:'Detecting'};
export function statusBadge(status: string, label = statusText[status] ?? status) {
  const tone = ['blocked','broken','failed'].includes(status) ? 'danger' : ['passed','proven','verified','light','completed'].includes(status) ? 'success' : ['argued','targeted','awaiting_setup','review','inconclusive'].includes(status) ? 'warning' : 'neutral';
  return `<span class="badge badge-${tone}"><span class="badge-dot" aria-hidden="true"></span>${esc(label)}</span>`;
}

export function emptyState(title: string, description: string, action = '') {
  return `<div class="empty-state">${icon('list','size-7')}<h3>${esc(title)}</h3><p>${esc(description)}</p>${action}</div>`;
}
