/**
 * Berifica — Verificador de billetes de Serie B para Bolivia
 *
 * Validates Bolivian banknotes (Serie B, Bs 10, Bs 20, Bs 50) against the
 * ranges invalidated by the Banco Central de Bolivia (BCB) following the
 * airplane accident on February 27, 2026.
 *
 * Data source: Official BCB publication
 * "NÚMEROS DE SERIE DE LOS BILLETES DE LA SERIE B QUE NO TIENEN VALOR LEGAL"
 * https://www.bcb.gob.bo
 */

"use strict";

/**
 * Invalid serial number ranges per denomination.
 * Each entry is [from, to] (inclusive).
 * The numbers are the numeric portion of the serial (without the "B" prefix).
 */
const INVALID_RANGES = {
  /** Bs 50 — 10 ranges */
  "50": [
    [67250001, 67700000],
    [69050001, 69500000],
    [69500001, 69950000],
    [69950001, 70400000],
    [70400001, 70850000],
    [70850001, 71300000],
    [76310012, 85139995],
    [86400001, 86850000],
    [90900001, 91350000],
    [91800001, 92250000],
  ],
  /** Bs 20 — 16 ranges */
  "20": [
    [87280145,  91646549],
    [96650001,  97100000],
    [99800001,  100250000],
    [100250001, 100700000],
    [109250001, 109700000],
    [110600001, 111050000],
    [111050001, 111500000],
    [111950001, 112400000],
    [112400001, 112850000],
    [112850001, 113300000],
    [114200001, 114650000],
    [114650001, 115100000],
    [115100001, 115550000],
    [118700001, 119150000],
    [119150001, 119600000],
    [120500001, 120950000],
  ],
  /** Bs 10 — 12 ranges */
  "10": [
    [77100001,  77550000],
    [78000001,  78450000],
    [78900001,  96350000],
    [96350001,  96800000],
    [96800001,  97250000],
    [98150001,  98600000],
    [104900001, 105350000],
    [105350001, 105800000],
    [106700001, 107150000],
    [107600001, 108050000],
    [108050001, 108500000],
    [109400001, 109850000],
  ],
};

/** Denominations affected by the BCB invalidation measure. */
const AFFECTED_DENOMINATIONS = ["10", "20", "50"];

/**
 * Check if a numeric serial falls within any invalid range for a denomination.
 *
 * @param {string} denomination - "10", "20", or "50"
 * @param {number} serialNumber - The numeric portion of the serial
 * @returns {boolean} True if the serial is in an invalid range
 */
function isInvalidRange(denomination, serialNumber) {
  const ranges = INVALID_RANGES[denomination];
  if (!ranges) return false;
  return ranges.some(([from, to]) => serialNumber >= from && serialNumber <= to);
}

/**
 * Validate a Serie B banknote from Bolivia.
 *
 * @param {string|number} denomination - Banknote denomination: "10", "20", or "50"
 * @param {string|number} serialNumber - Numeric serial number (digits only, without the "B" prefix)
 * @param {string} [seriesLetter="B"] - Series letter printed on the banknote
 * @returns {{ valid: boolean, invalidated: boolean, message: string, denomination: string, serial: string, series: string }}
 */
function validate(denomination, serialNumber, seriesLetter = "B") {
  const denom = String(denomination);
  const serial = String(serialNumber).replace(/\D/g, "");
  const series = String(seriesLetter).toUpperCase();

  if (!serial || serial.length < 7) {
    return {
      valid: false,
      invalidated: false,
      message: "Por favor ingresa un número de serie válido (mínimo 7 dígitos).",
      denomination: denom,
      serial,
      series,
    };
  }

  if (!AFFECTED_DENOMINATIONS.includes(denom)) {
    return {
      valid: true,
      invalidated: false,
      message: `Los billetes de Bs ${denom} no fueron afectados por la medida del BCB.`,
      denomination: denom,
      serial,
      series,
    };
  }

  if (series !== "B") {
    return {
      valid: true,
      invalidated: false,
      message: `Este billete pertenece a la Serie ${series}. Solo la Serie B fue afectada por la medida del BCB.`,
      denomination: denom,
      serial,
      series,
    };
  }

  const numericPart = parseInt(serial, 10);

  if (isNaN(numericPart)) {
    return {
      valid: false,
      invalidated: false,
      message: "No se pudo interpretar el número de serie.",
      denomination: denom,
      serial,
      series,
    };
  }

  if (isInvalidRange(denom, numericPart)) {
    return {
      valid: false,
      invalidated: true,
      message: "Este billete se encuentra en la lista de billetes invalidados por el BCB.",
      denomination: denom,
      serial,
      series,
    };
  }

  return {
    valid: true,
    invalidated: false,
    message: "Este billete NO se encuentra en la lista de billetes invalidados por el BCB.",
    denomination: denom,
    serial,
    series,
  };
}

export { validate, isInvalidRange, AFFECTED_DENOMINATIONS, INVALID_RANGES };
