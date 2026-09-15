import Link from "next/link";
import "./TitleLegalFooter.css";

type TitleLegalFooterProps = {
  boot?: boolean;
};

export default function TitleLegalFooter({ boot = false }: TitleLegalFooterProps) {
  return (
    <footer className={`title-footer${boot ? " title-footer--boot" : ""}`}>
      <p className="title-play-note">アプリのダウンロード不要でプレイできます。</p>
      <nav className="title-legal-links" aria-label="法的情報" onClick={(event) => event.stopPropagation()}>
        <Link href="/legal/terms">利用規約</Link>
        <Link href="/legal/privacy">プライバシーポリシー</Link>
        <Link href="/legal/tokusho">特定商取引法に基づく表記</Link>
      </nav>
      {!boot && (
        <div className="title-copyright">
          <span>v0.1.0</span>
          <span>© 2026 TRIBE NEON</span>
        </div>
      )}
    </footer>
  );
}
