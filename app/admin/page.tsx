import Link from "next/link";

const CARDS = [
  {
    href: "/admin/book",
    title: "予約調整（社内）",
    desc: "電話口など代理入力。全社員対象（任意で絞り込み）→ 顧客と同じ日程調整（P-04）",
    primary: true,
  },
  {
    href: "/admin/workers",
    title: "職人マスタ",
    desc: "Googleアカウント登録・調査メイン・有効／無効（P-05a）",
  },
  {
    href: "/admin/bookings",
    title: "予約一覧",
    desc: "確定・キャンセル済みの確認とオペキャンセル（P-05b）",
  },
  {
    href: "/admin/links",
    title: "顧客用URL発行",
    desc: "候補職人を選んで発行URLを作成（P-05c）",
  },
  {
    href: "/admin/settings",
    title: "共通設定",
    desc: "事務所・稼働時間・バッファ・2人必須など（P-05d）",
  },
];

export default function AdminHomePage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold">社内管理</h1>
      <p className="mb-8 text-sm text-slate-600">
        訪問調査の日程調整用。施工・車両・問い合わせ管理は対象外です。
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
