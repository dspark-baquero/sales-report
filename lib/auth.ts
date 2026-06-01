import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    signIn({ profile }) {
      return profile?.email?.endsWith("@baquero.co.kr") ?? false;
    },
    jwt({ token, profile }) {
      if (profile) {
        token.name = profile.name;
        token.email = profile.email;
        token.picture = profile.picture;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.email) {
        session.user.name = token.name as string;
        session.user.email = token.email as string;
        session.user.image = (token.picture as string) ?? "";
      }
      return session;
    },
  },
  events: {
    // 로그인 이벤트 기록 — 누가/언제. Cloud Run stdout → Cloud Logging(jsonPayload).
    // JWT 세션이라 실제 로그인 시점에만 발생(페이지 이동마다 X).
    // 조회: Cloud Logging에서 jsonPayload.event="login" 필터.
    signIn({ user }) {
      console.log(
        JSON.stringify({
          event: "login",
          email: user?.email ?? null,
          name: user?.name ?? null,
          ts: new Date().toISOString(),
        }),
      );
    },
  },
});
