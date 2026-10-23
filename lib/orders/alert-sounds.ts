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
 * full scale on a small tablet speaker without crackling. Both alarms are tunes
 * rather than two alternating pitches, so they read as "your turn" rather than
 * as a fire alarm. The counter's is the ballpark charge; see NEW_ORDER_FANFARE.
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

/** Time between the starts of two of the customer's ready alarm bursts. */
export const ALARM_INTERVAL_MS = 2_400;

/**
 * THE COUNTER'S NEW ORDER ALARM IS THE BALLPARK "CHARGE!".
 *
 * This is a New York sports-bar wing house, and the one sound everybody in
 * that room already reads as "something is happening, get up" is the stadium
 * organ's charge call, answered by the crowd's two-and-three clap. It replaces
 * a climbing bell arpeggio that did its job and sounded like any other app:
 * the counter could not tell it from a phone on the shelf.
 *
 * The fanfare is on a drawbar organ, whose upper drawbars put energy at two,
 * three and four times each note. A fanfare pitched at 0.8 to 1.6 kHz is
 * therefore also loud at 2 to 6 kHz, where hearing is most sensitive and a
 * fryer is quietest. The claps are filtered noise rather than a pitch, so they
 * cut through in a different way from the organ and from every other sound on
 * the board.
 *
 * It shares nothing with the customer's ready alarm, so a customer standing at
 * the counter never mistakes the kitchen's call for theirs.
 */
export const NEW_ORDER_FANFARE: ReadonlyArray<ChimeNote> = [
  { at: 0, freq: G5, duration: 0.1 },
  { at: 0.11, freq: C6, duration: 0.1 },
  { at: 0.22, freq: E6, duration: 0.1 },
  { at: 0.33, freq: G6, duration: 0.14 },
  { at: 0.52, freq: E6, duration: 0.12 },
  { at: 0.68, freq: G6, duration: 0.46 },
];

/** The crowd's answer: clap clap, clap clap clap. Seconds from the start. */
export const NEW_ORDER_CLAPS: ReadonlyArray<number> = [1.3, 1.46, 1.76, 1.92, 2.08];

/** Seconds of noise in one clap, slaps and tail together. */
export const CLAP_LENGTH = 0.16;

/**
 * Time between the starts of two new order bursts. A burst runs about 2.3
 * seconds, so this leaves a breath between them rather than a wall of sound,
 * and the gap is what makes a repeat read as "still waiting".
 */
export const NEW_ORDER_INTERVAL_MS = 3_000;

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

/**
 * The instrument a phrase is played on. A bell rings on after it is struck and
 * fades; an organ holds flat for as long as the key is down, then stops.
 */
export type Timbre = "bell" | "organ";

type Voice = { type: OscillatorType; ratio: number; level: number };

const VOICES: Record<Timbre, ReadonlyArray<Voice>> = {
  bell: [
    { type: "triangle", ratio: 1, level: 1 },
    // A quieter square underneath for bite, so it cuts through kitchen noise.
    { type: "square", ratio: 1, level: 0.3 },
    // A sparkle an octave up.
    { type: "sine", ratio: 2, level: 0.35 },
  ],
  // The ballpark organ's registration: the fundamental, then the upper
  // drawbars at the octave, the twelfth and the second octave, with a little
  // square for the reedy edge a stadium PA gives it.
  organ: [
    { type: "sine", ratio: 1, level: 0.8 },
    { type: "sine", ratio: 2, level: 0.6 },
    { type: "sine", ratio: 3, level: 0.45 },
    { type: "sine", ratio: 4, level: 0.3 },
    { type: "square", ratio: 1, level: 0.18 },
  ],
};

/**
 * A compressor into a master gain into the speakers. The compressor is what
 * lets an alarm be driven to just under full scale on a small tablet speaker
 * without crackling.
 */
function outputChain(ctx: BaseAudioContext, loudness: Loudness, now: number): AudioNode {
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-14, now);
  compressor.knee.setValueAtTime(0, now);
  compressor.ratio.setValueAtTime(12, now);
  compressor.attack.setValueAtTime(0.002, now);
  compressor.release.setValueAtTime(0.08, now);
  const master = ctx.createGain();
  master.gain.setValueAtTime(loudness === "alarm" ? 1.48 : 0.7, now);
  compressor.connect(master).connect(ctx.destination);
  return compressor;
}

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
  timbre: Timbre = "bell",
): void {
  const now = ctx.currentTime + 0.02;
  const compressor = outputChain(ctx, loudness, now);

  for (const { at, freq, duration } of notes) {
    const start = now + at;
    const end = start + duration;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(1, start + 0.005);
    if (timbre === "organ") {
      // Flat while the key is down, then a release short enough that the
      // fanfare's quick notes stay separate.
      envelope.gain.setValueAtTime(1, end - 0.025);
    } else {
      // Held, like a struck bell that keeps ringing, then a quick fade.
      envelope.gain.exponentialRampToValueAtTime(0.8, start + duration * 0.7);
    }
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    envelope.connect(compressor);

    for (const { type, ratio, level } of VOICES[timbre]) {
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

/**
 * One burst of the counter's new order alarm: the organ's charge, then the
 * crowd's claps. Every source it starts is handed to `onSource`, so "Got it"
 * can cut a burst off halfway rather than let the claps finish after the
 * order has already been answered.
 */
export function playNewOrderAlarm(
  ctx: BaseAudioContext,
  onSource?: (source: AudioScheduledSourceNode) => void,
): void {
  playPhrase(ctx, NEW_ORDER_FANFARE, "alarm", onSource, "organ");

  const now = ctx.currentTime + 0.02;
  const output = outputChain(ctx, "alarm", now);

  // One short buffer of white noise, shared by every clap in the burst.
  const length = Math.ceil(ctx.sampleRate * CLAP_LENGTH);
  const noise = ctx.createBuffer(1, length, ctx.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;

  // A hand clap is a band of noise around 1 to 2 kHz. What makes it read as
  // hands rather than as static is that it lands as three quick slaps a few
  // milliseconds apart before the tail.
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.setValueAtTime(1_400, now);
  band.Q.setValueAtTime(0.9, now);
  band.connect(output);

  for (const at of NEW_ORDER_CLAPS) {
    const start = now + at;
    const source = ctx.createBufferSource();
    source.buffer = noise;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    for (const slap of [0, 0.011, 0.022]) {
      envelope.gain.setValueAtTime(1.6, start + slap);
      envelope.gain.exponentialRampToValueAtTime(0.25, start + slap + 0.009);
    }
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + CLAP_LENGTH);
    source.connect(envelope).connect(band);
    onSource?.(source);
    source.start(start);
    source.stop(start + CLAP_LENGTH + 0.01);
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
