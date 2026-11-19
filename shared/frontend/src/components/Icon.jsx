const paths = {
  device: "M5 4h14v12H5z M8 20h8 M12 16v4 M8 8h8 M8 12h3",
  radio: "M12 14v7 M8 21h8 M9 10a3 3 0 0 1 6 0 M6 7a7 7 0 0 1 12 0 M3 4a11 11 0 0 1 18 0 M12 10h.01",
  link: "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2",
  activity: "M2 12h5l3-8 4 16 3-8h5",
  settings: "M4 7h16 M4 17h16 M8 4v6 M16 14v6",
  refresh: "M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 14 6 M4 12a8 8 0 0 0 14 6",
  power: "M12 2v10 M6 5a9 9 0 1 0 12 0",
  signal: "M4 20v-3 M9 20v-7 M14 20V9 M19 20V4",
  ethernet: "M4 6h16v12h-5v3H9v-3H4z M8 6v5 M12 6v5 M16 6v5",
  check: "M5 12l4 4L19 6",
  arrow: "M4 12h16 M14 6l6 6-6 6",
  network: "M9 2h6v6H9z M2 16h6v6H2z M16 16h6v6h-6z M12 8v4 M5 16v-4h14v4",
  shield: "M12 2l8 4v6c0 5-8 10-8 10S4 17 4 12V6z M8 12l3 3 5-6",
  info: "M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
};

export default function Icon({ name, className = "" }) {
  return <svg className={`orion-icon ${className}`} width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d={paths[name] || paths.device} />
  </svg>;
}
