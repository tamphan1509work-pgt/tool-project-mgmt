import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { resetDemo } from './api.js';
import { hashToPath, pathToHash } from './links.js';
import { Empty, Icon, Loading } from './components/ui.jsx';
import { ConfirmProvider, LookupProvider, ProjectProvider, ToastProvider, useConfirm, useProject } from './context.jsx';
import { BugDetail, BugList } from './pages/Bugs.jsx';
import { CategoryList } from './pages/Categories.jsx';
import Dashboard from './pages/Dashboard.jsx';
import { DocumentDetail, DocumentList } from './pages/Documents.jsx';
import { MeetingDetail, MeetingList } from './pages/Meetings.jsx';
import { MemberDetail, MemberList } from './pages/Members.jsx';
import { ProjectDetail, ProjectList } from './pages/Projects.jsx';
import { TaskDetail, TaskList } from './pages/Tasks.jsx';
import { TestCaseDetail, TestCaseList } from './pages/TestCases.jsx';

// Các mục quản lý theo dự án đang chọn
const NAV = [
  { to: '/', label: 'Tổng quan', icon: 'dashboard', end: true },
  { to: '/meetings', label: 'Meeting minutes', icon: 'meeting' },
  { to: '/tasks', label: 'Task', icon: 'task' },
  { to: '/test-cases', label: 'Test report', icon: 'test' },
  { to: '/bugs', label: 'Bug', icon: 'bug' },
];

const DOC_NAV = [
  { type: 'design', label: 'Thiết kế' },
  { type: 'specification', label: 'Tài liệu đặc tả' },
];

const TITLES = {
  '': 'Tổng quan dự án',
  projects: 'Quản lý dự án',
  members: 'Quản lý thành viên',
  categories: 'Danh mục dự án',
  meetings: 'Quản lý meeting minutes',
  tasks: 'Quản lý task',
  'test-cases': 'Test report',
  bugs: 'Quản lý bug',
  documents: 'Quản lý tài liệu',
};

