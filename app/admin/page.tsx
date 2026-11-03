import Link from "next/link";

const CARDS = [
  {
    href: "/internal/booking",
    title: "電話受付",
    desc: "住所を先に入力して候補枠を検索。メールは任意（社内オペ向け）",
    primary: true,
  },
  {
    href: "/internal/links",
    title: "URL発行",
    desc: "担当者選択＋必要人数（1人／2人）で顧客用URLを2タップ発行",
    primary: true,
  },
  {
    href: "/admin/book",
    title: "予約調整（詳細）",
    desc: "候補職人を絞り込んでから顧客と同じフローで代理入力",
  },
  {
    href: "/admin/workers",
    title: "職人マスタ",
    desc: "Googleアカウント登録・調査メイン・予約通知・有効／無効",
  },
  {
    href: "/admin/bookings",
    title: "予約一覧",
    desc: "確定・キャンセル済みの確認とオペキャンセル",
  },
  {
    href: "/admin/settings",
    title: "共通設定",
    desc: "事務所・稼働・バッファ・招待扱い・メール／画像（Firestore保存）",
  },
];

export default function AdminHomePage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold">社内管理</h1>
      <p className="mb-8 text-sm text-slate-600">
        訪問調査の日程調整用。認証は次スプリントで追加します。
      </p>
      <ul className="grid gap-4 sm:grid-cols-2">
        {CARDS.map(({ href, title, desc, primary }) => (
          <li key={href} className={primary ? "sm:col-span-2" : undefined}>
            <Link
              href={href}
              className={`flex h-full flex-col gap-2 rounded-2xl border p-5 transition hover:shadow-sm ${
                primary
                  ? "border-orange-400 bg-orange-50 hover:border-orange-500"
                  : "border-slate-200 bg-white hover:border-blue-900"
              }`}
            >
              <span className="text-lg font-bold text-slate-900">{title}</span>
              <span className="text-sm leading-relaxed text-slate-600">{desc}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
