/** Tiny synthesized "pop" via WebAudio — no asset, no dependency. Fires on task completion. */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    return ctx;
  } catch {
    return null;
  }
}

/** A soft, short "чпок". Safe to call from a click handler. */
export function playPop() {
  const ac = getCtx();
  if (!ac) return;
  if (ac.state === "suspended") ac.resume().catch(() => {});
  const now = ac.currentTime;

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  // Quick upward blip then a soft tail.
  osc.frequency.setValueAtTime(420, now);
  osc.frequency.exponentialRampToValueAtTime(720, now + 0.06);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}
