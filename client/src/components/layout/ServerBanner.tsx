import { useState, useEffect } from 'react';
import { WifiOff, Server, Check, ArrowRight } from 'lucide-react';
import { useWs } from '../../lib/ws';
import { getApiBaseUrl, setApiBaseUrl, api } from '../../lib/api';

export function ServerBanner() {
  const { connected } = useWs();
  const [showConfig, setShowConfig] = useState(false);
  const [ip, setIp] = useState(getApiBaseUrl() || 'http://192.168.0.111:4567');
  const [testing, setTesting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  if (connected && !showConfig) return null;

  return (
    <>
      {/* Top Banner when disconnected */}
      {!connected && (
        <div className="bg-amber-950/80 border-b border-amber-600/40 px-3 py-2 text-xs flex items-center justify-between text-amber-200">
          <div className="flex items-center gap-2 truncate">
            <WifiOff size={14} className="text-amber-400 shrink-0" />
            <span className="truncate">Desconectado do servidor OmniYomi ({getApiBaseUrl() || 'localhost'})</span>
          </div>
          <button
            onClick={() => setShowConfig(true)}
            className="shrink-0 ml-2 px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded font-medium flex items-center gap-1 transition-colors"
          >
            Configurar IP <ArrowRight size={12} />
          </button>
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
                <h3 className="text-base font-semibold text-white">Servidor OmniYomi</h3>
                <p className="text-xs text-gray-400">Conecte o celular ao seu computador</p>
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
                placeholder="http://192.168.0.111:4567"
                className="w-full bg-[#0d1017] border border-[#2a3040] text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Verifique se o celular está conectado na mesma rede Wi-Fi do computador.
              </p>
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
