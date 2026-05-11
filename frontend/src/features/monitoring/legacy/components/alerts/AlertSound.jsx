import { useEffect, useRef, useCallback } from "react";

const BEEP_FREQ = {
  critical: { freq: 880, duration: 300 },
  warning: { freq: 660, duration: 200 },
  info: { freq: 440, duration: 150 },
};

export default function AlertSound({ alerts, settings }) {
  const audioCtxRef = useRef(null);
  const playedRef = useRef(new Set());

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtxRef.current;
  }, []);

  const playBeep = useCallback((severity, volume) => {
    try {
      const ctx = getAudioCtx();
      const config = BEEP_FREQ[severity] || BEEP_FREQ.info;
      const vol = (volume ?? 70) / 100;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = severity === "critical" ? "square" : "sine";
      osc.frequency.value = config.freq;
      gain.gain.value = vol * 0.3;

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + config.duration / 1000);
      osc.stop(ctx.currentTime + config.duration / 1000);
    } catch (err) {
      console.warn("[AlertSound] playback error:", err.message);
    }
  }, [getAudioCtx]);

  useEffect(() => {
    if (!settings?.enabled || !alerts.length) return;

    const volume = settings.volume ?? 70;
    const repeatCount = settings.repeat_count || { info: 1, warning: 1, critical: 3 };

    for (const alert of alerts) {
      if (playedRef.current.has(alert.id)) continue;
      playedRef.current.add(alert.id);

      const count = repeatCount[alert.severity] || 1;
      for (let i = 0; i < count; i++) {
        setTimeout(() => playBeep(alert.severity, volume), i * 500);
      }
    }

    // cleanup old IDs
    if (playedRef.current.size > 100) {
      const alertIds = new Set(alerts.map((a) => a.id));
      for (const id of playedRef.current) {
        if (!alertIds.has(id)) playedRef.current.delete(id);
      }
    }
  }, [alerts, settings, playBeep]);

  return null; // no visual output
}
