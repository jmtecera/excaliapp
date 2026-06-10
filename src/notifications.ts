let audioContext: AudioContext | null = null;

export function prepareNotificationSound(): void {
  const context = getAudioContext();

  if (context?.state === "suspended") {
    void context.resume();
  }
}

export function playPomodoroCompleteSound(): void {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  void context.resume().then(() => {
    const startedAt = context.currentTime;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, startedAt);
    gain.gain.exponentialRampToValueAtTime(0.18, startedAt + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.9);
    gain.connect(context.destination);

    for (const [frequency, offset] of [
      [659.25, 0],
      [783.99, 0.18],
      [987.77, 0.36],
    ] as const) {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, startedAt + offset);
      oscillator.connect(gain);
      oscillator.start(startedAt + offset);
      oscillator.stop(startedAt + offset + 0.48);
    }
  }).catch(() => undefined);
}

function getAudioContext(): AudioContext | null {
  if (audioContext) {
    return audioContext;
  }

  const AudioContextConstructor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextConstructor) {
    return null;
  }

  audioContext = new AudioContextConstructor();
  return audioContext;
}
