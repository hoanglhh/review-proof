# Automatic verification within an assessment

Start an assessment once. Automatic mode checks for a verified plan matching the repository and submitted head configuration. If missing, detection uses the already pinned head snapshot and saves a reviewable plan. The assessment waits while a named human reviews and trusts execution. After a passing baseline it continues with the same pinned comparison and entered requirements; baseline failure or unsupported detection stays explicit. Existing saved plans skip setup review. Changed configuration needs new trust.

Only head commands are executed by automatic verification, so plan matching follows head configuration; differing base configuration is not executed or claimed verified. The report retains its explicit lack of base/head regression discrimination. The human execution-trust boundary and PR signing boundary remain unchanged.

Implementation: add snapshot plan creation and status notifications to the setup registry; pause/resume the existing job in-process without holding the active-execution lock; add waiting-plan links and continued polling to progress pages; test first-time detection, no code before trust, same-job continuation, reuse, changed configuration, unsupported/failed checks, and shutdown. A server stop interrupts a pending assessment; it does not execute waiting plans on restart.
