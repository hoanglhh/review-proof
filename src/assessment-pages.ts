import { esc } from './ui/html.ts';
import { renderDocument } from './ui/document.ts';
import { actionLink, icon, pageHeader } from './ui/components.ts';
import { STAGES, type Job } from './submissions.ts';

const SETUP_COPY = {
  review: ['Repository verification plan', 'Review verification plan', 'Automatic requires a named trust confirmation on this plan and successful baseline verification before the assessment can continue.'],
  running: ['Repository baseline verification', 'View verification progress', 'The trusted plan is running baseline checks. This assessment continues automatically after they pass.'],
  verified: ['Verified repository setup', 'View verified setup', 'This assessment uses a matching verified setup. No further trust confirmation is required.'],
  failed: ['Repository setup stopped', 'View setup details', 'Repository setup did not complete. Open the setup details for the reason; Automatic does not fall back to code inspection.'],
};
const STAGE_LABELS: Record<typeof STAGES[number], string> = {
  prepare: 'Resolve repository and revisions',
  setup: 'Detect and confirm repository verification',
  ingest: 'Extract diff and requirements',
  check: 'Verify available evidence',
  review: 'AI review',
  assemble: 'Validate and generate report',
};

function field(id: string, label: string, control: string, help = '') {
  return `<div class="field sm:grid-cols-1 sm:gap-2"><label for="${id}">${esc(label)}</label><div class="min-w-0">${control}${help ? `<p class="mt-2 text-sm text-gray-500" id="${id}-help">${esc(help)}</p>` : ''}</div></div>`;
}

function verificationOptions(profiles: { id: string; description: string }[], f: URLSearchParams) {
  return `<select id="profile" name="profile" aria-describedby="profile-help">${profiles.map(profile => {
    const label = profile.id === 'auto' ? 'Automatic — detect or reuse repository verification'
      : profile.id === 'inspection-only' ? 'Code inspection only — no tests executed' : profile.id;
    return `<option value="${esc(profile.id)}"${(f.get('profile') ?? 'auto') === profile.id ? ' selected' : ''}>${esc(label)}</option>`;
  }).join('')}</select>`;
}

export function renderAssessmentForm(profiles: { id: string; description: string }[], f = new URLSearchParams(), errors: string[] = [], nonce = '') {
  const value = (key: string) => esc(f.get(key) ?? '');
  const input = (key: string, attributes = '') => `<input id="${key}" name="${key}" type="text" value="${value(key)}" ${attributes}>`;
  const content = `${pageHeader('Assess a new change', 'Compare committed changes, verify the available evidence, and prepare a report for a human owner.', actionLink('/', 'All assessments', { icon: 'back' }))}
${errors.length ? `<div class="errors" role="alert"><h2>Assessment not started</h2><ul>${errors.map(error => `<li>${esc(error)}</li>`).join('')}</ul></div>` : ''}
<form method="post" action="/assess">
  <div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
    <div class="min-w-0 space-y-6">
      <section class="panel mt-0" aria-labelledby="comparison-heading">
        <h2 class="section-heading" id="comparison-heading">Git comparison</h2>
        <p class="section-description">Branches, tags and commit hashes are resolved to fixed commits before review.</p>
        ${field('repository', 'Repository', input('repository', 'required placeholder="/absolute/path/to/repository or https://github.com/owner/repository" aria-describedby="repository-help"'), 'A path on the machine running ReviewProof, or a public HTTPS GitHub repository. Only committed changes are assessed.')}
        <div class="grid gap-4 sm:grid-cols-2">
          ${field('base', 'Base revision', input('base', 'required placeholder="main"'))}
          ${field('head', 'Head revision', input('head', 'required placeholder="feature-branch"'))}
        </div>
      </section>
      <section class="panel mt-0" aria-labelledby="intent-heading">
        <h2 class="section-heading" id="intent-heading">Requirements and intent</h2>
        <p class="section-description">Describe what the change should do so the evidence can be assessed against its intended behavior.</p>
        ${field('requirementId', 'Requirement ID (optional)', input('requirementId', 'maxlength="120"'))}
        ${field('requirement', 'Requirement or issue text', `<textarea id="requirement" name="requirement" rows="8" required maxlength="50000">${value('requirement')}</textarea>`)}
      </section>
    </div>
    <div class="min-w-0 space-y-6">
      <section class="panel mt-0" aria-labelledby="verification-heading">
        <h2 class="section-heading" id="verification-heading">Verification</h2>
        <p class="section-description">Choose how this repository will be checked.</p>
        ${field('profile', 'Verification mode', verificationOptions(profiles, f))}
        <p class="mt-4 text-sm text-subtle">Automatic reuses a verified setup or pauses for your approval of a detected plan. Baseline verification must pass before the assessment continues.</p>
        <details class="mt-4"><summary>Verification options and limits</summary><div class="space-y-3 pt-3 text-sm text-subtle" id="profile-help">${profiles.map(profile => `<p><strong class="text-ink">${esc(profile.id)}</strong>: ${esc(profile.description)}</p>`).join('')}<p>Unsupported or failed verification stops Automatic; it does not switch to code inspection only.</p></div></details>
        <div class="choices mt-5"><label><input type="checkbox" name="trustProfile" value="yes"${f.get('trustProfile') === 'yes' ? ' checked' : ''}><span>For a manually installed executable profile, I confirm it is trusted and suitable for this repository.</span></label></div>
      </section>
      <section class="panel mt-0" aria-labelledby="owner-heading">
        <h2 class="section-heading" id="owner-heading">Human ownership</h2>
        ${field('owner', 'Human owner', input('owner', 'required maxlength="120" autocomplete="name" aria-describedby="owner-help"'), 'This names who will review the evidence. Starting an assessment does not sign or approve the change.')}
      </section>
    </div>
  </div>
  <footer class="mt-6 flex flex-wrap items-center justify-between gap-5 rounded-xl border border-gray-200 bg-white px-6 py-5">
    <p class="max-w-2xl text-sm text-gray-500">Starting an assessment does not approve the change.</p>
    <button type="submit">${icon('plus')}Start assessment</button>
  </footer>
</form>
<details class="advanced"><summary>Advanced options</summary><p>Automatic handles missing setup during the assessment. Preparing or inspecting saved plans separately is optional.</p>${actionLink('/setups', 'Manage verification setups', { icon: 'code' })}</details>`;
  return renderDocument('New assessment', content, { active: 'assessments', nonce });
}

