"use client";

import Script from "next/script";

export function JsdWidget() {
  return (
    <Script
      src="https://jsd-widget.atlassian.com/assets/embed.js"
      data-jsd-embedded=""
      data-key="1a7ea065-2d41-4065-b0cb-c9806c978043"
      data-base-url="https://jsd-widget.atlassian.com"
      strategy="afterInteractive"
      onLoad={() => {
        // embed.js waits for DOMContentLoaded, which has already fired by the
        // time a client-injected script loads — re-dispatch it so the
        // widget's own listener (registered synchronously on script execution) fires.
        document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true, cancelable: true }));
      }}
    />
  );
}
