import { esc } from './ui/html.ts';
import { renderDocument } from './ui/document.ts';
import { actionLink, emptyState, icon, pageHeader, statusBadge } from './ui/components.ts';
import type { RepositorySetup } from './repository-setup.ts';
import type { Detection } from './setup-detect.ts';

function setupField(id: string, label: string, value: string, placeholder: string) {
  return `<div class="field sm:grid-cols-1 sm:gap-2"><label for="${id}">${esc(label)}</label><input id="${id}" type="text" name="${id}" required value="${esc(value)}" placeholder="${esc(placeholder)}"></div>`;
}

function savedPlans(setups: RepositorySetup[]) {
  if (!setups.length) return emptyState('No verification plans yet', 'Detection currently supports .NET and npm projects; unsupported or ambiguous setups stay explicit.');
  return `<div class="scroll"><table><thead><tr><th>Repository and baseline</th><th>Status</th><th>Plan</th></tr></thead><tbody>${setups.map(setup => `
    <tr><td><code>${esc(setup.repository)}</code><p class="mt-1 text-xs text-gray-500">${esc(setup.revision)}</p></td><td>${statusBadge(setup.status)}</td><td>${actionLink(`/setups/${encodeURIComponent(setup.id)}`, 'View plan', { icon: 'arrow' })}</td></tr>`).join('')}</tbody></table></div>`;
}

export function renderSetupIndex(setups: RepositorySetup[], errors: string[] = [], f = new URLSearchParams()) {
  const content = `${pageHeader('Manage verification setups', 'Prepare and inspect repository verification plans. Automatic assessments also guide you through missing setup.', actionLink('/assess', 'New assessment', { primary: true, icon: 'plus' }))}
<div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
  <section class="panel mt-0" aria-labelledby="prepare-heading">
    <h2 class="section-heading" id="prepare-heading">Prepare a setup manually</h2>
    <p class="section-description">Prepare verification in advance, then review the proposed execution plan before it runs. This advanced step is optional.</p>
    ${errors.length ? `<div class="errors" role="alert"><h3>Setup was not started</h3><ul>${errors.map(error => `<li>${esc(error)}</li>`).join('')}</ul></div>` : ''}
    <form method="post" action="/setups">
      ${setupField('repository', 'Repository', f.get('repository') ?? '', '/absolute/path/to/repository or https://github.com/owner/repository')}
      ${setupField('revision', 'Baseline revision', f.get('revision') ?? '', 'main')}
      <p class="mt-3 text-sm text-gray-500">Choose an existing commit expected to build and pass tests. Detection reads configuration only; it does not execute repository scripts.</p>
      <div class="actions mt-6"><button type="submit">${icon('code')}Detect verification setup</button></div>
    </form>
  </section>
  <section class="panel mt-0" aria-labelledby="saved-heading"><h2 class="section-heading" id="saved-heading">Saved plans</h2><p class="section-description">Inspect an existing plan, its execution trust, and recorded baseline results.</p>${savedPlans(setups)}</section>
</div>`;
  return renderDocument('Manage verification setups', content, { active: 'verification' });
}

function runtimePlan(detection: Detection) {
  return `<section class="panel mt-0" aria-labelledby="runtime-heading">
    <h2 class="section-heading" id="runtime-heading">Proposed environment</h2>
    <dl class="facts"><dt>Project type</dt><dd>${esc(detection.kind)}</dd><dt>Container image</dt><dd><code>${esc(detection.image ?? 'Unavailable')}</code></dd><dt>Dependency restore</dt><dd>May access the network.</dd><dt>Verification checks</dt><dd>No network access, host credentials or Docker socket.</dd></dl>
  </section>`;
}

