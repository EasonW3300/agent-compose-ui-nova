import { Link, Outlet, useLocation } from 'react-router-dom';
import { NAV_ITEMS } from './navItems';
import { AuthOverlay } from './AuthOverlay';

// NAV_ITEMS keeps route labels and destinations centralized so the visual rail cannot drift from routing.
// AuthOverlay remains outside the scrolling content region so authentication always blocks the whole console.
export function ConsoleLayout() {
  const location = useLocation();
  return (
    <div className="console-layout">
      <aside className="console-layout__rail">
        <div className="console-layout__brand">
          <span className="console-layout__brand-mark" aria-hidden="true">AC</span>
          <div>
            <strong className="console-layout__brand-name">Agent Compose</strong>
            <span className="console-layout__brand-subtitle">本机 AI 工作台</span>
          </div>
        </div>
        <nav aria-label="主导航">
          <ul>
            {NAV_ITEMS.map((item) => {
              const active = item.exact
                ? location.pathname === item.to
                : location.pathname.startsWith(item.to);
              return (
                <li key={item.to}>
                  <Link to={item.to} aria-current={active ? 'page' : undefined}>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
      <main className="console-layout__content">
        <Outlet />
      </main>
      <AuthOverlay />
    </div>
  );
}
