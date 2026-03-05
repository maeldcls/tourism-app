import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';

import Home from './pages/Home';
import Destinations from './pages/Destinations';
import MapPage from './pages/MapPage';
import Travel from './pages/Travel';
import Monument from './pages/Monument';
import Profile from './pages/Profile';
import Stats from './pages/Stats';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/destinations" element={<Destinations />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/travel" element={<Travel />} />
        <Route path="/monument" element={<Monument />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/stats" element={<Stats />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
