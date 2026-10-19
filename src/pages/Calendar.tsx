import { Card, DemoBadge, PageHeader, StatusChip } from "../components/ui";
import { demoUpcomingPosts } from "../data/demo";

// October 2026: Oct 1 is a Thursday. Build a static month grid for the demo.
const YEAR = 2026;
const MONTH = 9; // 0-indexed: October
const MONTH_NAME = "October 2026";
const TIMEZONE = "Asia/Karachi (PKT, UTC+5)";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthCells(): (number | null)[] {
  const first = new Date(YEAR, MONTH, 1);
  // Convert Sunday-first to Monday-first offset
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(YEAR, MONTH + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function Calendar() {
  const cells = monthCells();
  const postsByDay = new Map<number, typeof demoUpcomingPosts>();
  for (const p of demoUpcomingPosts) {
    const arr = postsByDay.get(p.day) ?? [];
    arr.push(p);
    postsByDay.set(p.day, arr);
  }

  return (
    <div>
      <PageHeader
        title="Content Calendar"
        badge
        description="Scheduled posts by day. All entries are demo data — nothing is really scheduled."
      />

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-navy">{MONTH_NAME} <DemoBadge /></h2>
          <p className="text-sm text-gray-600">
            Timezone: <span className="font-semibold text-navy">{TIMEZONE}</span>
          </p>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase text-gray-500" role="row">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-2">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`${MONTH_NAME} calendar`}>
          {cells.map((day, i) => {
            const posts = day ? (postsByDay.get(day) ?? []) : [];
            const isToday = day === 18;
            return (
              <div
                key={i}
                role="gridcell"
                aria-label={day ? `${MONTH_NAME} ${day}` : "Empty"}
                className={`min-h-[88px] rounded-lg border p-1.5 text-left align-top ${
                  day ? "border-border bg-white" : "border-transparent bg-transparent"
                } ${isToday ? "ring-2 ring-primary" : ""}`}
              >
                {day ? (
                  <>
                    <span className={`text-xs font-bold ${isToday ? "text-primary" : "text-gray-700"}`}>{day}</span>
                    <div className="mt-1 space-y-1">
                      {posts.map((p) => (
                        <div key={p.id} className="rounded bg-bg p-1 text-[11px] leading-tight">
                          <p className="truncate font-medium text-gray-800">{p.caption}</p>
                          <p className="text-gray-500">{p.scheduledFor}</p>
                          <div className="mt-0.5"><StatusChip status={p.status} /></div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-gray-600">
          <span className="font-semibold">Legend:</span>
          <span className="flex items-center gap-1"><StatusChip status="scheduled" /> will run at its time</span>
          <span className="flex items-center gap-1"><StatusChip status="pending" /> awaiting confirmation</span>
          <span className="ml-2"><DemoBadge /></span>
        </div>
      </Card>
    </div>
  );
}
