import { useState, useRef, useEffect } from 'react';
import './App.css';
import TrainTab from './TrainTab';
import FuelTab from './FuelTab';
import BodyTab from './BodyTab';
import GainsTab from './GainsTab';
import ProfileModal from './ProfileModal';

const TABS = ['Train', 'Fuel', 'Body', 'Gains'];

export default function App() {
  const [tabIndex, setTabIndex]       = useState(0);
  const [showProfile, setShowProfile] = useState(false);

  const sliderRef      = useRef(null);
  const touchStartX    = useRef(0);
  const touchStartY    = useRef(0);
  const lockedVertical = useRef(false);
  const dragging       = useRef(false);
  const tabIndexRef    = useRef(0);

  // Keep ref in sync so touch handlers always see the current tab index
  useEffect(() => { tabIndexRef.current = tabIndex; }, [tabIndex]);

  // Animate slider whenever tab changes (e.g. via nav button tap)
  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return;
    el.style.transition = 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)';
    el.style.transform  = `translateX(${-tabIndex * 100}vw)`;
  }, [tabIndex]);

  // Wire up touch handlers — touchmove must be non-passive so we can preventDefault
  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return;

    const onTouchStart = e => {
      touchStartX.current    = e.touches[0].clientX;
      touchStartY.current    = e.touches[0].clientY;
      lockedVertical.current = false;
      dragging.current       = false;
    };

    const onTouchMove = e => {
      if (lockedVertical.current) return;

      const dx = e.touches[0].clientX - touchStartX.current;
      const dy = e.touches[0].clientY - touchStartY.current;

      // Decide direction on first significant movement
      if (!dragging.current) {
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 6) {
          lockedVertical.current = true;
          return;
        }
        if (Math.abs(dx) <= 6) return;
        dragging.current = true;
      }

      e.preventDefault(); // block vertical scroll while swiping horizontally

      const idx     = tabIndexRef.current;
      const atStart = idx === 0 && dx > 0;
      const atEnd   = idx === TABS.length - 1 && dx < 0;
      const px      = (atStart || atEnd) ? dx * 0.15 : dx; // rubber-band at edges

      el.style.transition = 'none';
      el.style.transform  = `translateX(calc(${-idx * 100}vw + ${px}px))`;
    };

    const onTouchEnd = e => {
      if (!dragging.current) return;
      dragging.current = false;

      const dx        = e.changedTouches[0].clientX - touchStartX.current;
      const threshold = window.innerWidth * 0.25;
      const idx       = tabIndexRef.current;

      let next = idx;
      if      (dx < -threshold && idx < TABS.length - 1) next = idx + 1;
      else if (dx >  threshold && idx > 0)                next = idx - 1;

      el.style.transition = 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)';
      el.style.transform  = `translateX(${-next * 100}vw)`;

      if (next !== idx) setTabIndex(next);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true  });
    el.addEventListener('touchmove',  onTouchMove,  { passive: false });
    el.addEventListener('touchend',   onTouchEnd,   { passive: true  });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove',  onTouchMove);
      el.removeEventListener('touchend',   onTouchEnd);
    };
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <span className="logo-chip">GZ</span>
        <h1 className="app-title">GAINZ TRACKER</h1>
        <button className="btn-profile" onClick={() => setShowProfile(true)}>Profile</button>
      </header>

      <nav className="tab-bar">
        {TABS.map((t, i) => (
          <button
            key={t}
            className={`tab-btn${tabIndex === i ? ' active' : ''}`}
            onClick={() => setTabIndex(i)}
          >
            {t}
          </button>
        ))}
      </nav>

      <main className="tab-content">
        <div className="tab-slider" ref={sliderRef}>
          <div className="tab-slide"><TrainTab /></div>
          <div className="tab-slide"><FuelTab /></div>
          <div className="tab-slide"><BodyTab /></div>
          <div className="tab-slide"><GainsTab /></div>
        </div>
      </main>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </div>
  );
}
