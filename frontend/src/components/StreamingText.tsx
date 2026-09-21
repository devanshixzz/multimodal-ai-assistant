"use client";

interface StreamingTextProps {
  text: string;
  isStreaming?: boolean;
  className?: string;
}

export default function StreamingText({
  text,
  isStreaming = false,
  className = "",
}: StreamingTextProps) {
  return (
    <div
      className={`whitespace-pre-wrap text-sm leading-6 text-slate-100 ${className}`}
    >
      {text}

      {isStreaming && (
        <span
          className="ml-1 inline-block h-4 w-1 animate-pulse rounded-full bg-blue-400 align-middle"
          aria-label="Generating response"
        />
      )}
    </div>
  );
}