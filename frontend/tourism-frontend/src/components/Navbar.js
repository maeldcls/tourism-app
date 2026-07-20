import { Link, useLocation } from 'react-router-dom';
import '../css/Navbar.css';

const NAV_ITEMS = [
  {
    path: '/',
    label: 'Accueil',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
      </svg>
    ),
  },
  {
    path: '/destinations',
    label: 'Destinations',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
      </svg>
    ),
  },
  {
    path: '/map',
    label: 'Carte',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z" />
      </svg>
    ),
  },
  {
    path: '/travel',
    label: 'Voyages',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
      </svg>
    ),
  },
  {
    path: '/profile',
    label: 'Profil',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
      </svg>
    ),
  },
];

// Doit rester égal au padding horizontal de .navbar (Navbar.css) : le slider est
// positionné en % de la boîte complète de .navbar, alors que les items flex sont
// resserrés par ce padding — sans le compenser ici, le rond dérive vers l'extérieur.
const NAV_PADDING = 6;

export default function Navbar() {
  const { pathname } = useLocation();
  const activeIndex = NAV_ITEMS.findIndex(({ path }) => path === pathname);
  const itemFraction = (activeIndex + 0.5) / NAV_ITEMS.length;

  return (
    <nav className="navbar">
      {activeIndex !== -1 && (
        <span
          className="navbar-slider"
          style={{ left: `calc(${NAV_PADDING}px + ${itemFraction} * (100% - ${NAV_PADDING * 2}px))` }}
        />
      )}
      {NAV_ITEMS.map(({ path, label, icon }) => {
        const active = pathname === path;
        return (
          <Link key={path} to={path} className={`navbar-item${active ? ' navbar-item--active' : ''}`}>
            <span className="navbar-icon">{icon}</span>
            <span className="navbar-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
