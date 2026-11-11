import { useUiStore } from "@/store/uiStore";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/** Synthesize a short sine wave beep without any external audio asset */
function playTone(freq: number, durationSec: number, type: OscillatorType = "sine"): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + durationSec);
  } catch {
    // Graceful degradation on unsupported environments
  }
}

/** Two-tone confirmation arpeggio */
function playConfirmTone(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.setValueAtTime(650, now + 0.05);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(now + 0.12);
  } catch {
    // Graceful degradation
  }
}

function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Ignore vibration failure
  }
}

export const feedback = {
  tick() {
    playTone(850, 0.03);
    vibrate(15);
  },
  confirm() {
    playConfirmTone();
    vibrate([25, 40, 30]);
  },
  error() {
    playTone(220, 0.15, "triangle");
    vibrate([50, 40, 50]);
  },
};

export function useFeedback() {
  const { soundEnabled, hapticsEnabled } = useUiStore();

  return {
    onTapItem: () => {
      if (soundEnabled) playTone(850, 0.03);
      if (hapticsEnabled) vibrate(15);
    },
    onSendSuccess: () => {
      if (soundEnabled) playConfirmTone();
      if (hapticsEnabled) vibrate([25, 40, 30]);
    },
    onPaySuccess: () => {
      if (soundEnabled) playConfirmTone();
      if (hapticsEnabled) vibrate([30, 40, 40]);
    },
    onError: () => {
      if (soundEnabled) playTone(220, 0.15, "triangle");
      if (hapticsEnabled) vibrate([50, 40, 50]);
    },
  };
}

