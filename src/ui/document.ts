import {CSS} from './styles.ts';
import {esc} from './html.ts';
import {icon, type IconName} from './components.ts';

export type NavigationSection = 'assessments' | 'verification' | 'findings' | 'studies' | 'metrics' | 'trust' | 'examples';
export type DocumentOptions = {active?: NavigationSection; nonce?: string; script?: string; standalone?: boolean};
const navigation: {section: NavigationSection; label: string; href: string; icon: IconName}[] = [
  {section:'assessments',label:'Assessments',href:'/',icon:'list'},
  {section:'verification',label:'Verification',href:'/setups',icon:'code'},
  {section:'findings',label:'Finding judgments',href:'/evaluation/findings',icon:'findings'},
  {section:'studies',label:'Reading studies',href:'/evaluation/targeted',icon:'study'},
  {section:'metrics',label:'Review metrics',href:'/metrics',icon:'chart'},
  {section:'trust',label:'Trust record',href:'/trust',icon:'shield'},
  {section:'examples',label:'Worked examples',href:'/examples',icon:'git'},
];
function links(active: NavigationSection) {
  const primary = ['assessments', 'verification', 'metrics'];
  const link = (item: typeof navigation[number]) => `<a class="nav-link${item.section === active ? ' nav-link-active' : ''}" href="${item.href}"${item.section === active ? ' aria-current="page"' : ''}>${icon(item.icon)}<span>${item.label}</span></a>`;
  return navigation.filter(item => primary.includes(item.section)).map(link).join('') +
    `<details class="nav-more"${primary.includes(active) ? '' : ' open'}><summary class="nav-link">${icon('chevron')}More tools</summary>${navigation.filter(item => !primary.includes(item.section)).map(link).join('')}</details>`;
}

/** The sole document shell. Embedded fonts/CSS keep saved reports self-contained. */
export function renderDocument(title: string, content: string, options: DocumentOptions = {}) {
  const active = options.active ?? 'assessments';
  const brand = `<a class="brand" href="${options.standalone ? '#content' : '/'}" aria-label="${options.standalone ? 'ReviewProof saved assessment' : 'ReviewProof home'}">${icon('proof','size-7')}<span>ReviewProof</span></a>`;
  const workspace = options.standalone ? `<header class="saved-header">${brand}<span>Saved assessment</span></header>` : `<aside class="sidebar"><div>${brand}<p class="sidebar-caption">Evidence before approval.</p></div><nav aria-label="Main navigation">${links(active)}</nav><a class="sidebar-new" href="/assess">${icon('plus')}New assessment</a></aside>`;
  const topbar = options.standalone ? '' : `<header class="workspace-header"><a class="brand lg:hidden" href="/">${icon('proof','size-6')}<span>ReviewProof</span></a><div class="breadcrumb"><span>Workspace</span>${icon('chevron','size-3')}<strong>${navigation.find(item => item.section === active)!.label}</strong></div><details class="mobile-navigation"><summary>${icon('list')} Menu</summary><nav aria-label="Mobile navigation">${links(active)}<a class="nav-link" href="/assess">${icon('plus')}New assessment</a></nav></details><span class="workspace-label">${icon('shield')}Human sign-off required</span></header>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(title)} · ReviewProof</title><style>${CSS}</style></head><body><a class="skip-link" href="#content">Skip to content</a><div class="${options.standalone ? 'standalone-layout' : 'app-layout'}">${workspace}<div class="workspace-body">${topbar}<div id="content" tabindex="-1"><main class="sheet">${content}</main></div><footer class="workspace-footer"><span>ReviewProof</span><span>AI reviews. Humans decide.</span></footer></div></div>${options.script ? `<script nonce="${esc(options.nonce ?? '')}">${options.script}</script>` : ''}</body></html>`;
}
