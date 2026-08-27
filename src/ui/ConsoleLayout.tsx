import { Link, Outlet, useLocation } from 'react-router-dom';
import { NAV_ITEMS } from './navItems';

export function ConsoleLayout() {
  const location = useLocation();
  return (
    <div className="console-layout">
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
      <Outlet />
    </div>
  );
}
