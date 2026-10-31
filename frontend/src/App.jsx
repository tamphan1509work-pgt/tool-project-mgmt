import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Empty, Icon } from './components/ui.jsx';
import { LookupProvider, ToastProvider } from './context.jsx';
import { BugDetail, BugList } from './pages/Bugs.jsx';
import Dashboard from './pages/Dashboard.jsx';
import { MeetingDetail, MeetingList } from './pages/Meetings.jsx';
import { TaskDetail, TaskList } from './pages/Tasks.jsx';
import { TestCaseDetail, TestCaseList } from './pages/TestCases.jsx';

const NAV = [
  { to: '/', label: 'Tổng quan', icon: 'dashboard', end: true },
  { to: '/meetings', label: 'Meeting minutes', icon: 'meeting' },
  { to: '/tasks', label: 'Task', icon: 'task' },
  { to: '/test-cases', label: 'Test case', icon: 'test' },
  { to: '/bugs', label: 'Bug', icon: 'bug' },
];

const TITLES = {
  '': 'Tổng quan dự án',
  meetings: 'Quản lý meeting minutes',
  tasks: 'Quản lý task',
  'test-cases': 'Quản lý test case',
  bugs: 'Quản lý bug',
};

function Layout({ children }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const section = pathname.split('/')[1] ?? '';
  const title = TITLES[section] ?? '';

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.title = title ? `${title} · PM` : 'Quản lý dự án';
  }, [title]);

  return (
    <div className={`layout ${open ? 'nav-open' : ''}`}>
      <aside className="sidebar no-print">
        <Link to="/" className="brand">
          <span className="brand-logo">✓</span> Project Hub
        </Link>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
              <Icon name={n.icon} /> {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="nav-scrim no-print" onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar no-print">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Mở menu">
            <Icon name="menu" />
          </button>
          <h1 className="page-title">{title}</h1>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <LookupProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/meetings" element={<MeetingList />} />
            <Route path="/meetings/:id" element={<MeetingDetail />} />
            <Route path="/tasks" element={<TaskList />} />
            <Route path="/tasks/:id" element={<TaskDetail />} />
            <Route path="/test-cases" element={<TestCaseList />} />
            <Route path="/test-cases/:id" element={<TestCaseDetail />} />
            <Route path="/bugs" element={<BugList />} />
            <Route path="/bugs/:id" element={<BugDetail />} />
            <Route path="*" element={<Empty>Không tìm thấy trang.</Empty>} />
          </Routes>
        </Layout>
      </LookupProvider>
    </ToastProvider>
  );
}
