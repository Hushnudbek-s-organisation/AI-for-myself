export function AetherMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <defs>
        <linearGradient id="ag" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e8c991" />
          <stop offset="100%" stopColor="#8b9cff" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill="none" stroke="url(#ag)" strokeWidth="1.4" />
      <path
        d="M24 10 L34 36 H29.4 L27.2 30.2 H20.8 L18.6 36 H14 Z M22.2 26.4 H25.8 L24 21.4 Z"
        fill="url(#ag)"
      />
      <circle cx="38" cy="12" r="2.1" fill="#8b9cff" />
    </svg>
  );
}
