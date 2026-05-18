'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';

// URL の ?err=... / ?ok=... を読んで上部にバナー表示し、3 秒後に自動で消す。
// レイアウト直下に <FlashBanner /> を置けば全ページで効く。
export function FlashBanner() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    const e = params.get('err');
    const o = params.get('ok');
    if (!e && !o) {
      setErr(null);
      setOk(null);
      return;
    }
    setErr(e);
    setOk(o);
    // URL からクエリを除去
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      next.delete('err');
      next.delete('ok');
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    }, 4000);
    return () => clearTimeout(t);
  }, [params, pathname, router]);

  if (!err && !ok) return null;
  return (
    <div className="sticky top-12 z-20 mx-auto max-w-5xl px-4">
      {err && (
        <div
          role="alert"
          className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 shadow-sm"
        >
          <span aria-hidden>⚠️ </span>
          {err}
        </div>
      )}
      {ok && (
        <div
          role="status"
          className="mt-2 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 shadow-sm"
        >
          <span aria-hidden>✅ </span>
          {ok}
        </div>
      )}
    </div>
  );
}
