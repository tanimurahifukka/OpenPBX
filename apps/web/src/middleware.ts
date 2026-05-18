import { NextRequest, NextResponse } from 'next/server';

// 未認証なら /login へリダイレクト。
// cookie の存在チェックだけで、有効性は Server Action / Page 内で再検証する。
const PUBLIC_PATHS = ['/login', '/api/login', '/api/logout', '/api/health'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/')) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }
  const hasSession = req.cookies.get('cr_session');
  if (!hasSession) {
    // /api/* は JSON API なのでリダイレクトせず 401 を返す
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
