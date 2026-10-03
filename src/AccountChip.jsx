import React, { useEffect, useRef, useState } from 'react';
import { GraduationCap, LogIn, LogOut, ShieldCheck, User, X } from 'lucide-react';
import { organizerUrl, readSession, signIn, signOut, watchSession } from './auth.js';

/**
 * Shared sign-in for the quiz site and the assignment organizer. Both read the
 * same session key on this origin, so signing in here means the Assignments page
 * opens already signed in, and signing out there signs this page out too.
 *
 * Sits bottom right, clear of the settings gear and of the Assignments pill.
 */
export default function AccountChip() {
  const [session, setSession] = useState(() => readSession());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const wrapRef = useRef(null);

  useEffect(() => watchSession(() => setSession(readSession())), []);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function openPanel() {
    setError('');
    setOpen((value) => !value);
  }

  function submit(event) {
    event.preventDefault();
    const result = signIn(form.username, form.password);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setForm({ username: '', password: '' });
    setSession(result.account);
    setOpen(false);
  }

  function leave() {
    signOut();
    setSession(null);
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="fixed bottom-4 right-4 z-50">
      {open && (
        <div
          role="dialog"
          aria-label="Class sign in"
          className="mb-3 w-72 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-2xl"
        >
          {session ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                    Signed in
                  </p>
                  <p className="mt-1 text-lg font-semibold text-gray-800">{session.username}</p>
                  <p className="text-xs font-medium text-emerald-700">
                    {session.role === 'admin' ? 'Admin' : 'Student'} on the class board
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="cursor-pointer rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                >
                  <X size={16} />
                </button>
              </div>
              <a
                href={organizerUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                <GraduationCap size={16} />
                Open assignments
              </a>
              <button
                type="button"
                onClick={leave}
                className="mt-2 flex min-h-[40px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                    Class sign in
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    One login for the quiz site and the assignment board.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="cursor-pointer rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
                <div>
                  <label htmlFor="chip-username" className="mb-1 block text-xs font-medium text-gray-600">
                    Username
                  </label>
                  <div className="relative">
                    <User size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      id="chip-username"
                      type="text"
                      value={form.username}
                      autoComplete="username"
                      maxLength={24}
                      onChange={(event) => {
                        setForm({ ...form, username: event.target.value });
                        if (error) setError('');
                      }}
                      className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="chip-password" className="mb-1 block text-xs font-medium text-gray-600">
                    Password
                  </label>
                  <input
                    id="chip-password"
                    type="password"
                    value={form.password}
                    autoComplete="current-password"
                    onChange={(event) => {
                      setForm({ ...form, password: event.target.value });
                      if (error) setError('');
                    }}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>

                {error && <p className="text-xs font-medium text-red-600">{error}</p>}

                <button
                  type="submit"
                  className="flex min-h-[40px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                >
                  <LogIn size={16} />
                  Sign in
                </button>
              </form>

              <p className="mt-3 text-xs leading-relaxed text-gray-500">
                No login yet?{' '}
                <a
                  href={organizerUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-emerald-700 underline-offset-2 hover:underline"
                >
                  Open Assignments
                </a>{' '}
                and create one with the class code.
              </p>
              <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-gray-400">
                <ShieldCheck size={13} className="mt-0.5 shrink-0" />
                Saved in this browser only, so classmates each keep their own copy.
              </p>
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={openPanel}
        aria-expanded={open}
        title={session ? `Signed in as ${session.username}` : 'Sign in to the class board'}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 shadow-lg ring-1 ring-gray-200 transition hover:-translate-y-0.5 hover:text-emerald-700"
      >
        {session ? (
          <>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
              {session.username.trim().charAt(0).toUpperCase()}
            </span>
            <span className="hidden sm:inline">{session.username}</span>
            {session.role === 'admin' && <ShieldCheck size={14} className="text-emerald-600" />}
          </>
        ) : (
          <>
            <LogIn size={16} />
            <span className="hidden sm:inline">Sign in</span>
          </>
        )}
      </button>
    </div>
  );
}