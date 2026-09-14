import { clerkMiddleware } from '@clerk/nextjs/server';

export default clerkMiddleware();

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/cloud/:path*',
    '/morpheus/:path*',
    '/__clerk/:path*',
  ],
};
