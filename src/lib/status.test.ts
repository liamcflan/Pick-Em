import { describe, expect, it } from "vitest";

import { buildInfo, overall, schemaState } from "./status";

describe("schemaState", () => {
  it("treats no error as present", () => {
    expect(schemaState(null)).toBe("present");
  });

  it("recognises a missing table from PostgREST or Postgres", () => {
    expect(schemaState({ code: "PGRST205", message: "Could not find the table" })).toBe("missing");
    expect(schemaState({ code: "42P01", message: 'relation "x" does not exist' })).toBe("missing");
    expect(schemaState({ code: "42703", message: "column profiles.x does not exist" })).toBe(
      "missing",
    );
    expect(schemaState({ code: null, message: "Could not find the table 'public.profiles'" })).toBe(
      "missing",
    );
  });

  it("counts a table this visitor may not read as present", () => {
    expect(
      schemaState({ code: "42501", message: "permission denied for table reminder_log" }),
    ).toBe("present");
  });

  it("reports anything else as an error", () => {
    expect(schemaState({ code: "PGRST301", message: "JWT expired" })).toBe("error");
  });
});

describe("buildInfo", () => {
  it("reads Vercel's system variables", () => {
    expect(
      buildInfo({
        VERCEL_ENV: "production",
        VERCEL_GIT_COMMIT_REF: "main",
        VERCEL_GIT_COMMIT_SHA: "e819beab37333bfe8589fd4b894f96d0018eacc2",
        VERCEL_GIT_COMMIT_MESSAGE: "Release: thing (#2)\n\nbody",
      }),
    ).toEqual({
      environment: "production",
      branch: "main",
      commit: "e819bea",
      message: "Release: thing (#2)",
    });
  });

  it("falls back outside Vercel", () => {
    expect(buildInfo({ NODE_ENV: "development" })).toEqual({
      environment: "development",
      branch: null,
      commit: null,
      message: null,
    });
  });
});

describe("overall", () => {
  it("is the worst state", () => {
    const c = (state: "ok" | "warn" | "fail") => ({ label: "x", state, detail: "" });
    expect(overall([c("ok"), c("ok")])).toBe("ok");
    expect(overall([c("ok"), c("warn")])).toBe("warn");
    expect(overall([c("warn"), c("fail")])).toBe("fail");
  });
});
