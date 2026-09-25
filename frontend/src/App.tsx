import RegisterPackageScreen from './features/packages/components/RegisterPackageScreen';
import { useState } from 'react';
import { USE_MOCK_DATA } from './shared/config/environment';
import './App.css';

function App() {
  const [screen, setScreen] = useState<'home' | 'register'>('home');

  if (screen === 'register') {
    return <RegisterPackageScreen onBack={() => setScreen('home')} />;
  }

  return (
    <main className="home-screen">
      <nav className="topbar" aria-label="Navegación principal">
        <span className="brand-mark">SLS</span>
        <span className="brand-name">Smart Logistics</span>
      </nav>
      <section className="home-content">
        <p className="eyebrow">OPERACIONES LOGÍSTICAS</p>
        <h1>Todo tu flujo de paquetes, en un solo lugar.</h1>
        <p className="home-copy">Registra envíos rápidamente y mantén cada guía lista para su siguiente movimiento.</p>
        <button className="primary-action" type="button" onClick={() => setScreen('register')}>
          Registrar paquete
        </button>
      </section>
      <footer className="home-footer">
        Panel de operaciones · {USE_MOCK_DATA ? 'Datos de prueba activos' : 'API configurada'}
      </footer>
    </main>
  );
}

export default App;
