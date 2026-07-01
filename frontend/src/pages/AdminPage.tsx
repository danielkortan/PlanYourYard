import { useState, useEffect } from 'react';
import { Shield, Trash2, UserCheck, UserX, RefreshCw, Folder, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

interface AdminUser {
  id: number;
  email: string;
  name: string;
  role: 'user' | 'admin';
  created_at: string;
  project_count: number;
}

const PAGE_SIZE = 25;

export default function AdminPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const loadUsers = () => {
    setLoading(true);
    axios.get('/api/admin/users', { params: { q: search || undefined, page, limit: PAGE_SIZE } })
      .then(res => { setUsers(res.data.results); setTotal(res.data.total); })
      .catch(() => toast.error('Failed to load users'))
      .finally(() => setLoading(false));
  };

  // Debounce free-text search before it drives the page-1 refetch below
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { loadUsers(); }, [search, page]);

  const toggleRole = async (user: AdminUser) => {
    if (user.id === currentUser?.id) { toast.error("You can't change your own role"); return; }
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    if (!confirm(`Change ${user.name}'s role to ${newRole}?`)) return;
    setActionId(user.id);
    try {
      const res = await axios.put(`/api/admin/users/${user.id}`, { role: newRole });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, ...res.data } : u));
      toast.success(`${user.name} is now ${newRole === 'admin' ? 'an admin' : 'a regular user'}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to update role');
    } finally {
      setActionId(null);
    }
  };

  const deleteUser = async (user: AdminUser) => {
    if (user.id === currentUser?.id) { toast.error("You can't delete your own account"); return; }
    if (!confirm(`Delete user "${user.name}" (${user.email}) and all their data? This cannot be undone.`)) return;
    setActionId(user.id);
    try {
      await axios.delete(`/api/admin/users/${user.id}`);
      toast.success(`User ${user.name} deleted`);
      if (users.length === 1 && page > 1) {
        setPage(p => p - 1); // deleted the last user on this page — fall back a page
      } else {
        loadUsers();
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to delete user');
    } finally {
      setActionId(null);
    }
  };

  const admins = users.filter(u => u.role === 'admin');
  const regularUsers = users.filter(u => u.role === 'user');

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
            <p className="text-gray-500 text-sm">{total} total user{total === 1 ? '' : 's'}</p>
          </div>
        </div>
        <button
          onClick={loadUsers}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 px-3 py-2 rounded-lg text-sm transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Stats (reflect the current page only, since the full user list is paginated) */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Total Users', value: total, color: 'bg-blue-50 text-blue-700' },
          { label: 'Admins (this page)', value: admins.length, color: 'bg-purple-50 text-purple-700' },
          { label: 'Regular Users (this page)', value: regularUsers.length, color: 'bg-green-50 text-green-700' },
        ].map(stat => (
          <div key={stat.label} className={`rounded-xl p-4 ${stat.color}`}>
            <div className="text-2xl font-bold">{stat.value}</div>
            <div className="text-sm font-medium opacity-80">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-6 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
        />
      </div>

      {/* Users table */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">Loading users…</div>
      ) : users.length === 0 && search ? (
        <div className="text-center py-20">
          <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-600 mb-2">No users match "{search}"</h3>
          <p className="text-gray-400">Try a different name or email.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">User</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Role</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden sm:table-cell">Projects</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3 hidden md:table-cell">Joined</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(user => {
                const isSelf = user.id === currentUser?.id;
                const busy = actionId === user.id;
                return (
                  <tr key={user.id} className={`hover:bg-gray-50 transition-colors ${isSelf ? 'bg-blue-50/30' : ''}`}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                          user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {user.name} {isSelf && <span className="text-xs text-blue-500 font-normal">(you)</span>}
                          </div>
                          <div className="text-xs text-gray-400">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.role === 'admin'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {user.role === 'admin' && <Shield className="w-3 h-3" />}
                        {user.role}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 hidden sm:table-cell">
                      <span className="flex items-center gap-1 text-sm text-gray-500">
                        <Folder className="w-3.5 h-3.5" /> {user.project_count}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-400 hidden md:table-cell">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => toggleRole(user)}
                          disabled={isSelf || busy}
                          title={user.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {user.role === 'admin' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => deleteUser(user)}
                          disabled={isSelf || busy}
                          title="Delete user"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && total > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-3 mt-8">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-500">
            Page {page} of {totalPages} · {total} user{total === 1 ? '' : 's'}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
