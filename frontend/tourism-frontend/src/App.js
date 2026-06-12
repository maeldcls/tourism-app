import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import './css/App.css';

import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Destinations from './pages/Destinations';
import MapPage from './pages/MapPage';
import Travel from './pages/Travel';
import Monument from './pages/Monument';
import Profile from './pages/Profile';
import Stats from './pages/Stats';
import Login from './pages/Login';
import Register from './pages/Register';

const NO_NAVBAR = ['/login', '/register'];

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
        {/* <Route path="/stats" element={<Stats />} /> */}
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
