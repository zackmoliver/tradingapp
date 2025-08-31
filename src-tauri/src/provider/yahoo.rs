use chrono::{NaiveDate, NaiveDateTime};
use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct YBar {
    pub date: String, // MM/DD/YYYY
    pub o: f64,
    pub h: f64,
    pub l: f64,
    pub c: f64,
    pub v: f64,
}

fn to_epoch(d: &str) -> i64 {
    let parts: Vec<&str> = d.split('/').collect();
    let (m, d2, y) = (
        parts[0].parse::<u32>().unwrap(),
        parts[1].parse::<u32>().unwrap(),
        parts[2].parse::<i32>().unwrap(),
    );
    let nd = NaiveDate::from_ymd_opt(y, m, d2).unwrap();
    NaiveDateTime::new(nd, chrono::NaiveTime::from_hms_opt(0, 0, 0).unwrap())
        .and_utc()
        .timestamp()
}

pub async fn yahoo_history(symbol: String, start: String, end: String) -> Result<Vec<YBar>, String> {
    let p1 = to_epoch(&start);
    let p2 = to_epoch(&end) + 86400; // inclusive end
    let url = format!("https://query1.finance.yahoo.com/v7/finance/download/{}?period1={}&period2={}&interval=1d&events=history&includeAdjustedClose=true", symbol, p1, p2);

    let text = reqwest::Client::new()
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let mut rdr = csv::Reader::from_reader(text.as_bytes());
    let mut out = vec![];
    for rec in rdr.records() {
        let r = rec.map_err(|e| e.to_string())?;
        if &r[0] == "Date" {
            continue;
        }
        // YYYY-MM-DD → MM/DD/YYYY
        let parts: Vec<&str> = r[0].split('-').collect();
        let mmddyyyy = format!("{}/{}/{}", parts[1], parts[2], parts[0]);
        let o: f64 = r[1].parse().unwrap_or(0.0);
        let h: f64 = r[2].parse().unwrap_or(0.0);
        let l: f64 = r[3].parse().unwrap_or(0.0);
        let c: f64 = r[5].parse().unwrap_or_else(|_| r[4].parse().unwrap_or(0.0)); // AdjClose or Close
        let v: f64 = r[6].parse::<f64>().unwrap_or(0.0);
        out.push(YBar {
            date: mmddyyyy,
            o,
            h,
            l,
            c,
            v,
        });
    }
    Ok(out)
}
