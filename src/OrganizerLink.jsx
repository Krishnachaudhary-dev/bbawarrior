import { GraduationCap } from 'lucide-react';

/**
 * Corner shortcut to the BBA Section H assignment organizer, which is served as
 * a static page from public/assignments.html. It opens in a new tab so nobody
 * loses their place in the quiz.
 */
export default function OrganizerLink() {
  const href = import.meta.env.BASE_URL + 'assignments.html';

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Open the assignment organizer"
      className="fixed top-4 left-4 z-50 inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-emerald-700"
    >
      <GraduationCap size={18} />
      <span className="hidden sm:inline">Assignments</span>
    </a>
  );
}
