const icons = {
  single: <>
    <circle cx="12" cy="6.5" r="3.5" />
    <path d="M5 20v-2.5a7 7 0 0 1 14 0V20z" />
  </>,
  coop: <>
    <path d="M16 10a3 3 0 1 0-2.3-4.9 5.3 5.3 0 0 1 0 4 3 3 0 0 0 2.3.9Zm1.9 8H22v-1.5a5.5 5.5 0 0 0-6.8-5.4 8.5 8.5 0 0 1 2.7 6.4Z" opacity=".65" />
    <circle cx="8.5" cy="7" r="3.5" />
    <path d="M2 20v-2.5a6.5 6.5 0 0 1 13 0V20z" />
  </>,
  leaderboards: <path d="M2 20h20v1H2zM3 12h4v7H3zM10 3h4v16h-4zM17 7h4v12h-4z" />,
  profile: <path fillRule="evenodd" d="M5 4h14l2 2v12l-2 2H5l-2-2V6zm3 6a2 2 0 1 0 4 0 2 2 0 0 0-4 0Zm-2 6.5h8a4 4 0 0 0-8 0Zm9-7h3V8h-3zm0 4h3V12h-3z" />,
  achievements: <path fillRule="evenodd" d="M7 3h10v2h5v2a6 6 0 0 1-5.5 6A5 5 0 0 1 13 16v3h4v2H7v-2h4v-3a5 5 0 0 1-3.5-3A6 6 0 0 1 2 7V5h5zm0 4H4a4 4 0 0 0 3 3.9zm10 0v3.9A4 4 0 0 0 20 7z" />,
  missions: <path fillRule="evenodd" d="M8 4h2a2 2 0 0 1 4 0h2v2h3l1 1v13l-1 1H5l-1-1V7l1-1h3zm-1 6 2 2 4-4-1-1-3 3-1-1zm7 1h3V9h-3zm-7 5 2 2 4-4-1-1-3 3-1-1zm7 1h3v-2h-3z" />,
  hangar: <>
    <path d="m3 8 9-5 9 5v12h-2V9l-7-4-7 4v11H3z" opacity=".65" />
    <path d="m12 8 5 10-4-1 1 3h-4l1-3-4 1z" />
  </>,
  codex: <path d="M3 4h4a7 7 0 0 1 4 1.4V21a7 7 0 0 0-4-1.4H3zm10 1.4A7 7 0 0 1 17 4h4v15.6h-4a7 7 0 0 0-4 1.4z" />,
  almanac: <>
    <path d="M2 8V3h5v2H4v3zm15-5h5v5h-2V5h-3zM2 16h2v3h3v2H2zm18 0h2v5h-5v-2h3z" opacity=".65" />
    <path fillRule="evenodd" d="M7.5 6.5 10 9h4l2.5-2.5L18 8l-2 2 2 3v5h-3v-2H9v2H6v-5l2-3-2-2zM8 12v2h2v-2zm6 0v2h2v-2z" />
  </>,
}

export function HomeMenuIcon({ name }: { name: keyof typeof icons }) {
  return <svg className="home-menu-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">{icons[name]}</svg>
}
