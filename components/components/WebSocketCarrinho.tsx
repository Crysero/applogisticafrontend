// FrontendLogistica.tsx
// Next.js (App Router or Pages) compatible React component
// Dependencies: npm i socket.io-client uuid
// Optional: npm i axios (we'll use fetch to avoid extra deps)
// Styling: TailwindCSS assumed.

'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

// =============================
// 🔧 CONFIGURAÇÃO DO BACKEND
// =============================
// Altere para o endereço do seu Flask (ex.: http://localhost:5000)
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:5000';

// Helper para montar querystring
const qs = (params: Record<string, any>) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

// Tipagens básicas
interface Movimentacao {
  id?: number;
  quantidade?: number;
  tipo_movimento?: string;
  data_entrada?: string;
  material?: string;
  ean?: string;
  texto_breve_material?: string;
  descricao_fornecedor_principal?: string;
}

interface ProdutoBusca {
  cod_material?: string;
  texto_breve_material?: string;
  ean?: string;
  descricao_fornecedor_principal?: string;
}

export default function FrontendLogistica() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [conectado, setConectado] = useState(false);

  // "chave" identifica o carrinho do usuário
  const [chave, setChave] = useState<string>('');
  const chaveInputRef = useRef<HTMLInputElement | null>(null);

  // Estados de busca de movimentações
  const [filtroId, setFiltroId] = useState('');
  const [filtroEAN, setFiltroEAN] = useState('');
  const [filtroMaterial, setFiltroMaterial] = useState('');
  const [movs, setMovs] = useState<Movimentacao[]>([]);
  const [carregandoMovs, setCarregandoMovs] = useState(false);

  // Busca de produto por valor único (material ou EAN)
  const [valorBuscaProduto, setValorBuscaProduto] = useState('');
  const [produto, setProduto] = useState<ProdutoBusca | null>(null);
  const [carregandoProduto, setCarregandoProduto] = useState(false);
  const [erroProduto, setErroProduto] = useState<string | null>(null);

  // Carrinho
  const [carrinho, setCarrinho] = useState<Movimentacao[]>([]);
  const [mensagem, setMensagem] = useState<string | null>(null);

  // =============================
  // 🔌 Socket.IO
  // =============================
  useEffect(() => {
    // Recupera/gera a chave do carrinho e persiste
    const stored = typeof window !== 'undefined' ? localStorage.getItem('chave_carrinho') : null;
    const nova = stored || uuidv4().slice(0, 8);
    setChave(nova);
    if (!stored) localStorage.setItem('chave_carrinho', nova);

    const s = io(BACKEND_URL, {
      transports: ['websocket'],
    });

    setSocket(s);

    s.on('connect', () => setConectado(true));
    s.on('disconnect', () => setConectado(false));

    // Eventos do servidor
    s.on('carrinho_atualizado', (payload: { chave: string; produtos: Movimentacao[] }) => {
      if (payload?.chave === (localStorage.getItem('chave_carrinho') || nova)) {
        setCarrinho(payload.produtos || []);
        setMensagem('Carrinho atualizado!');
        setTimeout(() => setMensagem(null), 2000);
      }
    });

    s.on('erro', (payload: { mensagem?: string }) => {
      setMensagem(payload?.mensagem || 'Erro ao processar ação');
      setTimeout(() => setMensagem(null), 3000);
    });

    return () => {
      s.disconnect();
    };
  }, []);

  // Trocar manualmente a chave do carrinho
  const aplicarChave = () => {
    const nova = chaveInputRef.current?.value?.trim();
    if (!nova) return;
    setChave(nova);
    localStorage.setItem('chave_carrinho', nova);
    setMensagem('Chave do carrinho atualizada.');
    setTimeout(() => setMensagem(null), 1500);
  };

  const gerarNovaChave = () => {
    const nova = uuidv4().slice(0, 8);
    setChave(nova);
    localStorage.setItem('chave_carrinho', nova);
    setCarrinho([]);
    setMensagem('Nova chave gerada.');
    setTimeout(() => setMensagem(null), 1500);
  };

  // =============================
  // 🔎 Consultar movimentações (GET /movimentacoes)
  // =============================
  const buscarMovimentacoes = async () => {
    try {
      setCarregandoMovs(true);
      const query = qs({ id: filtroId, ean: filtroEAN, material: filtroMaterial });
      const url = `${BACKEND_URL}/movimentacoes${query ? `?${query}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Falha ao consultar movimentações');
      const data = await res.json();
      setMovs(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setMensagem(e?.message || 'Erro ao carregar movimentações');
    } finally {
      setCarregandoMovs(false);
    }
  };

  // =============================
  // 🧾 Buscar produto (POST /buscar_produto)
  // =============================
  const buscarProduto = async () => {
    setErroProduto(null);
    setProduto(null);
    if (!valorBuscaProduto) {
      setErroProduto('Informe um Material ou EAN.');
      return;
    }
    try {
      setCarregandoProduto(true);
      const res = await fetch(`${BACKEND_URL}/buscar_produto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor: valorBuscaProduto }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErroProduto(data?.erro || 'Produto não encontrado');
        return;
      }
      setProduto(data);
    } catch (e: any) {
      setErroProduto(e?.message || 'Erro ao buscar produto');
    } finally {
      setCarregandoProduto(false);
    }
  };

  // =============================
  // 🛒 Carrinho
  // =============================
  const carregarCarrinho = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/carrinho/${chave}`);
      const data = await res.json();
      setCarrinho(Array.isArray(data) ? data : []);
      setMensagem('Carrinho carregado.');
      setTimeout(() => setMensagem(null), 1500);
    } catch (e: any) {
      setMensagem('Erro ao carregar carrinho');
    }
  };

  const adicionarAoCarrinho = (id?: number) => {
    if (!id) return;
    if (!socket) return;
    socket.emit('adicionar_produto', { id, chave });
  };

  // =============================
  // 🖼️ UI
  // =============================
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-2xl font-bold">📦 Logística – Frontend</h1>
          <div className="text-sm">
            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-2xl border ${conectado ? 'border-green-500' : 'border-red-400'}`}> 
              <span className={`h-2 w-2 rounded-full ${conectado ? 'bg-green-500' : 'bg-red-400'}`}></span>
              Socket {conectado ? 'conectado' : 'desconectado'}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 grid gap-6">
        {/* Chave do Carrinho */}
        <section className="bg-white rounded-2xl shadow p-4">
          <h2 className="text-lg font-semibold mb-3">🔑 Chave do carrinho</h2>
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-end">
            <div className="flex-1">
              <label className="text-sm text-gray-600">Chave atual</label>
              <input ref={chaveInputRef} defaultValue={chave} className="mt-1 w-full border rounded-xl p-2" placeholder="ex.: a1b2c3d4" />
            </div>
            <button onClick={aplicarChave} className="px-4 py-2 rounded-xl bg-gray-900 text-white hover:opacity-90">Aplicar</button>
            <button onClick={gerarNovaChave} className="px-4 py-2 rounded-xl border">Gerar nova</button>
            <button onClick={() => navigator.clipboard.writeText(chave)} className="px-4 py-2 rounded-xl border">Copiar</button>
            <button onClick={carregarCarrinho} className="px-4 py-2 rounded-xl border">Carregar carrinho</button>
          </div>
          <p className="text-sm text-gray-500 mt-2">Chave ativa: <span className="font-mono">{chave}</span></p>
        </section>

        {/* Buscar Produto */}
        <section className="bg-white rounded-2xl shadow p-4">
          <h2 className="text-lg font-semibold mb-3">🔍 Buscar produto (Material ou EAN)</h2>
          <div className="flex flex-col md:flex-row gap-3">
            <input value={valorBuscaProduto} onChange={(e) => setValorBuscaProduto(e.target.value)} className="flex-1 border rounded-xl p-2" placeholder="Ex.: 8517681 ou 7891234567890" />
            <button onClick={buscarProduto} className="px-4 py-2 rounded-xl bg-gray-900 text-white hover:opacity-90 disabled:opacity-60" disabled={carregandoProduto}>{carregandoProduto ? 'Buscando...' : 'Buscar'}</button>
          </div>
          {erroProduto && <p className="text-sm text-red-600 mt-2">{erroProduto}</p>}
          {produto && (
            <div className="mt-4 border rounded-xl p-3">
              <div className="grid md:grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-500">Material:</span> {produto.cod_material || '—'}</div>
                <div><span className="text-gray-500">EAN:</span> {produto.ean || '—'}</div>
                <div className="md:col-span-2"><span className="text-gray-500">Descrição:</span> {produto.texto_breve_material || '—'}</div>
                <div className="md:col-span-2"><span className="text-gray-500">Fornecedor:</span> {produto.descricao_fornecedor_principal || '—'}</div>
              </div>
            </div>
          )}
        </section>

        {/* Consultar Movimentações */}
        <section className="bg-white rounded-2xl shadow p-4">
          <h2 className="text-lg font-semibold mb-3">📑 Consultar movimentações</h2>
          <div className="grid md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="text-sm text-gray-600">ID</label>
              <input value={filtroId} onChange={(e) => setFiltroId(e.target.value)} className="w-full border rounded-xl p-2" placeholder="ex.: 12" />
            </div>
            <div>
              <label className="text-sm text-gray-600">EAN</label>
              <input value={filtroEAN} onChange={(e) => setFiltroEAN(e.target.value)} className="w-full border rounded-xl p-2" placeholder="ex.: 7891234567890" />
            </div>
            <div>
              <label className="text-sm text-gray-600">Material</label>
              <input value={filtroMaterial} onChange={(e) => setFiltroMaterial(e.target.value)} className="w-full border rounded-xl p-2" placeholder="ex.: 8517681" />
            </div>
            <div>
              <button onClick={buscarMovimentacoes} className="w-full px-4 py-2 rounded-xl bg-gray-900 text-white hover:opacity-90 disabled:opacity-60" disabled={carregandoMovs}>{carregandoMovs ? 'Carregando...' : 'Buscar'}</button>
            </div>
          </div>

          <div className="mt-4 overflow-auto border rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">Material</th>
                  <th className="text-left p-2">Descrição</th>
                  <th className="text-left p-2">Fornecedor</th>
                  <th className="text-left p-2">Qtd</th>
                  <th className="text-left p-2">Tipo</th>
                  <th className="text-left p-2">Entrada</th>
                  <th className="text-left p-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {movs.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-gray-500">Nenhuma movimentação carregada.</td>
                  </tr>
                )}
                {movs.map((m, idx) => (
                  <tr key={`${m.id}-${idx}`} className="border-t">
                    <td className="p-2">{m.id ?? '—'}</td>
                    <td className="p-2 font-mono">{m.material || '—'}</td>
                    <td className="p-2">{m.texto_breve_material || '—'}</td>
                    <td className="p-2">{m.descricao_fornecedor_principal || '—'}</td>
                    <td className="p-2">{m.quantidade ?? '—'}</td>
                    <td className="p-2">{m.tipo_movimento || '—'}</td>
                    <td className="p-2">{m.data_entrada ? new Date(m.data_entrada).toLocaleString() : '—'}</td>
                    <td className="p-2">
                      <button onClick={() => adicionarAoCarrinho(m.id)} className="px-3 py-1 rounded-lg border hover:bg-gray-50">Adicionar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Carrinho */}
        <section className="bg-white rounded-2xl shadow p-4">
          <h2 className="text-lg font-semibold mb-3">🛒 Carrinho ({carrinho.length})</h2>
          <div className="overflow-auto border rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left p-2">Material</th>
                  <th className="text-left p-2">Descrição</th>
                  <th className="text-left p-2">Fornecedor</th>
                  <th className="text-left p-2">Qtd</th>
                  <th className="text-left p-2">Tipo</th>
                  <th className="text-left p-2">Entrada</th>
                </tr>
              </thead>
              <tbody>
                {carrinho.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-gray-500">Seu carrinho está vazio.</td>
                  </tr>
                )}
                {carrinho.map((p, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2 font-mono">{p.material || '—'}</td>
                    <td className="p-2">{p.texto_breve_material || '—'}</td>
                    <td className="p-2">{p.descricao_fornecedor_principal || '—'}</td>
                    <td className="p-2">{p.quantidade ?? '—'}</td>
                    <td className="p-2">{p.tipo_movimento || '—'}</td>
                    <td className="p-2">{p.data_entrada ? new Date(p.data_entrada).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      {/* Consultar Movimentações */}
<section className="bg-white rounded-2xl shadow p-4">
  <h2 className="text-lg font-semibold mb-3">📑 Consultar movimentações</h2>
  <div className="grid md:grid-cols-4 gap-3 items-end">
    <div>
      <label className="text-sm text-gray-600">ID</label>
      <input value={filtroId} onChange={(e) => setFiltroId(e.target.value)} className="w-full border rounded-xl p-2" placeholder="ex.: 12" />
    </div>
    <div>
      <label className="text-sm text-gray-600">EAN</label>
      <input value={filtroEAN} onChange={(e) => setFiltroEAN(e.target.value)} className="w-full border rounded-xl p-2" placeholder="ex.: 7891234567890" />
    </div>
    <div>
      <label className="text-sm text-gray-600">Material</label>
      <input value={filtroMaterial} onChange={(e) => setFiltroMaterial(e.target.value)} className="w-full border rounded-xl p-2" placeholder="ex.: 8517681" />
    </div>
    <div>
      <button onClick={buscarMovimentacoes} className="w-full px-4 py-2 rounded-xl bg-gray-900 text-white hover:opacity-90 disabled:opacity-60" disabled={carregandoMovs}>
        {carregandoMovs ? 'Carregando...' : 'Buscar'}
      </button>
    </div>
  </div>

  <div className="mt-4 overflow-auto border rounded-xl">
    <table className="min-w-full text-sm">
      <thead className="bg-gray-100">
        <tr>
          {movs.length > 0 &&
            Object.keys(movs[0]).map((coluna) => (
              <th key={coluna} className="text-left p-2">
                {coluna}
              </th>
            ))}
        </tr>
      </thead>
      <tbody>
        {movs.length === 0 && (
          <tr>
            <td colSpan={10} className="p-4 text-center text-gray-500">
              Nenhuma movimentação carregada.
            </td>
          </tr>
        )}
        {movs.map((m, idx) => (
          <tr key={idx} className="border-t">
            {Object.values(m).map((valor, i) => (
              <td key={i} className="p-2">
                {String(valor)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</section>

      </main>

      {/* Toast */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2">
        {mensagem && (
          <div className="px-4 py-2 rounded-2xl shadow bg-black text-white text-sm">{mensagem}</div>
        )}
      </div>

      <footer className="py-6 text-center text-xs text-gray-500">Conectando em: {BACKEND_URL}</footer>
    </div>
  );
}

/*
====================================
🚀 Como usar no seu projeto Next.js:
====================================
1) Crie o projeto (se ainda não existir):
   npx create-next-app@latest logistica-frontend --ts --eslint --tailwind

2) Instale as dependências:
   cd logistica-frontend
   npm i socket.io-client uuid

3) Adicione este arquivo em:
   - App Router: app/page.tsx  (ou em app/(app)/page.tsx)
   - Pages Router: pages/index.tsx

4) Configure a URL do backend:
   - Crie .env.local na raiz com:
       NEXT_PUBLIC_BACKEND_URL=http://localhost:5000

5) Inicie o frontend:
   npm run dev

6) Certifique-se que seu backend Flask está rodando e com CORS habilitado, conforme seu código.

💡 Dicas:
- Se o Socket.IO não conectar, confira o console do navegador e o terminal do Flask para mensagens.
- Se estiver em redes diferentes (celular/PC), use IP local do PC no NEXT_PUBLIC_BACKEND_URL.
- Para deploy, ajuste a URL para o domínio/porta do backend em produção.
*/
