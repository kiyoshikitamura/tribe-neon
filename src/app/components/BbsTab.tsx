"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useGame } from "../context/GameContext";
import { supabase } from "@/utils/supabase";
import UserIdentityRow from "./profile/UserIdentityRow";
import CanonicalDialog from "./ui/CanonicalDialog";
import "./BbsTab.css";

export default function BbsTab({ embedded = false }: { embedded?: boolean } = {}) {
  const {
    session,
    bbsThreads,
    setBbsThreads,
    bbsActiveThread,
    setBbsActiveThread,
    bbsPosts,
    setBbsPosts,
    bbsLoading,
    bbsUnreadCounts,
    refreshBbsUnreadCounts,
    markBbsThreadRead,
    fetchBbsThreads,
    createBbsThread,
    fetchBbsPosts,
    createBbsPost,
    playCyberSe,
    setShowTribeChatPanel,
    setChatChannel,
    fetchPlayerDetail,
  } = useGame();

  const [activeCategory, setActiveCategory] = useState<"RECRUIT" | "STRATEGY_CHAT">("RECRUIT");
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);

  // スレッド作成用
  const [newTitle, setNewTitle] = useState<string>("");
  const [newContent, setNewContent] = useState<string>("");
  const [creating, setCreating] = useState<boolean>(false);

  // 返信用
  const [replyContent, setReplyContent] = useState<string>("");
  const [replying, setReplying] = useState<boolean>(false);
  const [identityByUserId, setIdentityByUserId] = useState<Record<string, any>>({});
  const [resolvedIdentityKey, setResolvedIdentityKey] = useState("");

  const postsEndRef = useRef<HTMLDivElement>(null);

  const identityUserIds = useMemo(() => Array.from(new Set([
    ...bbsThreads.map((thread: any) => thread.user_id),
    ...(bbsActiveThread?.user_id ? [bbsActiveThread.user_id] : []),
    ...bbsPosts.map((post: any) => post.user_id),
  ].filter(Boolean))).sort(), [bbsActiveThread, bbsPosts, bbsThreads]);
  const identityKey = identityUserIds.join("|");
  const identityReady = identityUserIds.length === 0 || resolvedIdentityKey === identityKey;

  useEffect(() => {
    let active = true;
    if (!session?.user?.id || identityUserIds.length === 0) {
      return () => { active = false; };
    }
    void supabase.rpc("get_public_profiles", { p_user_ids: identityUserIds }).then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setIdentityByUserId({});
      } else {
        setIdentityByUserId(Object.fromEntries((data || []).map((profile: any) => [profile.user_id || profile.id, profile])));
      }
      setResolvedIdentityKey(identityKey);
    });
    return () => { active = false; };
  }, [identityKey, identityUserIds, session?.user?.id]);

  const renderIdentity = (entry: any) => {
    const profile = identityByUserId[entry?.user_id];
    return <UserIdentityRow
      userName={String(profile?.username || "ユーザー")}
      guildName={profile?.guild_name} guildId={profile?.guild_id}
      title={profile?.title_name}
      leaderCharacterId={profile?.favorite_character_id}
      identityReady={identityReady}
      onOpen={entry?.user_id ? () => fetchPlayerDetail(entry.user_id) : undefined}
      variant="compact"
    />;
  };

  // カテゴリ変更時にスレッド取得
  useEffect(() => {
    if (session) {
      fetchBbsThreads(activeCategory);
    }
  }, [activeCategory, session]);

  // レスが更新されたら最下部にスクロール
  useEffect(() => {
    if (bbsActiveThread) {
      postsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [bbsPosts, bbsActiveThread]);

  // リアルタイム購読（スレッド一覧用）
  useEffect(() => {
    if (!session || bbsActiveThread) return;

    const channel = supabase
      .channel("realtime_bbs_threads")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bbs_threads" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newThread = payload.new as any;
            if (newThread.category === activeCategory) {
              setBbsThreads((prev: any[]) => {
                if (prev.some((t) => t.id === newThread.id)) return prev;
                return [newThread, ...prev];
              });
            }
          } else if (payload.eventType === "UPDATE") {
            const updatedThread = payload.new as any;
            if (updatedThread.category === activeCategory) {
              setBbsThreads((prev: any[]) => {
                const filtered = prev.filter((t) => t.id !== updatedThread.id);
                const nextList = [updatedThread, ...filtered];
                return nextList.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
              });
            }
          }

          void refreshBbsUnreadCounts();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void fetchBbsThreads(activeCategory);
          void refreshBbsUnreadCounts();
        }
      });

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchBbsThreads(activeCategory);
        void refreshBbsUnreadCounts();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [session, bbsActiveThread, activeCategory, refreshBbsUnreadCounts]);

  // リアルタイム購読（レス一覧用）
  useEffect(() => {
    if (!session || !bbsActiveThread) return;

    const channel = supabase
      .channel(`realtime_bbs_posts_${bbsActiveThread.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bbs_posts",
        },
        (payload) => {
          const newPost = payload.new as any;
          if (newPost.thread_id === bbsActiveThread.id) {
            setBbsPosts((prev: any[]) => {
              if (prev.some((p) => p.id === newPost.id)) return prev;
              return [...prev, newPost];
            });
            void markBbsThreadRead(bbsActiveThread.id);
          }
          void refreshBbsUnreadCounts();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void fetchBbsPosts(bbsActiveThread.id);
          void markBbsThreadRead(bbsActiveThread.id);
        }
      });

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchBbsPosts(bbsActiveThread.id);
        void markBbsThreadRead(bbsActiveThread.id);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [session, bbsActiveThread, refreshBbsUnreadCounts, markBbsThreadRead]);

  // スレッド作成処理
  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim() || creating) return;

    setCreating(true);
    playCyberSe("click");
    try {
      await createBbsThread(activeCategory, newTitle.trim(), newContent.trim());
      setNewTitle("");
      setNewContent("");
      setShowCreateModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  // レス投稿処理
  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim() || replying || !bbsActiveThread) return;

    setReplying(true);
    playCyberSe("click");
    try {
      await createBbsPost(bbsActiveThread.id, replyContent.trim());
      setReplyContent("");
    } catch (err) {
      console.error(err);
    } finally {
      setReplying(false);
    }
  };

  // 時間フォーマット関数
  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffMins < 1) return "今";
    if (diffMins < 60) return `${diffMins}分前`;
    if (diffHours < 24) return `${diffHours}時間前`;

    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <div className={`bbs-view-container${embedded ? " is-embedded" : ""}`}>
      {/* ヘッダー */}
      {!embedded && <div className="bbs-header-panel">
        <div className="bbs-header-left">
          <span className="bbs-header-tag">BBS COMMUNICATION</span>
          <h2 className="bbs-header-title">
            BBS <span className="bbs-header-sub">【ネオン街掲示板】</span>
          </h2>
        </div>
        <button
          className="bbs-create-btn active-scale-effect"
          onClick={() => {
            setChatChannel("GLOBAL");
            setShowTribeChatPanel(true);
            playCyberSe("click");
          }}
        >
          チャット
        </button>
        {!bbsActiveThread && (
          <button
            className="bbs-create-btn active-scale-effect"
            onClick={() => {
              playCyberSe("click");
              setShowCreateModal(true);
            }}
          >
            新規スレッド
          </button>
        )}
      </div>}

      {/* スレッド詳細表示 */}
      {bbsActiveThread ? (
        <div className="bbs-detail-panel">
          <div className="bbs-detail-top">
            <button
              className="bbs-back-btn active-scale-effect"
              onClick={() => {
                playCyberSe("click");
                setBbsActiveThread(null);
                setBbsPosts([]);
                fetchBbsThreads(activeCategory);
              }}
            >
              ← 一覧に戻る
            </button>
            <span className="bbs-detail-category-badge">
              {bbsActiveThread.category === "RECRUIT" ? "ギルドメンバー募集" : "攻略＆雑談"}
            </span>
          </div>

          <div className="bbs-thread-main-card">
            <div className="bbs-post-author-row">
              {renderIdentity(bbsActiveThread)}
              <span className="bbs-post-time">{formatTime(bbsActiveThread.created_at)}</span>
            </div>
            <h3 className="bbs-thread-main-title">{bbsActiveThread.title}</h3>
            <p className="bbs-thread-main-content">{bbsActiveThread.content}</p>
          </div>

          {/* 返信一覧 */}
          <div className="bbs-posts-container scroll-container">
            {bbsPosts.length === 0 ? (
              <div className="bbs-no-posts">最初の返信を書き込みましょう。</div>
            ) : (
              bbsPosts.map((post: any) => (
                <div key={post.id} className="bbs-post-card">
                  <div className="bbs-post-author-row">
                    {renderIdentity(post)}
                    <span className="bbs-post-time">{formatTime(post.created_at)}</span>
                  </div>
                  <p className="bbs-post-content">{post.content}</p>
                </div>
              ))
            )}
            <div ref={postsEndRef} />
          </div>

          {/* 返信フォーム */}
          <form className="bbs-reply-form" onSubmit={handleCreatePost}>
            <textarea
              className="bbs-reply-textarea"
              placeholder="メッセージを入力...（最大200文字）"
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              maxLength={200}
              required
            />
            <button
              type="submit"
              className="bbs-reply-submit-btn active-scale-effect"
              disabled={replying || !replyContent.trim()}
            >
              {replying ? "送信中..." : "書き込む"}
            </button>
          </form>
        </div>
      ) : (
        /* スレッド一覧表示 */
        <div className="bbs-list-panel">
          {/* カテゴリ切替タブ */}
          <div className="bbs-category-tabs">
            <button
              className={`bbs-category-tab active-scale-effect ${activeCategory === "RECRUIT" ? "active" : ""}`}
              onClick={() => {
                setActiveCategory("RECRUIT");
                playCyberSe("click");
              }}
            >
              {embedded ? "募集" : "ギルドメンバー募集"}
            </button>
            <button
              className={`bbs-category-tab active-scale-effect ${activeCategory === "STRATEGY_CHAT" ? "active" : ""}`}
              onClick={() => {
                setActiveCategory("STRATEGY_CHAT");
                playCyberSe("click");
              }}
            >
              {embedded ? "攻略" : "攻略＆雑談"}
            </button>
          </div>
          {embedded && (
            <button
              className="bbs-embedded-create-btn active-scale-effect"
              onClick={() => {
                playCyberSe("click");
                setShowCreateModal(true);
              }}
            >
              新規スレッド
            </button>
          )}

          {/* スレッド一覧 */}
          <div className="bbs-threads-list scroll-container">
            {bbsLoading ? (
              <div className="bbs-list-loading">
                <div className="spinner" />
              </div>
            ) : bbsThreads.length === 0 ? (
              <div className="bbs-empty-threads">スレッドがありません。新しく作成しましょう。</div>
            ) : (
              bbsThreads.map((thread: any) => (
                <div
                  key={thread.id}
                  className="bbs-thread-card active-scale-effect"
                  onClick={async () => {
                    playCyberSe("click");
                    setBbsActiveThread(thread);
                    await fetchBbsPosts(thread.id);
                    await markBbsThreadRead(thread.id);
                  }}
                >
                  <div className="bbs-thread-card-header">
                    <h4 className="bbs-thread-title">{thread.title}</h4>
                    {Number(bbsUnreadCounts?.[thread.id] || 0) > 0 && (
                      <span className="bbs-thread-unread">NEW {bbsUnreadCounts[thread.id]}</span>
                    )}
                    <span className="bbs-thread-date">{formatTime(thread.updated_at)}</span>
                  </div>
                  <p className="bbs-thread-preview">{thread.content}</p>
                  <div className="bbs-thread-footer">{renderIdentity(thread)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* スレッド作成モーダル */}
      {showCreateModal && (
        <CanonicalDialog title="スレッド作成" size="large" onClose={creating ? undefined : () => setShowCreateModal(false)}>
            <form onSubmit={handleCreateThread}>
              <div className="bbs-form-group">
                <label>スレッドタイトル</label>
                <input
                  type="text"
                  placeholder="タイトルを入力してください（最大50文字）"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  maxLength={50}
                  required
                />
              </div>
              <div className="bbs-form-group">
                <label>本文</label>
                <textarea
                  placeholder="本文を入力してください（最大200文字）"
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  maxLength={200}
                  required
                />
              </div>
              <div className="bbs-modal-actions">
                <button
                  type="button"
                  className="bbs-modal-cancel-btn active-scale-effect"
                  onClick={() => {
                    playCyberSe("click");
                    setShowCreateModal(false);
                  }}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="bbs-modal-submit-btn active-scale-effect"
                  disabled={creating || !newTitle.trim() || !newContent.trim()}
                >
                  {creating ? "作成中..." : "スレッドを作成"}
                </button>
              </div>
            </form>
        </CanonicalDialog>
      )}
    </div>
  );
}