function setupState(job: Job) {
  if (job.status === 'completed' || job.setupStatus === 'verified') return SETUP_COPY.verified;
  if (job.setupStatus === 'running' && ['running', 'awaiting_setup'].includes(job.status)) return SETUP_COPY.running;
  if (['failed', 'interrupted'].includes(job.status) || ['failed', 'interrupted'].includes(job.setupStatus ?? '')) return SETUP_COPY.failed;
  return SETUP_COPY.review;
}

function progressStages(job: Job) {
  return `<ol class="stages space-y-2">${STAGES.map(stage => `<li id="stage-${stage}" class="${stage === job.stage ? 'current' : ''}">${esc(STAGE_LABELS[stage])}</li>`).join('')}</ol>`;
}

export function renderAssessmentProgress(job: Job, nonce: string) {
  const done = job.status === 'completed';
  const setupId = /^setup-[0-9a-f-]{36}$/.test(job.setupId ?? '') ? job.setupId : undefined;
  const status = job.status === 'awaiting_setup'
    ? job.setupStatus === 'running' ? 'Verifying repository baseline' : job.setupStatus === 'verified' ? 'Continuing assessment' : 'Waiting for verification plan confirmation'
    : job.status;
  const setup = setupState(job);
  const content = `${pageHeader('Assessment progress', 'Follow evidence collection and verification for this comparison.', actionLink('/', 'All assessments', { icon: 'back' }) + actionLink('/assess', 'New assessment', { icon: 'plus' }))}
<div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]">
  <div class="min-w-0 space-y-6">
    <section class="panel mt-0" aria-labelledby="progress-heading">
      <h2 class="section-heading" id="progress-heading">Pipeline status</h2>
      <p id="job-status" class="notice" role="status" aria-live="polite">${esc(status)} · ${esc(job.stage)}</p>
      ${progressStages(job)}
      <p class="mt-5 text-sm text-gray-500">${done ? 'The pipeline finished. The report may still be blocked or require a full human read.' : 'Stages update automatically. Tests and the model can take several minutes; no completion percentage is estimated.'}</p>
      <p id="job-result" class="mt-5"${done ? '' : ' hidden'}>${actionLink(`/case/${encodeURIComponent(job.id)}`, 'Open assessment report', { primary: true, icon: 'arrow' })}</p>
      <form id="job-cancel" class="mt-5" method="post" action="/assess/${encodeURIComponent(job.id)}/cancel"${job.status === 'awaiting_setup' && job.setupStatus === 'review' ? '' : ' hidden'}><button class="secondary" type="submit">Cancel assessment</button></form>
    </section>
    <section class="panel mt-0" aria-labelledby="comparison-details"><h2 class="section-heading" id="comparison-details">Comparison details</h2><dl class="facts"><dt>Owner</dt><dd>${esc(job.owner)}</dd><dt>Repository</dt><dd><code>${esc(job.repository)}</code></dd><dt>Started</dt><dd>${esc(job.startedAt)}</dd></dl></section>
  </div>
  <div class="min-w-0 space-y-6">
    <section id="job-setup" class="panel mt-0"${setupId ? '' : ' hidden'}>
      <h2 class="section-heading" id="job-setup-title">${esc(setup[0])}</h2>
      <p id="job-setup-note" class="section-description">${esc(setup[2])}</p>
      <a class="button" id="job-setup-link"${setupId ? ` href="/setups/${esc(setupId)}"` : ''}>${esc(setup[1])}</a>
    </section>
    <p id="job-error" class="text-sm text-red-700" role="alert">${esc(job.error ?? '')}</p>
    <section class="panel mt-0" aria-labelledby="log-heading"><h2 class="section-heading" id="log-heading">Run log</h2><pre id="job-log" class="max-h-[420px] overflow-auto rounded-lg bg-gray-50 p-4">${esc(job.log)}</pre><noscript>Reload this page to update progress.</noscript></section>
  </div>
</div>`;
  return renderDocument('Assessment progress', content, { active: 'assessments', nonce, script: assessmentPolling(job) });
}

