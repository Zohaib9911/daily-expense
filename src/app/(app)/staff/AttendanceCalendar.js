import { daysInMonth } from "@/lib/salary";

const STYLE = {
  present: "bg-green-100 text-green-800",
  absent: "bg-red-100 text-red-700",
  half_day: "bg-gradient-to-br from-green-100 from-50% to-red-100 to-50% text-slate-800",
  none: "bg-slate-50 text-slate-400",
};
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Month grid (Mon-Sun) coloured by attendance. `days`: { [dayOfMonth]: "present" | "absent" | "half_day" }.
 * Days before `joinDay` (a day of this month, or 1) and after `lastDay` (today, in the current month) are dimmed.
 */
export default function AttendanceCalendar({ month, days, joinDay = 1, lastDay }) {
  const dim = daysInMonth(month);
  const [y, m] = month.split("-").map(Number);
  const firstDow = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // Monday = 0
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, i) =>
          day === null ? (
            <span key={`b${i}`} />
          ) : (
            <span
              key={day}
              title={days[day] ? days[day].replace("_", " ") : "not marked"}
              className={`flex aspect-square items-center justify-center rounded-lg text-sm font-semibold ${STYLE[days[day] || "none"]} ${
                day < joinDay || (lastDay && day > lastDay) ? "opacity-30" : ""
              }`}
            >
              {day}
            </span>
          )
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-green-100" /> Present</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-gradient-to-br from-green-100 from-50% to-red-100 to-50%" /> Half day</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-red-100" /> Absent</span>
        <span className="flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-slate-100" /> Not marked</span>
      </div>
    </div>
  );
}
