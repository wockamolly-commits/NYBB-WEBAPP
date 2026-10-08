/**
 * Every sound the order flow makes, for the staff board and the customer's
 * tracking page.
 *
 * Synthesised in the browser rather than shipped as files, the way the board's
 * first chime was, so there is nothing to load and nothing to go missing on a
 * phone with one bar of signal in a car park.
 *
 * TWO KINDS OF SOUND, ON PURPOSE.
 *
 * An alarm loops until a person taps something: a new order on the counter
 * tablet, and a ready order on the customer's phone. Those are the two moments
 * where somebody has to move, and a single chime is easy to miss over a fryer
 * or in a pocket. Everything else (cooking, collected, a refusal) is news,
 * and news plays once.
 *
 * WHY IT IS LOUD. The alarm sits between 1 and 2.7 kHz, where hearing is most
 * sensitive, and runs through a compressor so it can be driven to just under
 * full scale on a small tablet speaker without crackling. It climbs a major
 * chord rather than alternating two pitches, so it reads as "your turn" rather
 * than as a fire alarm.
 */

export type ChimeNote = { at: number; freq: number; duration: number };

// Note frequencies (Hz).
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1_046.5;
const D6 = 1_174.66;
const E6 = 1_318.5;
const G6 = 1_568;
const A6 = 1_760;
const C7 = 2_093;
const E7 = 2_637;

/** Time between the starts of two alarm bursts. */
export const ALARM_INTERVAL_MS = 2_400;

/** The counter's new order alarm. About 1.8 seconds, then a gap, then again. */
export const NEW_ORDER_ALARM: ReadonlyArray<ChimeNote> = [
  { at: 0, freq: C6, duration: 0.15 },
  { at: 0.15, freq: E6, duration: 0.15 },
  { at: 0.3, freq: G6, duration: 0.15 },
  { at: 0.45, freq: C7, duration: 0.42 },
  { at: 0.95, freq: G6, duration: 0.15 },
  { at: 1.1, freq: C7, duration: 0.15 },
  { at: 1.25, freq: E7, duration: 0.55 },
];

/**
 * The customer's ready alarm. A different tune from the counter's, so a
 * customer standing beside the tablet can tell which one is theirs.
 */
export const READY_ALARM: ReadonlyArray<ChimeNote> = [
  { at: 0, freq: G6, duration: 0.18 },
  { at: 0.2, freq: C7, duration: 0.18 },
  { at: 0.4, freq: G6, duration: 0.18 },
  { at: 0.6, freq: C7, duration: 0.18 },
  { at: 0.85, freq: E7, duration: 0.6 },
];

/** A customer is at the counter, or on the way. Three notes, played once. */
export const COUNTER_NOTICE: ReadonlyArray<ChimeNote> = [
  { at: 0, freq: E6, duration: 0.18 },
  { at: 0.22, freq: A6, duration: 0.18 },
  { at: 0.44, freq: E6, duration: 0.3 },
];

/** Cooking has started. Two warm rising notes. */
export const COOKING_CHIME: ReadonlyArray<ChimeNote> = [
  { at: 0, freq: E5, duration: 0.22 },
  { at: 0.22, freq: C6, duration: 0.4 },
];

/** Collected. A short resolving phrase. */
export const COLLECTED_CHIME: ReadonlyArray<ChimeNote> = [
  { at: 0, freq: C6, duration: 0.16 },
  { at: 0.16, freq: D6, duration: 0.16 },
  { at: 0.32, freq: E6, duration: 0.16 },
  { at: 0.48, freq: G6, duration: 0.45 },
];

/** Refused, cancelled or not collected. Falling, and lower. */
export const STOPPED_CHIME: ReadonlyArray<ChimeNote> = [
  { at: 0, freq: G5, duration: 0.25 },
  { at: 0.28, freq: C5, duration: 0.45 },
];

/** How hard each kind of sound is driven: alarms near full scale, news gentler. */
export type Loudness = "alarm" | "notice";

const VOICES: ReadonlyArray<{ type: OscillatorType; ratio: number; level: number }> = [
  { type: "triangle", ratio: 1, level: 1 },
  // A quieter square underneath for bite, so it cuts through kitchen noise.
  { type: "square", ratio: 1, level: 0.3 },
  // A sparkle an octave up.
  { type: "sine", ratio: 2, level: 0.35 },
];

/**
 * Schedules one phrase on an audio context, starting now.
 *
 * `onOscillator` hands every oscillator to the caller, which is how a tap on
 * "I'm coming" or "Got it" can cut a burst off halfway through rather than let
 * it finish after the person has already answered it.
 */
export function playPhrase(
  ctx: BaseAudioContext,
  notes: ReadonlyArray<ChimeNote>,
  loudness: Loudness,
  onOscillator?: (osc: OscillatorNode) => void,
): void {
  const now = ctx.currentTime + 0.02;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-14, now);
  compressor.knee.setValueAtTime(0, now);
  compressor.ratio.setValueAtTime(12, now);
  compressor.attack.setValueAtTime(0.002, now);
  compressor.release.setValueAtTime(0.08, now);
  const master = ctx.createGain();
  master.gain.setValueAtTime(loudness === "alarm" ? 1.48 : 0.7, now);
  compressor.connect(master).connect(ctx.destination);

  for (const { at, freq, duration } of notes) {
    const start = now + at;
    const end = start + duration;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(1, start + 0.005);
    // Held, like a struck bell that keeps ringing, then a quick fade.
    envelope.gain.exponentialRampToValueAtTime(0.8, start + duration * 0.7);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    envelope.connect(compressor);

    for (const { type, ratio, level } of VOICES) {
      const osc = ctx.createOscillator();
      const voice = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq * ratio, start);
      voice.gain.setValueAtTime(level, start);
      osc.connect(voice).connect(envelope);
      onOscillator?.(osc);
      osc.start(start);
      osc.stop(end + 0.01);
    }
  }
}

/** The browser's audio context constructor, or null where there is none. */
export function audioContextConstructor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    null
  );
}
