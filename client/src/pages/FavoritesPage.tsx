import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { CoverCard } from '../components/ui/CoverCard';
import { Loader, Empty } from '../components/ui/index';
import { Button } from '../components/ui/index';

export function FavoritesPage() {
  const navigate = useNavigate();
  const [manga, setManga] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getLibrary('favorites').then(setManga).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader size="lg" /></div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Favoritos</h1>
        <p className="text-sm text-gray-500 mt-0.5">{manga.length} obras</p>
      </div>

      {manga.length === 0 ? (
        <Empty
          icon="❤️"
          title="Nenhum favorito"
          description='Adicione obras à categoria "Favoritos" na sua biblioteca'
          action={<Button onClick={() => navigate('/library')}>Ir para a Biblioteca</Button>}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
          {manga.map(m => (
            <CoverCard
              key={m.id}
              title={m.title}
              coverUrl={m.coverUrl}
              onClick={() => navigate(`/manga/${encodeURIComponent(m.id)}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
