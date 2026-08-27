export const NAV_ITEMS = [
  { to: '/console', label: '首页', exact: true },
  { to: '/console/agents', label: '我的 AI 助手', exact: false },
  { to: '/console/runs', label: '运行记录', exact: false },
  { to: '/console/resources', label: '资源中心', exact: false },
  { to: '/console/settings', label: '设置', exact: false },
] as const;
