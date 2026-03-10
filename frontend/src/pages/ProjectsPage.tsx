import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Folder, MapPin, Image, Trash2, Calendar, X } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

interface Project {
  id: number;
  name: string;
  address: string;
  description: string;
  image_count: number;
  created_at: string;
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', address: '', description: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axios.get('/api/projects')
      .then(res => setProjects(res.data))
      .catch(() => toast.error('Failed to load projects'))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await axios.post('/api/projects', form);
      setProjects(prev => [{ ...res.data, image_count: 0 }, ...prev]);
      setForm({ name: '', address: '', description: '' });
      setShowForm(false);
      toast.success('Project created!');
      navigate(`/projects/${res.data.id}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to create project');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this project and all its images?')) return;
    try {
      await axios.delete(`/api/projects/${id}`);
      setProjects(prev => prev.filter(p => p.id !== id));
      toast.success('Project deleted');
    } catch {
      toast.error('Failed to delete project');
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Projects</h1>
          <p className="text-gray-500 text-sm mt-1">Welcome back, {user?.name}</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-forest-600 hover:bg-forest-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> New Project
        </button>
      </div>

      {/* Create Project Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-semibold text-gray-900">New Landscape Project</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Front Yard — Summer 2024"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={e => setForm({ ...form, address: e.target.value })}
                  placeholder="123 Main St, Springfield"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-500"
                />
                <p className="text-xs text-gray-400 mt-1">You can save the same address multiple times for different layout mockups.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Notes about this layout idea…"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-forest-500 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 bg-forest-600 hover:bg-forest-700 disabled:opacity-60 text-white py-2.5 rounded-lg font-medium transition-colors">
                  {saving ? 'Creating…' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Projects Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">Loading projects…</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20">
          <Folder className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-600 mb-2">No projects yet</h3>
          <p className="text-gray-400 mb-6">Create your first landscape mockup project to get started.</p>
          <button
            onClick={() => setShowForm(true)}
            className="bg-forest-600 hover:bg-forest-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Create Your First Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map(project => (
            <div
              key={project.id}
              onClick={() => navigate(`/projects/${project.id}`)}
              className="bg-white rounded-xl border border-gray-200 hover:border-forest-400 hover:shadow-md cursor-pointer transition-all group"
            >
              <div className="h-36 bg-gradient-to-br from-forest-100 to-forest-200 rounded-t-xl flex items-center justify-center">
                <Folder className="w-12 h-12 text-forest-400 group-hover:text-forest-500 transition-colors" />
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-gray-900 truncate">{project.name}</h3>
                {project.address && (
                  <div className="flex items-center gap-1 text-sm text-gray-500 mt-1 truncate">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{project.address}</span>
                  </div>
                )}
                {project.description && (
                  <p className="text-sm text-gray-400 mt-1 line-clamp-2">{project.description}</p>
                )}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Image className="w-3.5 h-3.5" />
                      {project.image_count} {project.image_count === 1 ? 'image' : 'images'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(project.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    onClick={(e) => handleDelete(project.id, e)}
                    className="text-gray-300 hover:text-red-500 transition-colors p-1"
                    title="Delete project"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