function commandPlan(detection: Detection) {
  return `<section class="panel mt-0" aria-labelledby="commands-heading">
    <div class="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 class="section-heading" id="commands-heading">Commands and scripts to review</h2><p class="section-description">Review the exact command arguments before granting execution trust.</p></div>${statusBadge(detection.runnable ? 'review' : 'inconclusive', detection.runnable ? 'Ready for review' : 'Not runnable')}</div>
    ${detection.commands.map(command => `<details class="my-3 rounded-lg bg-soft p-4" open><summary class="cursor-pointer text-sm font-semibold text-gray-900">${esc(command.phase)} · ${esc(command.id)}</summary><pre class="mt-3 overflow-auto rounded-lg bg-gray-50 p-4">${esc(command.argv.map(argument => JSON.stringify(argument)).join(' '))}</pre><p class="mt-3 text-sm text-gray-500">${esc(command.description)}</p></details>`).join('') || emptyState('No executable checks detected', 'No supported executable checks were detected for this committed configuration.')}
  </section>`;
}

function coverageLimits(detection: Detection) {
  return `<section class="panel mt-0" aria-labelledby="limits-heading">
    <h2 class="section-heading" id="limits-heading">Coverage and limits</h2>
    <ul class="list-disc space-y-2 pl-5 text-sm text-gray-600">${detection.limitations.map(limit => `<li>${esc(limit)}</li>`).join('')}</ul>
    <p class="mt-5 text-sm text-gray-500">Successful commands establish exit outcomes only. Individual test counts, security assurance and proof of requirement coverage are not inferred. A baseline is evidence that this setup runs at one commit.</p>
    <details class="advanced"><summary>Configuration fingerprint and observed files</summary><p><code>${esc(detection.fingerprint)}</code></p><ul class="mt-3 space-y-2">${detection.observed.map(observed => `<li><code>${esc(observed.path)}</code><br><code class="text-gray-500">${esc(observed.oid)}</code></li>`).join('')}</ul></details>
  </section>`;
}

function executionTrust(setup: RepositorySetup, assessmentId?: string) {
  if (setup.status !== 'review') return '';
  if (!setup.detection?.runnable) return `<section class="panel mt-0" aria-labelledby="unsupported-heading"><h2 class="section-heading" id="unsupported-heading">Verification cannot run</h2><p>No reusable verification profile can be created for this configuration. ${assessmentId ? 'This assessment cannot continue with Automatic. Choose code inspection only in a new assessment, or add supported committed configuration and start again.' : 'Use code inspection only, or add supported committed configuration and detect again.'}</p></section>`;
  return `<section class="panel mt-0" aria-labelledby="trust-heading">
    <h2 class="section-heading" id="trust-heading">Trust this execution plan</h2>
    <p class="section-description">This permits running repository checks in the isolated environment. It does not approve a pull request.</p>
    <form method="post" action="/setups/${encodeURIComponent(setup.id)}/trust">
      <input type="hidden" name="planHash" value="${esc(setup.planHash)}">
      <div class="field sm:grid-cols-1 sm:gap-2"><label for="name">Person trusting the plan</label><input id="name" name="name" type="text" required maxlength="120" autocomplete="name"></div>
      <div class="choices mt-4"><label><input type="checkbox" name="trust" value="yes" required><span>I reviewed the image, commands and repository scripts above and trust this plan for this repository.</span></label></div>
      <div class="actions mt-6"><button type="submit">${icon('shield')}Trust plan and run baseline</button></div>
    </form>
  </section>`;
}

function baselineResults(setup: RepositorySetup) {
  if (!setup.run) return '';
  return `<section class="panel mt-0" aria-labelledby="baseline-heading">
    <div class="mb-5 flex flex-wrap items-start justify-between gap-3"><h2 class="section-heading" id="baseline-heading">Baseline results</h2>${statusBadge(setup.run.status)}</div>
    <p class="mb-5 text-sm text-gray-500">Image: <code>${esc(setup.run.imageDigest ?? 'Not resolved')}</code>.</p>
    <div class="scroll"><table><thead><tr><th>Check</th><th>Outcome</th><th>Evidence</th></tr></thead><tbody>${setup.run.checks.map(check => `<tr><td><code>${esc(check.id)}</code></td><td>${statusBadge(check.status)}<p class="mt-2 text-xs text-gray-500">Exit ${esc(check.exitCode ?? 'unavailable')}</p></td><td>${esc(check.summary)}<p class="mt-2">${check.status === 'not_run' ? '<span class="text-gray-500">No command log</span>' : `<a href="/data/repository-setups/${encodeURIComponent(setup.id)}/baseline/${encodeURIComponent(check.log.split('/').pop() ?? '')}">View log</a>`}</p></td></tr>`).join('')}</tbody></table></div>
  </section>`;
}

