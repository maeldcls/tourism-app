import { Link, useLocation } from 'react-router-dom';
import '../css/AdminNav.css';

const ADMIN_LINKS = [
  { to: '/admin/comments', label: 'Commentaires' },
  { to: '/admin/tags', label: 'Tags' },
  { to: '/admin/photos', label: 'Photos' },
  { to: '/admin/featured-destinations', label: 'Destinations' },
];

export default function AdminNav() {
  const { pathname } = useLocation();

  return (
    <nav className="admin-nav" aria-label="Navigation admin">
      {ADMIN_LINKS.map(link => (
        <Link
          key={link.to}
          to={link.to}
          className={`admin-nav-link${pathname === link.to ? ' admin-nav-link--active' : ''}`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
