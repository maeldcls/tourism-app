import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';

import { AuthProvider } from './context/AuthContext';
import Home from './pages/Home';
import Destinations from './pages/Destinations';
import MapPage from './pages/MapPage';
import Travel from './pages/Travel';
import Monument from './pages/Monument';
import Profile from './pages/Profile';
import Stats from './pages/Stats';
import Login from './pages/Login';
import Register from './pages/Register';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/destinations" element={<Destinations />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/travel" element={<Travel />} />
          <Route path="/monument" element={<Monument />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/stats" element={<Stats />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
