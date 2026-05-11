import { useState, useRef, useEffect } from "react";

export default function Header({
  airports = [],
  selectedAirport,
  onAirportChange,
  airportLabel,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <header className="new-header">
      <div className="new-header-left">
        <div className="airport-dropdown" ref={ref}>
          <button
            className="airport-dropdown-btn"
            onClick={() => setOpen((p) => !p)}
          >
            <span className="airport-dropdown-icao">{airportLabel || selectedAirport || "----"}</span>
            <span className="airport-dropdown-caret">&#9660;</span>
          </button>
          {open && (
            <ul className="airport-dropdown-list">
              {airports.map((airport) => (
                <li
                  key={airport.icao}
                  className={airport.icao === selectedAirport ? "active" : ""}
                  onClick={() => {
                    onAirportChange?.(airport.icao);
                    setOpen(false);
                  }}
                >
                  {airport.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </header>
  );
}