function assessmentPolling(job: Job) {
  return `(() => {
    const setupCopy = ${JSON.stringify(SETUP_COPY)};
    let stopped = ${!['running', 'awaiting_setup'].includes(job.status)};

    function updateSetup(job) {
      const setupId = typeof job.setupId === 'string' && /^setup-[0-9a-f-]{36}$/.test(job.setupId) ? job.setupId : null;
      document.getElementById('job-setup').hidden = !setupId;
      if (setupId) document.getElementById('job-setup-link').href = '/setups/' + setupId;
      const state = job.status === 'completed' || job.setupStatus === 'verified' ? 'verified'
        : job.setupStatus === 'running' && ['running', 'awaiting_setup'].includes(job.status) ? 'running'
        : job.status === 'failed' || job.status === 'interrupted' || job.setupStatus === 'failed' || job.setupStatus === 'interrupted' ? 'failed' : 'review';
      const setup = setupCopy[state];
      document.getElementById('job-setup-title').textContent = setup[0];
      document.getElementById('job-setup-link').textContent = setup[1];
      document.getElementById('job-setup-note').textContent = setup[2];
    }

    async function refresh() {
      if (stopped) return;
      try {
        const response = await fetch(location.pathname + '/status');
        if (!response.ok) throw Error('Progress unavailable');
        const job = await response.json();
        const status = job.status === 'awaiting_setup'
          ? job.setupStatus === 'running' ? 'Verifying repository baseline'
            : job.setupStatus === 'verified' ? 'Continuing assessment' : 'Waiting for verification plan confirmation'
          : job.status;
        document.getElementById('job-status').textContent = status + ' · ' + job.stage;
        document.getElementById('job-log').textContent = job.log;
        document.getElementById('job-error').textContent = job.error || '';
        document.getElementById('job-result').hidden = job.status !== 'completed';
        document.getElementById('job-cancel').hidden = !(job.status === 'awaiting_setup' && job.setupStatus === 'review');
        updateSetup(job);
        for (const stage of ${JSON.stringify(STAGES)}) {
          document.getElementById('stage-' + stage).classList.toggle('current', stage === job.stage);
        }
        stopped = !['running', 'awaiting_setup'].includes(job.status);
      } catch {
        document.getElementById('job-error').textContent = 'Could not refresh progress. Retrying; reload if the server restarted.';
      }
      if (!stopped) setTimeout(refresh, 1500);
    }
    setTimeout(refresh, 1500);
  })();`;
}
