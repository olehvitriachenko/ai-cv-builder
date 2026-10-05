export interface AuthUser {
  id: string;
  email: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the auth guard from the validated session; never from client input. */
    authUser?: AuthUser;
  }
}
