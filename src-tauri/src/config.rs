//! User-facing configuration loaded from ~/.config/mgnx/config.toml.
//! Defaults are baked in here; the parser in parse.rs falls back to these
//! silently on missing file, syntax error, or per-field issues.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SortDefault { Cpu, Mem, Name }

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum TempUnit { C, F }

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct AppConfig {
    pub refresh_rate_hz: f64,
    pub default_sort: SortDefault,
    pub temperature_unit: TempUnit,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            refresh_rate_hz: 1.0,
            default_sort: SortDefault::Cpu,
            temperature_unit: TempUnit::C,
        }
    }
}

pub fn load() -> AppConfig {
    let Some(path) = config_path() else { return AppConfig::default(); };
    let Ok(content) = std::fs::read_to_string(path) else { return AppConfig::default(); };
    crate::parse::parse_config_toml(&content)
}

fn config_path() -> Option<PathBuf> {
    let home = std::env::var("HOME").ok()?;
    Some(PathBuf::from(home).join(".config/mgnx/config.toml"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_values_match_spec() {
        let d = AppConfig::default();
        assert!((d.refresh_rate_hz - 1.0).abs() < f64::EPSILON);
        assert_eq!(d.default_sort, SortDefault::Cpu);
        assert_eq!(d.temperature_unit, TempUnit::C);
    }
}