function verifiedSetup(setup: RepositorySetup, assessmentId?: string) {
  if (setup.status !== 'verified') return '';
  return `<section class="panel mt-0" aria-labelledby="verified-heading"><h2 class="section-heading" id="verified-heading">Verified repository setup</h2><p>Execution trusted by ${esc(setup.trustedBy)}. This setup is reusable only while the repository identity and submitted head have matching relevant configuration. Base verification is not performed by this mode.</p>${assessmentId ? `<p class="mt-4 text-sm text-gray-500">Baseline verification succeeded. The linked assessment continues automatically.</p><div class="actions mt-5">${actionLink(`/assess/${assessmentId}`, 'Return to assessment progress', { primary: true, icon: 'arrow' })}</div>` : `<div class="actions mt-5">${actionLink(`/assess?setup=${encodeURIComponent(setup.id)}`, 'Assess a change with this setup', { primary: true, icon: 'arrow' })}</div>`}</section>`;
}

export function renderSetup(setup: RepositorySetup, nonce: string, error = '') {
  const running = setup.status === 'detecting' || setup.status === 'running';
  const assessmentId = /^submission-[0-9a-f-]{36}$/.test(setup.assessmentId ?? '') ? setup.assessmentId : undefined;
  const detection = setup.detection;
  const actions = actionLink('/setups', 'Saved plans', { icon: 'back' }) + (assessmentId
    ? actionLink(`/assess/${assessmentId}`, 'Assessment progress', { icon: 'arrow' })
    : actionLink('/assess', 'New assessment', { icon: 'plus' }));
  const content = `${pageHeader('Repository verification plan', 'Inspect the environment, commands and coverage before trusting repository execution.', actions)}
<section class="panel mt-0 mb-6" aria-labelledby="plan-heading">
  <div class="mb-5 flex flex-wrap items-start justify-between gap-3"><h2 class="section-heading" id="plan-heading">Plan details</h2><span role="status">${statusBadge(setup.status)}</span></div>
  <dl class="facts"><dt>Repository</dt><dd><code>${esc(setup.repository)}</code></dd><dt>Baseline</dt><dd><code>${esc(setup.commit ?? setup.revision)}</code></dd>${setup.planHash ? `<dt>Plan</dt><dd><code>${esc(setup.planHash)}</code></dd>` : ''}</dl>
</section>
${error || setup.error ? `<div class="errors" role="alert"><h2>Setup needs attention</h2><p>${esc(error || setup.error)}</p></div>` : ''}
<div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
  <div class="min-w-0 space-y-6">
    ${detection ? commandPlan(detection) + baselineResults(setup) : emptyState(setup.status === 'detecting' ? 'Inspecting repository configuration' : 'No verification plan available', 'Detection reads the committed configuration before any executable plan is proposed. Review the setup status and any recorded error above.')}
    <section class="panel mt-0" aria-labelledby="setup-log-heading"><h2 class="section-heading" id="setup-log-heading">Setup progress</h2><pre class="max-h-[420px] overflow-auto rounded-lg bg-gray-50 p-4">${esc(setup.log)}</pre>${running ? '<p class="mt-4 text-sm text-gray-500">This page updates automatically. Dependency installation and baseline checks can take several minutes.</p>' : ''}</section>
  </div>
  <div class="min-w-0 space-y-6">
    ${detection ? runtimePlan(detection) + coverageLimits(detection) : ''}
    ${executionTrust(setup, assessmentId)}
    ${verifiedSetup(setup, assessmentId)}
  </div>
</div>`;
  return renderDocument('Verification plan', content, { active: 'verification', nonce, script: running ? 'setTimeout(()=>location.reload(),2000);' : '' });
}
