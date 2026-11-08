// Next.js 16 renamed "middleware" to "proxy". This is the middleware you asked for.
// It is only a first gate (is there a valid session cookie?). Real authorization
// (active user, role) happens in src/lib/auth-helpers.js, close to the data.
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

// The manifest and icons are fetched by the browser WITHOUT cookies, so they must be public
// or "Add to Home Screen" breaks.
// /.well-known/assetlinks.json is how Android checks that the Khaas Portal app belongs to this site (it carries no secrets).
const PUBLIC_PATHS = ["/login", "/api/auth", "/manifest.webmanifest", "/icons", "/.well-known/assetlinks.json"];

export async function proxy(request) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (token) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (pathname !== "/") url.searchParams.set("callbackUrl", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
