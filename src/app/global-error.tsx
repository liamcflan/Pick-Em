"use client";

/**
 * Last-resort error page, used when the root layout itself fails. It replaces the whole document,
 * so it carries its own minimal styling instead of the app's stylesheet.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 16,
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <title>Something went wrong · 10K Pool HQ</title>
        <main style={{ maxWidth: "24rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem" }}>Something went wrong</h1>
          <p style={{ color: "#525252", lineHeight: 1.5 }}>
            10K Pool HQ could not load. Try again, or open the status page to see what is missing.
            {error.digest ? (
              <span style={{ display: "block", fontSize: 12, paddingTop: 4 }}>
                Reference: {error.digest}
              </span>
            ) : null}
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #d4d4d4" }}
          >
            Try again
          </button>{" "}
          {/* A full page load on purpose: the app's client router may be what failed. */}
          <a href="/status" style={{ padding: "8px 16px", color: "inherit" }}>
            Site status
          </a>
        </main>
      </body>
    </html>
  );
}
