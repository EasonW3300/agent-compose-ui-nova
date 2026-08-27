import { Link, Outlet, useLocation } from 'react-router-dom';

export const NAV_ITEMS = [
  { to: '/console', label: '首页', exact: true },
  { to: '/console/agents', label: '我的 AI 助手', exact: false },
  { to: '/console/runs', label: '运行记录', exact: false },
  { to: '/console/resources', label: '资源中心', exact: false },
  { to: '/console/settings', label: '设置', exact: false },
] as const;

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
