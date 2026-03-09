import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import PlannerPage from './pages/PlannerPage';
import PlantsPage from './pages/PlantsPage';
import VisualizePage from './pages/VisualizePage';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/planner" element={<PlannerPage />} />
            <Route path="/plants" element={<PlantsPage />} />
            <Route path="/visualize" element={<VisualizePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#1f2937',
              color: '#f9fafb',
              borderRadius: '10px',
            },
            success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
          }}
        />
      </div>
    </BrowserRouter>
  );
}
