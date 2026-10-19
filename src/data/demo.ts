/**
 * DEMO DATA — Phase 1 only.
 * Every value here is fictional sample content for UI development.
 * Nothing here represents a real Facebook Page, a real post, or a real publish result.
 * Real data arrives in Phase 2+ (database) and Phase 3+ (Meta OAuth).
 */

export interface DemoScheduledPost {
  id: string;
  caption: string;
  pages: string[];
  scheduledFor: string; // display string
  day: number; // day of month for the calendar
  status: "scheduled" | "pending";
}

export interface DemoQueueJob {
  id: string;
  content: string;
  pages: string[];
  scheduledFor: string;
  status: "scheduled" | "processing" | "published" | "failed";
  attempts: number;
}

export interface DemoMediaItem {
  id: string;
  name: string;
  type: "image" | "video";
  size: string;
  dimensions: string;
}

export interface DemoLogRow {
  id: string;
  dateTime: string;
  pages: string;
  status: "success" | "failed" | "cancelled";
  message: string;
}

export const demoUpcomingPosts: DemoScheduledPost[] = [
  { id: "up-1", caption: "Demo post 1 — weekend sale announcement", pages: ["Demo Page A", "Demo Page B"], scheduledFor: "Today, 6:00 PM", day: 18, status: "scheduled" },
  { id: "up-2", caption: "Demo video 1 — product teaser", pages: ["Demo Page A"], scheduledFor: "Tomorrow, 2:00 PM", day: 19, status: "scheduled" },
  { id: "up-3", caption: "Demo image post — new arrival", pages: ["Demo Page B"], scheduledFor: "Oct 20, 6:30 PM", day: 20, status: "pending" },
];

export const demoRecentActivity = [
  { id: "act-1", text: "Demo draft saved — \"Demo post 1\"", time: "2 hours ago" },
  { id: "act-2", text: "Demo media uploaded — demo-image-1.jpg", time: "5 hours ago" },
  { id: "act-3", text: "Demo scheduled post created for Demo Page A", time: "Yesterday" },
];

export const demoQueueJobs: DemoQueueJob[] = [
  { id: "job-1", content: "Demo post 1", pages: ["Demo Page A", "Demo Page B"], scheduledFor: "Oct 18, 6:00 PM", status: "scheduled", attempts: 0 },
  { id: "job-2", content: "Demo video 1", pages: ["Demo Page A"], scheduledFor: "Oct 19, 2:00 PM", status: "processing", attempts: 1 },
  { id: "job-3", content: "Demo image post", pages: ["Demo Page B"], scheduledFor: "Oct 17, 6:30 PM", status: "published", attempts: 1 },
  { id: "job-4", content: "Demo reel 1", pages: ["Demo Page A"], scheduledFor: "Oct 17, 9:00 PM", status: "failed", attempts: 3 },
];

export const demoMediaItems: DemoMediaItem[] = [
  { id: "m-1", name: "demo-image-1.jpg", type: "image", size: "1.2 MB", dimensions: "1920 × 1080" },
  { id: "m-2", name: "demo-video-1.mp4", type: "video", size: "24.6 MB", dimensions: "1080 × 1920" },
  { id: "m-3", name: "demo-video-2.mp4", type: "video", size: "31.8 MB", dimensions: "1920 × 1080" },
  { id: "m-4", name: "demo-image-2.png", type: "image", size: "860 KB", dimensions: "1080 × 1080" },
];

export const demoLogRows: DemoLogRow[] = [
  { id: "log-1", dateTime: "Oct 17, 6:30 PM", pages: "Demo Page B", status: "success", message: "Demo: post published successfully (sample result)" },
  { id: "log-2", dateTime: "Oct 17, 9:00 PM", pages: "Demo Page A", status: "failed", message: "Demo: rate limit exceeded (sample error)" },
  { id: "log-3", dateTime: "Oct 17, 9:15 PM", pages: "Demo Page A", status: "success", message: "Demo: retried and published (sample result)" },
  { id: "log-4", dateTime: "Oct 16, 2:00 PM", pages: "Demo Page A", status: "success", message: "Demo: post published successfully (sample result)" },
  { id: "log-5", dateTime: "Oct 16, 11:00 AM", pages: "Demo Page B", status: "cancelled", message: "Demo: cancelled by user (sample result)" },
];

export const setupChecklist = [
  { id: "sc-1", label: "Connect your Facebook account (OAuth)", done: false, phase: "Phase 3" },
  { id: "sc-2", label: "Connect at least one Facebook Page", done: false, phase: "Phase 3" },
  { id: "sc-3", label: "Upload media to the Media Library", done: false, phase: "Phase 1" },
  { id: "sc-4", label: "Create your first post", done: false, phase: "Phase 1" },
  { id: "sc-5", label: "Schedule a post (server-side scheduler)", done: false, phase: "Phase 5" },
];
