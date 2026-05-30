//! Per-metric threshold tracker. Each metric carries its own state
//! (when it started exceeding the threshold; when an alert last fired).
//! Cooldown prevents flapping notifications when a metric stays elevated.

use serde::Serialize;
use std::time::{Duration, Instant};

const COOLDOWN: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum AlertKind { Cpu, Memory, Disk, CpuTemp }

#[derive(Debug, Clone, Serialize)]
pub struct FiredAlert {
    pub kind: AlertKind,
    pub value: f64,
    pub threshold: f64,
    pub message: String,
}

#[derive(Default, Clone, Copy)]
struct AlertState {
    exceeding_since: Option<Instant>,
    last_fired: Option<Instant>,
}

pub struct AlertEngine {
    states: [AlertState; 4],
}

impl AlertEngine {
    pub fn new() -> Self {
        Self { states: [AlertState::default(); 4] }
    }

    /// Test one metric. Returns Some(FiredAlert) only when:
    /// - threshold is Some
    /// - value >= threshold
    /// - value has been over threshold for >= duration_secs
    /// - the same alert has not fired within COOLDOWN
    ///
    /// A value below threshold resets the exceeding window.
    pub fn tick(
        &mut self,
        kind: AlertKind,
        value: f64,
        threshold: Option<f64>,
        duration_secs: u32,
        now: Instant,
    ) -> Option<FiredAlert> {
        let thresh = threshold?;
        let idx = kind as usize;
        let state = &mut self.states[idx];

        if value < thresh {
            state.exceeding_since = None;
            return None;
        }
        let since = *state.exceeding_since.get_or_insert(now);
        if now.duration_since(since) < Duration::from_secs(duration_secs as u64) {
            return None;
        }
        if let Some(last) = state.last_fired {
            if now.duration_since(last) < COOLDOWN {
                return None;
            }
        }
        state.last_fired = Some(now);
        Some(FiredAlert {
            kind,
            value,
            threshold: thresh,
            message: format_alert(kind, value, thresh, duration_secs),
        })
    }
}

impl Default for AlertEngine {
    fn default() -> Self { Self::new() }
}

fn format_alert(kind: AlertKind, value: f64, thresh: f64, secs: u32) -> String {
    let metric = match kind {
        AlertKind::Cpu => "CPU",
        AlertKind::Memory => "Memory",
        AlertKind::Disk => "Disk",
        AlertKind::CpuTemp => "CPU temp",
    };
    let unit = if matches!(kind, AlertKind::CpuTemp) { "°C" } else { "%" };
    if secs == 0 {
        format!("{metric} > {thresh:.0}{unit} (now {value:.0}{unit})")
    } else {
        format!("{metric} > {thresh:.0}{unit} for {secs}s (now {value:.0}{unit})")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_threshold_means_no_fire() {
        let mut e = AlertEngine::new();
        let now = Instant::now();
        assert!(e.tick(AlertKind::Cpu, 99.0, None, 0, now).is_none());
    }

    #[test]
    fn below_threshold_never_fires() {
        let mut e = AlertEngine::new();
        let now = Instant::now();
        assert!(e.tick(AlertKind::Cpu, 50.0, Some(80.0), 0, now).is_none());
    }

    #[test]
    fn at_or_above_with_zero_duration_fires_immediately() {
        let mut e = AlertEngine::new();
        let now = Instant::now();
        let fired = e.tick(AlertKind::Cpu, 81.0, Some(80.0), 0, now);
        assert!(fired.is_some());
        assert_eq!(fired.unwrap().kind, AlertKind::Cpu);
    }

    #[test]
    fn duration_must_elapse_before_first_fire() {
        let mut e = AlertEngine::new();
        let t0 = Instant::now();
        assert!(e.tick(AlertKind::Cpu, 90.0, Some(80.0), 5, t0).is_none());
        assert!(e.tick(AlertKind::Cpu, 90.0, Some(80.0), 5, t0 + Duration::from_secs(4)).is_none());
        assert!(e.tick(AlertKind::Cpu, 90.0, Some(80.0), 5, t0 + Duration::from_secs(5)).is_some());
    }

    #[test]
    fn second_call_within_cooldown_suppressed() {
        let mut e = AlertEngine::new();
        let t0 = Instant::now();
        assert!(e.tick(AlertKind::Cpu, 90.0, Some(80.0), 0, t0).is_some());
        assert!(e.tick(AlertKind::Cpu, 90.0, Some(80.0), 0, t0 + Duration::from_secs(30)).is_none());
    }

    #[test]
    fn fires_again_after_cooldown() {
        let mut e = AlertEngine::new();
        let t0 = Instant::now();
        assert!(e.tick(AlertKind::Cpu, 90.0, Some(80.0), 0, t0).is_some());
        assert!(e.tick(AlertKind::Cpu, 90.0, Some(80.0), 0, t0 + Duration::from_secs(61)).is_some());
    }

    #[test]
    fn dropping_below_resets_exceeding_window() {
        let mut e = AlertEngine::new();
        let t0 = Instant::now();
        // 4s of exceeding (would fire at +5).
        let _ = e.tick(AlertKind::Cpu, 90.0, Some(80.0), 5, t0);
        let _ = e.tick(AlertKind::Cpu, 90.0, Some(80.0), 5, t0 + Duration::from_secs(4));
        // Drops below — resets exceeding_since.
        let _ = e.tick(AlertKind::Cpu, 10.0, Some(80.0), 5, t0 + Duration::from_secs(4));
        // New window starts at +8.
        assert!(e.tick(AlertKind::Cpu, 90.0, Some(80.0), 5, t0 + Duration::from_secs(8)).is_none());
        // +12 = 4s into new window — still not enough.
        assert!(e.tick(AlertKind::Cpu, 90.0, Some(80.0), 5, t0 + Duration::from_secs(12)).is_none());
        // +13 = 5s into new window — fires.
        assert!(e.tick(AlertKind::Cpu, 90.0, Some(80.0), 5, t0 + Duration::from_secs(13)).is_some());
    }

    #[test]
    fn format_alert_with_zero_duration() {
        let s = format_alert(AlertKind::Cpu, 92.0, 80.0, 0);
        assert!(s.contains("CPU"));
        assert!(s.contains("80"));
        assert!(s.contains("92"));
    }

    #[test]
    fn format_alert_cpu_temp_uses_celsius_suffix() {
        let s = format_alert(AlertKind::CpuTemp, 91.0, 85.0, 3);
        assert!(s.contains("°C"));
    }
}
