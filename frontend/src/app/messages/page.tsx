'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { messagesApi, usersApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import toast from 'react-hot-toast';

interface MsgUser { id: string; name: string; role: string; }
interface Msg { id: string; fromId: string; toId: string; content: string; createdAt: string; from: { id: string; name: string }; }
interface Conv { partner: MsgUser; latest: Msg; unread: number; }

export default function MessagesPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conv[]>([]);
  const [allUsers, setAllUsers] = useState<MsgUser[]>([]);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [history, setHistory] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res: any = await messagesApi.getConversations();
      setConversations(res.data || []);
    } catch {}
  }, []);

  const fetchHistory = useCallback(async (otherId: string) => {
    try {
      const res: any = await messagesApi.getHistory(otherId);
      setHistory(res.data || []);
      // Mark as read in conversation list
      setConversations((prev) =>
        prev.map((c) => c.partner.id === otherId ? { ...c, unread: 0 } : c)
      );
    } catch {}
  }, []);

  useEffect(() => {
    fetchConversations();
    usersApi.list({ isActive: true }).then((res: any) => {
      setAllUsers((res.data?.items || res.data || []).filter((u: any) => u.id !== user?.id));
    }).catch(() => {});
  }, [user?.id, fetchConversations]);

  // Poll active conversation every 3s, conversations list every 10s
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      if (activeUserId) fetchHistory(activeUserId);
      else fetchConversations();
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeUserId, fetchHistory, fetchConversations]);

  // Also poll conversations in background every 10s for unread badge
  useEffect(() => {
    const id = setInterval(fetchConversations, 10000);
    return () => clearInterval(id);
  }, [fetchConversations]);

  const openConversation = async (partnerId: string) => {
    setActiveUserId(partnerId);
    setShowNewChat(false);
    await fetchHistory(partnerId);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activeUserId) return;
    setSending(true);
    try {
      const res: any = await messagesApi.send(activeUserId, input.trim());
      setHistory((prev) => [...prev, res.data]);
      setInput('');
      fetchConversations();
    } catch {
      toast.error('发送失败');
    } finally {
      setSending(false);
    }
  };

  const startNewChat = (userId: string) => {
    // Ensure partner appears in sidebar (even if no messages yet)
    const u = allUsers.find((u) => u.id === userId);
    if (u && !conversations.find((c) => c.partner.id === userId)) {
      setConversations((prev) => [{ partner: u, latest: null as any, unread: 0 }, ...prev]);
    }
    openConversation(userId);
  };

  const activeParter = conversations.find((c) => c.partner.id === activeUserId)?.partner
    || allUsers.find((u) => u.id === activeUserId);

  const fmt = (d: string) => {
    const date = new Date(d);
    const now = new Date();
    return date.toDateString() === now.toDateString()
      ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-112px)] rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 flex-shrink-0 border-r border-gray-200 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">消息</h2>
            <button onClick={() => { setShowNewChat(true); setActiveUserId(null); }}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium">+ 新建</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 && !showNewChat && (
              <p className="px-4 py-8 text-sm text-center text-gray-400">暂无会话</p>
            )}
            {conversations.map((conv) => (
              <button key={conv.partner.id} onClick={() => openConversation(conv.partner.id)}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 border-b border-gray-50 transition-colors ${activeUserId === conv.partner.id ? 'bg-blue-50' : ''}`}>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                  {conv.partner.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 truncate">{conv.partner.name}</span>
                    {conv.unread > 0 && (
                      <span className="ml-1 flex-shrink-0 bg-blue-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                        {conv.unread > 9 ? '9+' : conv.unread}
                      </span>
                    )}
                  </div>
                  {conv.latest && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">{conv.latest.content}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col">
          {showNewChat ? (
            <div className="flex-1 p-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">选择联系人</h3>
              <div className="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto">
                {allUsers.map((u) => (
                  <button key={u.id} onClick={() => startNewChat(u.id)}
                    className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-blue-50 hover:border-blue-300 text-left transition-colors">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                      {u.name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{u.name}</p>
                      <p className="text-xs text-gray-400">{u.role === 'ADMIN' ? '管理员' : '业务员'}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : !activeUserId ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <div className="text-5xl mb-3">💬</div>
                <p className="text-sm">选择一个会话开始聊天</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-sm font-semibold">
                  {activeParter?.name[0]}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{activeParter?.name}</p>
                  <p className="text-xs text-gray-400">{activeParter?.role === 'ADMIN' ? '管理员' : '业务员'}</p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {history.length === 0 && (
                  <p className="text-center text-sm text-gray-400 py-8">暂无消息，发送第一条消息吧</p>
                )}
                {history.map((msg) => {
                  const isMine = msg.fromId === user?.id;
                  return (
                    <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      {!isMine && (
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-semibold mr-2 mt-0.5 flex-shrink-0">
                          {msg.from.name[0]}
                        </div>
                      )}
                      <div className={`max-w-xs lg:max-w-md ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
                        <div className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                          isMine
                            ? 'bg-blue-600 text-white rounded-br-sm'
                            : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                        }`}>
                          {msg.content}
                        </div>
                        <span className="text-[10px] text-gray-400 mt-1 px-1">{fmt(msg.createdAt)}</span>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <form onSubmit={handleSend} className="px-5 py-3 border-t border-gray-100 flex items-center gap-3">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="输入消息..."
                  className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e as any); }
                  }}
                />
                <button type="submit" disabled={sending || !input.trim()}
                  className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white hover:bg-blue-700 disabled:opacity-40 transition-colors flex-shrink-0">
                  <svg className="w-4 h-4 rotate-90" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                  </svg>
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
