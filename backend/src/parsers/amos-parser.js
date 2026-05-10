function parseAmosRows(text) {
  if (typeof text !== "string" || !text.trim()) {
    return [];
  }

  let header = null;
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (!line.startsWith("#")) return true;
      const tokens = line.replace(/^#+\s*/, "").split(/\s+/).filter(Boolean);
      if (tokens.includes("TM") || tokens.includes("YYMMDDHHMI")) {
        header = tokens;
      }
      return false;
    })
    .map((line) => {
      const fields = line.split(/\s+/);
      if (fields.length < 13) return null;

      const tm = fields[1];
      const rnRaw = Number(fields[12]);
      if (!/^\d{12}$/.test(tm) || !Number.isFinite(rnRaw)) {
        return null;
      }

      const named = {};
      if (Array.isArray(header) && header.length === fields.length) {
        header.forEach((name, index) => {
          named[String(name).toLowerCase()] = fields[index];
        });
      }

      return { tm, rn_raw: rnRaw, fields, named };
    })
    .filter(Boolean);
}

function parseTmToMs(tm) {
  if (!/^\d{12}$/.test(tm)) return NaN;
  const y = Number(tm.slice(0, 4));
  const m = Number(tm.slice(4, 6));
  const d = Number(tm.slice(6, 8));
  const hh = Number(tm.slice(8, 10));
  const mi = Number(tm.slice(10, 12));
  return Date.UTC(y, m - 1, d, hh - 9, mi, 0, 0);
}

function pickDailyRainfallAtTime(rows, targetTm, toleranceMinutes = 60) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const sorted = rows.slice().sort((a, b) => a.tm.localeCompare(b.tm));
  const exact = sorted.find((row) => row.tm === targetTm);
  const candidate = exact || sorted.filter((row) => row.tm <= targetTm).slice(-1)[0] || sorted[sorted.length - 1];
  if (!candidate) {
    return null;
  }

  const targetMs = parseTmToMs(targetTm);
  const obsMs = parseTmToMs(candidate.tm);
  const diffMin = Number.isFinite(targetMs) && Number.isFinite(obsMs)
    ? Math.abs(targetMs - obsMs) / 60000
    : Infinity;
  const stale = !Number.isFinite(diffMin) || diffMin > toleranceMinutes;

  if (candidate.rn_raw === -99999 || stale) {
    return {
      mm: null,
      rn_raw: candidate.rn_raw,
      observed_tm_kst: candidate.tm,
      target_tm_kst: targetTm,
      stale
    };
  }

  return {
    mm: candidate.rn_raw / 10,
    rn_raw: candidate.rn_raw,
    observed_tm_kst: candidate.tm,
    target_tm_kst: targetTm,
    stale
  };
}

function numberFromNamed(row, names) {
  for (const name of names) {
    const raw = row?.named?.[name.toLowerCase()];
    const value = Number(raw);
    if (Number.isFinite(value) && value !== -99999) return value;
  }
  return null;
}

function validRawNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed !== -99999 ? parsed : null;
}

function scaled(value, divisor = 1) {
  const raw = validRawNumber(value);
  return raw == null ? null : raw / divisor;
}

function fixedColumnObservation(row) {
  const fields = row?.fields || [];
  if (fields.length < 27) return {};

  return {
    l_vis: scaled(fields[2]),
    r_vis: scaled(fields[3]),
    l_rvr: scaled(fields[4]),
    r_rvr: scaled(fields[5]),
    cloud_min_m: scaled(fields[6]),
    temperature_c: scaled(fields[7], 10),
    dewpoint_c: scaled(fields[8], 10),
    humidity_pct: scaled(fields[9]),
    sea_level_pressure_hpa: scaled(fields[10], 10),
    station_pressure_hpa: scaled(fields[11], 10),
    rainfall_mm: scaled(fields[12], 10),
    wind_2m: null,
    wind_10m: null,
    runways: [
      {
        side: "L",
        visibility_m: scaled(fields[2]),
        rvr_m: scaled(fields[4]),
        cloud_min_m: scaled(fields[6]),
        wind_direction: scaled(fields[15]),
        wind_direction_max: scaled(fields[16]),
        wind_direction_min: scaled(fields[17]),
        wind_speed: scaled(fields[18], 10),
        wind_speed_max: scaled(fields[19], 10),
        wind_speed_min: scaled(fields[20], 10),
      },
      {
        side: "R",
        visibility_m: scaled(fields[3]),
        rvr_m: scaled(fields[5]),
        cloud_min_m: scaled(fields[6]),
        wind_direction: scaled(fields[21]),
        wind_direction_max: scaled(fields[22]),
        wind_direction_min: scaled(fields[23]),
        wind_speed: scaled(fields[24], 10),
        wind_speed_max: scaled(fields[25], 10),
        wind_speed_min: scaled(fields[26], 10),
      },
    ],
  };
}

function pickObservationAtTime(rows, targetTm, toleranceMinutes = 60) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const sorted = rows.slice().sort((a, b) => a.tm.localeCompare(b.tm));
  const exact = sorted.find((row) => row.tm === targetTm);
  const candidate = exact || sorted.filter((row) => row.tm <= targetTm).slice(-1)[0] || sorted[sorted.length - 1];
  if (!candidate) return null;

  const targetMs = parseTmToMs(targetTm);
  const obsMs = parseTmToMs(candidate.tm);
  const diffMin = Number.isFinite(targetMs) && Number.isFinite(obsMs)
    ? Math.abs(targetMs - obsMs) / 60000
    : Infinity;
  if (!Number.isFinite(diffMin) || diffMin > toleranceMinutes) return null;

  return {
    observed_tm_kst: candidate.tm,
    ...fixedColumnObservation(candidate),
    qnh: numberFromNamed(candidate, ["qnh", "ps"]) ?? fixedColumnObservation(candidate).sea_level_pressure_hpa,
    raw_fields: candidate.fields,
    raw_named: candidate.named,
  };
}

export { parseAmosRows, pickDailyRainfallAtTime, pickObservationAtTime }
export default { parseAmosRows, pickDailyRainfallAtTime, pickObservationAtTime }
