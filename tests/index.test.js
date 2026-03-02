import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validate, isInvalidRange, AFFECTED_DENOMINATIONS } from "../src/index.js";

describe("AFFECTED_DENOMINATIONS", () => {
  it("includes Bs 10, Bs 20 and Bs 50", () => {
    assert.deepEqual(AFFECTED_DENOMINATIONS, ["10", "20", "50"]);
  });
});

describe("isInvalidRange()", () => {
  it("returns true for a Bs 10 serial in an invalid range", () => {
    assert.equal(isInvalidRange("10", 77300000), true);
  });

  it("returns false for a Bs 10 serial outside all invalid ranges", () => {
    assert.equal(isInvalidRange("10", 70000000), false);
  });

  it("returns true for a Bs 20 serial in an invalid range", () => {
    assert.equal(isInvalidRange("20", 90000000), true);
  });

  it("returns false for a Bs 20 serial outside all invalid ranges", () => {
    assert.equal(isInvalidRange("20", 80000000), false);
  });

  it("returns true for a Bs 50 serial in an invalid range", () => {
    assert.equal(isInvalidRange("50", 67500000), true);
  });

  it("returns false for a Bs 50 serial outside all invalid ranges", () => {
    assert.equal(isInvalidRange("50", 60000000), false);
  });

  it("returns false for an unknown denomination", () => {
    assert.equal(isInvalidRange("100", 90000000), false);
  });

  it("returns true for a serial exactly at the start of a range (inclusive)", () => {
    assert.equal(isInvalidRange("10", 77100001), true);
  });

  it("returns true for a serial exactly at the end of a range (inclusive)", () => {
    assert.equal(isInvalidRange("10", 77550000), true);
  });

  it("returns false for a serial just before the start of a range", () => {
    assert.equal(isInvalidRange("10", 77100000), false);
  });

  it("returns false for a serial just after the end of a range", () => {
    assert.equal(isInvalidRange("10", 77550001), false);
  });
});

describe("validate()", () => {
  describe("Bs 10 — Serie B", () => {
    it("returns invalidated=true for a serial in an invalid range", () => {
      const result = validate("10", "80000000", "B");
      assert.equal(result.invalidated, true);
      assert.equal(result.valid, false);
    });

    it("returns valid=true for a serial outside all invalid ranges", () => {
      const result = validate("10", "70000000", "B");
      assert.equal(result.invalidated, false);
      assert.equal(result.valid, true);
    });

    it("returns valid=true for a serial that contains non-digit characters (strips them)", () => {
      const result = validate("10", "70,000,000", "B");
      assert.equal(result.valid, true);
      assert.equal(result.serial, "70000000");
    });
  });

  describe("Bs 20 — Serie B", () => {
    it("returns invalidated=true for a serial in an invalid range", () => {
      const result = validate("20", "90000000", "B");
      assert.equal(result.invalidated, true);
      assert.equal(result.valid, false);
    });

    it("returns valid=true for a serial outside all invalid ranges", () => {
      const result = validate("20", "80000000", "B");
      assert.equal(result.invalidated, false);
      assert.equal(result.valid, true);
    });
  });

  describe("Bs 50 — Serie B", () => {
    it("returns invalidated=true for a serial in an invalid range", () => {
      const result = validate("50", "67500000", "B");
      assert.equal(result.invalidated, true);
      assert.equal(result.valid, false);
    });

    it("returns valid=true for a serial outside all invalid ranges", () => {
      const result = validate("50", "60000000", "B");
      assert.equal(result.invalidated, false);
      assert.equal(result.valid, true);
    });
  });

  describe("Non-affected denominations", () => {
    it("returns valid=true for Bs 100 regardless of serial", () => {
      const result = validate("100", "90000000", "B");
      assert.equal(result.valid, true);
      assert.equal(result.invalidated, false);
    });

    it("returns valid=true for Bs 200 regardless of serial", () => {
      const result = validate("200", "90000000", "B");
      assert.equal(result.valid, true);
      assert.equal(result.invalidated, false);
    });
  });

  describe("Non-B series", () => {
    it("returns valid=true for a Serie A banknote even if serial would be invalid for Serie B", () => {
      const result = validate("10", "80000000", "A");
      assert.equal(result.valid, true);
      assert.equal(result.invalidated, false);
    });

    it("returns valid=true for a Serie C banknote", () => {
      const result = validate("20", "90000000", "C");
      assert.equal(result.valid, true);
      assert.equal(result.invalidated, false);
    });
  });

  describe("Input validation", () => {
    it("returns valid=false when serial number has fewer than 7 digits", () => {
      const result = validate("10", "123456", "B");
      assert.equal(result.valid, false);
      assert.equal(result.invalidated, false);
    });

    it("uses 'B' as the default series letter", () => {
      const result = validate("50", "67500000");
      assert.equal(result.series, "B");
    });

    it("accepts numeric denomination argument", () => {
      const result = validate(10, "80000000", "B");
      assert.equal(result.denomination, "10");
    });
  });
});
