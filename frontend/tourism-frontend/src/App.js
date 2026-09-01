import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import './css/App.css';

import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Destinations from './pages/Destinations';
import MapPage from './pages/MapPage';
import Travel from './pages/Travel';
import Monument from './pages/Monument';
import Profile from './pages/Profile';
import UserProfile from './pages/UserProfile';
import Friends from './pages/Friends';
import VisitedPlaces from './pages/VisitedPlaces';
import Stats from './pages/Stats';
import Login from './pages/Login';
import Register from './pages/Register';
import AdminComments from './pages/AdminComments';
import AdminTags from './pages/AdminTags';
import AdminPhotos from './pages/AdminPhotos';

const NO_NAVBAR = ['/login', '/register'];

// Garde de routing : bloque l'accès aux pages /admin/* avant même leur montage
// (auparavant chaque page admin vérifiait is_admin elle-même, mais le routeur
// laissait n'importe qui naviguer dessus — la vérification n'était que côté UI).
function AdminRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_admin) return <Navigate to="/" replace />;
  return children;
}

function Layout() {
  const { pathname } = useLocation();
  const showNavbar = !NO_NAVBAR.includes(pathname);

  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/destinations" element={<Destinations />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/travel" element={<Travel />} />
        <Route path="/monument" element={<Monument />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/profile/:userId" element={<UserProfile />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/visited" element={<VisitedPlaces />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/admin" element={<Navigate to="/admin/comments" replace />} />
        <Route path="/admin/comments" element={<AdminRoute><AdminComments /></AdminRoute>} />
        <Route path="/admin/tags" element={<AdminRoute><AdminTags /></AdminRoute>} />
        <Route path="/admin/photos" element={<AdminRoute><AdminPhotos /></AdminRoute>} />
      </Routes>
      {showNavbar && <Navbar />}
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
