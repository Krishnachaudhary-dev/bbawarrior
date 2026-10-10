    import React, { useEffect, useMemo, useRef, useState } from "react";
    import { createRoot } from "react-dom/client";
    import {
      ArrowRight, BookOpen, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert,
      CircleCheckBig, Clock,      Copy, Download, Eye, EyeOff, FileText, Filter, GraduationCap,
      HardDrive, ImagePlus, Inbox, KeyRound, Layers, Lightbulb, LoaderCircle,
      Lock, LogIn, LogOut, Maximize2, Monitor, Moon, Pencil, PenLine, Plus,
      RefreshCw, Search, Settings, ShieldCheck, Sparkles, Sun, Tag, Trash2,
      Upload, User, UserPlus, Users, X, ZoomIn, ZoomOut,
    } from "lucide-react";

    /* ============================================================
       Domain constants
       ============================================================ */

    const DEFAULT_CLASS_CODE = "SECTION-H";
    const STORAGE_KEY = "bba-section-h-organizer.v1";
    const CONFIG_KEY = "bba-section-h-organizer.config.v1";
    /* Two keys from before sign in moved to the server. The session key once held
       who was signed in, the enrolment key once held a password waiting for the
       board. Nothing writes them any more; they are deleted on boot so no copy of
       an old credential survives in this browser. */
    const LEGACY_SESSION_KEY = "bba-section-h-organizer.session.v1";
    const LEGACY_PENDING_KEY = "bba-section-h-organizer.pending-enrolment.v1";
    /* #admin only chooses which sign in screen opens. It grants nothing: every
       privileged call is authorised by the server against the session cookie. */
    const ADMIN_HASH = "#admin";

    /* Everyone signs in with their own login. An admin can manage the class,
       a student can submit work to the shared board. */
    const ROLE_META = {
      admin: {
        label: "Admin",
        chip: "bg-amber-50 text-amber-700 ring-amber-200/80 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/25",
      },
      student: {
        label: "Student",
        chip: "bg-slate-100 text-slate-600 ring-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
      },
    };

    const DEFAULT_SUBJECTS = [
      "Business Economics",
      "General Proficiency",
      "Indian Knowledge System",
      "Environmental Science and Sustainability",
      "Communication Lab",
      "Financial Accounting",
      "Principles and Practices of Management",
      "Business Communication - I",
    ];

    /* Subjects carry a single dot colour. The chip itself stays neutral so the
       page keeps one accent language instead of a rainbow of pastel badges. */
    const SUBJECT_DOTS = {
      "Business Economics": "bg-indigo-500",
      "General Proficiency": "bg-rose-500",
      "Indian Knowledge System": "bg-violet-500",
      "Environmental Science and Sustainability": "bg-sky-500",
      "Communication Lab": "bg-cyan-500",
      "Financial Accounting": "bg-amber-500",
      "Principles and Practices of Management": "bg-teal-500",
      "Business Communication - I": "bg-orange-500",
    };
    const subjectDot = (subject) => SUBJECT_DOTS[subject] || "bg-slate-400 dark:bg-slate-500";

    const STATUS_META = {
      pending: {
        label: "Pending",
        icon: Clock,
        chip: "bg-amber-50 text-amber-700 ring-amber-200/80 hover:bg-amber-100 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/25 dark:hover:bg-amber-400/20",
        active: "bg-amber-50 text-amber-700 ring-amber-300 dark:bg-amber-400/15 dark:text-amber-200 dark:ring-amber-400/40",
        bar: "bg-amber-500",
        tile: "bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20",
      },
      "in-progress": {
        label: "In Progress",
        icon: LoaderCircle,
        chip: "bg-sky-50 text-sky-700 ring-sky-200/80 hover:bg-sky-100 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/25 dark:hover:bg-sky-400/20",
        active: "bg-sky-50 text-sky-700 ring-sky-300 dark:bg-sky-400/15 dark:text-sky-200 dark:ring-sky-400/40",
        bar: "bg-sky-500",
        tile: "bg-sky-50 text-sky-600 ring-sky-100 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/20",
      },
      completed: {
        label: "Completed",
        icon: CircleCheckBig,
        chip: "bg-emerald-50 text-emerald-700 ring-emerald-200/80 hover:bg-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/25 dark:hover:bg-emerald-400/20",
        active: "bg-emerald-50 text-emerald-700 ring-emerald-300 dark:bg-emerald-400/15 dark:text-emerald-200 dark:ring-emerald-400/40",
        bar: "bg-emerald-500",
        tile: "bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20",
      },
    };
    const STATUS_ORDER = ["pending", "in-progress", "completed"];
    const NEXT_STATUS = { pending: "in-progress", "in-progress": "completed", completed: "pending" };

    const THEME_ORDER = ["light", "dark", "system"];
    const THEME_META = {
      light: { label: "Light", icon: Sun },
      dark: { label: "Dark", icon: Moon },
      system: { label: "System", icon: Monitor },
    };

    const DUE_FILTERS = [
      { key: "all", label: "All" },
      { key: "overdue", label: "Overdue" },
      { key: "today", label: "Due today" },
      { key: "week", label: "Next 7 days" },
    ];

    /* Required fields, in the order they should be chased when a submit fails.
       The modal scrolls as one long column, so this order doubles as the
       order the eye is walked down the form. */
    const REQUIRED_FIELDS = [
      { key: "title", label: "Title" },
      { key: "subject", label: "Subject" },
      { key: "dueDate", label: "Due date" },
      { key: "description", label: "Description" },
    ];    /* Pictures per assignment, per part. Six keeps a card readable; the files
       themselves live in Storage, so a photo heavy board no longer decides
       whether the browser store or the first paint survives. */
    const MAX_PICTURES = 6;

    const SEED = [
      {
        id: "seed-1",
        subject: "Financial Accounting",
        title: "Ratio Analysis: Walmart vs. Target",
        description:
          "Compute liquidity, leverage and profitability ratios for both retailers from their latest filings, then write a 400-word comparison of how efficiently each firm manages working capital.",
        solution:
          "1) Current ratio = Current Assets / Current Liabilities\n   Walmart about 0.81, Target about 1.18\n\n2) Debt to Equity = Total Debt / Shareholders' Equity\n   Walmart about 0.66, Target about 1.29\n\n3) DuPont ROE = Net Margin x Asset Turnover x Equity Multiplier\n   Walmart about 22.1%, Target about 29.4%\n\nConclusion: Target is more liquid but materially more leveraged. Walmart's thinner liquidity is cushioned by fast cash conversion. Retail runs on negative working capital, so payables turnover matters more than the current ratio. Say that explicitly for full marks.",
        dueDate: "2026-10-06",
        status: "in-progress",
        createdAt: 1,
      },
      {
        id: "seed-2",
        subject: "Principles and Practices of Management",
        title: "Case Study: Communication Breakdown on the Assembly Line",
        description:
          "Identify the structural and behavioural causes of the production delay, map each cause to a communication model from class, and recommend two corrective actions.",
        solution:
          "Framework: Ladder of Inference plus Johari Window for the floor supervisor conflict.\n\n1) Cause, filtering: shift reports summarised away the defect rate.\n   Model: Shannon and Weaver noise in the encoding step.\n\n2) Cause, status distance: operators did not challenge the supervisor.\n   Model: Hofstede power distance, score about 40 in the case.\n\nRecommendations:\n1. Ten minute tiered huddle at every shift handover with a fixed defect template.\n2. Anonymous issue channel reviewed by the team lead within 24 hours.\n\nFinish with one paragraph on how each fix shortens the feedback loop.",
        dueDate: "2026-10-03",
        status: "pending",
        createdAt: 2,
      },
      {
        id: "seed-3",
        subject: "General Proficiency",
        title: "Contract Validity Problem Set (Offer, Acceptance, Consideration)",
        description:
          "Answer the six hypotheticals on offer, acceptance and consideration, citing the governing principle for every conclusion in IRAC form.",
        solution:
          "Q1: An advertisement is an invitation to treat (Partridge v Crittenden). The shop display accepted the customer's offer, not the other way round.\n\nQ2: A counter offer kills the original offer (Hyde v Wrench).\n\nQ3: Late acceptance only counts if the offeror is notified promptly (Adams v Lindsell). Silence is never acceptance (Felthouse v Bindley).\n\nQ4: Consideration must move from the promisee, and past consideration is no consideration (Roscorla v Thomas).\n\nQ5: A certified cheque is valid consideration even for a moral duty (Hamer v Sidway).\n\nQ6: Intention to create legal relations: a social agreement carries a rebuttable presumption against (Balfour v Balfour).",
        dueDate: "2026-10-12",
        status: "in-progress",
        createdAt: 3,
      },
      {
        id: "seed-4",
        subject: "Business Communication - I",
        title: "Formal Memo: Remote Work Policy Change",
        description:
          "Draft a one-page block memo from the HR Director to all staff announcing the hybrid policy effective 1 November, including rationale, expectations and next steps.",
        solution:
          "MEMORANDUM\nTo: All Employees\nFrom: Director of Human Resources\nDate: 12 October 2026\nSubject: Transition to a Hybrid Work Schedule\n\nOpening, direct: from 1 November all professional roles move to a three day in office schedule, Tuesday to Thursday.\n\nRationale, reader benefit first:\n1. Faster cross team decisions\n2. Mentoring for junior staff\n3. Client visits handled without rescheduling\n\nExpectations: core hours 9:30 to 16:00, calendar blocks for focus work, manager approval for exceptions.\n\nClose: FAQ session on 20 October, questions to people@company.com.\n\nTone check: second person, active voice, no hedging.",
        dueDate: "2026-09-28",
        status: "pending",
        createdAt: 4,
      },
      {
        id: "seed-5",
        subject: "Business Economics",
        title: "ERP Selection Report: SAP vs. Oracle vs. Dynamics",
        description:
          "Score three ERP vendors on a weighted decision matrix for a mid-sized manufacturer and justify the recommendation in a two page report.",
        solution:
          "Weights: Functionality .30, Total cost of ownership .25, Implementation risk .20, Scalability .15, Vendor support .10\n\nScores out of 10:\nSAP S/4HANA: 8, 5, 6, 9, 8 gives 7.15\nOracle Fusion: 7, 6, 6, 9, 7 gives 6.95\nMicrosoft Dynamics 365: 7, 9, 8, 7, 7 gives 7.60\n\nRecommendation: Dynamics 365, the best balance of cost and risk for a 400 seat manufacturer already on Microsoft 365. Revisit SAP if the group acquires an SAP shop.\n\nAdd a sensitivity note: if the cost weight drops to .15, SAP moves to first place.",
        dueDate: "2026-09-26",
        status: "completed",
        createdAt: 5,
      },
      {
        id: "seed-6",
        subject: "General Proficiency",
        title: "Linear Programming: Production Mix (Exercise Set 4)",
        description:
          "Formulate the production mix LP, solve it with the simplex method, and interpret the shadow prices for both constraints.",
        solution:
          "Maximise Z = 40x1 + 30x2\nSubject to:\n  2x1 + 1x2 <= 40 (assembly hours)\n  1x1 + 2x2 <= 50 (finishing hours)\n  x1, x2 >= 0\n\nOptimal tableau: x1 = 10, x2 = 20, Z = 1000.\n\nShadow prices: assembly 10 per hour, finishing 10 per hour. Buy assembly hours first, up to the feasibility range of 33.3 to 55 hours.\n\nA reduced cost of minus 5 on a third product means it must earn 5 more per unit before it enters the basis.",
        dueDate: "2026-10-15",
        status: "completed",
        createdAt: 6,
      },
      {
        id: "seed-7",
        subject: "Business Economics",
        title: "STP Analysis of Nespresso",
        description:
          "Segment the at-home coffee market, define the target segment Nespresso serves, and write a positioning statement supported by evidence from the case.",
        solution: "",
        dueDate: "2026-10-09",
        status: "pending",
        createdAt: 7,
      },
      {
        id: "seed-8",
        subject: "Environmental Science and Sustainability",
        title: "Persuasive Pitch: Campus Sustainability Fee",
        description:
          "Build a five slide persuasive argument for or against a $50 per semester sustainability fee, using one concession and refute move.",
        solution: "",
        dueDate: "2026-10-18",
        status: "pending",
        createdAt: 8,
      },
    ];

    /* ============================================================
       Storage
       ============================================================ */

    const uid = () => "a-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);

    function loadItems() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.items)) return parsed.items.map(normaliseItem);
        }
      } catch (err) {
        /* corrupted storage, fall back to the sample set */
      }
      return SEED.map(normaliseItem);
    }

    function saveItems(items) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, items }));
        return true;
      } catch (err) {
        return false; /* quota exceeded or storage blocked */
      }
    }

    /* Ids deleted on this device, kept until the server copy agrees they are
       gone. A board answer can predate a delete made here, and without this
       list the next poll would put the card straight back on screen. Ids are
       never reused, so a tombstone only has to outlive the round trip. */
    const DELETED_KEY = "bba-section-h-organizer.deleted.v1";

    function loadDeleted() {
      try {
        const parsed = JSON.parse(localStorage.getItem(DELETED_KEY) || "[]");
        return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string" && id) : [];
      } catch (err) {
        return []; /* corrupted storage, nothing to guard */
      }
    }

    function saveDeleted(list) {
      try {
        localStorage.setItem(DELETED_KEY, JSON.stringify(list.slice(-200)));
        return true;
      } catch (err) {
        return false;
      }
    }

    /* One decision for every board answer, pure so it can be tested without a
       board: drop ids this device has already deleted, forget the tombstones
       the server has caught up with, and report whether the corrected list
       needs to travel back so every device converges on the shorter list. */
    function reconcileBoard(remoteItems, localItems, deletedIds) {
      const gone = new Set(deletedIds);
      const kept = remoteItems.filter((item) => !gone.has(item.id));
      const held = new Set(remoteItems.map((item) => item.id));
      return {
        items: kept,
        changed: itemsFingerprint(kept) !== itemsFingerprint(localItems),
        stale: kept.length !== remoteItems.length,
        nextDeleted: deletedIds.filter((id) => held.has(id)),
      };
    }

    function normaliseAccount(raw) {
      if (!raw || !raw.username) return null;
      const username = String(raw.username).replace(/\s+/g, " ").trim();
      if (!username) return null;
      return {
        id: raw.id ? String(raw.id) : uid(),
        username,
        /* No password field, ever. The server publishes only these fields and the
           browser has no business holding a credential of anyone's. */
        role: raw.role === "admin" ? "admin" : "student",
        createdAt: raw.createdAt ? Number(raw.createdAt) : Date.now(),
        lastSeen: raw.lastSeen ? Number(raw.lastSeen) : 0,
      };
    }

    /* A cached roster only: the accounts this device last saw, with no secrets.
       Who may sign in, and as what role, is decided on the board, never here. */
    function normaliseConfig(parsed) {
      const source = parsed && typeof parsed === "object" ? parsed : {};
      const accounts = Array.isArray(source.accounts)
        ? source.accounts.map(normaliseAccount).filter(Boolean)
        : [];

      return {
        subjects: Array.isArray(source.subjects) && source.subjects.length ? source.subjects : [...DEFAULT_SUBJECTS],
        theme: source.theme || "system",
        classCode: typeof source.classCode === "string" && source.classCode.trim() ? source.classCode.trim() : DEFAULT_CLASS_CODE,
        accounts,
      };
    }

    function loadConfig() {
      try {
        const raw = localStorage.getItem(CONFIG_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && (Array.isArray(parsed.subjects) || Array.isArray(parsed.accounts))) {
            return normaliseConfig(parsed);
          }
        }
      } catch (err) {
        /* fall through to defaults */
      }
      return normaliseConfig({ subjects: [...DEFAULT_SUBJECTS], theme: "system" });
    }

    function saveConfig(config) {
      try {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
        return true;
      } catch (err) {
        return false;
      }
    }

    /* Removes credentials an older version of this app left in the browser: the
       remembered sign in, a password waiting for the board, and any password
       field still sitting inside the cached account list. Runs on every boot and
       never prints what it removes. */
    function purgeLegacySecrets() {
      try {
        localStorage.removeItem(LEGACY_SESSION_KEY);
        localStorage.removeItem(LEGACY_PENDING_KEY);
        const raw = localStorage.getItem(CONFIG_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return;
        let changed = false;
        if (typeof parsed.password === "string") {
          delete parsed.password;
          changed = true;
        }
        if (Array.isArray(parsed.accounts)) {
          const cleaned = parsed.accounts.map((account) => {
            if (account && typeof account === "object" && "password" in account) {
              const { password, ...rest } = account;
              changed = true;
              return rest;
            }
            return account;
          });
          parsed.accounts = cleaned;
        }
        if (changed) localStorage.setItem(CONFIG_KEY, JSON.stringify(parsed));
      } catch (err) {
        /* a broken file is replaced by the next save anyway */
      }
    }

    /* index.html#admin (or ?gate=admin) opens the admin gate. Students land on the
       class screen and never see it. */
    function readGate() {
      try {
        const hash = String(window.location.hash || "").replace(/^#/, "").toLowerCase();
        if (hash === "admin" || hash === "adm") return "admin";
        if (new URLSearchParams(window.location.search).get("gate") === "admin") return "admin";
      } catch (err) {
        /* fall through to the class gate */
      }
      return "class";
    }

    function accountsFingerprint(accounts) {
      return (accounts || [])
        .map((a) => [a.id, a.username, a.role, a.lastSeen || 0].join(":"))
        .join("|");
    }

    /* The roster on the board arrives with no secrets, so it simply replaces the
       cached list. There is nothing to carry over: no device holds a password
       for anyone any more. */
    function mergeRemoteAccounts(remote) {
      return Array.isArray(remote) ? remote.map(normaliseAccount).filter(Boolean) : [];
    }

    function itemsFingerprint(items) {
      return items
        .map((i) =>
          [i.id, i.createdAt || 0, i.updatedAt || 0, i.status, i.title, (i.images || []).length, (i.solutionImages || []).length].join(":")
        )
        .join("|");
    }

    function storageOriginLabel() {
      try {
        const origin = window.location.origin;
        if (origin && origin !== "null") return origin;
      } catch (err) {
        /* fall through to the file case */
      }
      return "this file, opened straight from your computer";
    }

    /* Shared class board. Served from the college quiz app, /api holds one copy for
       everyone, so an admin deleting an assignment removes it for every student on
       their next poll. Opened on its own, or with no network, the API does not
       answer and this app keeps using its own localStorage copy as before. */
    /* Why the last board call came back with nothing: "slow" for one cut off while the
       function woke up, "unreachable" for a network that is not there. The sign in
       screen says which, because they call for different things. */
    let lastFailure = null;

    /* One board call, tried at most twice. A serverless function that has been
       asleep for a while takes seconds to wake up, and a request cut off during
       that wake is indistinguishable from a board that is not there: both arrive
       as nothing at all. Believing the first one is what turned a cold start into
       "the class board did not answer" and a student locked out of their own
       account.

       Answers { data, status }: data is the parsed body (null when nothing
       arrived), status is the HTTP status (0 when nothing arrived). The status
       matters now that identity lives in a cookie: a 401 is a sign out, not a
       failed save. The session cookie rides along automatically; this code never
       sees it and cannot read it. */
    function remoteRequest(path, options) {
      const limit = (options && options.timeout) || 4000;
      return (async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
          const controller = new AbortController();
          let late = false;
          const timer = setTimeout(() => {
            late = true;
            controller.abort();
          }, limit);
          try {
            const res = await fetch("./api" + path, {
              method: (options && options.method) || "GET",
              headers: { "Content-Type": "application/json" },
              body: options ? options.body : undefined,
              signal: controller.signal,
              credentials: "same-origin",
            });
            const data = await res.json();
            lastFailure = null;
            return { data, status: res.status };
          } catch (err) {
            lastFailure = late ? "slow" : "unreachable";
          } finally {
            clearTimeout(timer);
          }
        }
        return { data: null, status: 0 };
      })();
    }

    async function remotePull() {
      const { data } = await remoteRequest("/state");
      /* The realtime doorbell config doubles as the browser's Storage
         credential: same publishable key, same origin. Captured on every
         pull so uploads never need a second round trip. */
      if (data && data.ok && data.realtime) storageConfig = data.realtime;
      return data && data.ok ? data : null;
    }

    /* A board write. This code sends no identity of its own: the HttpOnly session
       cookie authenticates the request and the server re-derives the account and
       its role from the board on every call. */
    async function remotePush(type, payload) {
      const { data, status } = await remoteRequest("/action", {
        method: "POST",
        body: JSON.stringify({ type, payload }),
        /* A write gets longer than a read, because cutting one off at four seconds
           on a weak signal looked exactly like a board that refused it. */
        timeout: 10000,
      });
      /* The body is read whatever the status was, so a refusal from the server can
         be shown instead of vanishing. A request that never arrived is not a
         refusal though, and the two have to stay apart: an alert that says a save
         was turned down would be lying about a dropped connection. */
      if (!data) return { ok: false, offline: true, reason: lastFailure === "slow" ? "The class board took too long to answer." : "No connection to the class board." };
      if (status === 401) return { ok: false, offline: false, sessionLost: true, reason: data.reason || "Your session has expired. Sign in again." };
      if (status === 429) return { ok: false, offline: false, rateLimited: true, reason: data.reason || "Too many attempts. Try again in a minute." };
      return data.ok
        ? { ok: true, offline: false }
        : { ok: false, offline: false, reason: data.reason || "The server did not accept that change." };
    }

    /* Supabase Realtime, used only as a doorbell. The browser subscribes with the
       anon key, which is public by design, and hears one thing: that an admin saved
       something. No board data and no login ever travels on this channel, the browser
       then re-reads /api/state where the access rules live. If this cannot connect
       the poll below still keeps the board fresh, so a failure here is never fatal. */
    let realtimeChannel = null;
    async function openRealtime(config, onChange) {
      if (realtimeChannel || !config || !config.url || !config.anonKey) return;
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(config.url, config.anonKey, { auth: { persistSession: false } });
        realtimeChannel = supabase
          .channel("class-board")
          .on("broadcast", { event: "changed" }, () => onChange())
          .subscribe();
      } catch (err) {
        realtimeChannel = null;
      }
    }

    /* Every auth answer is one of three shapes: agreed (with the safe account
       fields), refused (with a reason the caller may show), or the board could
       not be reached. The password travels to exactly one endpoint on this
       origin, over the same connection as everything else, and is never kept,
       echoed back or stored anywhere by this code. */
    function offlineReason() {
      return lastFailure === "slow"
        ? "The class board took too long to answer. Try again in a moment."
        : "This device cannot reach the class board.";
    }

    async function authRequest(path, payload) {
      const { data, status } = await remoteRequest(path, {
        method: "POST",
        body: JSON.stringify(payload),
        timeout: 10000,
      });
      if (!data) return { ok: false, offline: true, reason: offlineReason() };
      return { ok: Boolean(data.ok), offline: false, status, data };
    }

    /* GET /api/auth/me: who the session cookie says we are, decided entirely on
       the server. offline means the server could not be asked at all, which is
       different from being asked and told nobody is signed in. */
    async function meRequest() {
      const { data, status } = await remoteRequest("/auth/me");
      if (!data) return { ok: false, offline: true, reason: offlineReason() };
      if (data.ok && data.account) return { ok: true, offline: false, account: data.account };
      return {
        ok: false,
        offline: false,
        status,
        setup: Boolean(data.setup),
        reason: data.reason || "",
      };
    }

    async function loginRequest(username, password, adminOnly) {
      const result = await authRequest("/auth/login", { username, password, adminOnly: Boolean(adminOnly) });
      if (result.offline) return result;
      if (result.ok && result.data && result.data.account) {
        return { ok: true, offline: false, account: result.data.account };
      }
      return {
        ok: false,
        offline: false,
        setup: Boolean(result.data && result.data.setup),
        reason: (result.data && result.data.reason) || "That username or password is not right.",
      };
    }

    async function registerRequest(username, password, code) {
      const result = await authRequest("/auth/register", { username, password, code });
      if (result.offline) return result;
      if (result.ok && result.data && result.data.account) {
        return { ok: true, offline: false, account: result.data.account };
      }
      return {
        ok: false,
        offline: false,
        reason: (result.data && result.data.reason) || "That account could not be created.",
      };
    }

    /* First run only: the server refuses setup forever once any account exists. */
    async function setupRequest(username, password) {
      const result = await authRequest("/auth/setup", { username, password });
      if (result.offline) return result;
      if (result.ok && result.data && result.data.account) {
        return { ok: true, offline: false, account: result.data.account };
      }
      return {
        ok: false,
        offline: false,
        reason: (result.data && result.data.reason) || "That account could not be created.",
      };
    }

    async function changePasswordRequest(current, next) {
      const result = await authRequest("/auth/change-password", { currentPassword: current, newPassword: next });
      if (result.offline) return { ok: false, offline: true, reason: result.reason };
      if (result.ok) return { ok: true };
      if (result.status === 401) {
        return { ok: false, sessionLost: true, reason: (result.data && result.data.reason) || "Your session has expired. Sign in again." };
      }
      return {
        ok: false,
        offline: false,
        reason: (result.data && result.data.reason) || "Could not save that password.",
      };
    }

    async function logoutRequest() {
      try {
        await remoteRequest("/auth/logout", { method: "POST", body: "{}", timeout: 6000 });
      } catch (err) {
        /* a failed call still leaves the server session to expire on its clock */
      }
    }

    /* Admin account operations. The server checks the session's role against the
       board on every call; nothing on this side can talk its way into an admin
       action. A successful response carries the refreshed public account list so
       the cached roster updates at once. */
    async function adminRequest(method, path, payload) {
      const { data, status } = await remoteRequest(path, {
        method,
        body: payload === undefined ? "{}" : JSON.stringify(payload),
        timeout: 10000,
      });
      if (!data) return { ok: false, offline: true, reason: offlineReason() };
      if (status === 401) {
        return { ok: false, sessionLost: true, reason: data.reason || "Your session has expired. Sign in again." };
      }
      if (!data.ok) return { ok: false, reason: data.reason || "The server did not accept that." };
      return { ok: true, accounts: Array.isArray(data.accounts) ? data.accounts : null };
    }

    /* Registration lives at /api/auth/register now: the password goes straight to
       the server, is hashed there, and comes back as a signed in session. There
       is no pending copy waiting in this browser, because a copy waiting in a
       browser is a password in a browser. */

    function adminGateUrl() {
      try {
        const url = new URL(window.location.href);
        url.hash = "admin";
        url.search = "";
        return url.toString();
      } catch (err) {
        return ADMIN_HASH;
      }
    }

    function storageUsageText() {
      try {
        const bytes =
          (localStorage.getItem(STORAGE_KEY) || "").length +
          (localStorage.getItem(CONFIG_KEY) || "").length;
        const kb = bytes / 1024;
        return kb > 1024 ? (kb / 1024).toFixed(2) + " MB" : Math.max(1, Math.round(kb)) + " KB";
      } catch (err) {
        return "an unknown amount";
      }
    }

    /* ============================================================
       Date, image and file helpers
       ============================================================ */

    function parseISO(iso) {
      const [y, m, d] = String(iso).split("-").map(Number);
      if (!y || !m || !d) return null;
      return new Date(y, m - 1, d);
    }

    function formatDate(iso) {
      const date = parseISO(iso);
      if (!date) return "No date";
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }

    function daysUntil(iso) {
      const date = parseISO(iso);
      if (!date) return null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return Math.round((date - today) / 86400000);
    }

    function dueInfo(iso, status) {
      const diff = daysUntil(iso);
      if (diff === null) return { label: "No due date", tone: "text-slate-500 dark:text-slate-400", overdue: false };

      let label, tone, overdue = false;
      if (diff > 1) { label = "Due in " + diff + " days"; tone = "text-slate-500 dark:text-slate-400"; }
      else if (diff === 1) { label = "Due tomorrow"; tone = "text-amber-600 dark:text-amber-400"; }
      else if (diff === 0) { label = "Due today"; tone = "text-amber-600 dark:text-amber-400"; }
      else if (diff === -1) { label = "1 day overdue"; tone = "text-rose-600 dark:text-rose-400"; overdue = true; }
      else { label = Math.abs(diff) + " days overdue"; tone = "text-rose-600 dark:text-rose-400"; overdue = true; }

      /* The status chip already says Completed, so the due row stays quiet. */
      if (status === "completed") return { label: "", tone: "text-slate-500 dark:text-slate-400", overdue: false };
      return { label, tone, overdue };
    }

    /* Buckets power the quick filter chips. Finished work is never overdue. */
    function dueBucket(item) {
      const diff = daysUntil(item.dueDate);
      if (diff === null) return "later";
      if (diff < 0) return item.status === "completed" ? "later" : "overdue";
      if (diff === 0) return "today";
      if (diff <= 7) return "week";
      return "later";
    }

    /* Pick history: files are handed to uploadFile() as typed blobs straight
       from the input - no canvas re-encoding - so a PNG stays a PNG and a PDF
       stays a PDF all the way into the assignments Storage bucket. */

    function downloadBackup(items, config) {
      const payload = {
        app: "BBA Section H Organizer",
        version: 1,
        exportedAt: new Date().toISOString(),
        items,
        subjects: config.subjects,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "bba-section-h-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    function readJsonFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("That file could not be read."));
        reader.onload = () => {
          try {
            resolve(JSON.parse(String(reader.result)));
          } catch (err) {
            reject(new Error("That file is not valid JSON."));
          }
        };
        reader.readAsText(file);
      });
    }    /* Files are uploaded straight to Supabase Storage as typed blobs, so the
       filename keeps its real extension and the download keeps its real MIME
       type. The board row only ever receives the public URL this returns. */
    let storageConfig = null;
    let storageClientPromise = null;

    function getStorageClient() {
      if (!storageConfig || !storageConfig.url || !storageConfig.anonKey) {
        return Promise.reject(
          new Error("File storage is not connected yet - wait for the board to finish loading.")
        );
      }
      if (!storageClientPromise) {
        storageClientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
          createClient(storageConfig.url, storageConfig.anonKey, { auth: { persistSession: false } })
        );
      }
      return storageClientPromise;
    }

    const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; /* matches the bucket's file_size_limit */
    const UPLOAD_TYPES = /^(application\/pdf|image\/(png|jpe?g|webp|gif|avif|bmp|svg\+xml))$/;

    function uploadExt(file) {
      const fromName = /\.([a-z0-9]+)$/i.exec(String(file.name || ""));
      if (fromName) return fromName[1].toLowerCase();
      if (file.type === "application/pdf") return "pdf";
      const fromType = /^image\/([a-z0-9.+]+)$/i.exec(file.type || "");
      if (fromType) return fromType[1].toLowerCase().replace("jpeg", "jpg");
      return "bin";
    }

    function humanUploadError(error) {
      const msg = String((error && error.message) || error || "").toLowerCase();
      if (msg.includes("mime") || msg.includes("content-type") || msg.includes("allowed")) {
        return "That file type is not allowed in the class bucket.";
      }
      if (msg.includes("exceed") || msg.includes("too large") || msg.includes("size")) {
        return "That file is over the 10 MB storage limit.";
      }
      if (msg.includes("bucket")) return "The assignments bucket is missing - run supabase/schema.sql.";
      if (msg.includes("policy") || msg.includes("row-level security")) {
        return "Storage rejected the upload - check the bucket policies in supabase/schema.sql.";
      }
      return (error && error.message) || "That file could not be uploaded.";
    }

    async function uploadFile(file) {
      const type = String((file && file.type) || "").toLowerCase();
      if (!UPLOAD_TYPES.test(type)) {
        throw new Error("Only PDF documents and common image types can be attached.");
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error("That file is over the 10 MB upload limit.");
      }
      /* Timestamp plus a random suffix: unique enough that no upload can
         overwrite another, and the extension is taken from the picked file so
         downloads keep their real .pdf / .png / .jpg name. */
      const path = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8) + "." + uploadExt(file);
      const supabase = await getStorageClient();
      const { error } = await supabase.storage.from("assignments").upload(path, file, {
        contentType: type,
        cacheControl: "3600000",
        upsert: false,
      });
      if (error) throw new Error(humanUploadError(error));
      const { data } = supabase.storage.from("assignments").getPublicUrl(path);
      if (!data || !data.publicUrl) throw new Error("Storage kept the file but returned no link.");
      return data.publicUrl;
    }

    /* Pictures are stored as arrays. Older saves and backups carry a single
       string instead, so both shapes are accepted and merged here. Only http(s)
       links survive: an inline base64 payload from an old row or an old local
       copy is dropped so the board paints without parsing megabytes. */
    function toImageList(list, legacy) {
      const out = [];
      const link = (src) => typeof src === "string" && /^https?:\/\//.test(src);
      if (Array.isArray(list)) out.push(...list.filter(link));
      else if (link(list)) out.push(list);
      if (link(legacy) && !out.includes(legacy)) out.push(legacy);
      return out.slice(0, MAX_PICTURES);
    }

    function normaliseItem(raw, index) {
      const status = STATUS_ORDER.includes(raw && raw.status) ? raw.status : "pending";
      return {
        id: raw && raw.id ? String(raw.id) : uid() + "-" + index,
        subject: raw && raw.subject ? String(raw.subject) : "Unfiled",
        title: raw && raw.title ? String(raw.title) : "Untitled assignment",
        description: raw && raw.description ? String(raw.description) : "",
        solution: raw && raw.solution ? String(raw.solution) : "",
        dueDate: raw && typeof raw.dueDate === "string" ? raw.dueDate : "",
        status,
        ownerId: raw && raw.ownerId ? String(raw.ownerId) : "",
        ownerName: raw && raw.ownerName ? String(raw.ownerName) : "",
        images: toImageList(raw && raw.images, raw && raw.image),
        solutionImages: toImageList(raw && raw.solutionImages, raw && raw.solutionImage),
        createdAt: raw && raw.createdAt ? Number(raw.createdAt) : Date.now(),
        updatedAt: raw && raw.updatedAt ? Number(raw.updatedAt) : Date.now(),
      };
    }

    /* ============================================================
       Shared class strings
       ============================================================ */

    /* One rule for every file the app shows: it is a link into the assignments
       Storage bucket and the browser renders it from that URL directly. No
       data: URI reaches the address bar, no base64 sits in a row. */
    function isPdf(src) {
      const s = String(src || "").split(/[?#]/)[0];
      if (s.startsWith("data:application/pdf")) return true;
      return /\.pdf$/i.test(s);
    }

    function fileExt(src) {
      const s = String(src || "");
      if (s.startsWith("data:")) return (s.split(";")[0].split("/")[1] || "pdf").toLowerCase();
      const clean = s.split(/[?#]/)[0];
      const seg = clean.split("/").pop() || "";
      const ext = seg.includes(".") ? seg.split(".").pop() : "";
      return (ext || (isPdf(s) ? "pdf" : "")).toLowerCase();
    }

    /* The name a download lands under: card title plus the extension that is
       actually in the URL. No derived indexes, so "NaN" can never appear. */
    function pictureFileName(title, index, src) {
      const base = String(title || "assignment").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "assignment";
      const ext = fileExt(src) || (isPdf(src) ? "pdf" : "jpg");
      const at = Number.isFinite(index) ? "-" + (index + 1) : "";
      const kind = isPdf(src) ? "document" : "picture";
      return base + "-" + kind + at + "." + ext;
    }

    /* Download keeps the original extension and MIME type: the bytes come
       straight off Storage with their Content-Type, and the name is rebuilt
       from the card title plus the extension in the URL. */
    async function downloadPicture(src, title, index) {
      const url = String(src || "");
      if (!url) return;
      const name = pictureFileName(title, index, url);
      try {
        const res = await fetch(url, { mode: "cors" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
      } catch (err) {
        /* CORS or offline: ask Storage to send it as a download instead. */
        const forced = url + (url.includes("?") ? "&" : "?") + "download=" + encodeURIComponent(name);
        window.open(forced, "_blank", "noopener");
      }
    }

    /* PDFs open from their direct Storage URL: the browser's native viewer
       renders it, which is exactly what a data: URI tab used to block. An
       inline leftover from an old row is rewrapped as a blob first, because
       Chrome refuses top level navigation to data: URLs. */
    async function openPdfDocument(src) {
      const url = String(src || "");
      if (!url) return;
      if (!url.startsWith("data:")) {
        window.open(url, "_blank", "noopener");
        return;
      }
      try {
        const res = await fetch(url);
        const objectUrl = URL.createObjectURL(await res.blob());
        window.open(objectUrl, "_blank", "noopener");
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      } catch (err) {
        window.open(url, "_blank", "noopener");
      }
    }

    const INPUT =
      "w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-500 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-emerald-500 dark:focus:bg-slate-900 dark:focus:ring-emerald-500/20";
    const INPUT_ERR =
      "w-full rounded-xl border border-rose-300 bg-rose-50/40 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-500 outline-none transition focus:border-rose-400 focus:bg-white focus:ring-4 focus:ring-rose-100 dark:border-rose-500/50 dark:bg-rose-500/10 dark:text-slate-100 dark:focus:border-rose-400 dark:focus:ring-rose-500/20";
    const CARD =
      "relative rounded-2xl border border-slate-200/70 bg-white/85 shadow-card backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/45 dark:shadow-card-dark glass-sheen";
    const BTN_PRIMARY =
      "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:to-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 active:scale-[0.98]";
    const BTN_GHOST =
      "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800";
    const BTN_ICON =
      "inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100";

    /* ============================================================
       Shared chrome
       ============================================================ */

    function AmbientBackdrop() {
      return (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.07)_1px,transparent_0)] [background-size:24px_24px] dark:bg-[radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.14)_1px,transparent_0)]" />
          <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-emerald-400/25 blur-3xl dark:bg-emerald-500/[0.18]" />
          <div className="absolute -right-48 top-32 h-[30rem] w-[30rem] rounded-full bg-sky-400/20 blur-3xl dark:bg-sky-500/[0.16]" />
          <div className="absolute bottom-[-9rem] left-1/4 h-80 w-80 rounded-full bg-indigo-400/15 blur-3xl dark:bg-indigo-500/[0.15]" />
          <div className="absolute inset-0 bg-gradient-to-b from-white/50 via-transparent to-slate-100/70 dark:from-slate-950/35 dark:via-transparent dark:to-slate-950/55" />
        </div>
      );
    }

    function Field({ id, label, optional, required, error, hint, className = "", children }) {
      const messageId = id ? id + "-message" : undefined;
      return (
        <div className={className}>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            {id ? (
              <label htmlFor={id} className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                {label}
              </label>
            ) : (
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{label}</span>
            )}
            {optional ? (
              <span className="rounded-lg bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                Optional
              </span>
            ) : required ? (
              <span className="rounded-lg bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                Required
              </span>
            ) : null}
          </div>
          {children}
          {error ? (
            <p id={messageId} className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
              <CircleAlert size={12} className="shrink-0" />
              {error}
            </p>
          ) : hint ? (
            <p id={messageId} className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
          ) : null}
        </div>
      );
    }

    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';

    function Modal({ open, onClose, icon: Icon, iconClass, title, subtitle, maxWidth = "max-w-2xl", focusRef, children }) {
      const dialogRef = useRef(null);

      useEffect(() => {
        if (!open) return;
        const previous = document.activeElement;
        const dialog = dialogRef.current;

        const first = focusRef && focusRef.current ? focusRef.current : dialog && dialog.querySelector(FOCUSABLE);
        if (first && first.focus) first.focus();

        function onKeyDown(event) {
          if (event.key === "Escape") { onClose(); return; }
          if (event.key !== "Tab" || !dialog) return;
          const nodes = Array.from(dialog.querySelectorAll(FOCUSABLE)).filter((node) => node.offsetParent !== null);
          if (!nodes.length) return;
          const firstNode = nodes[0];
          const lastNode = nodes[nodes.length - 1];
          if (event.shiftKey && document.activeElement === firstNode) {
            event.preventDefault();
            lastNode.focus();
          } else if (!event.shiftKey && document.activeElement === lastNode) {
            event.preventDefault();
            firstNode.focus();
          }
        }

        document.addEventListener("keydown", onKeyDown);
        document.body.style.overflow = "hidden";
        return () => {
          document.removeEventListener("keydown", onKeyDown);
          document.body.style.overflow = "";
          if (previous && previous.focus) previous.focus();
        };
      }, [open, onClose, focusRef]);

      if (!open) return null;

      return (
        /* Safe centring matters here: a long form is taller than a short window, and
           plain items-center clips the top of the dialog out of reach. Safe
           alignment centres short dialogs and falls back to the top for tall ones. */
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center-safe">
          <div className="fixed inset-0 animate-fade-in bg-slate-900/40 backdrop-blur-sm dark:bg-slate-950/70" onClick={onClose} />

          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`relative z-10 my-6 w-full ${maxWidth} animate-rise rounded-2xl border border-white/70 bg-white p-5 shadow-lift sm:p-7 dark:border-slate-800 dark:bg-slate-900`}
          >
            <div className="flex items-start gap-4">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-glow ${iconClass}`}>
                <Icon size={19} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">{title}</h2>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            {children}
          </div>
        </div>
      );
    }

    /* ============================================================
       Lock screen
       ============================================================ */

    /* ============================================================
       Admin gate, opened with index.html#admin
       ============================================================ */

    function AdminSignIn({ onSignIn, onLeave }) {
      const [form, setForm] = useState({ username: "", password: "" });
      const [show, setShow] = useState(false);
      const [error, setError] = useState("");
      const firstRef = useRef(null);
      const cardRef = useRef(null);

      useEffect(() => {
        const t = setTimeout(() => firstRef.current && firstRef.current.focus(), 120);
        return () => clearTimeout(t);
      }, []);

      const field =
        "w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-slate-100 placeholder:text-slate-500 transition focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/30";
      const fieldErr =
        "w-full rounded-xl border border-rose-400/60 bg-white/5 px-3.5 py-3 text-sm text-slate-100 placeholder:text-slate-500 transition focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-400/30";
      const label = "block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400";

      function fail(message) {
        setError(message);
        const el = cardRef.current;
        if (!el || !el.animate) return;
        el.animate(
          [
            { transform: "translateX(0px)" },
            { transform: "translateX(-9px)" },
            { transform: "translateX(9px)" },
            { transform: "translateX(-5px)" },
            { transform: "translateX(5px)" },
            { transform: "translateX(0px)" },
          ],
          { duration: 420, easing: "ease-in-out" }
        );
      }

      function set(key) {
        return (value) => {
          setForm((f) => ({ ...f, [key]: value }));
          if (error) setError("");
        };
      }

      function submit(event) {
        event.preventDefault();
        const username = form.username.trim();
        if (!username) return fail("Enter your admin username.");
        if (!form.password) return fail("Enter your admin password.");
        /* Awaited because a password with no trusted copy here is checked against
           the board over the network before it is accepted. */
        Promise.resolve(onSignIn(username, form.password, { adminOnly: true })).then((result) => {
          if (!result.ok) fail(result.reason);
        });
      }

      return (
        <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
          <AmbientBackdrop />

          <div ref={cardRef} className="relative z-10 w-full max-w-md animate-rise">
            <div className="overflow-hidden rounded-2xl bg-slate-900 shadow-lift ring-1 ring-white/10">
              <div className="flex items-center gap-2 border-b border-white/10 px-6 py-3">
                <ShieldCheck size={14} className="text-emerald-400" />
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-300">
                  Admin gate
                </span>
                <span className="ml-auto text-[11px] text-slate-500">Section H</span>
              </div>

              <div className="p-8 sm:p-9">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-glow">
                  <ShieldCheck size={24} />
                </div>

                <h1 className="mt-6 text-center font-display text-2xl font-semibold tracking-tight text-white">
                  Organizer admin
                </h1>
                <p className="mx-auto mt-2 max-w-xs text-center text-sm leading-relaxed text-slate-400">
                  Restricted to class admins. Students sign in on the class screen with their own login.
                </p>

                <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
                  <div>
                    <label htmlFor="admin-username" className={label}>Username</label>
                    <div className="relative mt-1.5">
                      <User size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        id="admin-username"
                        ref={firstRef}
                        type="text"
                        value={form.username}
                        onChange={(e) => set("username")(e.target.value)}
                        placeholder="admin"
                        autoComplete="username"
                        maxLength={24}
                        className={`${field} pl-10`}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="admin-password" className={label}>Password</label>
                    <div className="relative mt-1.5">
                      <KeyRound size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        id="admin-password"
                        type={show ? "text" : "password"}
                        value={form.password}
                        onChange={(e) => set("password")(e.target.value)}
                        placeholder="Your admin password"
                        autoComplete="current-password"
                        aria-invalid={error ? "true" : undefined}
                        aria-describedby={error ? "admin-password-message" : undefined}
                        className={`${error ? fieldErr : field} pl-10 pr-12`}
                      />
                      <button
                        type="button"
                        onClick={() => setShow((s) => !s)}
                        aria-label={show ? "Hide password" : "Show password"}
                        className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-xl p-2 text-slate-400 transition hover:bg-white/10 hover:text-slate-100"
                      >
                        {show ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {error && (
                      <p id="admin-password-message" className="mt-2 flex items-center gap-1.5 text-xs font-medium text-rose-300">
                        <CircleAlert size={12} />
                        {error}
                      </p>
                    )}
                  </div>

                  <button type="submit" className={`${BTN_PRIMARY} group w-full py-3`}>
                    <Lock size={16} />
                    Unlock organizer
                    <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                  </button>
                </form>

                <button
                  type="button"
                  onClick={onLeave}
                  className="mt-4 w-full cursor-pointer rounded-xl py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/5"
                >
                  <ArrowRight size={14} className="mr-1.5 inline rotate-180" />
                  Back to the class sign in
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    function SignInScreen({ onSignIn, onRegister, onSetup, onOpenAdminGate, setup, offlineAvailable, onOfflineGuest }) {
      const [mode, setMode] = useState("signin");
      const [form, setForm] = useState({ username: "", password: "", code: "" });
      const [show, setShow] = useState(false);
      const [error, setError] = useState("");
      const [escape, setEscape] = useState(false);
      const firstRef = useRef(null);
      const cardRef = useRef(null);

      useEffect(() => {
        const t = setTimeout(() => firstRef.current && firstRef.current.focus(), 120);
        return () => clearTimeout(t);
      }, [mode]);

      /* A board with no accounts yet opens straight into first-run setup. The
         server accepts exactly one setup request ever, so this form exists only
         on a brand new board. */
      useEffect(() => {
        if (setup && mode !== "setup") {
          setMode("setup");
          setError("");
          setForm({ username: "", password: "", code: "" });
        }
      }, [setup, mode]);

      function fail(message) {
        setError(message);
        const el = cardRef.current;
        if (!el || !el.animate) return;
        el.animate(
          [
            { transform: "translateX(0px)" },
            { transform: "translateX(-9px)" },
            { transform: "translateX(9px)" },
            { transform: "translateX(-5px)" },
            { transform: "translateX(5px)" },
            { transform: "translateX(0px)" },
          ],
          { duration: 420, easing: "ease-in-out" }
        );
      }

      const set = (key) => (value) => {
        setForm((f) => ({ ...f, [key]: value }));
        if (error) setError("");
        if (escape) setEscape(false);
      };

      function switchMode(next) {
        if (setup) return; /* there is no account to sign in to yet */
        setMode(next);
        setError("");
        setEscape(false);
        setForm({ username: "", password: "", code: "" });
      }

      function submit(event) {
        event.preventDefault();
        const username = form.username.trim();
        if (!username) return fail("Enter your username.");
        if (!form.password) return fail("Enter your password.");

        if (mode === "signin") {
          /* Awaited because the board is asked over the network before the password
             is accepted; the answer is a session cookie, not a stored secret. */
          Promise.resolve(onSignIn(username, form.password)).then((result) => {
            if (!result.ok) {
              setEscape(result.action === "admin-gate");
              fail(result.reason);
            }
          });
          return;
        }

        if (form.password.length < 8) return fail("Use at least 8 characters for a password.");

        if (mode === "setup") {
          /* First run: one request, hashed on the server, refused forever after. */
          Promise.resolve(onSetup(username, form.password)).then((result) => {
            if (result && !result.ok) fail(result.reason);
          });
          return;
        }

        if (!form.code.trim()) return fail("Enter the class code your admin gave you.");
        /* Awaited because the board is asked to create the login, which is the only
           place the password gets hashed. */
        Promise.resolve(onRegister(username, form.password, form.code.trim())).then((result) => {
          if (result && !result.ok) fail(result.reason);
        });
      }

      const setupMode = mode === "setup";
      const creating = mode === "register" || setupMode;

      return (
        <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
          <AmbientBackdrop />

          <div ref={cardRef} className="relative z-10 w-full max-w-md animate-rise">
            <div className="rounded-2xl border border-white/70 bg-white/85 p-8 shadow-lift backdrop-blur-xl sm:p-9 dark:border-slate-800 dark:bg-slate-900/80">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-glow">
                {creating ? <UserPlus size={24} /> : <Lock size={24} />}
              </div>

              <h1 className="mt-6 text-center font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                BBA Section H Organizer
              </h1>
              <p className="mx-auto mt-2 max-w-xs text-center text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                {setupMode
                  ? "This board is brand new. Create the first account; it becomes the admin."
                  : creating
                    ? "Create your login with the class code, then add your assignments to the class board."
                    : "Sign in to add your assignments to the Section H board."}
              </p>

              <form onSubmit={submit} className="mt-7 space-y-4" noValidate key={mode}>
                <Field id="signin-username" label="Username">
                  <div className="relative">
                    <User size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                    <input
                      id="signin-username"
                      ref={firstRef}
                      type="text"
                      value={form.username}
                      onChange={(e) => set("username")(e.target.value)}
                      placeholder="Your name, for example Riya"
                      autoComplete="username"
                      maxLength={24}
                      className={`${INPUT} py-3 pl-10`}
                    />
                  </div>
                </Field>

                <Field id="signin-password" label="Password" error={error}>
                  <div className="relative">
                    <KeyRound size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                    <input
                      id="signin-password"
                      type={show ? "text" : "password"}
                      value={form.password}
                      onChange={(e) => set("password")(e.target.value)}
                      placeholder={creating ? "At least 8 characters" : "Your password"}
                      autoComplete={creating ? "new-password" : "current-password"}
                      aria-invalid={error ? "true" : undefined}
                      aria-describedby={error ? "signin-password-message" : undefined}
                      className={`${error ? INPUT_ERR : INPUT} py-3 pl-10 pr-12`}
                    />
                    <button
                      type="button"
                      onClick={() => setShow((s) => !s)}
                      aria-label={show ? "Hide password" : "Show password"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      {show ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </Field>

                {mode === "register" && (
                  <Field id="signin-code" label="Class code" hint="Ask your admin if you do not have it.">
                    <div className="relative">
                      <ShieldCheck size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                      <input
                        id="signin-code"
                        type="text"
                        value={form.code}
                        onChange={(e) => set("code")(e.target.value)}
                        placeholder="SECTION-H"
                        autoComplete="off"
                        maxLength={24}
                        className={`${INPUT} py-3 pl-10 uppercase`}
                      />
                    </div>
                  </Field>
                )}

                <button type="submit" className={`${BTN_PRIMARY} group w-full py-3`}>
                  {creating ? <UserPlus size={16} /> : <LogIn size={16} />}
                  {setupMode ? "Create the admin account" : creating ? "Create my account" : "Sign in"}
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                </button>
              </form>

              {offlineAvailable && (
                <button
                  type="button"
                  onClick={onOfflineGuest}
                  className="mt-4 w-full cursor-pointer rounded-xl border border-slate-200/80 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-emerald-500/40 dark:hover:text-emerald-300"
                >
                  View the saved board (offline, read only)
                </button>
              )}

              {escape && (
                <button
                  type="button"
                  onClick={onOpenAdminGate}
                  className="mt-4 w-full cursor-pointer rounded-xl border border-slate-200/80 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-emerald-500/40 dark:hover:text-emerald-300"
                >
                  <ShieldCheck size={14} className="mr-1.5 inline" />
                  That is an admin login. Open the admin gate
                </button>
              )}

              <button
                type="button"
                onClick={() => switchMode(creating ? "signin" : "register")}
                className="mt-4 w-full cursor-pointer rounded-xl py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
              >
                {setupMode ? "One account creates the board admin" : creating ? "Already have an account? Sign in" : "New here? Create an account"}
              </button>

              <div className="mt-5 flex items-center justify-center gap-2 border-t border-slate-200/80 pt-5 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <Users size={14} />
                One shared class board, Section H, Fall 2026
              </div>
              <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
                Everyone here shares the assignments posted by the admin. Logins on this device live
                on {storageOriginLabel()}.
              </p>
            </div>
          </div>
        </div>
      );
    }

    /* ============================================================
       Account panel (change own password, sign out)
       ============================================================ */

    function AccountModal({ open, onClose, account, onChangePassword, onSignOut }) {
      const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
      const [errors, setErrors] = useState({});
      const [done, setDone] = useState(false);
      const [busy, setBusy] = useState(false);
      const [reveal, setReveal] = useState(false);

      useEffect(() => {
        if (!open) return;
        setPw({ current: "", next: "", confirm: "" });
        setErrors({});
        setDone(false);
        setBusy(false);
      }, [open]);

      if (!open || !account) return null;

      const role = ROLE_META[account.role] || ROLE_META.student;

      /* The current password is checked against the board, so this still works on a
         device whose saved copy has drifted. onChangePassword answers with a promise
         and a reason, because the board has to be asked before anything is written. */
      async function submit(event) {
        event.preventDefault();
        const found = {};
        if (!pw.current) found.current = "Enter your current password.";
        if (!pw.next) found.next = "Choose a new password.";
        else if (pw.next.length < 8) found.next = "Use at least 8 characters.";
        else if (pw.next === pw.current) found.next = "Pick something different.";
        if (pw.confirm !== pw.next) found.confirm = "The two passwords do not match.";

        setErrors(found);
        setDone(false);
        if (Object.keys(found).length) return;

        setBusy(true);
        const result = await onChangePassword(pw.current, pw.next);
        setBusy(false);

        if (!result || !result.ok) {
          setErrors({ current: (result && result.reason) || "Could not save that password." });
          return;
        }
        setPw({ current: "", next: "", confirm: "" });
        setDone(true);
      }

      return (
        <Modal
          open={open}
          onClose={onClose}
          icon={User}
          iconClass="bg-gradient-to-br from-emerald-500 to-teal-600"
          title="Your account"
          subtitle="Signed in on this device. Your name shows on everything you add."
          maxWidth="max-w-md"
        >
          <div className="mt-6 flex items-center gap-3 rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-base font-bold text-white">
              {account.username.trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-base font-semibold text-slate-900 dark:text-slate-50">{account.username}</p>
              <span className={`mt-1 inline-flex rounded-lg px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${role.chip}`}>
                {role.label}
              </span>
            </div>
          </div>

          <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
            <Field id="account-current" label="Current password" error={errors.current}>
              <input
                id="account-current"
                type={reveal ? "text" : "password"}
                value={pw.current}
                onChange={(e) => { setPw({ ...pw, current: e.target.value }); setDone(false); }}
                autoComplete="current-password"
                aria-invalid={errors.current ? "true" : undefined}
                aria-describedby={errors.current ? "account-current-message" : undefined}
                className={errors.current ? INPUT_ERR : INPUT}
              />
            </Field>

            <Field id="account-next" label="New password" error={errors.next}>
              <input
                id="account-next"
                type={reveal ? "text" : "password"}
                value={pw.next}
                onChange={(e) => { setPw({ ...pw, next: e.target.value }); setDone(false); }}
                autoComplete="new-password"
                aria-invalid={errors.next ? "true" : undefined}
                aria-describedby={errors.next ? "account-next-message" : undefined}
                className={errors.next ? INPUT_ERR : INPUT}
              />
            </Field>

            <Field id="account-confirm" label="Confirm new password" error={errors.confirm}>
              <input
                id="account-confirm"
                type={reveal ? "text" : "password"}
                value={pw.confirm}
                onChange={(e) => { setPw({ ...pw, confirm: e.target.value }); setDone(false); }}
                autoComplete="new-password"
                aria-invalid={errors.confirm ? "true" : undefined}
                aria-describedby={errors.confirm ? "account-confirm-message" : undefined}
                className={errors.confirm ? INPUT_ERR : INPUT}
              />
            </Field>

            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={reveal}
                onChange={(e) => setReveal(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-emerald-600"
              />
              Show passwords
            </label>

            {done && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-300">
                <Check size={13} strokeWidth={3} />
                Password updated.
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200/80 pt-4 sm:flex-row sm:justify-between dark:border-slate-800">
              <button type="button" onClick={onSignOut} className={BTN_GHOST}>
                <LogOut size={15} />
                Sign out
              </button>
              <button type="submit" disabled={busy} className={BTN_PRIMARY + " disabled:cursor-not-allowed disabled:opacity-60"}>
                <KeyRound size={16} />
                {busy ? "Checking with the board" : "Save password"}
              </button>
            </div>
          </form>
        </Modal>
      );
    }

    /* ============================================================
       Stats, toolbar controls, theme toggle
       ============================================================ */

    function StatCard({ label, count, total, meta }) {
      const Icon = meta.icon;
      const pct = total ? Math.round((count / total) * 100) : 0;
      return (
        <div className={`${CARD} p-5 transition hover:shadow-lift sm:p-6`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{label}</p>
              <p className="mt-1.5 font-display text-3xl font-semibold tracking-tight text-slate-900 tabular-nums dark:text-slate-50">{count}</p>
            </div>
            <div className={`rounded-xl p-2.5 ring-1 ring-inset ${meta.tile}`}>
              <Icon size={18} />
            </div>
          </div>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className={`h-full rounded-full ${meta.bar} transition-all duration-500`} style={{ width: pct + "%" }} />
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{pct}% of all assignments</p>
        </div>
      );
    }

    function SelectControl({ icon: Icon, value, onChange, ariaLabel, children }) {
      return (
        <div className="relative">
          <Icon size={15} className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
          <select
            aria-label={ariaLabel}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50/70 py-2.5 pl-9 pr-9 text-sm font-medium text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:focus:border-emerald-500 dark:focus:bg-slate-900 dark:focus:ring-emerald-500/20"
          >
            {children}
          </select>
          <ChevronDown size={15} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
        </div>
      );
    }

    function ThemeToggle({ theme, onChange }) {
      const meta = THEME_META[theme] || THEME_META.system;
      const Icon = meta.icon;
      const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
      return (
        <button
          type="button"
          onClick={() => onChange(next)}
          className={BTN_ICON}
          title={"Theme: " + meta.label + ". Switch to " + THEME_META[next].label + "."}
          aria-label={"Theme: " + meta.label + ". Switch to " + THEME_META[next].label + "."}
        >
          <Icon size={16} />
        </button>
      );
    }

    /* ============================================================
       Lightbox
       ============================================================ */

    function Lightbox({ srcs, index, onIndex, caption, onClose, onRemove, removeLabel = "Remove picture" }) {
      const closeRef = useRef(null);
      const [actualSize, setActualSize] = useState(false);
      const total = srcs.length;
      const current = Math.min(Math.max(index || 0, 0), Math.max(total - 1, 0));

      /* Arrow keys read the freshest index through a ref, so the listener does
         not need to be rebuilt on every step. */
      const goRef = useRef(() => {});
      goRef.current = (delta) => {
        if (total < 2) return;
        onIndex(Math.min(Math.max(current + delta, 0), total - 1));
      };

      useEffect(() => {
        const previous = document.activeElement;
        if (closeRef.current) closeRef.current.focus();
        function onKeyDown(event) {
          if (event.key === "Escape") onClose();
          else if (event.key === "ArrowRight") goRef.current(1);
          else if (event.key === "ArrowLeft") goRef.current(-1);
        }
        document.addEventListener("keydown", onKeyDown);
        return () => {
          document.removeEventListener("keydown", onKeyDown);
          if (previous && previous.focus) previous.focus();
        };
      }, [onClose]);

      const arrow =
        "absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white ring-1 ring-white/20 transition hover:bg-white/25 disabled:opacity-30";

      return (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={caption}
          className="fixed inset-0 z-[70] flex animate-fade-in items-center justify-center bg-slate-900/85 p-4 backdrop-blur-md"
          onClick={onClose}
        >
          <div className="absolute right-4 top-4 z-10 flex items-center gap-2 sm:right-6 sm:top-6" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setActualSize((v) => !v)}
              aria-pressed={actualSize}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/25"
            >
              {actualSize ? <ZoomOut size={13} /> : <ZoomIn size={13} />}
              {actualSize ? "Fit to screen" : "Actual size"}
            </button>
            {onRemove && (
              <button
                type="button"
                onClick={() => { onRemove(current); onClose(); }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/20 transition hover:bg-rose-500/80"
              >
                <Trash2 size={13} />
                {removeLabel}
              </button>
            )}
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close picture"
              className="rounded-xl bg-white/10 p-2 text-white ring-1 ring-white/20 transition hover:bg-white/25"
            >
              <X size={16} />
            </button>
          </div>

          {total > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); goRef.current(-1); }}
              disabled={current === 0}
              aria-label="Previous picture"
              className={arrow + " left-3 sm:left-6"}
            >
              <ChevronLeft size={20} />
            </button>
          )}

          <figure
            className={actualSize ? "h-full w-full overflow-auto" : "flex max-h-full flex-col items-center"}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={srcs[current]}
              alt={caption + ", picture " + (current + 1)}
              className={
                actualSize
                  ? "mx-auto my-2 max-w-none rounded-xl shadow-lift"
                  : "max-h-[74vh] w-auto max-w-full rounded-2xl shadow-lift"
              }
            />
            {!actualSize && (
              <figcaption className="mt-4 max-w-lg text-center text-sm font-medium text-white/80">
                {caption}
                {total > 1 && <span className="mt-1 block text-xs text-white/60">Picture {current + 1} of {total}</span>}
              </figcaption>
            )}
          </figure>

          {total > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); goRef.current(1); }}
              disabled={current === total - 1}
              aria-label="Next picture"
              className={arrow + " right-3 sm:right-6"}
            >
              <ChevronRight size={20} />
            </button>
          )}
        </div>
      );
    }

    /* ============================================================
       Assignment card
       ============================================================ */

    function copyText(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
      }
      return Promise.resolve(fallbackCopy(text));
    }

    function fallbackCopy(text) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (err) { /* ignore */ }
      document.body.removeChild(ta);
    }

    function AssignmentCard({
      item, account, onCycleStatus, onEdit, onDelete,
      onViewImage, onPickImage, onRemoveImage,
      onViewSolutionImage, onPickSolutionImage, onRemoveSolutionImage,
      onAttachFiles,
    }) {
      const [open, setOpen] = useState(false);
      const [copied, setCopied] = useState(false);
      const [confirming, setConfirming] = useState(false);

      /* Drag and drop: files can be pulled straight from a folder onto the card,
         which avoids the native file dialog entirely (and with it the Windows
         File Explorer stalls the wildcard picker could trigger). The whole card
         is the drop target for card pictures; while the answer panel is open it
         takes drops for itself. A depth counter keeps the highlight steady as
         the pointer crosses child elements, which each fire their own enter/leave. */
      const [dropZone, setDropZone] = useState(null); /* null | 'card' | 'answer' */
      const cardDragDepth = useRef(0);
      const answerDragDepth = useRef(0);

      function dropProps(zone, depthRef) {
        return {
          onDragEnter: (event) => {
            if (!canManage) return;
            event.preventDefault();
            event.stopPropagation();
            depthRef.current += 1;
            setDropZone(zone);
          },
          onDragOver: (event) => {
            if (!canManage) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "copy";
          },
          onDragLeave: (event) => {
            if (!canManage) return;
            event.stopPropagation();
            depthRef.current = Math.max(0, depthRef.current - 1);
            if (!depthRef.current) setDropZone((current) => (current === zone ? null : current));
          },
          onDrop: (event) => {
            if (!canManage) return;
            event.preventDefault();
            event.stopPropagation();
            depthRef.current = 0;
            setDropZone(null);
            const files = Array.from((event.dataTransfer && event.dataTransfer.files) || []);
            if (files.length && onAttachFiles) {
              onAttachFiles(item, zone === "answer" ? "solutionImages" : "images", files);
            }
          },
        };
      }

      /* The board is shared and read only for everyone except an admin. Adding a
         card is no longer enough to earn the right to change it: whoever posted it
         still cannot edit, delete, repicture or move its status unless they are an
         admin. Viewers keep everything that does not write: reading, filtering and
         opening the solution. */
      const isAdmin = Boolean(account && account.role === "admin");
      const canManage = isAdmin;

      const meta = STATUS_META[item.status] || STATUS_META.pending;
      const StatusIcon = meta.icon;
      const due = dueInfo(item.dueDate, item.status);
      const solutionId = "solution-" + item.id;

      /* The description clamps to three lines. When it truly overflows, a small
         See more control expands it in place. The move is animated through a
         max-height transition, and the three-line clamp is only reapplied after
         the collapse animation finishes, so both directions stay smooth. */
      const descRef = useRef(null);
      const descTimer = useRef(null);
      const [descPhase, setDescPhase] = useState("clamped"); /* clamped | open | collapsing */
      const [descOver, setDescOver] = useState(false);
      const [descFull, setDescFull] = useState(0);
      const [descClamped, setDescClamped] = useState(0);

      function measureDescription() {
        const el = descRef.current;
        if (!el) return;
        const over = el.scrollHeight > el.clientHeight + 1;
        setDescOver(over);
        setDescFull(el.scrollHeight);
        setDescClamped(over ? el.clientHeight : 0);
      }

      useEffect(() => {
        if (descPhase !== "clamped") return undefined;
        measureDescription();
        const remeasure = () => measureDescription();
        window.addEventListener("resize", remeasure);
        /* The webfont swaps in after first paint and rewraps the text, which
           can turn a description that fit into one that does not. The browser
           never reports that as a resize, so listen for the fonts promise and
           the load event as well. A local observer then covers any later
           change to the paragraph's box of its own. The setters are given the
           same values every time, so a re-measure that finds nothing new
           settles without another render. */
        if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
          document.fonts.ready.then(remeasure);
        }
        window.addEventListener("load", remeasure);
        let observer = null;
        if (typeof ResizeObserver === "function" && descRef.current) {
          observer = new ResizeObserver(remeasure);
          observer.observe(descRef.current);
        }
        return () => {
          window.removeEventListener("resize", remeasure);
          window.removeEventListener("load", remeasure);
          if (observer) observer.disconnect();
        };
      }, [descPhase, item.description]);

      useEffect(() => {
        if (descPhase !== "collapsing") return undefined;
        /* If the transition end event never fires, settle on a timer instead. */
        descTimer.current = setTimeout(() => setDescPhase("clamped"), 380);
        return () => clearTimeout(descTimer.current);
      }, [descPhase]);

      function toggleDescription() {
        if (descPhase === "collapsing") return;
        if (descPhase === "clamped") {
          measureDescription(); /* capture the real full height while still clamped */
          setDescPhase("open");
          return;
        }
        setDescPhase("collapsing");
      }

      function handleDescTransitionEnd(event) {
        if (event.target !== event.currentTarget || event.propertyName !== "max-height") return;
        if (descPhase !== "collapsing") return;
        clearTimeout(descTimer.current);
        setDescPhase("clamped"); /* the effect re-measures once the clamp is back on */
      }

      const cardTone =
        item.status === "completed"
          ? "border-emerald-200/80 bg-emerald-50/40 dark:border-emerald-400/25 dark:bg-emerald-500/[0.08]"
          : due.overdue
          ? "border-rose-200/80 bg-rose-50/40 dark:border-rose-400/25 dark:bg-rose-500/[0.08]"
          : "border-slate-200/70 bg-white dark:border-white/10 dark:bg-slate-900/45";

      function handleCopy() {
        copyText(item.solution || "").then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }

      function handleDelete() {
        if (confirming) {
          onDelete(item.id);
          return;
        }
        setConfirming(true);
        setTimeout(() => setConfirming(false), 3500);
      }

      return (
        <article
          className={`group relative flex flex-col rounded-[22px] border p-5 shadow-card backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:shadow-lift dark:shadow-card-dark glass-sheen sm:p-6 ${cardTone} ${dropZone === "card" ? "ring-2 ring-emerald-400" : ""}`}
          {...dropProps("card", cardDragDepth)}
        >
          {dropZone === "card" && (
            <div className="pointer-events-none absolute inset-3 z-30 flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-emerald-400 bg-emerald-50/90 text-center backdrop-blur-sm dark:border-emerald-400/70 dark:bg-slate-900/85">
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Drop files to attach to this card</span>
              <span className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80">PDF, PNG, JPG or WEBP - up to {MAX_PICTURES} files</span>
            </div>
          )}
          <div className="flex items-start justify-between gap-3">
            <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
              <span className={`h-1.5 w-1.5 rounded-full ${subjectDot(item.subject)}`} aria-hidden="true" />
              {item.subject}
            </span>

            {canManage && (confirming ? (
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={handleDelete}
                  className="rounded-lg bg-rose-600 px-2.5 py-2 text-[11px] font-semibold text-white transition hover:bg-rose-700"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-lg px-2 py-2 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Keep
                </button>
              </div>
            ) : (
              <div className="flex shrink-0 items-center gap-1 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  aria-label={"Edit " + item.title}
                  title="Edit assignment"
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  aria-label={"Delete " + item.title}
                  title="Delete assignment"
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-500/15 dark:hover:text-rose-300"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>

          {item.images.length > 0 ? (
            <div className="mt-3">
              <div className={"grid gap-2.5 " + (item.images.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                {item.images.slice(0, 4).map((src, index) => (
                  <div key={index} className="group/img relative overflow-hidden rounded-xl border border-slate-200/70 bg-slate-100 dark:border-slate-800 dark:bg-slate-800">
                    {isPdf(src) ? (
                      <button
                        type="button"
                        onClick={() => openPdfDocument(src)}
                        title="View document"
                        aria-label={"Open document " + (index + 1) + " of " + item.title}
                        className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-rose-500/10 to-transparent text-slate-500 transition duration-300 group-hover/img:from-rose-500/20 dark:from-rose-500/15 dark:text-slate-300"
                      >
                        <span className="rounded-lg bg-rose-500/15 p-2.5 text-rose-600 ring-1 ring-inset ring-rose-500/30 dark:text-rose-300">
                          <FileText size={22} />
                        </span>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-300">PDF document</span>
                      </button>
                    ) : (
                      <img
                        src={src}
                        alt={"Picture " + (index + 1) + " attached to " + item.title}
                        loading="lazy"
                        className="aspect-[4/3] w-full object-cover transition duration-500 group-hover/img:scale-[1.04]"
                      />
                    )}
                    {!isPdf(src) && (
                    <button
                      type="button"
                      onClick={() => onViewImage(item, index)}
                      title={"View picture " + (index + 1)}
                      aria-label={"View picture " + (index + 1) + " of " + item.title}
                      className="absolute inset-0 flex items-center justify-center bg-slate-900/0 opacity-0 transition duration-300 group-hover/img:bg-slate-900/35 group-hover/img:opacity-100 focus-visible:bg-slate-900/35 focus-visible:opacity-100"
                    >
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/90 px-2.5 py-2 text-[11px] font-semibold text-slate-700">
                        <Maximize2 size={12} />
                        View
                      </span>
                    </button>
                    )}
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => onRemoveImage(item.id, index)}
                        aria-label={"Remove picture " + (index + 1)}
                        title="Remove picture"
                        className="absolute right-2 top-2 rounded-lg bg-white/90 p-2 text-slate-600 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 focus-visible:opacity-100 group-hover/img:opacity-100"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => downloadPicture(src, item.title, index)}
                      title="Download full resolution"
                      aria-label={"Download picture " + (index + 1) + " of " + item.title}
                      className="absolute bottom-2 right-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-950/55 text-white/85 ring-1 ring-inset ring-white/15 backdrop-blur-md transition hover:bg-slate-950/80 hover:text-white focus-visible:opacity-100"
                    >
                      <Download size={13} />
                    </button>
                    {index === 3 && item.images.length > 4 && (
                      <span className="pointer-events-none absolute bottom-2 left-2 rounded-lg bg-slate-900/75 px-2 py-1 text-[11px] font-bold text-white">
                        +{item.images.length - 4} more
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {canManage && item.images.length < MAX_PICTURES && (
                <button
                  type="button"
                  onClick={() => onPickImage(item.id)}
                  className="mt-2 flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 text-[11px] font-semibold text-slate-500 transition hover:border-emerald-300 hover:bg-emerald-50/60 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
                >
                  <ImagePlus size={12} />
                  Add more pictures or PDFs
                </button>
              )}
            </div>
          ) : canManage ? (
            <button
              type="button"
              onClick={() => onPickImage(item.id)}
              className="mt-3 flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 text-[11px] font-semibold text-slate-500 transition hover:border-emerald-300 hover:bg-emerald-50/60 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
            >                <ImagePlus size={14} />
                Add pictures or PDF
            </button>
          ) : null}

          <h3 className="mt-3 font-display text-base font-semibold leading-snug text-slate-900 dark:text-slate-50">{item.title}</h3>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <CalendarDays size={13} className={due.overdue ? "text-rose-500" : "text-slate-500 dark:text-slate-400"} />
              {formatDate(item.dueDate)}
            </span>
            {due.label && <span className={`inline-flex items-center gap-1.5 font-semibold ${due.tone}`}>{due.label}</span>}
            <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400" title={"Added by " + (item.ownerName || "an earlier save")}>
              <User size={12} />
              {item.ownerName || "Earlier save"}
            </span>
          </div>

          <p
            ref={descRef}
            onTransitionEnd={handleDescTransitionEnd}
            style={descOver ? { maxHeight: descPhase === "open" ? descFull : descClamped } : undefined}
            className={
              "mt-3 overflow-hidden text-sm leading-relaxed text-slate-600 transition-[max-height] duration-300 ease-out dark:text-slate-300 " +
              (descPhase === "open" || descPhase === "collapsing" ? "" : "line-clamp-3")
            }
          >
            {item.description || "No description yet."}          </p>
          {descOver && (
            <button
              type="button"
              onClick={toggleDescription}
              aria-expanded={descPhase !== "clamped"}
              className="-ml-1 mt-1 inline-flex items-center gap-1 rounded-lg px-1 py-0.5 text-xs font-semibold text-slate-500 transition hover:text-emerald-700 dark:text-slate-400 dark:hover:text-emerald-300"
            >
              {descPhase === "clamped" ? "See more" : "See less"}
              <ChevronDown size={12} className={"transition-transform duration-300 " + (descPhase === "open" ? "rotate-180" : "")} />
            </button>
          )}
          <div className="mt-4 flex items-center justify-between gap-3">
            {canManage ? (
              <button
                type="button"
                onClick={() => onCycleStatus(item.id)}
                title="Change status"
                aria-label={"Status: " + meta.label + ". Activate to move to " + STATUS_META[NEXT_STATUS[item.status]].label + "."}
                className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ring-1 ring-inset transition active:scale-95 ${meta.chip}`}
              >
                <StatusIcon size={13} className={item.status === "in-progress" ? "transition group-hover:animate-spin" : ""} />
                {meta.label}
              </button>
            ) : (
              /* A viewer sees the same status, as a readout rather than a control.
                 No button, no hover, nothing for a click to land on. */
              <span
                className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ring-1 ring-inset ${meta.chip}`}
              >
                <StatusIcon size={13} />
                {meta.label}
              </span>
            )}
            {canManage && (
              <span className="hidden text-[11px] text-slate-500 sm:inline dark:text-slate-400">click status to cycle</span>
            )}
          </div>

          {item.solution || item.solutionImages.length > 0 ? (
            <div className="mt-auto pt-4">
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-controls={solutionId}
                className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                  open
                    ? "bg-emerald-600 text-white shadow-[0_10px_24px_-14px_rgba(16,185,129,0.9)]"
                    : "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25 dark:hover:bg-emerald-500/20"
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <Lightbulb size={15} />
                  {open ? "Hide solution" : "View solution"}
                </span>
                <ChevronDown size={16} className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
              </button>

              <div id={solutionId} className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                <div className="overflow-hidden">
                  <div
                    className="relative mt-3 rounded-xl border border-emerald-200/80 bg-emerald-50/70 p-4 dark:border-emerald-500/25 dark:bg-emerald-500/10"
                    aria-hidden={!open}
                    {...dropProps("answer", answerDragDepth)}
                  >
                    {dropZone === "answer" && (
                      <div className="pointer-events-none absolute inset-2 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-emerald-400 bg-emerald-100/90 text-center text-sm font-semibold text-emerald-700 dark:border-emerald-400/70 dark:bg-slate-900/90 dark:text-emerald-300">
                        Drop answer files here
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 border-b border-emerald-200/70 pb-2.5 dark:border-emerald-500/20">
                      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                        Answer and solution
                      </span>
                      <div className="flex items-center gap-1.5">
                        {item.solutionImages.length > 0 && (
                          <button
                            type="button"
                            onClick={() => downloadPicture(item.solutionImages[0], item.title, 0)}
                            tabIndex={open ? 0 : -1}
                            title="Download answer file"
                            aria-label={"Download answer file of " + item.title}
                            className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg bg-white/80 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 transition hover:bg-white dark:bg-slate-900/70 dark:text-emerald-300 dark:ring-emerald-500/30 dark:hover:bg-slate-900"
                          >
                            <Download size={12} />
                            Download
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleCopy}
                          tabIndex={open ? 0 : -1}
                          className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
                            copied
                              ? "bg-emerald-600 text-white"
                              : "bg-white/80 text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-white dark:bg-slate-900/70 dark:text-emerald-300 dark:ring-emerald-500/30 dark:hover:bg-slate-900"
                          }`}
                        >
                          {copied ? <Check size={12} strokeWidth={3} /> : <Copy size={12} />}
                          {copied ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </div>
                    {item.solution && (
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">{item.solution}</p>
                    )}

                    {item.solutionImages.length > 0 && (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {item.solutionImages.slice(0, 6).map((src, index) => (
                          <div key={index} className="group/sol relative overflow-hidden rounded-xl border border-emerald-200/80 bg-white/60 dark:border-emerald-500/25 dark:bg-slate-900/50">
                            {isPdf(src) ? (
                              <button
                                type="button"
                                onClick={() => openPdfDocument(src)}
                                tabIndex={open ? 0 : -1}
                                title="View document"
                                aria-label={"Open answer document " + (index + 1) + " of " + item.title}
                                className="flex h-20 w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-rose-500/10 to-transparent text-slate-500 transition duration-300 group-hover/sol:from-rose-500/20 dark:from-rose-500/15 dark:text-slate-300"
                              >
                                <span className="rounded-md bg-rose-500/15 p-1.5 text-rose-600 ring-1 ring-inset ring-rose-500/30 dark:text-rose-300">
                                  <FileText size={16} />
                                </span>
                                <span className="text-[9px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-300">PDF</span>
                              </button>
                            ) : (
                              <img
                                src={src}
                                alt={"Answer picture " + (index + 1) + " for " + item.title}
                                loading="lazy"
                                className="h-20 w-full object-cover transition duration-500 group-hover/sol:scale-[1.03]"
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => downloadPicture(src, item.title, index)}
                              tabIndex={open ? 0 : -1}
                              title="Download full resolution"
                              aria-label={"Download answer picture " + (index + 1) + " of " + item.title}
                              className="absolute bottom-1.5 right-1.5 z-10 inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate-950/55 text-white/85 ring-1 ring-inset ring-white/15 backdrop-blur-md transition hover:bg-slate-950/80 hover:text-white focus-visible:opacity-100"
                            >
                              <Download size={11} />
                            </button>
                            {!isPdf(src) && (
                            <button
                              type="button"
                              onClick={() => onViewSolutionImage(item, index)}
                              tabIndex={open ? 0 : -1}
                              title={"View answer picture " + (index + 1)}
                              aria-label={"View answer picture " + (index + 1) + " of " + item.title}
                              className="absolute inset-0 flex items-center justify-center bg-slate-900/0 opacity-0 transition duration-300 group-hover/sol:bg-slate-900/35 group-hover/sol:opacity-100 focus-visible:bg-slate-900/35 focus-visible:opacity-100"
                            >
                              <Maximize2 size={12} className="text-white" />
                            </button>
                            )}
                            {canManage && (
                            <button
                              type="button"
                              onClick={() => onRemoveSolutionImage(item.id, index)}
                              tabIndex={open ? 0 : -1}
                              aria-label={"Remove answer picture " + (index + 1)}
                              className="absolute right-1 top-1 rounded-lg bg-white/90 p-1 text-slate-600 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 focus-visible:opacity-100 group-hover/sol:opacity-100"
                            >
                              <Trash2 size={11} />
                            </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {canManage && item.solutionImages.length < MAX_PICTURES && (
                      <button
                        type="button"
                        onClick={() => onPickSolutionImage(item.id)}
                        tabIndex={open ? 0 : -1}
                        className={"mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-emerald-200 bg-white/50 text-[11px] font-semibold text-emerald-700 transition hover:bg-white dark:border-emerald-500/25 dark:bg-slate-900/40 dark:text-emerald-300 dark:hover:bg-slate-900 " + (item.solutionImages.length ? "min-h-[36px]" : "min-h-[40px]")}
                      >
                        <ImagePlus size={13} />
                        {item.solutionImages.length ? "Add more answer files" : "Attach pictures or a PDF of the answer"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-auto pt-4">
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                <Sparkles size={13} />
                No solution yet
              </div>
            </div>
          )}
        </article>
      );
    }

    /* ============================================================
       Task modal (add and edit)
       ============================================================ */

    /* Shared picture picker. Used in the add form and, in compact form, inside
       the solution accordion, so pictures can always be added or removed in place. */
    function PictureGrid({ images, busy, onPick, onRemove, tone = "slate", compact = false, emptyLabel = "Add pictures or PDF" }) {
      const frame = tone === "emerald"
        ? "border-emerald-200/80 bg-white/60 dark:border-emerald-500/25 dark:bg-slate-900/50"
        : "border-slate-200/70 bg-slate-100 dark:border-slate-700 dark:bg-slate-800";
      const dashed = tone === "emerald"
        ? "border-emerald-200 bg-white/50 text-emerald-700 hover:bg-white dark:border-emerald-500/25 dark:bg-slate-900/40 dark:text-emerald-300 dark:hover:bg-slate-900"
        : "border-slate-200 bg-slate-50/60 text-slate-500 hover:border-emerald-300 hover:bg-emerald-50/60 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300";
      const full = images.length >= MAX_PICTURES;

      return (
        <div>
          {images.length > 0 && (
            <div className={"grid gap-2 " + (compact ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3")}>
              {images.map((src, index) => (
                <div key={index} className={"relative overflow-hidden rounded-xl border " + frame}>
                  {isPdf(src) ? (
                    <button
                      type="button"
                      onClick={() => openPdfDocument(src)}
                      title="View document"
                      aria-label={"Open document " + (index + 1)}
                      className="flex h-28 w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-rose-500/10 to-transparent text-slate-500 transition hover:from-rose-500/20 dark:from-rose-500/15 dark:text-slate-300"
                    >
                      <span className="rounded-lg bg-rose-500/15 p-2 text-rose-600 ring-1 ring-inset ring-rose-500/30 dark:text-rose-300">
                        <FileText size={18} />
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-300">PDF document</span>
                    </button>
                  ) : (
                    <img
                      src={src}
                      alt={"Picture " + (index + 1)}
                      className={compact ? "h-20 w-full object-cover" : "h-28 w-full object-cover"}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    aria-label={(isPdf(src) ? "Remove document " : "Remove picture ") + (index + 1)}
                    title={isPdf(src) ? "Remove document" : "Remove picture"}
                    className="absolute right-1.5 top-1.5 rounded-lg bg-white/90 p-1.5 text-slate-600 transition hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 size={12} />
                  </button>
                  <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-md bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {index + 1}
                  </span>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={onPick}
            disabled={busy > 0 || full}
            className={
              "flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 " +
              (images.length ? "mt-2 min-h-[40px] text-[11px]" : "h-24 text-sm") + " " + dashed
            }
          >
            {busy > 0 ? <LoaderCircle size={14} className="animate-spin" /> : <ImagePlus size={14} />}
            {busy > 0
              ? "Attaching " + busy + " file" + (busy === 1 ? "" : "s")
              : full
                ? "Maximum of " + MAX_PICTURES + " files"
                : images.length ? "Add more files" : emptyLabel}
          </button>

          {images.length > 0 && (
            <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              {images.length} of {MAX_PICTURES} files
            </p>
          )}
        </div>
      );
    }

    function TaskModal({ open, onClose, onSubmit, subjects, initial }) {
      const blank = { title: "", subject: "", description: "", solution: "", dueDate: "", status: "pending", images: [], solutionImages: [] };
      const [form, setForm] = useState(blank);
      const [errors, setErrors] = useState({});
      const [imageErrors, setImageErrors] = useState({ images: "", solutionImages: "" });
      const [busy, setBusy] = useState({ images: 0, solutionImages: 0 });
      const titleRef = useRef(null);
      const subjectRef = useRef(null);
      const dueRef = useRef(null);
      const descriptionRef = useRef(null);
      const fileRef = useRef(null);
      const solutionFileRef = useRef(null);

      const fieldRefs = { title: titleRef, subject: subjectRef, dueDate: dueRef, description: descriptionRef };
      const editing = Boolean(initial);

      useEffect(() => {
        if (!open) return;
        setForm(
          initial
            ? {
                title: initial.title || "",
                subject: initial.subject || "",
                description: initial.description || "",
                solution: initial.solution || "",
                dueDate: initial.dueDate || "",
                status: initial.status || "pending",
                images: toImageList(initial.images, initial.image),
                solutionImages: toImageList(initial.solutionImages, initial.solutionImage),
              }
            : blank
        );
        setErrors({});
        setImageErrors({ images: "", solutionImages: "" });
        setBusy({ images: 0, solutionImages: 0 });
      }, [open, initial]);

      if (!open) return null;

      const set = (key) => (value) => {
        setForm((f) => ({ ...f, [key]: value }));
        setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
      };

      async function handleImages(event, key) {
        const input = event.target;
        const picked = Array.from(input.files || []);
        input.value = "";
        if (!picked.length) return;

        const existing = form[key] || [];
        const room = Math.max(0, MAX_PICTURES - existing.length);
        if (!room) {
          setImageErrors((e) => ({ ...e, [key]: "Remove a file first, the limit is " + MAX_PICTURES + "." }));
          return;
        }

        const files = picked.slice(0, room);
        setBusy((b) => ({ ...b, [key]: b[key] + files.length }));

        const added = [];
        let failure = "";
        for (const file of files) {
          try {
            added.push(await uploadFile(file));
          } catch (err) {
            failure = (err && err.message) || "One file could not be uploaded.";
          }
        }
        setBusy((b) => ({ ...b, [key]: Math.max(0, b[key] - files.length) }));
        if (added.length) setForm((f) => ({ ...f, [key]: [...(f[key] || []), ...added] }));
        setImageErrors((e) => ({
          ...e,
          [key]: failure || (picked.length > room ? "Added " + added.length + " of " + picked.length + " files. " + MAX_PICTURES + " is the limit." : ""),
        }));
      }

      function validate() {
        const found = {};
        if (!form.title.trim()) found.title = "Add a title.";
        else if (form.title.trim().length < 3) found.title = "Use at least 3 characters.";
        if (!form.subject.replace(/\s+/g, " ").trim()) found.subject = "Choose or type a subject.";
        if (!form.description.trim()) found.description = "Add a short description.";
        if (!form.dueDate) found.dueDate = "Pick a due date.";
        return found;
      }

      const missing = REQUIRED_FIELDS.filter((field) => errors[field.key]);

      function submit(event) {
        event.preventDefault();
        const found = validate();
        setErrors(found);

        const firstBad = REQUIRED_FIELDS.find((field) => found[field.key]);
        if (firstBad) {
          /* The form is one long scrolling column, so an empty field used to
             fail in silence. Walk the user to it and focus it. */
          setTimeout(() => {
            const node = fieldRefs[firstBad.key].current;
            if (!node) return;
            node.scrollIntoView({ behavior: "smooth", block: "center" });
            node.focus({ preventScroll: true });
          }, 40);
          return;
        }

        onSubmit({
          title: form.title.trim(),
          subject: form.subject.replace(/\s+/g, " ").trim(),
          description: form.description.trim(),
          solution: form.solution.trim(),
          dueDate: form.dueDate,
          status: form.status,
          images: form.images,
          solutionImages: form.solutionImages,
        });
      }

      return (
        <Modal
          open={open}
          onClose={onClose}
          focusRef={titleRef}
          icon={editing ? Pencil : PenLine}
          iconClass="bg-gradient-to-br from-emerald-500 to-teal-600"
          title={editing ? "Edit assignment" : "Add new assignment"}
          subtitle={editing ? "Update any detail, including the picture and solution." : "Capture the task now, then add the picture and solution whenever you have them."}
        >
          <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2" noValidate>
            <Field id="task-title" label="Title" required error={errors.title} className="sm:col-span-2">
              <input
                id="task-title"
                ref={titleRef}
                type="text"
                value={form.title}
                onChange={(e) => set("title")(e.target.value)}
                placeholder="Ratio Analysis: Walmart vs. Target"
                aria-invalid={errors.title ? "true" : undefined}
                aria-describedby={errors.title ? "task-title-message" : undefined}
                className={errors.title ? INPUT_ERR : INPUT}
              />
            </Field>

            <Field id="task-subject" label="Subject" required error={errors.subject} hint="Pick from the list, or just type a new subject name.">
              <div className="relative">
                <BookOpen size={15} className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                <input
                  id="task-subject"
                  ref={subjectRef}
                  type="text"
                  list="task-subject-options"
                  autoComplete="off"
                  maxLength={60}
                  value={form.subject}
                  onChange={(e) => set("subject")(e.target.value)}
                  placeholder="e.g. Business Communication"
                  aria-invalid={errors.subject ? "true" : undefined}
                  aria-describedby={errors.subject ? "task-subject-message" : undefined}
                  className={`${errors.subject ? INPUT_ERR : INPUT} pl-9`}
                />
                <datalist id="task-subject-options">
                  {subjects.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
            </Field>

            <Field id="task-due" label="Due date" required error={errors.dueDate}>
              <div className="relative">
                <CalendarDays size={15} className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                <input
                  id="task-due"
                  ref={dueRef}
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => set("dueDate")(e.target.value)}
                  aria-invalid={errors.dueDate ? "true" : undefined}
                  aria-describedby={errors.dueDate ? "task-due-message" : undefined}
                  className={`${errors.dueDate ? INPUT_ERR : INPUT} pl-9`}
                />
              </div>
            </Field>

            <Field id="task-description" label="Description" required error={errors.description} className="sm:col-span-2">
              <textarea
                id="task-description"
                ref={descriptionRef}
                rows={3}
                value={form.description}
                onChange={(e) => set("description")(e.target.value)}
                placeholder="What has to be submitted, and what does the brief ask for?"
                aria-invalid={errors.description ? "true" : undefined}
                aria-describedby={errors.description ? "task-description-message" : undefined}
                className={`${errors.description ? INPUT_ERR : INPUT} leading-relaxed`}
              />
            </Field>

            <Field
              id="task-picture"
              label="Pictures of the brief"
              optional
              className="sm:col-span-2"
              error={imageErrors.images}
              hint="The brief, whiteboard or notes. Select several files at once. Uploaded straight to the class's file storage."
            >
              <PictureGrid
                images={form.images}
                busy={busy.images}
                onPick={() => fileRef.current && fileRef.current.click()}
                onRemove={(index) => setForm((f) => ({ ...f, images: f.images.filter((_, i) => i !== index) }))}
              />
              <input
                id="task-picture"
                ref={fileRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                multiple
                className="hidden"
                onChange={(e) => handleImages(e, "images")}
              />
            </Field>

            <Field
              id="task-solution"
              label="Answer or solution"
              optional
              className="sm:col-span-2"
              hint="Hidden behind the View solution button on the card. Handy for revision."
            >
              <textarea
                id="task-solution"
                rows={4}
                value={form.solution}
                onChange={(e) => set("solution")(e.target.value)}
                placeholder="Paste the model answer, key steps or marking criteria here."
                className={`${INPUT} leading-relaxed`}
              />
            </Field>

            <Field
              id="task-solution-picture"
              label="Pictures of the answer"
              optional
              className="sm:col-span-2"
              error={imageErrors.solutionImages}
              hint="Shots of the written answer or working. Select several files at once."
            >
              <div className="mt-1">
                <PictureGrid
                  tone="emerald"
                  compact
                  images={form.solutionImages}
                  busy={busy.solutionImages}
                  onPick={() => solutionFileRef.current && solutionFileRef.current.click()}
                  onRemove={(index) => setForm((f) => ({ ...f, solutionImages: f.solutionImages.filter((_, i) => i !== index) }))}
                  emptyLabel="Attach pictures or a PDF of the answer"
                />
              </div>
              <input
                ref={solutionFileRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                multiple
                className="hidden"
                onChange={(e) => handleImages(e, "solutionImages")}
              />
            </Field>

            <div className="sm:col-span-2" role="group" aria-label="Status">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Status</span>
              <div className="grid grid-cols-3 gap-2">
                {STATUS_ORDER.map((key) => {
                  const meta = STATUS_META[key];
                  const Icon = meta.icon;
                  const active = form.status === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => set("status")(key)}
                      aria-pressed={active}
                      className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold ring-1 transition ${
                        active
                          ? meta.active + " ring-inset"
                          : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50 hover:text-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      }`}
                    >
                      <Icon size={14} />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {missing.length > 0 && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs font-medium text-rose-700 sm:col-span-2 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
              >
                <CircleAlert size={14} className="mt-px shrink-0" />
                <span>
                  Still needed: {missing.map((field) => field.label).join(", ")}.{" "}
                  {missing.length === 1 ? "That field is" : "Those fields are"} highlighted above.
                </span>
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200/80 pt-4 sm:col-span-2 sm:flex-row sm:justify-end dark:border-slate-800">
              <button type="button" onClick={onClose} className={BTN_GHOST}>
                Cancel
              </button>
              <button type="submit" className={BTN_PRIMARY}>
                {editing ? <Check size={16} /> : <Plus size={16} />}
                {editing ? "Save changes" : "Add assignment"}
              </button>
            </div>
          </form>
        </Modal>
      );
    }

    /* ============================================================
       Admin settings (password, accounts, subjects, data)
       ============================================================ */

    function makeClassCode() {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let out = "";
      for (let i = 0; i < 6; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
      return "H-" + out;
    }

    function AccountsPanel({
      accounts, items, classCode, viewer,
      onAddAccount, onRenameAccount, onSetRole, onSetAccountPassword, onDeleteAccount, onClassCode,
    }) {
      const [draft, setDraft] = useState({ username: "", password: "", role: "student" });
      const [error, setError] = useState("");
      const [notice, setNotice] = useState("");
      const [showCode, setShowCode] = useState(false);
      const [renaming, setRenaming] = useState(null);
      const [renameValue, setRenameValue] = useState("");
      const [pwFor, setPwFor] = useState(null);
      const [pwValue, setPwValue] = useState("");
      const [dropFor, setDropFor] = useState(null);

      useEffect(() => {
        if (!notice) return;
        const t = setTimeout(() => setNotice(""), 2600);
        return () => clearTimeout(t);
      }, [notice]);

      const countFor = (id) => items.filter((i) => i.ownerId === id).length;
      const adminCount = accounts.filter((a) => a.role === "admin").length;
      const adminUrl = adminGateUrl();
      const originLabel = storageOriginLabel();

      async function copyAdminLink() {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(adminUrl);
            setNotice("Admin gate link copied");
            return;
          }
        } catch (err) {
          /* fall through to the inline copy */
        }
        setNotice(adminUrl);
      }

      async function addAccount(event) {
        event.preventDefault();
        const username = draft.username.replace(/\s+/g, " ").trim();
        setError("");
        setNotice("");
        if (username.length < 2) { setError("Usernames need at least 2 characters."); return; }
        if (username.length > 24) { setError("Keep usernames under 24 characters."); return; }
        if (accounts.some((a) => a.username.toLowerCase() === username.toLowerCase())) {
          setError("That username is already taken.");
          return;
        }
        if (draft.password.length < 8) { setError("Give them a password of at least 8 characters."); return; }
        /* The server answers with the refreshed roster or a reason, which is
           notified above; this form only moves on when the board agreed. */
        if (!(await onAddAccount({ username, password: draft.password, role: draft.role }))) {
          return;
        }
        setDraft({ username: "", password: "", role: "student" });
        setNotice(username + " can sign in now");
      }

      async function commitRename(id) {
        const name = renameValue.replace(/\s+/g, " ").trim();
        setError("");
        if (name.length < 2 || name.length > 24) { setError("Usernames need between 2 and 24 characters."); return; }
        if (accounts.some((a) => a.id !== id && a.username.toLowerCase() === name.toLowerCase())) {
          setError("That username is already taken.");
          return;
        }
        if (!(await onRenameAccount(id, name))) return;
        setRenaming(null);
        setNotice("Renamed to " + name);
      }

      async function commitPassword(id) {
        setError("");
        if (pwValue.length < 8) { setError("Passwords need at least 8 characters."); return; }
        if (!(await onSetAccountPassword(id, pwValue))) return;
        setPwFor(null);
        setPwValue("");
        setNotice("Password reset");
      }

      const miniBtn =
        "cursor-pointer rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800";

      return (
        <div className="mt-6 space-y-6">
          <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 p-4 dark:border-emerald-500/25 dark:bg-emerald-500/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
                <ShieldCheck size={14} />
                Class code
              </span>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setShowCode((s) => !s)} className={miniBtn} aria-pressed={showCode}>
                  {showCode ? <EyeOff size={12} /> : <Eye size={12} />}
                  {showCode ? "Hide" : "Show"}
                </button>
                <button type="button" onClick={() => onClassCode(makeClassCode())} className={miniBtn}>
                  <RefreshCw size={12} />
                  New code
                </button>
              </div>
            </div>
            <p className="mt-2 font-mono text-lg font-semibold tracking-wide text-emerald-800 dark:text-emerald-200">
              {showCode ? classCode : "••••••••"}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-emerald-900/70 dark:text-emerald-200/70">
              Students type this on the sign in screen to create their own login. A new code does
              not remove anyone who already signed up.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/80 p-4 dark:border-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                <Lock size={14} />
                Admin gate
              </span>
              <button type="button" onClick={copyAdminLink} className={miniBtn}>
                Copy link
              </button>
            </div>
            <p
              className="mt-2 truncate rounded-lg bg-slate-100 px-3 py-2 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              title={adminUrl}
            >
              {adminUrl}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Keep this link to yourself. It is the only route to the admin gate, and it opens even
              when nobody is signed in. Accounts and the board stay in this browser profile on{" "}
              {originLabel}, so they do not travel between devices.
            </p>
          </div>

          <form onSubmit={addAccount} className="rounded-xl border border-slate-200/80 p-4 dark:border-slate-700">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              Add someone yourself
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field id="new-username" label="Username">
                <input
                  id="new-username"
                  type="text"
                  value={draft.username}
                  onChange={(e) => { setDraft({ ...draft, username: e.target.value }); setError(""); }}
                  placeholder="Riya"
                  autoComplete="off"
                  maxLength={24}
                  className={INPUT}
                />
              </Field>
              <Field id="new-password" label="Password">
                <input
                  id="new-password"
                  type="text"
                  value={draft.password}
                  onChange={(e) => { setDraft({ ...draft, password: e.target.value }); setError(""); }}
                  placeholder="At least 8 characters"
                  autoComplete="off"
                  className={INPUT}
                />
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setDraft({ ...draft, role: draft.role === "student" ? "admin" : "student" })}
                className={miniBtn}
                aria-pressed={draft.role === "admin"}
              >
                <ShieldCheck size={12} />
                {draft.role === "admin" ? "Role: Admin" : "Role: Student"}
              </button>
              <button type="submit" className={`${miniBtn} ring-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:ring-emerald-500/30 dark:hover:bg-emerald-500/10`}>
                <UserPlus size={12} />
                Add account
              </button>
            </div>
          </form>

          {error && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400">
              <CircleAlert size={12} />
              {error}
            </p>
          )}
          {notice && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-300">
              <Check size={12} strokeWidth={3} />
              {notice}
            </p>
          )}

          <ul className="space-y-2">
            {accounts.map((a) => {
              const role = ROLE_META[a.role] || ROLE_META.student;
              const lastAdmin = a.role === "admin" && adminCount === 1;
              const busy = renaming === a.id || pwFor === a.id || dropFor === a.id;

              return (
                <li key={a.id} className="rounded-xl border border-slate-200/80 p-3 dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {a.username.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                        {a.username}
                        {viewer && a.id === viewer.id && (
                          <span className="ml-1.5 text-[11px] font-normal text-slate-400">you</span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {countFor(a.id)} {countFor(a.id) === 1 ? "assignment" : "assignments"}
                        {a.lastSeen ? " · last seen " + new Date(a.lastSeen).toLocaleDateString() : " · never signed in"}
                      </p>
                    </div>
                    <span className={"shrink-0 rounded-lg px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset " + role.chip}>
                      {role.label}
                    </span>
                  </div>

                  {renaming === a.id && (
                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <Field id={"rename-" + a.id} label="New username" className="min-w-[160px] flex-1">
                        <input
                          id={"rename-" + a.id}
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          maxLength={24}
                          className={INPUT}
                        />
                      </Field>
                      <button type="button" onClick={() => commitRename(a.id)} className={miniBtn + " mb-1 ring-emerald-200 text-emerald-700 dark:ring-emerald-500/30"}>Save</button>
                      <button type="button" onClick={() => setRenaming(null)} className={miniBtn + " mb-1"}>Cancel</button>
                    </div>
                  )}

                  {pwFor === a.id && (
                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <Field id={"pw-" + a.id} label="New password" className="min-w-[160px] flex-1">
                        <input
                          id={"pw-" + a.id}
                          type="text"
                          value={pwValue}
                          onChange={(e) => setPwValue(e.target.value)}
                          autoComplete="off"
                          className={INPUT}
                        />
                      </Field>
                      <button type="button" onClick={() => commitPassword(a.id)} className={miniBtn + " mb-1 ring-emerald-200 text-emerald-700 dark:ring-emerald-500/30"}>Save</button>
                      <button type="button" onClick={() => setPwFor(null)} className={miniBtn + " mb-1"}>Cancel</button>
                    </div>
                  )}

                  {dropFor === a.id && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-rose-50 px-3 py-2.5 dark:bg-rose-500/10">
                      <p className="flex-1 text-xs font-medium text-rose-700 dark:text-rose-300">
                        {countFor(a.id) > 0
                          ? a.username + " still has " + countFor(a.id) + " assignment(s) on the board."
                          : "Remove " + a.username + "?"}
                      </p>
                      <button
                        type="button"
                        onClick={async () => { setDropFor(null); await onDeleteAccount(a.id); }}
                        disabled={countFor(a.id) > 0}
                        className={miniBtn + " mb-0 border-0 bg-rose-600 text-white ring-0 hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"}
                      >
                        Remove
                      </button>
                      <button type="button" onClick={() => setDropFor(null)} className={miniBtn}>Keep</button>
                    </div>
                  )}

                  {!busy && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => { setPwFor(a.id); setPwValue(""); setError(""); }} className={miniBtn}>
                        <KeyRound size={12} />
                        Reset password
                      </button>
                      <button type="button" onClick={() => { setRenaming(a.id); setRenameValue(a.username); setError(""); }} className={miniBtn}>
                        <Pencil size={12} />
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={async () => { await onSetRole(a.id, a.role === "admin" ? "student" : "admin"); }}
                        disabled={lastAdmin}
                        title={lastAdmin ? "The class needs at least one admin" : ""}
                        className={miniBtn}
                      >
                        <ShieldCheck size={12} />
                        {a.role === "admin" ? "Make student" : "Make admin"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDropFor(a.id)}
                        className={miniBtn + " text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-300 dark:hover:bg-rose-500/10"}
                      >
                        <Trash2 size={12} />
                        Remove
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      );
    }

    function SettingsModal({
      open, onClose, config, account, items, subjects,
      onChangePassword, onAddAccount, onRenameAccount, onSetRole, onSetAccountPassword, onDeleteAccount, onClassCode,
      onAddSubject, onRenameSubject, onDeleteSubject, onImport,
    }) {
      const [tab, setTab] = useState("password");
      const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
      const [pwErrors, setPwErrors] = useState({});
      const [saved, setSaved] = useState(false);
      const [pwBusy, setPwBusy] = useState(false);
      const [newSubject, setNewSubject] = useState("");
      const [editing, setEditing] = useState(null);
      const [editValue, setEditValue] = useState("");
      const [formError, setFormError] = useState("");
      const [pendingImport, setPendingImport] = useState(null);
      const [usage, setUsage] = useState("");
      const importRef = useRef(null);

      useEffect(() => {
        if (!open) return;
        setTab("password");
        setPw({ current: "", next: "", confirm: "" });
        setPwErrors({});
        setSaved(false);
        setPwBusy(false);
        setNewSubject("");
        setEditing(null);
        setFormError("");
        setPendingImport(null);
        setUsage(storageUsageText());
      }, [open]);

      if (!open) return null;

      const usageCount = (name) => items.filter((i) => i.subject === name).length;

      /* The board is asked whether the current password is right, then the new one is
         written with the credential the board agreed to. Comparing against the copy
         this device holds is what made this refuse a change on a device that had
         drifted away from the board. */
      async function savePassword(event) {
        event.preventDefault();
        const found = {};
        if (!pw.current) found.current = "Enter your current password.";
        if (!pw.next) found.next = "Choose a new password.";
        else if (pw.next.length < 8) found.next = "Use at least 8 characters.";
        else if (pw.next === pw.current) found.next = "Pick something different from the current password.";
        if (pw.confirm !== pw.next) found.confirm = "The two passwords do not match.";

        setPwErrors(found);
        setSaved(false);
        if (Object.keys(found).length) return;

        setPwBusy(true);
        const result = await onChangePassword(pw.current, pw.next);
        setPwBusy(false);

        if (!result || !result.ok) {
          setPwErrors({ current: (result && result.reason) || "Could not save that password." });
          return;
        }
        setPw({ current: "", next: "", confirm: "" });
        setSaved(true);
        setTimeout(() => setSaved(false), 5000);
      }

      function addSubject(event) {
        event.preventDefault();
        const name = newSubject.trim();
        setFormError("");
        if (!name) { setFormError("Type a subject name first."); return; }
        if (name.length > 40) { setFormError("Keep subject names under 40 characters."); return; }
        if (subjects.some((s) => s.toLowerCase() === name.toLowerCase())) { setFormError("That subject already exists."); return; }
        if (onAddSubject(name)) setNewSubject("");
        else setFormError("Could not save. Browser storage is unavailable.");
      }

      function commitEdit() {
        const name = editValue.trim();
        setFormError("");
        if (!name) { setFormError("A subject name cannot be empty."); return; }
        if (name !== editing && subjects.some((s) => s.toLowerCase() === name.toLowerCase())) {
          setFormError("That subject already exists.");
          return;
        }
        if (name !== editing) onRenameSubject(editing, name);
        setEditing(null);
      }

      async function handleImportFile(event) {
        const file = event.target.files && event.target.files[0];
        event.target.value = "";
        if (!file) return;
        try {
          const parsed = await readJsonFile(file);
          const list = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.items) ? parsed.items : null;
          if (!list) throw new Error("That file has no tasks in it.");
          const subjectsInFile = parsed && Array.isArray(parsed.subjects) ? parsed.subjects : [];
          setPendingImport({ items: list.map(normaliseItem), subjects: subjectsInFile });
          setFormError("");
        } catch (err) {
          setPendingImport(null);
          setFormError(err.message || "That backup could not be read.");
        }
      }

      const TABS = [
        { key: "password", label: "My password", icon: KeyRound },
        { key: "accounts", label: "Accounts", icon: Users },
        { key: "subjects", label: "Subjects", icon: Tag },
        { key: "data", label: "Data", icon: HardDrive },
      ];

      return (
        <Modal
          open={open}
          onClose={onClose}
          icon={Settings}
          iconClass="bg-gradient-to-br from-slate-700 to-slate-900"
          title="Admin settings"
          subtitle="Manage who can sign in, edit your subjects, and back up the class board."
        >
          <div className="mt-6 grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => { setTab(key); setFormError(""); }}
                aria-pressed={tab === key}
                className={`flex min-h-[40px] items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  tab === key
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {tab === "password" && (
            <form onSubmit={savePassword} className="mt-6 grid gap-4 sm:grid-cols-2" noValidate>
              <Field id="current-password" label="Current password" error={pwErrors.current} className="sm:col-span-2">
                <input
                  id="current-password"
                  type="password"
                  value={pw.current}
                  onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
                  placeholder="The password you unlock with"
                  autoComplete="current-password"
                  aria-invalid={pwErrors.current ? "true" : undefined}
                  aria-describedby={pwErrors.current ? "current-password-message" : undefined}
                  className={pwErrors.current ? INPUT_ERR : INPUT}
                />
              </Field>

              <Field id="new-password" label="New password" error={pwErrors.next} hint="At least 8 characters.">
                <input
                  id="new-password"
                  type="text"
                  value={pw.next}
                  onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
                  placeholder="Enter new password"
                  autoComplete="new-password"
                  aria-invalid={pwErrors.next ? "true" : undefined}
                  aria-describedby="new-password-message"
                  className={pwErrors.next ? INPUT_ERR : INPUT}
                />
              </Field>

              <Field id="confirm-password" label="Confirm new password" error={pwErrors.confirm}>
                <input
                  id="confirm-password"
                  type="text"
                  value={pw.confirm}
                  onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
                  placeholder="Repeat new password"
                  autoComplete="new-password"
                  aria-invalid={pwErrors.confirm ? "true" : undefined}
                  aria-describedby={pwErrors.confirm ? "confirm-password-message" : undefined}
                  className={pwErrors.confirm ? INPUT_ERR : INPUT}
                />
              </Field>

              {saved && (
                <p role="status" className="flex animate-fade-in items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-700 sm:col-span-2 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <Check size={14} strokeWidth={3} />
                  Password updated. Use it the next time you unlock.
                </p>
              )}

              <div className="flex justify-end gap-2 border-t border-slate-200/80 pt-4 sm:col-span-2 dark:border-slate-800">
                <button type="submit" disabled={pwBusy} className={BTN_PRIMARY + " disabled:cursor-not-allowed disabled:opacity-60"}>
                  <KeyRound size={15} />
                  {pwBusy ? "Checking with the board" : "Save password"}
                </button>
              </div>
            </form>
          )}

          {tab === "accounts" && (
            <AccountsPanel
              accounts={config.accounts}
              items={items}
              classCode={config.classCode}
              viewer={account}
              onAddAccount={onAddAccount}
              onRenameAccount={onRenameAccount}
              onSetRole={onSetRole}
              onSetAccountPassword={onSetAccountPassword}
              onDeleteAccount={onDeleteAccount}
              onClassCode={onClassCode}
            />
          )}

          {tab === "subjects" && (
            <div className="mt-6 space-y-4">
              <form onSubmit={addSubject} className="flex gap-2" noValidate>
                <input
                  id="new-subject"
                  type="text"
                  value={newSubject}
                  onChange={(e) => { setNewSubject(e.target.value); setFormError(""); }}
                  placeholder="Add a subject, for example Supply Chain Management"
                  aria-label="New subject name"
                  className={formError && !editing ? INPUT_ERR : INPUT}
                />
                <button type="submit" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white">
                  <Plus size={15} />
                  Add
                </button>
              </form>

              {formError && (
                <p role="alert" className="flex animate-fade-in items-center gap-2 text-xs font-medium text-rose-600 dark:text-rose-400">
                  <CircleAlert size={12} />
                  {formError}
                </p>
              )}

              <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {subjects.map((name) => {
                  const count = usageCount(name);
                  const isEditing = editing === name;
                  return (
                    <li key={name} className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900/60">
                      {isEditing ? (
                        <>
                          <input
                            autoFocus
                            value={editValue}
                            aria-label={"Rename " + name}
                            onChange={(e) => { setEditValue(e.target.value); setFormError(""); }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
                              if (e.key === "Escape") setEditing(null);
                            }}
                            className="min-w-0 flex-1 rounded-lg border border-emerald-400 bg-white px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:ring-4 focus:ring-emerald-100 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-emerald-500/20"
                          />
                          <button type="button" onClick={commitEdit} title="Save name" className="rounded-lg bg-emerald-600 p-2 text-white transition hover:bg-emerald-700">
                            <Check size={14} strokeWidth={3} />
                          </button>
                          <button type="button" onClick={() => { setEditing(null); setFormError(""); }} title="Cancel rename" className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800">
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${subjectDot(name)}`} aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700 dark:text-slate-200">{name}</span>
                          <span className={`shrink-0 rounded-lg px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${count ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-slate-200/70 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
                            {count ? count + (count === 1 ? " task" : " tasks") : "unused"}
                          </span>
                          <button
                            type="button"
                            onClick={() => { setEditing(name); setEditValue(name); setFormError(""); }}
                            title="Rename subject"
                            aria-label={"Rename " + name}
                            className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-white hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => { if (!count) onDeleteSubject(name); }}
                            disabled={count > 0}
                            title={count ? "Used by " + count + (count === 1 ? " task" : " tasks") + ", rename it instead" : "Delete subject"}
                            aria-label={"Delete " + name}
                            className={`shrink-0 rounded-lg p-2 transition ${count > 0 ? "text-slate-400 dark:text-slate-600" : "text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-500/15 dark:hover:text-rose-300"}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>

              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Renaming a subject updates every task that uses it. A subject that is still in use cannot be deleted, so no
                task loses its label.
              </p>
            </div>
          )}

          {tab === "data" && (
            <div className="mt-6 space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                <HardDrive size={16} className="mt-0.5 shrink-0 text-slate-500 dark:text-slate-400" />
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">This browser is using {usage}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    Pictures are compressed before they are saved, so roughly 15 to 25 of them fit inside the usual 5 MB
                    browser limit. Export a backup before clearing browser data.
                  </p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => downloadBackup(items, config)}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Download size={15} />
                  Export backup
                </button>
                <button
                  type="button"
                  onClick={() => importRef.current && importRef.current.click()}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Upload size={15} />
                  Import backup
                </button>
              </div>

              <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImportFile} />

              {formError && (
                <p role="alert" className="flex animate-fade-in items-center gap-2 text-xs font-medium text-rose-600 dark:text-rose-400">
                  <CircleAlert size={12} />
                  {formError}
                </p>
              )}

              {pendingImport && (
                <div className="animate-fade-in rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                    Replace your tasks with {pendingImport.items.length} from this file?
                  </p>
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                    Your current {items.length} tasks will be overwritten. Your unlock password stays as it is.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onImport(pendingImport);
                        setPendingImport(null);
                        setUsage(storageUsageText());
                      }}
                      className="rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-amber-700"
                    >
                      Replace tasks
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingImport(null)}
                      className="rounded-xl px-3.5 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-500/20"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                A backup is a plain JSON file holding your tasks, pictures, subjects and theme. Keep it private, it contains
                everything on your board.
              </p>
            </div>
          )}
        </Modal>
      );
    }

    /* ============================================================
       Empty states
       ============================================================ */

    function EmptyState({ title, body, actionLabel, onAction, secondary }) {
      return (
        <div className="rounded-2xl border border-dashed border-slate-300/80 bg-white/70 px-6 py-14 text-center backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/50">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
            <Inbox size={24} />
          </div>
          <h3 className="mt-4 font-display text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">{body}</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {actionLabel && (
              <button
                type="button"
                onClick={onAction}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                {actionLabel}
              </button>
            )}
            {secondary}
          </div>
        </div>
      );
    }

    /* ============================================================
       Dashboard
       ============================================================ */

    function Dashboard({
      items, subjects, config, theme, account,
      onAdd, onUpdate, onCycleStatus, onDelete, onEnsureSubject,
      onAddPictures, onRemovePicture,
      notify, onSignOut, onChangePassword, onAddAccount, onRenameAccount, onSetRole,
      onSetAccountPassword, onDeleteAccount, onClassCode,
      onAddSubject, onRenameSubject, onDeleteSubject, onImport, onThemeChange,
      saveError, onDismissSaveError, onReverifyDevice,
    }) {
      const [query, setQuery] = useState("");
      const [subject, setSubject] = useState("all");
      const [status, setStatus] = useState("all");
      const [dueFilter, setDueFilter] = useState("all");
      const [modalOpen, setModalOpen] = useState(false);
      const [accountOpen, setAccountOpen] = useState(false);
      const [editing, setEditing] = useState(null);
      const [settingsOpen, setSettingsOpen] = useState(false);
      const [lightbox, setLightbox] = useState(null);
      const fileRef = useRef(null);
      const fileTarget = useRef(null);

      const lightboxEntry = lightbox ? items.find((i) => i.id === lightbox.id) : null;
      const lightboxSrcs = lightboxEntry
        ? lightbox.kind === "solution" ? lightboxEntry.solutionImages : lightboxEntry.images
        : [];

      const stats = useMemo(() => {
        const counts = { pending: 0, "in-progress": 0, completed: 0 };
        items.forEach((item) => { if (counts[item.status] !== undefined) counts[item.status] += 1; });
        return counts;
      }, [items]);

      const matchesSearchAndFacets = useMemo(() => {
        const q = query.trim().toLowerCase();
        return items.filter((item) => {
          if (subject !== "all" && item.subject !== subject) return false;
          if (status !== "all" && item.status !== status) return false;
          if (!q) return true;
          return [item.title, item.subject, item.description, item.solution].join(" ").toLowerCase().includes(q);
        });
      }, [items, query, subject, status]);

      const dueCounts = useMemo(() => {
        const counts = { all: matchesSearchAndFacets.length, overdue: 0, today: 0, week: 0 };
        matchesSearchAndFacets.forEach((item) => {
          const bucket = dueBucket(item);
          if (bucket === "overdue") counts.overdue += 1;
          else if (bucket === "today") counts.today += 1;
          else if (bucket === "week") counts.week += 1;
        });
        return counts;
      }, [matchesSearchAndFacets]);

      const filtered = useMemo(() => {
        return matchesSearchAndFacets
          .filter((item) => dueFilter === "all" || dueBucket(item) === dueFilter)
          .sort((a, b) => {
            const da = a.dueDate || "9999-12-31";
            const db = b.dueDate || "9999-12-31";
            if (da !== db) return da < db ? -1 : 1;
            return (b.createdAt || 0) - (a.createdAt || 0);
          });
      }, [matchesSearchAndFacets, dueFilter]);

      const filtersActive = query.trim() !== "" || subject !== "all" || status !== "all" || dueFilter !== "all";

      function clearFilters() {
        setQuery("");
        setSubject("all");
        setStatus("all");
        setDueFilter("all");
      }

      function openCreate() {
        setEditing(null);
        setModalOpen(true);
      }

      function openEdit(item) {
        setEditing(item);
        setModalOpen(true);
      }

      function closeModal() {
        setModalOpen(false);
        setEditing(null);
      }

      function handleSubmit(payload) {
        /* A subject nobody has used yet is added to the subject list on the fly. */
        const subject = onEnsureSubject(payload.subject);
        const next = { ...payload, subject };
        const count = (next.images || []).length + (next.solutionImages || []).length;
        if (editing) {
          onUpdate(editing.id, next);
          notify("Changes saved");
        } else {
          onAdd(next);
          notify(count ? "Assignment added with " + count + (count === 1 ? " picture" : " pictures") : "Assignment added to your dashboard");
        }
        closeModal();
      }

      function requestPicture(id, kind) {
        fileTarget.current = { id, kind };
        if (fileRef.current) fileRef.current.click();
      }

      function pickImage(id) {
        requestPicture(id, "card");
      }

      function pickSolutionImage(id) {
        requestPicture(id, "solution");
      }

      /* One upload path shared by the file picker and the card dropzone, so both
         land in the same bucket and report failures the same way. It takes an
         already-resolved item (not an id) so a drop on a card can hand over the
         exact card under the cursor without a second lookup. */
      async function attachFiles(item, key, picked) {
        if (!item || !picked.length) return;
        const existing = item[key] || [];
        const room = Math.max(0, MAX_PICTURES - existing.length);
        if (!room) {
          notify("That assignment already has " + MAX_PICTURES + " files", "danger");
          return;
        }

        const files = picked.slice(0, room);
        const where = key === "solutionImages" ? "the answer" : "the card";
        notify("Attaching " + files.length + " file" + (files.length === 1 ? "" : "s") + " to " + where, "info");

        const added = [];
        let failure = "";
        for (const file of files) {
          try {
            added.push(await uploadFile(file));
          } catch (err) {
            failure = (err && err.message) || "That file could not be uploaded.";
          }
        }
        if (!added.length) {
          notify(failure || "No files were uploaded.", "danger");
          return;
        }
        onAddPictures(item.id, key, added);
        const skipped = picked.length - added.length;
        notify(
          added.length + (added.length === 1 ? " file added to " : " files added to ") + where +
            (skipped > 0 ? ". " + skipped + " skipped, the limit is " + MAX_PICTURES : "")
        );
      }

      async function handleImagePick(event) {
        const picked = Array.from(event.target.files || []);
        event.target.value = "";
        const target = fileTarget.current;
        fileTarget.current = null;
        if (!picked.length || !target) return;

        const item = items.find((i) => i.id === target.id);
        if (!item) return;
        await attachFiles(item, target.kind === "solution" ? "solutionImages" : "images", picked);
      }

      return (
        <div className="relative min-h-screen">
          <AmbientBackdrop />

          <div className="relative z-10">
            <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/70 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/70">
              <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-glow">
                  <GraduationCap size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="truncate font-display text-base font-semibold tracking-tight text-slate-900 sm:text-lg dark:text-slate-50">
                      BBA Section H Organizer
                    </h1>
                    <span className="hidden shrink-0 rounded-lg bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white sm:inline dark:bg-slate-100 dark:text-slate-900">
                      Section H
                    </span>
                  </div>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    Fall 2026, {items.length} {items.length === 1 ? "assignment" : "assignments"} tracked
                  </p>
                </div>

                <div className="ml-auto flex items-center gap-2">
                  {account && account.role === "admin" && (
                    <button type="button" onClick={openCreate} className={BTN_PRIMARY + " px-3.5 py-2.5"}>
                      <Plus size={16} />
                      <span className="hidden sm:inline">New assignment</span>
                    </button>
                  )}
                  <ThemeToggle theme={theme} onChange={onThemeChange} />
                  {account && account.role === "admin" && (
                    <button type="button" onClick={() => setSettingsOpen(true)} className={BTN_ICON} title="Admin settings" aria-label="Admin settings">
                      <Settings size={16} />
                    </button>
                  )}
                  {/* No gear means no door, but say so rather than leaving a gap. */}
                  {account && (
                    <button
                      type="button"
                      onClick={() => setAccountOpen(true)}
                      className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-xl bg-slate-100 px-2.5 py-2 text-left transition hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
                      title={"Signed in as " + account.username}
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-[11px] font-bold text-white">
                        {account.username.charAt(0).toUpperCase()}
                      </span>
                      <span className="hidden max-w-[7rem] truncate text-xs font-semibold text-slate-700 sm:inline dark:text-slate-200">
                        {account.username}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </header>

            {/* A save the server would not take. Deliberately persistent rather than a
                toast, because the edit behind it is still sitting on screen looking
                saved, and that is the exact mistake worth making impossible. */}
            {saveError && account && account.role === "admin" && (
              <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
                <div
                  role="alert"
                  aria-live="assertive"
                  className="flex items-start gap-3 rounded-2xl border border-rose-200/80 bg-rose-50/70 px-4 py-3 text-sm text-rose-900 shadow-card backdrop-blur-xl dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                    <CircleAlert size={13} strokeWidth={3} />
                  </span>
                  <p className="min-w-0 flex-1 leading-relaxed">
                    <span className="font-semibold">Not saved to the class board.</span>{" "}
                    {saveError} Everything on screen is still only in this browser, so no one else can
                    see it yet.
                  </p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {/* A refusal with a session that expired has one repair: sign in
                        again, which mints a fresh cookie. */}
                    <button
                      type="button"
                      onClick={onReverifyDevice}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:text-rose-200 dark:hover:bg-rose-500/20"
                    >
                      Sign in again
                    </button>
                    <button
                      type="button"
                      onClick={onDismissSaveError}
                      aria-label="Dismiss the unsaved warning"
                      className="shrink-0 rounded-lg p-1.5 text-rose-600 transition hover:bg-rose-100 dark:text-rose-300 dark:hover:bg-rose-500/15"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            <main className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
              <section className="grid gap-3 sm:grid-cols-3 sm:gap-4">
                {STATUS_ORDER.map((key) => (
                  <StatCard key={key} label={STATUS_META[key].label} count={stats[key]} total={items.length} meta={STATUS_META[key]} />
                ))}
              </section>

              <section className={`${CARD} mt-5 p-4 sm:p-5`}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <div className="relative flex-1">
                    <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search title, subject, description or solution"
                      aria-label="Search assignments"
                      className={`${INPUT} py-2.5 pl-10 pr-10`}
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        aria-label="Clear search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:w-auto">
                    <SelectControl icon={BookOpen} value={subject} onChange={setSubject} ariaLabel="Filter by subject">
                      <option value="all">All subjects</option>
                      {subjects.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </SelectControl>

                    <SelectControl icon={Filter} value={status} onChange={setStatus} ariaLabel="Filter by status">
                      <option value="all">All statuses</option>
                      {STATUS_ORDER.map((key) => (
                        <option key={key} value={key}>{STATUS_META[key].label}</option>
                      ))}
                    </SelectControl>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-3 dark:border-slate-800">
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Due</span>
                  {DUE_FILTERS.map(({ key, label }) => {
                    const active = dueFilter === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setDueFilter(key)}
                        aria-pressed={active}
                        className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition ${
                          active
                            ? "bg-slate-900 text-white ring-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:ring-slate-100"
                            : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
                        }`}
                      >
                        {label}
                        <span className={`tabular-nums ${active ? "text-white/70 dark:text-slate-900/60" : "text-slate-500 dark:text-slate-400"}`}>
                          {dueCounts[key]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-slate-800 tabular-nums dark:text-slate-100">{filtered.length}</span> of {items.length}{" "}
                  {items.length === 1 ? "assignment" : "assignments"}
                  {status !== "all" && " in " + STATUS_META[status].label}
                  {dueFilter !== "all" && " due " + DUE_FILTERS.find((f) => f.key === dueFilter).label.toLowerCase()}
                </p>
                <div className="flex items-center gap-3">
                  {filtersActive && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="text-xs font-semibold text-slate-500 underline-offset-2 transition hover:text-emerald-700 hover:underline dark:text-slate-400 dark:hover:text-emerald-300"
                    >
                      Clear filters
                    </button>
                  )}
                  <p className="hidden text-xs text-slate-500 sm:block dark:text-slate-400">Sorted by due date</p>
                </div>
              </div>

              <div className="mt-4">
                {filtered.length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {filtered.map((item) => (
                      <AssignmentCard
                        key={item.id}
                        item={item}
                        account={account}
                        onCycleStatus={onCycleStatus}
                        onEdit={openEdit}
                        onDelete={onDelete}
                        onViewImage={(target, index) => setLightbox({ id: target.id, kind: "card", index: index || 0 })}
                        onPickImage={pickImage}
                        onRemoveImage={(id, index) => onRemovePicture(id, "images", index)}
                        onViewSolutionImage={(target, index) => setLightbox({ id: target.id, kind: "solution", index: index || 0 })}
                        onPickSolutionImage={pickSolutionImage}
                        onRemoveSolutionImage={(id, index) => onRemovePicture(id, "solutionImages", index)}
                        onAttachFiles={attachFiles}
                      />
                    ))}
                  </div>
                ) : items.length === 0 ? (
                  <EmptyState
                    title="No assignments yet"
                    body={
                      account && account.role === "admin"
                        ? "Add the first task for Section H and it appears here straight away."
                        : "There is nothing on the board yet. An admin posts the assignments, they land here for everyone to read."
                    }
                    actionLabel={account && account.role === "admin" ? "Add first assignment" : null}
                    onAction={openCreate}
                  />
                ) : (
                  <EmptyState
                    title="Nothing matches these filters"
                    body="Try a different keyword, subject, status or due window. Clearing the filters brings everything back."
                    actionLabel="Clear filters"
                    onAction={clearFilters}
                    secondary={
                      account && account.role === "admin" ? (
                        <button type="button" onClick={openCreate} className={BTN_GHOST}>
                          <Plus size={15} />
                          New assignment
                        </button>
                      ) : null
                    }
                  />
                )}
              </div>

              <footer className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-slate-200/80 pt-6 text-xs text-slate-500 sm:flex-row dark:border-slate-800 dark:text-slate-400">
                <p className="inline-flex items-center gap-2">
                  <Layers size={13} />
                  BBA Section H Organizer, Fall 2026
                </p>
                <p className="inline-flex items-center gap-2">
                  <Lock size={12} />
                  Locks on reload, data stays in this browser
                </p>
              </footer>
            </main>
          </div>

          <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" multiple className="hidden" onChange={handleImagePick} />

          <TaskModal
            open={modalOpen}
            onClose={closeModal}
            onSubmit={handleSubmit}
            subjects={subjects}
            initial={editing}
          />

          <SettingsModal
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            config={config}
            account={account}
            items={items}
            subjects={subjects}
            onChangePassword={onChangePassword}
            onAddAccount={onAddAccount}
            onRenameAccount={onRenameAccount}
            onSetRole={onSetRole}
            onSetAccountPassword={onSetAccountPassword}
            onDeleteAccount={onDeleteAccount}
            onClassCode={onClassCode}
            onAddSubject={onAddSubject}
            onRenameSubject={onRenameSubject}
            onDeleteSubject={onDeleteSubject}
            onImport={onImport}
          />

          <AccountModal
            open={accountOpen}
            onClose={() => setAccountOpen(false)}
            account={account}
            onChangePassword={async (current, next) => {
              const result = await onChangePassword(current, next);
              if (result && result.ok) notify("Password updated");
              return result;
            }}
            onSignOut={() => {
              setAccountOpen(false);
              onSignOut();
            }}
          />

          {lightboxEntry && lightboxSrcs.length > 0 && (
            <Lightbox
              srcs={lightboxSrcs}
              index={lightbox.index || 0}
              onIndex={(index) => setLightbox((l) => ({ ...l, index }))}
              caption={lightboxEntry.title}
              onClose={() => setLightbox(null)}
              onRemove={
                account && account.role === "admin"
                  ? (index) =>
                      onRemovePicture(
                        lightboxEntry.id,
                        lightbox.kind === "solution" ? "solutionImages" : "images",
                        index
                      )
                  : undefined
              }
            />
          )}
        </div>
      );
    }

    /* ============================================================
       Toast
       ============================================================ */

    const TONES = {
      success: { wrap: "border-emerald-200/80 dark:border-emerald-500/30", tile: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", Icon: Check },
      danger: { wrap: "border-rose-200/80 dark:border-rose-500/30", tile: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300", Icon: CircleAlert },
      info: { wrap: "border-sky-200/80 dark:border-sky-500/30", tile: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", Icon: Sparkles },
    };

    function Toast({ toast }) {
      if (!toast) return null;
      const tone = TONES[toast.tone] || TONES.success;
      const Icon = tone.Icon;
      return (
        <div
          className="pointer-events-none fixed bottom-5 right-5 z-[60] animate-toast-in"
          role={toast.tone === "danger" ? "alert" : "status"}
          aria-live={toast.tone === "danger" ? "assertive" : "polite"}
        >
          <div className={`flex items-center gap-2.5 rounded-2xl border bg-white/95 px-4 py-3 text-sm font-medium text-slate-700 shadow-lift backdrop-blur-xl dark:bg-slate-900/95 dark:text-slate-200 ${tone.wrap}`}>
            <span className={`flex h-6 w-6 items-center justify-center rounded-full ${tone.tile}`}>
              <Icon size={13} strokeWidth={3} />
            </span>
            {toast.text}
          </div>
        </div>
      );
    }

    /* ============================================================
       App
       ============================================================ */

    function App() {
      const [account, setAccount] = useState(null);
      /* Offline visitor: the board could not be reached at sign in, so the saved
         copy is shown read only. A guest state, not a session: it carries no
         role, grants nothing, and is never persisted. */
      const [guest, setGuest] = useState(false);
      const [offlineBoot, setOfflineBoot] = useState(false);
      const [needsSetup, setNeedsSetup] = useState(false);
      const [gate, setGate] = useState(readGate);
      const remoteOn = useRef(false);
      const lastRemoteItems = useRef("");
      const lastRemoteAccounts = useRef("");
      const syncRef = useRef(null);
      /* When the board last went quiet, so a run of failed saves says so once. */
      const offlineNotice = useRef(0);
      /* Set when the server refuses a save, cleared when one lands. It has to
         outlive the toast: a refused edit is still on screen, so without a warning
         that stays put it looks exactly like an edit that saved. */
      const [saveError, setSaveError] = useState(null);

      /* The role rule, in one place: an admin writes to the shared board, everyone
         else reads it. The server checks this too, so hiding a button is a courtesy
         rather than the protection. */
      const isAdmin = Boolean(account && account.role === "admin");

      /* Every write rides the session cookie; the server decides whether the
         caller may make it. A refusal is surfaced instead of swallowed, so a
         rejected change is never mistaken for a saved one, and a 401 ends the
         session instead of raising an error only a sign in screen can fix. */
      const upload = (type, payload) => {
        if (!account || account.guest) return;
        remotePush(type, payload).then((result) => {
          if (result.ok) {
            /* A save that lands means the board is current again. */
            offlineNotice.current = 0;
            setSaveError(null);
            return;
          }
          if (result.sessionLost) {
            setAccount(null);
            setGuest(false);
            notify("Your session has expired. Sign in again.", "info");
            return;
          }
          if (result.offline) {
            /* At most one line per half minute, because a dropped connection is a
               condition rather than an event. A toast per failed save turned one
               wobble of a weak signal into a stream of them, which is how a notice
               meant to be helpful becomes something to ignore. */
            const now = Date.now();
            if (now - offlineNotice.current > 30000) {
              offlineNotice.current = now;
              notify(result.reason, "info");
            }
            return;
          }
          const reason = result.reason || "The class board did not accept that change.";
          setSaveError(reason);
          notify(reason, "danger");
        });
      };
      const [items, setItems] = useState(loadItems);
      /* Deleted ids ride along with the items so a board answer that predates a
         delete cannot put the card back. */
      const [deletedIds, setDeletedIds] = useState(loadDeleted);
      const [config, setConfig] = useState(loadConfig);
      const [toast, setToast] = useState(null);
      const [systemDark, setSystemDark] = useState(
        () => window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      );
      const saveFailed = useRef(false);

      const theme = config.theme || "system";
      const dark = theme === "dark" || (theme === "system" && systemDark);

      /* Keep the document in step with the chosen theme. One theme at a time. */
      useEffect(() => {
        const root = document.documentElement;
        root.classList.toggle("dark", dark);
        root.style.colorScheme = dark ? "dark" : "light";
      }, [dark]);

      useEffect(() => {
        if (!window.matchMedia) return;
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const onChange = (event) => setSystemDark(event.matches);
        if (media.addEventListener) media.addEventListener("change", onChange);
        else if (media.addListener) media.addListener(onChange);
        return () => {
          if (media.removeEventListener) media.removeEventListener("change", onChange);
          else if (media.removeListener) media.removeListener(onChange);
        };
      }, []);

      /* The admin gate is a URL rather than a menu item, so students never meet it. */
      useEffect(() => {
        const onHash = () => setGate(readGate());
        window.addEventListener("hashchange", onHash);
        return () => window.removeEventListener("hashchange", onHash);
      }, []);

      /* Join the shared board on first load, then stay on it. Both no-ops when the
         page is not served from the quiz app. */
      useEffect(() => {
        let alive = true;
        (async () => {
          const state = await remotePull();
          if (!alive || !state) return;
          remoteOn.current = true;
          const remoteItems = Array.isArray(state.items) ? state.items.map(normaliseItem) : [];
          lastRemoteItems.current = itemsFingerprint(remoteItems);
          if (lastRemoteItems.current !== itemsFingerprint(items)) setItems(remoteItems);
          const remoteAccounts = Array.isArray(state.accounts)
            ? state.accounts.map(normaliseAccount).filter(Boolean)
            : [];
          if (remoteAccounts.length) {
            setConfig((current) => {
              const merged = mergeRemoteAccounts(remoteAccounts);
              lastRemoteAccounts.current = accountsFingerprint(merged);
              return normaliseConfig({
                subjects: (state.config && state.config.subjects) || current.subjects,
                theme: current.theme,
                classCode: (state.config && state.config.classCode) || current.classCode,
                accounts: merged,
              });
            });
          }
          /* Once the board answers, open the doorbell so an admin save shows up here
             at once rather than at the next poll. */
          openRealtime(state.realtime, () => {
            if (syncRef.current) syncRef.current();
          });
        })();
        return () => {
          alive = false;
        };
        /* Mount only: later changes travel through the poll and the save effect. */
        /* eslint-disable-next-line */
      }, []);

      /* One sync routine with two triggers: the safety poll, and the realtime doorbell
         when another admin saves. It lives in a ref so a doorbell that rings between
         renders still compares against the current items rather than a stale copy. */
      const syncFromRemote = async () => {
        if (!remoteOn.current) return;
        const state = await remotePull();
        if (!state) return;
        const rawRemote = Array.isArray(state.items) ? state.items.map(normaliseItem) : [];
        const board = reconcileBoard(rawRemote, items, deletedIds);
        /* Tombstones the server has caught up with are forgotten here, so the
           guard only lives as long as it is needed. */
        if (board.nextDeleted.length !== deletedIds.length) {
          setDeletedIds(board.nextDeleted);
          saveDeleted(board.nextDeleted);
        }
        if (board.changed) {
          lastRemoteItems.current = itemsFingerprint(board.items);
          setItems(board.items);
        }
        if (board.stale) {
          /* The shorter list wins and travels back: without this the server
             keeps the deleted id and the next device that syncs re-adds it. */
          upload("saveBoard", board.items);
        }
        const remoteAccounts = Array.isArray(state.accounts)
          ? state.accounts.map(normaliseAccount).filter(Boolean)
          : [];
        if (remoteAccounts.length) {
          setConfig((current) => {
            const merged = mergeRemoteAccounts(remoteAccounts);
            const afp = accountsFingerprint(merged);
            if (accountsFingerprint(current.accounts) === afp) return current;
            lastRemoteAccounts.current = afp;
            return normaliseConfig({ ...current, accounts: merged });
          });
        }
      };
      syncRef.current = syncFromRemote;

      useEffect(() => {
        const timer = setInterval(() => {
          if (syncRef.current) syncRef.current();
        }, 12000);
        return () => clearInterval(timer);
      }, []);

      /* The session lives in an HttpOnly cookie this code cannot read or write;
         the server is the only thing that can say who is signed in. A network
         failure is not a sign out: it offers the saved board read only instead,
         and a board with no accounts yet offers the first-run setup. */
      useEffect(() => {
        let alive = true;
        (async () => {
          /* Credentials from older versions leave this browser first, silently. */
          purgeLegacySecrets();
          const me = await meRequest();
          if (!alive) return;
          if (me.ok) setAccount(me.account);
          else if (me.offline) setOfflineBoot(true);
          else if (me.setup) setNeedsSetup(true);
        })();
        return () => {
          alive = false;
        };
        /* Mount only: sign in, sign out and expiry all update state directly. */
      }, []);

      /* The refused-save warning belongs to whoever hit the refusal. Tying it to the
         login id rather than the account object means it clears on every handover,
         including a sign out that did not come through signOut, and it survives the
         harmless account object swap that a password change causes. */
      useEffect(() => {
        setSaveError(null);
      }, [account ? account.id : null]);

      /* Another tab on this origin, or the college quiz site, can add an account,
         reset a password or sign out. Without this the sign in form keeps working
         from a stale list and rejects a login that is actually right. */
      useEffect(() => {
        const onStorage = (event) => {
          const key = event.key;
          if (!key || key === STORAGE_KEY) refreshBoard();
          if (!key || key === DELETED_KEY) setDeletedIds(loadDeleted());
          if (!key || key === CONFIG_KEY) syncAccounts();
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
      }, []);

      function openAdminGate() {
        window.location.hash = ADMIN_HASH;
        setGate("admin");
      }

      function openClassGate() {
        if (window.location.hash) window.location.hash = "";
        setGate("class");
      }

      useEffect(() => {
        const ok = saveItems(items);
        /* Only a change made here is worth uploading. Anything that arrived from
           /api already matches what the server has, so it is skipped. */
        if (ok && remoteOn.current && isAdmin && itemsFingerprint(items) !== lastRemoteItems.current) {
          upload("saveBoard", items);
        }
        if (!ok && !saveFailed.current) {
          saveFailed.current = true;
          notify("Browser storage is full. Remove a picture from an assignment, then try again.", "danger");
        }
        if (ok) saveFailed.current = false;
      }, [items]);

      useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 2800);
        return () => clearTimeout(t);
      }, [toast]);

      const notify = (text, tone = "success") => setToast({ id: Date.now(), text, tone });

      const subjects = useMemo(() => {
        const list = [...config.subjects];
        items.forEach((item) => {
          if (item.subject && !list.includes(item.subject)) list.push(item.subject);
        });
        return list.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      }, [config.subjects, items]);

      /* Anything saved before accounts existed belongs to the admin, so no card
         ever loses its name when the class starts signing in. */
      useEffect(() => {
        if (!config.accounts.length) return;
        const fallback = config.accounts.find((a) => a.role === "admin") || config.accounts[0];
        if (!items.some((item) => !item.ownerId)) return;
        setItems((prev) =>
          prev.map((item) => (item.ownerId ? item : { ...item, ownerId: fallback.id, ownerName: fallback.username }))
        );
      }, [config.accounts, items]);

      /* The roster this device remembers: public fields only. The server owns the
         real list; admin actions replace this copy from the server's response, so
         what the UI shows is always what the board confirmed. */
      function setAccounts(nextAccounts) {
        const next = { ...config, accounts: nextAccounts };
        if (!saveConfig(next)) return false;
        setConfig(next);
        setAccount((current) => {
          if (!current) return current;
          const found = nextAccounts.find((a) => a.id === current.id);
          return found ? { ...current, ...found } : current;
        });
        return true;
      }

      /* Sign in: username and password go to /api/auth/login on this origin, the
         server checks the stored hash and answers with a session cookie this code
         never sees, plus the public account fields. Nothing about identity is
         decided locally any more; the local roster is only a UI cache. */
      function signIn(username, password, options) {
        const adminOnly = Boolean(options && options.adminOnly);
        const name = String(username || "").replace(/\s+/g, " ").trim();
        if (!name || !password) {
          return { ok: false, reason: "Enter your username and password." };
        }
        return loginRequest(name, password, adminOnly).then((verdict) => {
          if (verdict.ok) {
            setAccount(verdict.account);
            setGuest(false);
            setOfflineBoot(false);
            setNeedsSetup(false);
            return { ok: true };
          }
          if (verdict.setup) {
            setNeedsSetup(true);
            return {
              ok: false,
              setup: true,
              reason: "This board has no account yet. Create the first one below.",
            };
          }
          return { ok: false, offline: Boolean(verdict.offline), reason: verdict.reason };
        });
      }

      /* Registration: username, password and the class code go to the server,
         which checks the code, hashes the password and answers with an already
         signed in session. The checks below are only the quick kind; the server
         repeats every one of them, and a refusal comes back as its reason. */
      async function register(username, password, code) {
        const name = String(username || "").replace(/\s+/g, " ").trim();
        if (name.length < 2) return { ok: false, reason: "Usernames need 2 to 24 characters." };
        if (!password || password.length < 8) {
          return { ok: false, reason: "Use at least 8 characters for a password." };
        }
        if (!String(code || "").trim()) return { ok: false, reason: "Enter the class code." };

        const verdict = await registerRequest(name, password, String(code).trim());
        if (verdict.ok) {
          setAccount(verdict.account);
          setGuest(false);
          setOfflineBoot(false);
          setNeedsSetup(false);
          return { ok: true };
        }
        return { ok: false, offline: Boolean(verdict.offline), reason: verdict.reason };
      }

      /* First run: no account exists yet, so the server accepts exactly one setup
         request and refuses every one after it. */
      async function setupFirstAdmin(username, password) {
        const verdict = await setupRequest(username, password);
        if (verdict.ok) {
          setAccount(verdict.account);
          setNeedsSetup(false);
          setOfflineBoot(false);
          setGuest(false);
          return { ok: true };
        }
        return { ok: false, offline: Boolean(verdict.offline), reason: verdict.reason };
      }

      /* Offline: the last saved copy, read only, with no role and no privileges.
         A guest view, not a session: nothing is persisted and nothing is sent. */
      function enterOfflineGuest() {
        setAccount({ id: "", username: "Offline visitor", role: "student", guest: true, createdAt: 0, lastSeen: 0 });
        setGuest(true);
        notify("Viewing the saved board, read only", "info");
      }

      function signOut() {
        setAccount(null);
        setGuest(false);
        /* The cookie is the session: ask the server to burn the row behind it. */
        logoutRequest();
        notify("Signed out", "info");
      }

      /* Offered when a save was refused because the session is no longer good. The
         fix is the same as any expired session: sign in again, which mints a fresh
         cookie. There is no local copy left to repair. */
      function reverifyDevice() {
        logoutRequest();
        setAccount(null);
        setGuest(false);
        setSaveError(null);
        notify("Sign in again to carry on saving", "info");
      }

      /* Changing your own password: current and new go to the server over the
         session, which verifies the stored hash, validates and hashes the new one,
         and signs out every other device holding the old credential. */
      async function changeOwnPassword(current, next) {
        if (!account || account.guest) return { ok: false, reason: "Sign in before changing a password." };
        if (!current) return { ok: false, reason: "Enter your current password." };
        if (!next || next.length < 8) return { ok: false, reason: "Use at least 8 characters for a new password." };
        const verdict = await changePasswordRequest(current, next);
        if (verdict.ok) return { ok: true };
        if (verdict.sessionLost) {
          setAccount(null);
          setGuest(false);
          return { ok: false, reason: "Your session has expired. Sign in again." };
        }
        return { ok: false, reason: verdict.reason || "Could not save that password." };
      }

      /* Account administration, all of it on the server: each function sends the
         operation, the server checks the session's role against the board, and the
         refreshed public roster comes back. Nothing here can approve itself. */
      function adminOutcome(result, fallback) {
        if (result.sessionLost) {
          setAccount(null);
          setGuest(false);
          notify("Your session has expired. Sign in again.", "info");
          return false;
        }
        if (!result.ok) {
          notify(result.reason || fallback, "danger");
          return false;
        }
        if (result.accounts) setAccounts(result.accounts);
        return true;
      }

      async function addAccount({ username, password, role }) {
        /* A student who joined on their own phone is already on the board under a
           name, and a second login with the same name is two people who can never
           tell which is which. The server enforces that rule as well. */
        const name = String(username || "").replace(/\s+/g, " ").trim();
        const result = await adminRequest("POST", "/api/admin/accounts", {
          username: name,
          password,
          role,
        });
        return adminOutcome(result, "That login could not be created.");
      }

      async function renameAccount(id, username) {
        const name = String(username || "").replace(/\s+/g, " ").trim();
        const result = await adminRequest("PATCH", "/api/admin/accounts/" + encodeURIComponent(id), {
          username: name,
        });
        if (!adminOutcome(result, "That login could not be renamed.")) return false;
        /* The author line on their cards follows the rename at once here; the
           board's copy is rewritten server side too, so every device agrees. */
        setItems((prev) => prev.map((item) => (item.ownerId === id ? { ...item, ownerName: name } : item)));
        return true;
      }

      async function setAccountRole(id, role) {
        const result = await adminRequest("PATCH", "/api/admin/accounts/" + encodeURIComponent(id), {
          role,
        });
        return adminOutcome(result, "That role could not be changed.");
      }

      async function setAccountPassword(id, password) {
        /* The one place one login sets another's secret, and it never enters this
           device's storage: the new password goes straight to the server, which
           hashes it and signs that account out everywhere. */
        const result = await adminRequest(
          "POST",
          "/api/admin/accounts/" + encodeURIComponent(id) + "/reset-password",
          { newPassword: password },
        );
        return adminOutcome(result, "That password could not be reset.");
      }

      async function deleteAccount(id) {
        /* The server keeps these guards too (an account that still owns
           assignments cannot go; the last admin cannot go). The local copies only
           spare a pointless round trip when the answer is already known. */
        if (items.some((item) => item.ownerId === id)) {
          notify("That person still has assignments on the board", "danger");
          return false;
        }
        if (config.accounts.filter((a) => a.role === "admin").length === 1 && config.accounts.find((a) => a.id === id)?.role === "admin") {
          notify("The class needs at least one admin", "danger");
          return false;
        }
        const result = await adminRequest("DELETE", "/api/admin/accounts/" + encodeURIComponent(id));
        return adminOutcome(result, "That login could not be removed.");
      }

      function setClassCode(code) {
        const ok = commitConfig({ ...config, classCode: code });
        if (ok) notify("New class code: " + code, "info");
        return ok;
      }

      function addItem(payload) {
        setItems((prev) => [
          {
            id: uid(),
            createdAt: Date.now(),
            ownerId: account ? account.id : "",
            ownerName: account ? account.username : "",
            ...payload,
          },
          ...prev,
        ]);
      }

      function updateItem(id, payload) {
        setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...payload, updatedAt: Date.now() } : item)));
      }

      function cycleStatus(id) {
        const target = items.find((i) => i.id === id);
        if (!target) return;
        const next = NEXT_STATUS[target.status] || "pending";
        setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status: next } : item)));
        notify("Marked " + target.title + " as " + STATUS_META[next].label, next === "completed" ? "success" : "info");
      }

      function removeItem(id) {
        const target = items.find((i) => i.id === id);
        const next = items.filter((item) => item.id !== id);
        /* Optimistic, and backed on the spot: the card leaves the screen, the
           shorter list reaches storage, and the tombstone stops the next board
           answer from resurrecting it, all before this function returns. */
        const tombstones = [...deletedIds, id];
        setDeletedIds(tombstones);
        saveDeleted(tombstones);
        setItems(next);
        saveItems(next);
        if (target) notify("Deleted " + target.title, "danger");
      }

      function addPictures(id, key, urls) {
        setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [key]: [...(item[key] || []), ...urls] } : item)));
      }

      function removePicture(id, key, index) {
        let removed = 0;
        setItems((prev) =>
          prev.map((item) => {
            if (item.id !== id) return item;
            const list = item[key] || [];
            removed = Math.max(removed, list.length);
            return { ...item, [key]: list.filter((_, i) => i !== index) };
          })
        );
        notify((removed > 1 ? "Picture removed, " + (removed - 1) + " left" : "Picture removed"), "info");
      }

      /* An admin posting an assignment in one tab should reach every other tab on this
         device straight away. The fingerprint keeps the save effect from bouncing the
         same board back and forth between tabs. */
      function refreshBoard() {
        const fresh = loadItems();
        setItems((prev) => (itemsFingerprint(prev) === itemsFingerprint(fresh) ? prev : fresh));
      }

      function syncAccounts() {
        const fresh = loadConfig();
        setConfig(fresh);
        /* The roster is a cache. Whether the signed in person still exists is the
           server's answer to make, not something a local file gets to decide. */
      }

      function commitConfig(next) {
        if (!saveConfig(next)) return false;
        setConfig(next);
        if (remoteOn.current && isAdmin) {
          upload("saveConfig", { classCode: next.classCode, subjects: next.subjects });
        }
        return true;
      }

      function addSubject(name) {
        const ok = commitConfig({ ...config, subjects: [...config.subjects, name] });
        if (ok) notify("Subject " + name + " added", "info");
        return ok;
      }

      /* Used by the add and edit forms: reuses an existing subject when only the
         capitalisation differs, and saves genuinely new names to the list. */
      function ensureSubject(name) {
        const clean = String(name || "").replace(/\s+/g, " ").trim().slice(0, 60);
        if (!clean) return "";
        const known = [...config.subjects, ...items.map((item) => item.subject)];
        const match = known.find((s) => s && s.toLowerCase() === clean.toLowerCase());
        if (match) return match;
        if (!config.subjects.includes(clean)) {
          commitConfig({ ...config, subjects: [...config.subjects, clean] });
        }
        return clean;
      }

      function renameSubject(oldName, newName) {
        const ok = commitConfig({ ...config, subjects: config.subjects.map((s) => (s === oldName ? newName : s)) });
        if (!ok) return false;
        setItems((prev) => prev.map((item) => (item.subject === oldName ? { ...item, subject: newName } : item)));
        notify("Renamed to " + newName, "info");
        return true;
      }

      function deleteSubject(name) {
        const ok = commitConfig({ ...config, subjects: config.subjects.filter((s) => s !== name) });
        if (ok) notify("Subject " + name + " deleted", "danger");
        return ok;
      }

      function changeTheme(next) {
        commitConfig({ ...config, theme: next });
      }

      function importBackup(payload) {
        const nextSubjects = payload.subjects && payload.subjects.length ? payload.subjects : config.subjects;
        setItems(payload.items);
        commitConfig({ ...config, subjects: nextSubjects });
        notify("Imported " + payload.items.length + (payload.items.length === 1 ? " assignment" : " assignments"));
      }

      return (
        <>
          {account ? (
            <Dashboard
              items={items}
              subjects={subjects}
              config={config}
              theme={theme}
              account={account}
              onAdd={addItem}
              onEnsureSubject={ensureSubject}
              onUpdate={updateItem}
              onCycleStatus={cycleStatus}
              onDelete={removeItem}
              onAddPictures={addPictures}
              onRemovePicture={removePicture}
              notify={notify}
              onSignOut={signOut}
              onChangePassword={changeOwnPassword}
              onAddAccount={addAccount}
              onRenameAccount={renameAccount}
              onSetRole={setAccountRole}
              onSetAccountPassword={setAccountPassword}
              onDeleteAccount={deleteAccount}
              onClassCode={setClassCode}
              onAddSubject={addSubject}
              onRenameSubject={renameSubject}
              onDeleteSubject={deleteSubject}
              onImport={importBackup}
              onThemeChange={changeTheme}
              saveError={saveError}
              onDismissSaveError={() => setSaveError(null)}
              onReverifyDevice={reverifyDevice}
            />
          ) : gate === "admin" ? (
            <AdminSignIn onSignIn={signIn} onLeave={openClassGate} />
          ) : (
            <SignInScreen
              onSignIn={signIn}
              onRegister={register}
              onSetup={setupFirstAdmin}
              onOpenAdminGate={openAdminGate}
              setup={needsSetup}
              offlineAvailable={offlineBoot}
              onOfflineGuest={enterOfflineGuest}
            />
          )}
          <Toast toast={toast} />

          {/* Trivia replaces the old quiz link: it stays visible but quiet until
              the quiz app itself is ready to open. */}
          {window.location.pathname.split("/").pop() !== "index.html" && (
            <span
              title="Coming soon"
              aria-disabled="true"
              className="fixed bottom-4 left-4 z-[55] inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-white/90 px-3 py-2 text-[11px] font-semibold text-slate-600 opacity-80 shadow-lift ring-1 ring-slate-200 backdrop-blur dark:bg-slate-900/90 dark:text-slate-300 dark:ring-slate-700"
            >
              <Sparkles size={13} />
              Trivia
              <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-inset ring-emerald-500/30 dark:text-emerald-300">
                Soon
              </span>
            </span>
          )}
        </>
      );
    }

    createRoot(document.getElementById("root")).render(<App />);
  