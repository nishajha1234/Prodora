declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: import('../services/auth.service.js').AuthenticatedUser;
    }
  }
}

export {};
