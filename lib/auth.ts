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
});