function ProjectSwitcher() {
  const { projects, projectId, setProjectId } = useProject();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (!projects.length) return null;
  const change = (e) => {
    setProjectId(Number(e.target.value));
    // Đang xem chi tiết một bản ghi -> quay về danh sách của dự án mới
    const [, section, id] = pathname.split('/');
    if (id && !['projects', 'members'].includes(section)) navigate(`/${section}`);
  };
  return (
    <div className="project-switcher">
      <label htmlFor="project-switcher">Dự án đang làm việc</label>
      <select id="project-switcher" value={projectId ?? ''} onChange={change}>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.code} · {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function DocumentsNav() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const inDocs = pathname.startsWith('/documents');
  const type = inDocs && pathname === '/documents' ? (params.get('type') ?? '') : null;
  return (
    <>
      <Link to="/documents" className={`nav-link ${inDocs && !type ? 'active' : ''}`}>
        <Icon name="doc" /> Tài liệu
      </Link>
      {DOC_NAV.map((d) => (
        <Link
          key={d.type}
          to={`/documents?type=${d.type}`}
          className={`nav-link nav-sub ${type === d.type ? 'active' : ''}`}
        >
          {d.label}
        </Link>
      ))}
    </>
  );
}

/** Các trang theo dự án: cần có ít nhất một dự án */
function RequireProject({ children }) {
  const { loaded, projectId } = useProject();
  if (!loaded) return <Loading />;
  if (!projectId) {
    return (
      <Empty>
        Chưa có dự án nào. <Link to="/projects">Tạo dự án đầu tiên</Link> để bắt đầu quản lý meeting minutes, task, test
        report, bug và tài liệu.
      </Empty>
    );
  }
  return children;
}

/** Bản demo: giữ "#tên" trên thanh địa chỉ khớp với trang đang xem và ngược lại */
function DemoHashSync() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const name = pathToHash(pathname);
    try {
      window.history.replaceState(null, '', name ? `#${name}` : window.location.pathname + window.location.search);
    } catch {
      // khung nhúng có thể chặn; bỏ qua
    }
  }, [pathname]);
  useEffect(() => {
    const onHash = () => {
      const path = hashToPath(window.location.hash);
      if (path) navigate(path);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [navigate]);
  return null;
}

function DemoBanner({ onReset }) {
  const confirm = useConfirm();
  const reset = async () => {
    if (!(await confirm('Xoá mọi thay đổi và khôi phục dữ liệu mẫu ban đầu?', { confirmLabel: 'Khôi phục' }))) return;
    resetDemo();
    onReset();
  };
  return (
    <div className="demo-banner">
      Bản demo · dữ liệu chỉ lưu trong trình duyệt này
      <button className="btn btn-sm" onClick={reset}>
        Khôi phục dữ liệu mẫu
      </button>
    </div>
  );
}

function Layout({ children, onReset }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const section = pathname.split('/')[1] ?? '';
  const { project } = useProject();
  const base = TITLES[section] ?? '';
  const title = ['projects', 'members'].includes(section) || !project ? base : `${base} · ${project.code}`;

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
          <NavLink to="/projects" className="nav-link">
            <Icon name="folder" /> Dự án
          </NavLink>
          <NavLink to="/categories" className="nav-link nav-sub">
            Danh mục
          </NavLink>
          <NavLink to="/members" className="nav-link">
            <Icon name="people" /> Thành viên
          </NavLink>
          <ProjectSwitcher />
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
              <Icon name={n.icon} /> {n.label}
            </NavLink>
          ))}
          <DocumentsNav />
        </nav>
      </aside>
      <div className="nav-scrim no-print" onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar no-print">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Mở menu">
            <Icon name="menu" />
          </button>
          <h1 className="page-title">{title}</h1>
          {import.meta.env.MODE === 'demo' && <DemoBanner onReset={onReset} />}
          {import.meta.env.MODE === 'demo' && <DemoHashSync />}
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();
  // Đổi key để tải lại toàn bộ dữ liệu sau khi khôi phục dữ liệu mẫu (bản demo)
  const [generation, setGeneration] = useState(0);
  const onReset = () => {
    navigate('/');
    setGeneration((g) => g + 1);
  };
  return (
    <ToastProvider key={generation}>
      <ConfirmProvider>
        <ProjectProvider>
          <LookupProvider>
            <Layout onReset={onReset}>
              <Routes>
                <Route path="/projects" element={<ProjectList />} />
                <Route path="/projects/:id" element={<ProjectDetail />} />
                <Route path="/members" element={<MemberList />} />
                <Route path="/members/:id" element={<MemberDetail />} />
                <Route
                  path="/categories"
                  element={
                    <RequireProject>
                      <CategoryList />
                    </RequireProject>
                  }
                />
                <Route
                  path="/"
                  element={
                    <RequireProject>
                      <Dashboard />
                    </RequireProject>
                  }
                />
                <Route
                  path="/meetings"
                  element={
                    <RequireProject>
                      <MeetingList />
                    </RequireProject>
                  }
                />
                <Route
                  path="/meetings/:id"
                  element={
                    <RequireProject>
                      <MeetingDetail />
                    </RequireProject>
                  }
                />
                <Route
                  path="/tasks"
                  element={
                    <RequireProject>
                      <TaskList />
                    </RequireProject>
                  }
                />
                <Route
                  path="/tasks/:id"
                  element={
                    <RequireProject>
                      <TaskDetail />
                    </RequireProject>
                  }
                />
                <Route
                  path="/test-cases"
                  element={
                    <RequireProject>
                      <TestCaseList />
                    </RequireProject>
                  }
                />
                <Route
                  path="/test-cases/:id"
                  element={
                    <RequireProject>
                      <TestCaseDetail />
                    </RequireProject>
                  }
                />
                <Route
                  path="/bugs"
                  element={
                    <RequireProject>
                      <BugList />
                    </RequireProject>
                  }
                />
                <Route
                  path="/bugs/:id"
                  element={
                    <RequireProject>
                      <BugDetail />
                    </RequireProject>
                  }
                />
                <Route
                  path="/documents"
                  element={
                    <RequireProject>
                      <DocumentList />
                    </RequireProject>
                  }
                />
                <Route
                  path="/documents/:id"
                  element={
                    <RequireProject>
                      <DocumentDetail />
                    </RequireProject>
                  }
                />
                <Route path="*" element={<Empty>Không tìm thấy trang.</Empty>} />
              </Routes>
            </Layout>
          </LookupProvider>
        </ProjectProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
