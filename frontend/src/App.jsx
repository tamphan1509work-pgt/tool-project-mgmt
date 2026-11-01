import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { resetDemo } from './api.js';
import { hashToPath, pathToHash } from './links.js';
import { Empty, Icon, Loading } from './components/ui.jsx';
import { ConfirmProvider, LookupProvider, ProjectProvider, ToastProvider, useConfirm, useProject } from './context.jsx';
import { BugDetail, BugList } from './pages/Bugs.jsx';
import Dashboard from './pages/Dashboard.jsx';
import { DocumentDetail, DocumentList } from './pages/Documents.jsx';
import { MeetingDetail, MeetingList } from './pages/Meetings.jsx';
import { MemberDetail, MemberList } from './pages/Members.jsx';
import { MilestoneDetail } from './pages/Milestones.jsx';
import SettingsPage from './pages/Settings.jsx';
import { NotificationBell, UserMenu } from './components/TopbarTools.jsx';
import { AuthProvider, useAuth } from './auth.jsx';
import LoginPage from './pages/Login.jsx';
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
  milestones: 'Milestone',
  settings: 'Cài đặt thông báo',
  meetings: 'Quản lý meeting minutes',
  tasks: 'Quản lý task',
  'test-cases': 'Test report',
  bugs: 'Quản lý bug',
  documents: 'Quản lý tài liệu',
};

function ProjectSwitcher({ collapsed }) {
  const { projects, projectId, setProjectId, project } = useProject();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (!projects.length) return null;
  if (collapsed) {
    // Menu thu gọn: chỉ hiện mã dự án đang chọn
    return (
      <Link to={`/projects/${projectId}`} className="project-chip" title={`Dự án đang làm việc: ${project?.name}`}>
        {project?.code}
      </Link>
    );
  }
  const change = (e) => {
    setProjectId(Number(e.target.value));
    // Đang xem chi tiết một bản ghi -> quay về danh sách của dự án mới
    const [, section, id] = pathname.split('/');
    if (id && !['projects', 'members', 'milestones'].includes(section)) navigate(`/${section}`);
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
      <Link to="/documents" className={`nav-link ${inDocs && !type ? 'active' : ''}`} title="Tài liệu">
        <Icon name="doc" /> <span className="nav-label">Tài liệu</span>
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
  const { user } = useAuth();
  if (!loaded) return <Loading />;
  if (!projectId) {
    return user?.is_admin ? (
      <Empty>
        Chưa có dự án nào. <Link to="/projects">Tạo dự án đầu tiên</Link> để bắt đầu quản lý meeting minutes, task, test
        report, bug và tài liệu.
      </Empty>
    ) : (
      <Empty>Bạn chưa được thêm vào dự án nào. Hãy liên hệ quản trị viên để được thêm vào dự án.</Empty>
    );
  }
  return children;
}

/** Trang chỉ dành cho quản trị viên (VD: danh sách thành viên) */
function RequireAdmin({ children }) {
  const { user } = useAuth();
  return user?.is_admin ? children : <Navigate replace to="/" />;
}

/** Chỉ hiện ứng dụng khi đã đăng nhập; giữ nguyên đường dẫn để sau khi đăng nhập vào đúng trang */
function AuthGate({ children }) {
  const { status } = useAuth();
  if (status === 'loading') return <Loading />;
  if (status !== 'ok') return <LoginPage />;
  return children;
}

/** Đường dẫn cũ /categories -> tab Danh mục trong chi tiết dự án đang chọn */
function CategoriesRedirect() {
  const { projectId } = useProject();
  return <Navigate replace to={`/projects/${projectId}?tab=categories`} />;
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

const COLLAPSE_KEY = 'pm.sidebarCollapsed';
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
};

function Layout({ children, onReset }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  // Thu gọn / mở rộng menu trái (máy tính); ghi nhớ trên trình duyệt
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        // bỏ qua
      }
      return !c;
    });
  const section = pathname.split('/')[1] ?? '';
  const { project } = useProject();
  const base = TITLES[section] ?? '';
  const title = ['projects', 'members', 'settings'].includes(section) || !project ? base : `${base} · ${project.code}`;

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.title = title ? `${title} · PM` : 'Quản lý dự án';
  }, [title]);

  return (
    <div className={`layout ${open ? 'nav-open' : ''} ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar no-print">
        <Link to="/" className="brand" title="Project Hub">
          <span className="brand-logo">✓</span> <span className="nav-label">Project Hub</span>
        </Link>
        <nav>
          <NavLink to="/projects" className="nav-link" title="Dự án">
            <Icon name="folder" /> <span className="nav-label">Dự án</span>
          </NavLink>
          {user?.is_admin && (
            <NavLink to="/members" className="nav-link" title="Thành viên">
              <Icon name="people" /> <span className="nav-label">Thành viên</span>
            </NavLink>
          )}
          <ProjectSwitcher collapsed={collapsed} />
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav-link" title={n.label}>
              <Icon name={n.icon} /> <span className="nav-label">{n.label}</span>
            </NavLink>
          ))}
          <DocumentsNav />
          <div className="nav-sep" />
          <NavLink to="/settings" className="nav-link" title="Cài đặt">
            <Icon name="gear" /> <span className="nav-label">Cài đặt</span>
          </NavLink>
        </nav>
        <button
          className="collapse-btn"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
          title={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
          aria-expanded={!collapsed}
        >
          <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} />
          <span className="nav-label">Thu gọn menu</span>
        </button>
      </aside>
      <div className="nav-scrim no-print" onClick={() => setOpen(false)} />
      <div className="main">
        <header className="topbar no-print">
          <button
            className="icon-btn menu-btn"
            onClick={() =>
              // điện thoại: mở menu dạng ngăn kéo; máy tính: thu gọn / mở rộng menu
              window.matchMedia('(max-width: 860px)').matches ? setOpen(true) : toggleCollapsed()
            }
            aria-label="Mở / thu gọn menu"
            title="Mở / thu gọn menu"
          >
            <Icon name="menu" />
          </button>
          <h1 className="page-title">{title}</h1>
          <div className="topbar-tools">
            {import.meta.env.MODE === 'demo' && <DemoBanner onReset={onReset} />}
            <NotificationBell />
            <UserMenu />
          </div>
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
        <AuthProvider>
          <AuthGate>
            <ProjectProvider>
              <LookupProvider>
                <Layout onReset={onReset}>
                  <Routes>
                    <Route path="/projects" element={<ProjectList />} />
                    <Route path="/projects/:id" element={<ProjectDetail />} />
                    <Route
                      path="/members"
                      element={
                        <RequireAdmin>
                          <MemberList />
                        </RequireAdmin>
                      }
                    />
                    <Route path="/members/:id" element={<MemberDetail />} />
                    <Route
                      path="/categories"
                      element={
                        <RequireProject>
                          <CategoriesRedirect />
                        </RequireProject>
                      }
                    />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route
                      path="/milestones/:id"
                      element={
                        <RequireProject>
                          <MilestoneDetail />
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
          </AuthGate>
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
