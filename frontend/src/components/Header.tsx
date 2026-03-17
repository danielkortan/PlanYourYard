import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Leaf, Map, TreePine, Eye, Menu, X, Folder, Shield, LogOut, LogIn, User, ChevronDown, PencilRuler } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const navItems = [
  { to: '/', label: 'Home', icon: Leaf },
  { to: '/planner', label: 'Yard Planner', icon: Map },
  { to: '/designer', label: 'Yard Designer', icon: PencilRuler },
  { to: '/plants', label: 'Plant Library', icon: TreePine },
  { to: '/visualize', label: 'AI Visualizer', icon: Eye },
];

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleLogout = () => {
    logout();
    setUserMenuOpen(false);
    navigate('/');
  };

  return (
    <header className="bg-forest-800 text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group shrink-0">
            <div className="w-8 h-8 bg-forest-500 rounded-lg flex items-center justify-center group-hover:bg-forest-400 transition-colors">
              <Leaf className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">
              Plan<span className="text-forest-300">Your</span>Yard
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(({ to, label, icon: Icon }) => {
              const active = location.pathname === to;
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-forest-600 text-white'
                      : 'text-forest-100 hover:bg-forest-700 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              );
            })}
            {user && (
              <Link
                to="/projects"
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname.startsWith('/projects')
                    ? 'bg-forest-600 text-white'
                    : 'text-forest-100 hover:bg-forest-700 hover:text-white'
                }`}
              >
                <Folder className="w-4 h-4" />
                My Projects
              </Link>
            )}
          </nav>

          {/* Right side: auth */}
          <div className="hidden md:flex items-center gap-2">
            {user ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-forest-100 hover:bg-forest-700 transition-colors"
                >
                  <div className="w-7 h-7 bg-forest-500 rounded-full flex items-center justify-center text-xs font-semibold">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="max-w-[120px] truncate">{user.name}</span>
                  {user.role === 'admin' && <Shield className="w-3.5 h-3.5 text-yellow-400" />}
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50">
                    <div className="px-4 py-2.5 border-b border-gray-100">
                      <div className="text-sm font-semibold text-gray-900">{user.name}</div>
                      <div className="text-xs text-gray-400 truncate">{user.email}</div>
                    </div>
                    <Link
                      to="/projects"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Folder className="w-4 h-4 text-gray-400" /> My Projects
                    </Link>
                    {user.role === 'admin' && (
                      <Link
                        to="/admin"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <Shield className="w-4 h-4 text-purple-500" /> Admin Panel
                      </Link>
                    )}
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors border-t border-gray-100"
                    >
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                to="/login"
                className="flex items-center gap-2 px-4 py-2 bg-forest-500 hover:bg-forest-400 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <LogIn className="w-4 h-4" /> Sign In
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 rounded-lg text-forest-200 hover:bg-forest-700 transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-forest-700 bg-forest-800 px-4 py-3">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium mb-1 transition-colors ${
                  active
                    ? 'bg-forest-600 text-white'
                    : 'text-forest-100 hover:bg-forest-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
          {user ? (
            <>
              <Link
                to="/projects"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium mb-1 transition-colors ${
                  location.pathname.startsWith('/projects') ? 'bg-forest-600 text-white' : 'text-forest-100 hover:bg-forest-700'
                }`}
              >
                <Folder className="w-4 h-4" /> My Projects
              </Link>
              {user.role === 'admin' && (
                <Link
                  to="/admin"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium mb-1 text-yellow-300 hover:bg-forest-700 transition-colors"
                >
                  <Shield className="w-4 h-4" /> Admin Panel
                </Link>
              )}
              <div className="flex items-center gap-3 px-3 py-3 border-t border-forest-700 mt-2">
                <User className="w-4 h-4 text-forest-400" />
                <span className="text-forest-200 text-sm flex-1 truncate">{user.name}</span>
                <button
                  onClick={() => { handleLogout(); setMobileOpen(false); }}
                  className="text-red-400 text-sm font-medium"
                >
                  Sign Out
                </button>
              </div>
            </>
          ) : (
            <Link
              to="/login"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium mt-2 bg-forest-500 text-white hover:bg-forest-400 transition-colors"
            >
              <LogIn className="w-4 h-4" /> Sign In / Register
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
