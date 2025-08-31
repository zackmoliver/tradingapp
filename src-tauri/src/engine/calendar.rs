// src-tauri/src/engine/calendar.rs
// US market calendar with trading session gates

use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc, NaiveDate, NaiveTime, NaiveDateTime, Datelike, Weekday, TimeZone};
use chrono_tz::US::Eastern;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum MarketSession {
    PreMarket,    // 4:00 AM - 9:30 AM ET
    Regular,      // 9:30 AM - 4:00 PM ET
    AfterHours,   // 4:00 PM - 8:00 PM ET
    Closed,       // Market is closed
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum HolidayType {
    Full,         // Market closed all day
    EarlyClose,   // Market closes early (1:00 PM ET)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketHoliday {
    pub date: NaiveDate,
    pub name: String,
    pub holiday_type: HolidayType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradingSession {
    pub date: NaiveDate,
    pub session: MarketSession,
    pub start_time: NaiveTime,
    pub end_time: NaiveTime,
    pub is_holiday: bool,
    pub holiday_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketCalendar {
    pub holidays: Vec<MarketHoliday>,
    pub allow_premarket: bool,
    pub allow_afterhours: bool,
    pub allow_holiday_trading: bool,
}

impl Default for MarketCalendar {
    fn default() -> Self {
        Self {
            holidays: Self::get_2024_holidays(),
            allow_premarket: false,
            allow_afterhours: false,
            allow_holiday_trading: false,
        }
    }
}

impl MarketCalendar {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_extended_hours(mut self, premarket: bool, afterhours: bool) -> Self {
        self.allow_premarket = premarket;
        self.allow_afterhours = afterhours;
        self
    }

    pub fn with_holiday_trading(mut self, enabled: bool) -> Self {
        self.allow_holiday_trading = enabled;
        self
    }

    /// Check if trading is allowed at the given timestamp
    pub fn is_trading_allowed(&self, timestamp: i64) -> bool {
        let dt = match DateTime::from_timestamp(timestamp, 0) {
            Some(dt) => dt,
            None => return false,
        };

        let session_info = self.get_session_info(dt);
        
        // Check if it's a holiday (but allow early close holidays during trading hours)
        if session_info.is_holiday && !self.allow_holiday_trading {
            // For early close holidays, allow trading during permitted hours
            if let Some(holiday) = self.holidays.iter().find(|h| h.date == session_info.date) {
                if holiday.holiday_type == HolidayType::EarlyClose && session_info.session == MarketSession::Regular {
                    // Allow trading during regular hours on early close days
                } else {
                    return false;
                }
            } else {
                return false;
            }
        }

        // Check session permissions
        match session_info.session {
            MarketSession::Regular => true,
            MarketSession::PreMarket => self.allow_premarket,
            MarketSession::AfterHours => self.allow_afterhours,
            MarketSession::Closed => false,
        }
    }

    /// Get detailed session information for a given timestamp
    pub fn get_session_info(&self, dt: DateTime<Utc>) -> TradingSession {
        // Convert to Eastern Time
        let et_dt = dt.with_timezone(&Eastern);
        let date = et_dt.date_naive();
        let time = et_dt.time();

        // Check if it's a weekend
        if matches!(date.weekday(), Weekday::Sat | Weekday::Sun) {
            return TradingSession {
                date,
                session: MarketSession::Closed,
                start_time: NaiveTime::from_hms_opt(0, 0, 0).unwrap(),
                end_time: NaiveTime::from_hms_opt(0, 0, 0).unwrap(),
                is_holiday: false,
                holiday_name: None,
            };
        }

        // Check for holidays
        let holiday = self.holidays.iter().find(|h| h.date == date);
        let (is_holiday, holiday_name) = match holiday {
            Some(h) => (true, Some(h.name.clone())),
            None => (false, None),
        };

        // Determine session based on time
        let session = if is_holiday {
            match holiday.unwrap().holiday_type {
                HolidayType::Full => {
                    // If holiday trading is allowed, treat as normal trading day
                    if self.allow_holiday_trading {
                        if time < NaiveTime::from_hms_opt(4, 0, 0).unwrap() {
                            MarketSession::Closed
                        } else if time < NaiveTime::from_hms_opt(9, 30, 0).unwrap() {
                            MarketSession::PreMarket
                        } else if time < NaiveTime::from_hms_opt(16, 0, 0).unwrap() {
                            MarketSession::Regular
                        } else if time < NaiveTime::from_hms_opt(20, 0, 0).unwrap() {
                            MarketSession::AfterHours
                        } else {
                            MarketSession::Closed
                        }
                    } else {
                        MarketSession::Closed
                    }
                },
                HolidayType::EarlyClose => {
                    if time < NaiveTime::from_hms_opt(9, 30, 0).unwrap() {
                        MarketSession::PreMarket
                    } else if time < NaiveTime::from_hms_opt(13, 0, 0).unwrap() {
                        MarketSession::Regular
                    } else {
                        MarketSession::Closed
                    }
                }
            }
        } else {
            // Normal trading day
            if time < NaiveTime::from_hms_opt(4, 0, 0).unwrap() {
                MarketSession::Closed
            } else if time < NaiveTime::from_hms_opt(9, 30, 0).unwrap() {
                MarketSession::PreMarket
            } else if time < NaiveTime::from_hms_opt(16, 0, 0).unwrap() {
                MarketSession::Regular
            } else if time < NaiveTime::from_hms_opt(20, 0, 0).unwrap() {
                MarketSession::AfterHours
            } else {
                MarketSession::Closed
            }
        };

        let (start_time, end_time) = match session {
            MarketSession::PreMarket => (
                NaiveTime::from_hms_opt(4, 0, 0).unwrap(),
                NaiveTime::from_hms_opt(9, 30, 0).unwrap(),
            ),
            MarketSession::Regular => {
                if is_holiday && holiday.unwrap().holiday_type == HolidayType::EarlyClose {
                    (
                        NaiveTime::from_hms_opt(9, 30, 0).unwrap(),
                        NaiveTime::from_hms_opt(13, 0, 0).unwrap(),
                    )
                } else {
                    (
                        NaiveTime::from_hms_opt(9, 30, 0).unwrap(),
                        NaiveTime::from_hms_opt(16, 0, 0).unwrap(),
                    )
                }
            },
            MarketSession::AfterHours => (
                NaiveTime::from_hms_opt(16, 0, 0).unwrap(),
                NaiveTime::from_hms_opt(20, 0, 0).unwrap(),
            ),
            MarketSession::Closed => (
                NaiveTime::from_hms_opt(0, 0, 0).unwrap(),
                NaiveTime::from_hms_opt(0, 0, 0).unwrap(),
            ),
        };

        TradingSession {
            date,
            session,
            start_time,
            end_time,
            is_holiday,
            holiday_name,
        }
    }

    /// Get the next trading session start time
    pub fn get_next_session_start(&self, current_timestamp: i64) -> Option<i64> {
        let mut dt = DateTime::from_timestamp(current_timestamp, 0)?;
        
        // Look ahead up to 7 days
        for _ in 0..7 {
            dt = dt + chrono::Duration::days(1);
            let et_dt = dt.with_timezone(&Eastern);
            let date = et_dt.date_naive();
            
            // Skip weekends
            if matches!(date.weekday(), Weekday::Sat | Weekday::Sun) {
                continue;
            }
            
            // Check for full holidays
            if let Some(holiday) = self.holidays.iter().find(|h| h.date == date) {
                if holiday.holiday_type == HolidayType::Full && !self.allow_holiday_trading {
                    continue;
                }
            }
            
            // Return next regular session start (9:30 AM ET)
            let session_start = Eastern
                .from_local_datetime(&NaiveDateTime::new(
                    date,
                    NaiveTime::from_hms_opt(9, 30, 0).unwrap(),
                ))
                .single()?
                .with_timezone(&Utc);
                
            return Some(session_start.timestamp());
        }
        
        None
    }

    /// Check if a specific date is a trading day
    pub fn is_trading_day(&self, date: NaiveDate) -> bool {
        // Check weekend
        if matches!(date.weekday(), Weekday::Sat | Weekday::Sun) {
            return false;
        }
        
        // Check holidays
        if let Some(holiday) = self.holidays.iter().find(|h| h.date == date) {
            if holiday.holiday_type == HolidayType::Full {
                return !self.allow_holiday_trading;
            }
        }
        
        true
    }

    /// Get trading days between two dates (inclusive)
    pub fn get_trading_days(&self, start_date: NaiveDate, end_date: NaiveDate) -> Vec<NaiveDate> {
        let mut trading_days = Vec::new();
        let mut current = start_date;
        
        while current <= end_date {
            if self.is_trading_day(current) {
                trading_days.push(current);
            }
            current = current + chrono::Duration::days(1);
        }
        
        trading_days
    }

    /// Get 2024 US market holidays
    fn get_2024_holidays() -> Vec<MarketHoliday> {
        vec![
            MarketHoliday {
                date: NaiveDate::from_ymd_opt(2024, 1, 1).unwrap(),
                name: "New Year's Day".to_string(),
                holiday_type: HolidayType::Full,
            },
            MarketHoliday {
                date: NaiveDate::from_ymd_opt(2024, 1, 15).unwrap(),
                name: "Martin Luther King Jr. Day".to_string(),
                holiday_type: HolidayType::Full,
            },
            MarketHoliday {
                date: NaiveDate::from_ymd_opt(2024, 2, 19).unwrap(),
                name: "Presidents' Day".to_string(),
                holiday_type: HolidayType::Full,
            },
            MarketHoliday {
                date: NaiveDate::from_ymd_opt(2024, 3, 29).unwrap(),
                name: "Good Friday".to_string(),
                holiday_type: HolidayType::Full,
            },
            MarketHoliday {
                date: NaiveDate::from_ymd_opt(2024, 5, 27).unwrap(),
                name: "Memorial Day".to_string(),
                holiday_type: HolidayType::Full,
            },
            MarketHoliday {
                date: NaiveDate::from_ymd_opt(2024, 6, 19).unwrap(),
                name: "Juneteenth".to_string(),
                holiday_type: HolidayType::Full,
            },
            MarketHoliday {
                date: NaiveDate::from_ymd_opt(2024, 7, 4).unwrap(),
                name: "Independence Day".to_string(),
                holiday_type: HolidayType::Full,
            },
            MarketHoliday {
                date: NaiveDate::from_ymd_opt(2024, 9, 2).unwrap(),
                name: "Labor Day".to_string(),
                holiday_type: HolidayType::Full,
            },
            MarketHoliday {
                date: NaiveDate::from_ymd_opt(2024, 11, 28).unwrap(),
                name: "Thanksgiving Day".to_string(),
                holiday_type: HolidayType::Full,
            },
            MarketHoliday {
                date: NaiveDate::from_ymd_opt(2024, 11, 29).unwrap(),
                name: "Day after Thanksgiving".to_string(),
                holiday_type: HolidayType::EarlyClose,
            },
            MarketHoliday {
                date: NaiveDate::from_ymd_opt(2024, 12, 24).unwrap(),
                name: "Christmas Eve".to_string(),
                holiday_type: HolidayType::EarlyClose,
            },
            MarketHoliday {
                date: NaiveDate::from_ymd_opt(2024, 12, 25).unwrap(),
                name: "Christmas Day".to_string(),
                holiday_type: HolidayType::Full,
            },
        ]
    }

    /// Add custom holiday
    pub fn add_holiday(&mut self, date: NaiveDate, name: String, holiday_type: HolidayType) {
        self.holidays.push(MarketHoliday {
            date,
            name,
            holiday_type,
        });
        
        // Sort holidays by date
        self.holidays.sort_by(|a, b| a.date.cmp(&b.date));
    }

    /// Remove holiday by date
    pub fn remove_holiday(&mut self, date: NaiveDate) {
        self.holidays.retain(|h| h.date != date);
    }

    /// Get holiday information for a specific date
    pub fn get_holiday(&self, date: NaiveDate) -> Option<&MarketHoliday> {
        self.holidays.iter().find(|h| h.date == date)
    }

    /// Get all holidays in a year
    pub fn get_holidays_for_year(&self, year: i32) -> Vec<&MarketHoliday> {
        self.holidays
            .iter()
            .filter(|h| h.date.year() == year)
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn test_regular_trading_hours() {
        let calendar = MarketCalendar::default();

        // Tuesday, January 2, 2024 at 10:00 AM ET (regular trading hours)
        let dt = Eastern.with_ymd_and_hms(2024, 1, 2, 10, 0, 0).unwrap().with_timezone(&Utc);
        let timestamp = dt.timestamp();

        assert!(calendar.is_trading_allowed(timestamp));

        let session = calendar.get_session_info(dt);
        assert_eq!(session.session, MarketSession::Regular);
        assert!(!session.is_holiday);
    }

    #[test]
    fn test_holiday_blocking() {
        let calendar = MarketCalendar::default();

        // New Year's Day 2024 (January 1, 2024) at 10:00 AM ET
        let dt = Eastern.with_ymd_and_hms(2024, 1, 1, 10, 0, 0).unwrap().with_timezone(&Utc);
        let timestamp = dt.timestamp();

        assert!(!calendar.is_trading_allowed(timestamp));

        let session = calendar.get_session_info(dt);
        assert_eq!(session.session, MarketSession::Closed);
        assert!(session.is_holiday);
        assert_eq!(session.holiday_name, Some("New Year's Day".to_string()));
    }

    #[test]
    fn test_early_close_holiday() {
        let calendar = MarketCalendar::default();

        // Day after Thanksgiving 2024 (November 29, 2024) at 12:00 PM ET
        let dt = Eastern.with_ymd_and_hms(2024, 11, 29, 12, 0, 0).unwrap().with_timezone(&Utc);
        let timestamp = dt.timestamp();

        // Should be allowed during regular hours
        assert!(calendar.is_trading_allowed(timestamp));

        let session = calendar.get_session_info(dt);
        assert_eq!(session.session, MarketSession::Regular);
        assert!(session.is_holiday);

        // But not after 1:00 PM ET
        let dt_after = Eastern.with_ymd_and_hms(2024, 11, 29, 14, 0, 0).unwrap().with_timezone(&Utc);
        let session_after = calendar.get_session_info(dt_after);
        assert_eq!(session_after.session, MarketSession::Closed);
    }

    #[test]
    fn test_weekend_blocking() {
        let calendar = MarketCalendar::default();

        // Saturday, January 6, 2024 at 10:00 AM ET
        let dt = Eastern.with_ymd_and_hms(2024, 1, 6, 10, 0, 0).unwrap().with_timezone(&Utc);
        let timestamp = dt.timestamp();

        assert!(!calendar.is_trading_allowed(timestamp));

        let session = calendar.get_session_info(dt);
        assert_eq!(session.session, MarketSession::Closed);
        assert!(!session.is_holiday);
    }

    #[test]
    fn test_extended_hours_configuration() {
        let mut calendar = MarketCalendar::default()
            .with_extended_hours(true, true);

        // Tuesday, January 2, 2024 at 5:00 AM ET (pre-market)
        let dt = Eastern.with_ymd_and_hms(2024, 1, 2, 5, 0, 0).unwrap().with_timezone(&Utc);
        let timestamp = dt.timestamp();

        assert!(calendar.is_trading_allowed(timestamp));

        let session = calendar.get_session_info(dt);
        assert_eq!(session.session, MarketSession::PreMarket);

        // Tuesday, January 2, 2024 at 6:00 PM ET (after-hours)
        let dt_ah = Eastern.with_ymd_and_hms(2024, 1, 2, 18, 0, 0).unwrap().with_timezone(&Utc);
        let timestamp_ah = dt_ah.timestamp();

        assert!(calendar.is_trading_allowed(timestamp_ah));

        let session_ah = calendar.get_session_info(dt_ah);
        assert_eq!(session_ah.session, MarketSession::AfterHours);
    }

    #[test]
    fn test_holiday_trading_override() {
        let mut calendar = MarketCalendar::default()
            .with_holiday_trading(true);

        // New Year's Day 2024 (January 1, 2024) at 10:00 AM ET
        let dt = Eastern.with_ymd_and_hms(2024, 1, 1, 10, 0, 0).unwrap().with_timezone(&Utc);
        let timestamp = dt.timestamp();

        // Should be allowed with holiday trading enabled
        assert!(calendar.is_trading_allowed(timestamp));
    }

    #[test]
    fn test_custom_holiday() {
        let mut calendar = MarketCalendar::default();

        // Add custom holiday on a weekday (Monday, June 17, 2024)
        let custom_date = NaiveDate::from_ymd_opt(2024, 6, 17).unwrap();
        calendar.add_holiday(custom_date, "Custom Holiday".to_string(), HolidayType::Full);

        // Test that the custom holiday blocks trading
        let dt = Eastern.with_ymd_and_hms(2024, 6, 17, 10, 0, 0).unwrap().with_timezone(&Utc);
        let timestamp = dt.timestamp();

        assert!(!calendar.is_trading_allowed(timestamp));

        let session = calendar.get_session_info(dt);
        assert_eq!(session.session, MarketSession::Closed);
        assert!(session.is_holiday);
        assert_eq!(session.holiday_name, Some("Custom Holiday".to_string()));
    }
}
