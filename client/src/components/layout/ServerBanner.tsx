import { useState, useEffect } from 'react';
import { WifiOff, Server, Check, ArrowRight, X } from 'lucide-react';
import { useWs } from '../../lib/ws';
import { getApiBaseUrl, setApiBaseUrl, api, isServerConfigured } from '../../lib/api';

export function ServerBanner() {
  const { connected } = useWs();
  const [showConfig, setShowConfig] = useState(false);
  const [dismissed, setDismissed] = useState(true); // Não incomodar por padrão em modo mobile
  const [ip, setIp] = useState(getApiBaseUrl() || 'http://192.168.0.111:8888');
  const [testing, setTesting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Só exibe se o usuário tiver configurado explicitamente um servidor e ele estiver offline
  const shouldShow = isServerConfigured() && !connected && !dismissed;

  // If connected, hide the config modal
  useEffect(() => {
    if (connected) {
      setShowConfig(false);
      setErrorMsg(null);
    }
  }, [connected]);

  const handleConnect = async () => {
    setTesting(true);
    setErrorMsg(null);
    try {
      setApiBaseUrl(ip);
      await api.health();
      window.location.reload();
    } catch (e: any) {
      setErrorMsg(e.message || 'Falha ao conectar.');
    } finally {
      setTesting(false);
    }
  };

  if (!shouldShow && !showConfig) return null;

  return (
    <>
      {/* Top Banner when disconnected and configured */}
      {shouldShow && (
        <div className="bg-purple-950/90 border-b border-purple-600/40 px-3 py-1.5 text-xs flex items-center justify-between text-purple-200">
          <div className="flex items-center gap-2 truncate">
            <WifiOff size={13} className="text-purple-400 shrink-0" />
            <span className="truncate">Servidor PC offline ({getApiBaseUrl()})</span>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button
              onClick={() => setShowConfig(true)}
              className="px-2 py-0.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-[11px] font-medium flex items-center gap-1 transition-colors"
            >
              Conectar <ArrowRight size={11} />
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="p-1 text-purple-400 hover:text-white transition-colors"
              title="Dispensar aviso"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Modal Dialog to enter Server IP */}
      {showConfig && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161b27] border border-purple-500/40 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-purple-600/20 flex items-center justify-center text-purple-400">
                <Server size={18} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Servidor OmniYomi (PC)</h3>
                <p className="text-xs text-gray-400">Conecte o celular ao computador via Wi-Fi</p>
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-300 font-medium block mb-1">
                Endereço IP do Computador:
              </label>
              <input
                type="text"
                value={ip}
                onChange={e => setIp(e.target.value)}
                placeholder="http://192.168.0.111:8888"
                className="w-full bg-[#0d1017] border border-[#2a3040] text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              />
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setIp('http://192.168.0.111:8888')}
                  className="text-[11px] px-2 py-0.5 rounded bg-[#242c3d] text-purple-300 hover:bg-[#2e374d]"
                >
                  Porta 8888 (Padrão)
                </button>
                <button
                  type="button"
                  onClick={() => setIp('http://192.168.0.111:4567')}
                  className="text-[11px] px-2 py-0.5 rounded bg-[#242c3d] text-purple-300 hover:bg-[#2e374d]"
                >
                  Porta 4567
                </button>
              </div>
            </div>

            {errorMsg && (
              <p className="text-xs text-rose-400 bg-rose-950/40 border border-rose-800/40 p-2 rounded">
                {errorMsg}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleConnect}
                disabled={testing}
                className="flex-1 py-2 px-4 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {testing ? 'Testando...' : <><Check size={14} /> Conectar</>}
              </button>
              <button
                onClick={() => setShowConfig(false)}
                className="py-2 px-3 bg-[#242c3d] hover:bg-[#2e374d] text-gray-300 text-sm rounded-lg transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
