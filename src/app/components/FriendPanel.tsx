import React, { useState, useEffect } from "react";
import { useGame } from "../context/GameContext";
import FullScreenPanel from "./ui/FullScreenPanel";
import SubTabNav from "./ui/SubTabNav";
import OutlawButton from "./ui/OutlawButton";
import { supabase } from "../../utils/supabase";
import "./FriendPanel.css";

export default function FriendPanel() {
  const { 
    showFriendPanel, 
    setShowFriendPanel, 
    userFriends, 
    friendRequests, 
    friendSearchResult,
    searchUserByName,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    removeFriend,
    fetchFriends,
    fetchFriendRequests,
    setConfirmDialogConfig,
    session,
    playCyberSe,
    selectedBattleHelper,
    setSelectedBattleHelper,
    giftCode,
    handleGenerateGiftCode
  } = useGame();
  
  const [activeTab, setActiveTab] = useState<string>("list");
  const [friendNameInput, setFriendNameInput] = useState<string>("");
  const [invitationCount, setInvitationCount] = useState(0);

  useEffect(() => {
    if (showFriendPanel && session?.user?.id) {
      fetchFriends(session.user.id);
      fetchFriendRequests(session.user.id);
      void supabase.from("user_invitations").select("id", { count: "exact", head: true })
        .eq("inviter_user_id", session.user.id).then(({ count }) => setInvitationCount(count || 0));
    }
  }, [showFriendPanel, session?.user?.id, fetchFriends, fetchFriendRequests]);

  if (!showFriendPanel) return null;

  const handleClose = () => {
    setShowFriendPanel(false);
  };

  const tabs = [
    { id: "list", label: "一覧" },
    { id: "add", label: "友達追加" },
    { id: "requests", label: "承認待ち" },
    { id: "invite", label: "招待" }
  ];

  const handleSearch = async () => {
    playCyberSe("click");
    if (!friendNameInput) return;
    await searchUserByName(friendNameInput);
  };

  const handleSendRequest = async (targetId: string) => {
    playCyberSe("click");
    if (!session?.user?.id) return;
    
    const res = await sendFriendRequest(session.user.id, targetId);
    
    setConfirmDialogConfig({
      isOpen: true,
      title: "友達申請",
      message: res.success ? "友達申請を送信しました。" : (res.message || "申請に失敗しました。"),
      confirmText: "OK",
      onConfirm: () => setConfirmDialogConfig(null)
    });
  };

  const handleAcceptRequest = async (requestId: string) => {
    playCyberSe("click");
    if (!session?.user?.id) return;
    await acceptFriendRequest(requestId, session.user.id);
  };

  const handleRejectRequest = async (requestId: string) => {
    playCyberSe("click");
    if (!session?.user?.id) return;
    await rejectFriendRequest(requestId, session.user.id);
  };

  const handleRemoveFriend = async (friendId: string) => {
    playCyberSe("click");
    if (!session?.user?.id) return;
    
    setConfirmDialogConfig({
      isOpen: true,
      title: "友達解除",
      message: "このプレイヤーを友達から削除しますか？",
      confirmText: "削除",
      cancelText: "キャンセル",
      onConfirm: async () => {
        await removeFriend(session.user.id, friendId);
        setConfirmDialogConfig(null);
      },
      onCancel: () => setConfirmDialogConfig(null)
    });
  };

  return (
    <FullScreenPanel title="友達" onClose={handleClose}>
      <SubTabNav tabs={tabs} activeTabId={activeTab} onSelect={setActiveTab} />
      
      <div className="friend-panel-container-inner flex-1 p-3 scroll-container flex-col-gap-3">
        {activeTab === "list" && (
          <div className="flex-col-gap-2">
            <h3 className="font-size-9 text-color-cyan font-weight-bold">友達一覧 ({userFriends?.length || 0}/30)</h3>
            <p className="font-size-7 text-secondary">「助っ人選択」でバトル時の6人目として呼び出せます。</p>
            {userFriends && userFriends.length > 0 ? (
              userFriends.map((f: any) => (
                <div key={f.id} className="friend-card border-subtle p-2 flex-row-space-between align-center bg-black-60">
                  <div className="flex flex-row gap-2 align-center">
                    <img src={f.avatar_url || "/characters/reiji_transparent_asset.png"} alt="avatar" className="w-12 h-12 object-contain" />
                    <div className="flex-col">
                      <span className="font-size-8 font-weight-bold text-white">{f.username}</span>
                      <span className="font-size-7 text-secondary">Lv.{f.level} | 総合力: {f.power?.toLocaleString() || 0}</span>
                    </div>
                  </div>
                  <div className="flex-col gap-1">
                    <OutlawButton 
                      variant={selectedBattleHelper === f.id ? "primary" : "secondary"} 
                      onClick={() => { playCyberSe("click"); setSelectedBattleHelper(selectedBattleHelper === f.id ? null : f.id); }} 
                      className="px-2 py-1 font-size-7"
                    >
                      {selectedBattleHelper === f.id ? "助っ人選択中" : "助っ人選択"}
                    </OutlawButton>
                    <OutlawButton variant="danger" onClick={() => handleRemoveFriend(f.id)} className="px-2 py-1 font-size-7">
                      解除
                    </OutlawButton>
                  </div>
                </div>
              ))
            ) : (
              <p className="font-size-8 text-secondary">友達がいません。</p>
            )}
          </div>
        )}

        {activeTab === "add" && (
          <div className="flex-col-gap-2">
            <h3 className="font-size-9 text-color-cyan font-weight-bold">プレイヤー検索</h3>
            <p className="font-size-7 text-secondary">プレイヤー名で検索して友達申請を送ります。</p>
            <div className="flex gap-2">
              <input
                type="text"
                className="game-input flex-1 p-2 font-size-8"
                placeholder="プレイヤー名"
                value={friendNameInput}
                onChange={(e) => setFriendNameInput(e.target.value)}
              />
              <OutlawButton variant="primary" onClick={handleSearch} className="px-3" disabled={!friendNameInput}>
                検索
              </OutlawButton>
            </div>
            
            <div className="mt-4">
              {friendSearchResult ? (
                <div className="friend-card border-subtle p-2 flex-row-space-between align-center bg-black-60">
                  <div className="flex flex-row gap-2 align-center">
                    <img src={friendSearchResult.avatar_url || "/characters/reiji_transparent_asset.png"} alt="avatar" className="w-12 h-12 object-contain" />
                    <div className="flex-col">
                      <span className="font-size-8 font-weight-bold text-white">{friendSearchResult.username}</span>
                      <span className="font-size-7 text-secondary">Lv.{friendSearchResult.level}</span>
                    </div>
                  </div>
                  <OutlawButton variant="primary" onClick={() => handleSendRequest(friendSearchResult.id)} className="px-2 py-1 font-size-7">
                    申請
                  </OutlawButton>
                </div>
              ) : (
                <p className="font-size-8 text-secondary">検索結果がありません。</p>
              )}
            </div>
          </div>
        )}

        {activeTab === "requests" && (
          <div className="flex-col-gap-2">
            <h3 className="font-size-9 text-color-cyan font-weight-bold">承認待ち</h3>
            
            <div className="mt-2">
              <h4 className="font-size-8 text-white mb-2">受信した申請</h4>
              {friendRequests && friendRequests.length > 0 ? (
                friendRequests.map((f: any) => (
                  <div key={f.id} className="friend-card border-subtle p-2 flex-row-space-between align-center bg-black-60 mb-2">
                    <div className="flex flex-row gap-2 align-center">
                      <img src={f.avatarUrl || "/characters/reiji_transparent_asset.png"} alt="avatar" className="w-10 h-10 object-contain" />
                      <div className="flex-col">
                        <span className="font-size-8 font-weight-bold text-white">{f.username}</span>
                        <span className="font-size-7 text-secondary">Lv.{f.level}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <OutlawButton variant="primary" onClick={() => handleAcceptRequest(f.id)} className="px-2 py-1 font-size-7">
                        承認
                      </OutlawButton>
                      <OutlawButton variant="danger" onClick={() => handleRejectRequest(f.id)} className="px-2 py-1 font-size-7">
                        拒否
                      </OutlawButton>
                    </div>
                  </div>
                ))
              ) : (
                <p className="font-size-8 text-secondary">受信した申請はありません。</p>
              )}
            </div>
          </div>
        )}

        {activeTab === "invite" && (
          <div className="flex-col-gap-3">
            <h3 className="font-size-9 text-color-cyan font-weight-bold">友達をTRIBE NEONへ招待</h3>
            <p className="font-size-8 text-secondary">招待URLから新規プレイヤー登録が完了すると成立します。最大10人まで招待できます。</p>
            <div className="friend-card border-subtle p-3 bg-black-60">
              <div className="font-size-7 text-secondary">招待実績</div>
              <div className="font-size-12 text-white font-weight-bold">{invitationCount} / 10人</div>
              <div className="font-size-7 text-secondary mt-2">招待コード</div>
              <div className="font-size-12 text-color-cyan font-weight-bold">{giftCode || "未発行"}</div>
            </div>
            {!giftCode ? (
              <OutlawButton variant="primary" onClick={() => void handleGenerateGiftCode()}>招待コードを発行</OutlawButton>
            ) : (
              <>
                <OutlawButton variant="secondary" onClick={async () => {
                  const url = `${window.location.origin}/?invite=${encodeURIComponent(giftCode)}`;
                  await navigator.clipboard.writeText(url);
                  setConfirmDialogConfig({ isOpen: true, title: "招待URL", message: "招待URLをコピーしました。", onConfirm: () => setConfirmDialogConfig(null) });
                }}>招待URLをコピー</OutlawButton>
                <OutlawButton variant="secondary" onClick={() => {
                  const url = `${window.location.origin}/?invite=${encodeURIComponent(giftCode)}`;
                  const text = "TRIBE NEONで一緒に東京の頂点を目指そう。";
                  window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank", "noopener,noreferrer");
                }}>Xで共有</OutlawButton>
              </>
            )}
            <p className="font-size-7 text-secondary">被招待者にはダイヤ100、招待者には招待ミッション報酬が付与されます。報酬値はOpen Beta暫定です。</p>
          </div>
        )}
      </div>
    </FullScreenPanel>
  );
}
