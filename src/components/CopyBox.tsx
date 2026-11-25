"use client";

import { useState } from "react";

export default function CopyBox({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="stack">
      <pre className="summary">{text}</pre>
      <div>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "Đã chép ✓" : "Chép tin nhắn"}
        </button>
      </div>
    </div>
  );
}
