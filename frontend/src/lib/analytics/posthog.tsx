import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';

posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY || '', {
  api_host: 'https://us.i.posthog.com',
  capture_exceptions: true, // This enables capturing exceptions using Error Tracking
  debug: import.meta.env.DEV,
  session_recording: {
    // WARNING: Only enable this if you understand the security implications
    recordCrossOriginIframes: true,
  },
});

export const PostHogAnalyticsProvider = ({ children }: { children: React.ReactNode }) => {
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
};
