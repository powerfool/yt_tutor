import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          const username = credentials?.username as string;
          const password = credentials?.password as string;

          if (!username || !password) return null;

          const validUsername = username === process.env.ADMIN_USERNAME;
          const validPassword = await bcrypt.compare(
            password,
            process.env.ADMIN_PASSWORD_HASH!
          );

          if (validUsername && validPassword) {
            return { id: "1", name: username };
          }
          return null;
        } catch (err) {
          console.error("[AUTH] authorize error:", err);
          return null;
        }
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
});
