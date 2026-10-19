// A Simulator v2 world with BOTH sessions simulated from the same latent state. syntheticWorld(..., session, ...) simulates only the requested
// session's observations and leaves the other as the REAL ones, so a race filter that reads qualifying would read real qualifying results there.
// The latent draws do not depend on the session (they come from their own stream), so a race call and a qualifying call with the same seed share a world.
import { syntheticWorld } from '../../eval/src/index.js';

export function bothSessions(timeline, idx0, params, seed) {
  const wr = syntheticWorld(timeline, idx0, 'race', params, seed);
  const wq = syntheticWorld(timeline, idx0, 'qual', params, seed);
  const composed = wr.timeline.map((w, i) => ({ ...w, obs: { ...w.obs, qual: wq.timeline[i].obs.qual } }));
  return { timeline: composed, truth: wr.truth, truthQual: wq.truth };
}
