import { useEffect, useRef, useCallback } from "react";

// 낮은 주파수가 각성 효과가 크고(연구상 500~600Hz대), 사인파보다 배음 있는 파형이 덜 거슬리면서
// 잘 들린다. 심각도는 음높이뿐 아니라 반복 리듬(gap)으로도 구분한다 — critical은 짧게 끊어치고,
// warning은 느긋하게, info는 한 번만 울리고 끝.
const BEEP_FREQ = {
  critical: { freq: 550, duration: 220, gap: 150, type: "square" },
  warning: { freq: 350, duration: 220, gap: 300, type: "triangle" },
  info: { freq: 440, duration: 180, gap: 0, type: "sine" },
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

      osc.type = config.type;
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

      const config = BEEP_FREQ[alert.severity] || BEEP_FREQ.info;
      const count = repeatCount[alert.severity] || 1;
      const step = config.duration + config.gap;
      for (let i = 0; i < count; i++) {
        setTimeout(() => playBeep(alert.severity, volume), i * step);
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
