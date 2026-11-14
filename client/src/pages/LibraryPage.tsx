import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Grid3X3, List, Plus, Trash2, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { CoverCard, Badge } from '../components/ui/CoverCard';
import { Button, Input, Loader, Empty, Modal } from '../components/ui/index';
import { useToast } from '../components/ui/ToastProvider';
import { cn } from '../lib/utils';

export function LibraryPage() {
  const navigate = useNavigate();
  const { show } = useToast();
  const [manga, setManga] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showNewCatModal, setShowNewCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [updating, setUpdating] = useState(false);
  const [updateResults, setUpdateResults] = useState<any>(null);

  useEffect(() => {
    loadAll();
  }, [selectedCategory, search]);

  async function loadAll() {
    setLoading(true);
    try {
      const [items, cats] = await Promise.all([
        api.getLibrary(selectedCategory === 'all' ? undefined : selectedCategory, search || undefined),
        api.getCategories(),
      ]);
      setManga(items);
      setCategories(cats);
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckUpdates() {
    setUpdating(true);
    setUpdateResults(null);
    try {
      const res = await api.checkUpdates();
      setUpdateResults(res);
      const newOnes = res.updatedManga?.reduce((sum: number, m: any) => sum + m.newChaptersCount, 0) || 0;
      show(newOnes > 0 ? `${newOnes} novos capítulos encontrados!` : 'Biblioteca está atualizada!', newOnes > 0 ? 'success' : 'info');
      loadAll();
    } catch (e: any) {
      show(e.message, 'error');
    } finally {
      setUpdating(false);
    }
  }

  async function handleCreateCategory() {
    if (!newCatName.trim()) return;
    try {
      const cat = await api.createCategory(newCatName.trim());
      setCategories(prev => [...prev, cat]);
      setNewCatName('');
      setShowNewCatModal(false);
      show('Categoria criada!', 'success');
    } catch (e: any) {
      show(e.message, 'error');
    }
  }

  async function handleDeleteCategory(id: string) {
    if (!confirm('Remover esta categoria? As obras serão movidas para Padrão.')) return;
    try {
      await api.deleteCategory(id);
      setCategories(prev => prev.filter(c => c.id !== id));
      if (selectedCategory === id) setSelectedCategory('all');
      show('Categoria removida', 'info');
      loadAll();
    } catch (e: any) {
      show(e.message, 'error');
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Biblioteca</h1>
          <p className="text-sm text-gray-500 mt-0.5">{manga.length} obras</p>
        </div>
        <Button variant="secondary" size="sm" onClick={handleCheckUpdates} loading={updating}>
          <RefreshCw size={14} />
          Verificar atualizações
        </Button>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setSelectedCategory('all')}
          className={cn('flex-shrink-0 text-sm px-3 py-1.5 rounded-lg border transition-colors', selectedCategory === 'all' ? 'bg-purple-600 border-purple-500 text-white' : 'border-[#2a3040] text-gray-500 hover:text-gray-200')}
        >
          Todas
        </button>
        {categories.map(cat => (
          <div key={cat.id} className="flex-shrink-0 flex items-center gap-1 group">
            <button
              onClick={() => setSelectedCategory(cat.id)}
              className={cn('text-sm px-3 py-1.5 rounded-lg border transition-colors', selectedCategory === cat.id ? 'bg-purple-600 border-purple-500 text-white' : 'border-[#2a3040] text-gray-500 hover:text-gray-200')}
            >
              {cat.name}
            </button>
            {cat.id !== 'default' && (
              <button
                onClick={() => handleDeleteCategory(cat.id)}
                className="hidden group-hover:flex text-gray-600 hover:text-red-400 transition-colors p-1"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={() => setShowNewCatModal(true)}
          className="flex-shrink-0 text-sm px-2.5 py-1.5 rounded-lg border border-dashed border-[#2a3040] text-gray-600 hover:text-purple-400 hover:border-purple-500/50 transition-colors flex items-center gap-1"
        >
          <Plus size={13} /> Nova
        </button>
      </div>

      {/* Controls */}
      <div className="flex gap-3">
        <div className="flex-1">
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar na biblioteca..."
            leftIcon={<Search size={15} />}
          />
        </div>
        <div className="flex gap-1 bg-[#1a1e29] border border-[#2a3040] rounded-lg p-1">
          <button
            onClick={() => setViewMode('grid')}
            className={cn('p-1.5 rounded transition-colors', viewMode === 'grid' ? 'bg-purple-600 text-white' : 'text-gray-500 hover:text-gray-200')}
          >
            <Grid3X3 size={15} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn('p-1.5 rounded transition-colors', viewMode === 'list' ? 'bg-purple-600 text-white' : 'text-gray-500 hover:text-gray-200')}
          >
            <List size={15} />
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader size="lg" label="Carregando biblioteca..." />
        </div>
      ) : manga.length === 0 ? (
        <Empty
          icon="📚"
          title="Biblioteca vazia"
          description="Adicione obras à sua biblioteca a partir do catálogo"
          action={
            <Button onClick={() => navigate('/catalog')}>
              Explorar Catálogo
            </Button>
          }
        />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
          {manga.map(m => (
            <CoverCard
              key={m.id}
              title={m.title}
              coverUrl={m.coverUrl}
              onClick={() => navigate(`/manga/${encodeURIComponent(m.id)}`)}
              badges={
                m.unreadCount > 0 ? (
                  <Badge variant="purple">{m.unreadCount}</Badge>
                ) : m.downloadedCount > 0 ? (
                  <Badge variant="green">↓</Badge>
                ) : undefined
              }
            />
          ))}
        </div>
      ) : (
        <div className="space-y-1 border border-[#1f2535] rounded-xl overflow-hidden">
          {manga.map(m => (
            <div
              key={m.id}
              className="flex items-center gap-3 p-3 hover:bg-[#1a1e29] cursor-pointer transition-colors"
              onClick={() => navigate(`/manga/${encodeURIComponent(m.id)}`)}
            >
              <img
                src={m.coverUrl}
                alt={m.title}
                className="w-10 h-14 object-cover rounded flex-shrink-0"
                onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/80x112/1a1e29/8b5cf6?text=?'; }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-200 truncate">{m.title}</p>
                <p className="text-xs text-gray-500">{m.totalChapters} capítulos</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {m.unreadCount > 0 && (
                  <Badge variant="purple">{m.unreadCount} novos</Badge>
                )}
                {m.downloadedCount > 0 && (
                  <Badge variant="green">{m.downloadedCount} baixados</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Category Modal */}
      <Modal
        open={showNewCatModal}
        onClose={() => setShowNewCatModal(false)}
        title="Nova Categoria"
      >
        <div className="space-y-4">
          <Input
            label="Nome da categoria"
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            placeholder="Ex: Favoritos, Isekai, Lendo..."
            onKeyDown={e => e.key === 'Enter' && handleCreateCategory()}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setShowNewCatModal(false)}>Cancelar</Button>
            <Button onClick={handleCreateCategory} disabled={!newCatName.trim()}>Criar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
