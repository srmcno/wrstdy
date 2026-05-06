// Module-level registry of in-flight AI requests, keyed by studyId.
//
// Why this exists: a Step 7 chat() request is async and can take 20–60 seconds.
// If the user navigates to another step (or back to the dashboard) while the
// request is in flight, Step 7 unmounts and its local `loading` state is lost.
// When the user returns to Step 7, they see the empty Generate button again
// even though the request is still running in the background. Worse, the
// resolved reply gets merged against a stale `study` snapshot held in the
// caller's closure, which can clobber unrelated edits made elsewhere.
//
// This module hoists job tracking out of the component:
//   - startAiJob(studyId, runner)  — kicks off (or joins) a job for a study
//   - isAiBusy(studyId)            — synchronous flag
//   - subscribeAiJobs(fn)          — listener for job-state changes (re-render)
//
// The actual side effect (saving the reply to the study) is the runner's
// responsibility. Runners should use a patch-style update so the merge happens
// against the LATEST study, not the closure-captured snapshot.

const jobs = new Map(); // studyId -> Promise<void>
const listeners = new Set();

function notify() {
  for (const fn of listeners) {
    try { fn(); } catch (err) { console.error('ai-jobs listener threw', err); }
  }
}

export function startAiJob(studyId, runner) {
  if (!studyId) return Promise.resolve();
  if (jobs.has(studyId)) return jobs.get(studyId);
  const promise = Promise.resolve()
    .then(runner)
    .finally(() => {
      jobs.delete(studyId);
      notify();
    });
  jobs.set(studyId, promise);
  notify();
  return promise;
}

export function isAiBusy(studyId) {
  return !!studyId && jobs.has(studyId);
}

export function subscribeAiJobs(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
