'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { messagesApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { ROLE_MAP } from '@/lib/constants';
import toast from 'react-hot-toast';

interface MsgUser {
  id: string;
  name: string;
  role: string;
  phone?: string;
  email?: string;
  bio?: string;
  avatar?: string;
}
interface Msg {
  id: string;
  fromId: string;
  toId: string;
  content: string;
  createdAt: string;
  from: { id: string; name: string };
}
interface Conv { partner: MsgUser; latest: Msg; unread: number; }

function UserAvatar({ user, size = 9, onClick }: { user: MsgUser; size?: number; onClick?: () => void }) {
  const px = size * 4;
  return (
    <div
      className={`rounded-full flex-shrink-0 overflow-hidden ${onClick ? 'cursor-pointer hover:ring-2 hover:ring-blue-400 ring-offset-1' : ''}`}
      style={{ width: px, height: px, minWidth: px, minHeight: px }}
      onClick={onClick}
    >
      {user.avatar ? (
        <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-semibold"
          style={{ fontSize: size >= 9 ? 14 : 12 }}>
          {user.name[0]}
        </div>
      )}
    </div>
  );
}

function ProfileCard({ user, onClose }: { user: MsgUser; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-72 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col items-center gap-3">
          <UserAvatar user={user} size={16} />
          <div className="text-center">
            <p className="text-base font-semibold text-gray-900">{user.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{ROLE_MAP[user.role] || user.role}</p>
          </div>
        </div>
        {user.bio && (
          <p className="text-sm text-gray-500 text-center italic border-t pt-3">"{user.bio}"</p>
        )}
        {(user.email || user.phone) && (
          <div className="space-y-2 text-sm border-t pt-3">
            {user.email && (
              <div className="flex items-center gap-2 text-gray-600">
                <svg className="w-4 h-4 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="truncate">{user.email}</span>
              </div>
            )}
            {user.phone && (
              <div className="flex items-center gap-2 text-gray-600">
                <svg className="w-4 h-4 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <span>{user.phone}</span>
              </div>
            )}
          </div>
        )}
        <button onClick={onClose} className="w-full rounded-lg border border-gray-200 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
          关闭
        </button>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conv[]>([]);
  const [allUsers, setAllUsers] = useState<MsgUser[]>([]);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [history, setHistory] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [profileUser, setProfileUser] = useState<MsgUser | null>(null);
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
      setConversations((prev) =>
        prev.map((c) => c.partner.id === otherId ? { ...c, unread: 0 } : c)
      );
    } catch {}
  }, []);

  useEffect(() => {
    fetchConversations();
    // Use /messages/users — accessible to all roles (not the admin-only /users endpoint)
    messagesApi.getUsers().then((res: any) => {
      setAllUsers((res.data || []).filter((u: any) => u.id !== user?.id));
    }).catch(() => {});
  }, [user?.id, fetchConversations]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      if (activeUserId) fetchHistory(activeUserId);
      else fetchConversations();
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeUserId, fetchHistory, fetchConversations]);

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

  const startNewChat = (u: MsgUser) => {
    if (!conversations.find((c) => c.partner.id === u.id)) {
      setConversations((prev) => [{ partner: u, latest: null as any, unread: 0 }, ...prev]);
    }
    openConversation(u.id);
  };

  const showProfile = async (target: MsgUser) => {
    if (target.email !== undefined) {
      setProfileUser(target);
      return;
    }
    try {
      const res: any = await messagesApi.getUserProfile(target.id);
      setProfileUser(res.data);
    } catch {}
  };

  const activePartner: MsgUser | undefined =
    conversations.find((c) => c.partner.id === activeUserId)?.partner
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
      {profileUser && <ProfileCard user={profileUser} onClose={() => setProfileUser(null)} />}

      <div className="flex h-[calc(100vh-112px)] rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Conversation list */}
        <div className="w-64 flex-shrink-0 border-r border-gray-200 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">消息</h2>
            <button
              onClick={() => { setShowNewChat(true); setActiveUserId(null); }}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              + 新建
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 && !showNewChat && (
              <p className="px-4 py-8 text-sm text-center text-gray-400">暂无会话</p>
            )}
            {conversations.map((conv) => (
              <button
                key={conv.partner.id}
                onClick={() => openConversation(conv.partner.id)}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 border-b border-gray-50 transition-colors ${activeUserId === conv.partner.id ? 'bg-blue-50' : ''}`}
              >
                <div onClick={(e) => { e.stopPropagation(); showProfile(conv.partner); }}>
                  <UserAvatar user={conv.partner} size={9} onClick={() => {}} />
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
                  <button
                    key={u.id}
                    onClick={() => startNewChat(u)}
                    className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-blue-50 hover:border-blue-300 text-left transition-colors"
                  >
                    <UserAvatar user={u} size={8} />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{u.name}</p>
                      <p className="text-xs text-gray-400">{ROLE_MAP[u.role] || u.role}</p>
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
                {activePartner && (
                  <UserAvatar user={activePartner} size={8} onClick={() => showProfile(activePartner)} />
                )}
                <div>
                  <p className="text-sm font-semibold text-gray-900">{activePartner?.name}</p>
                  <p className="text-xs text-gray-400">{ROLE_MAP[activePartner?.role || ''] || activePartner?.role}</p>
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
                      {!isMine && activePartner && (
                        <div className="mr-2 mt-0.5">
                          <UserAvatar user={activePartner} size={7} onClick={() => showProfile(activePartner)} />
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
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white hover:bg-blue-700 disabled:opacity-40 transition-colors flex-shrink-0"
                >
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
