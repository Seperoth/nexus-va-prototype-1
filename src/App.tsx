import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  Clock3,
  Command as CommandIcon,
  CreditCard,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Upload,
  Users,
  Video,
  Wallet,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { ColumnDef } from "@tanstack/react-table";
import Auth from "./Auth";
import sampleOutput from "../docs/sample-output.txt?raw";
import {
  Avatar,
  Badge,
  DataTable,
  Empty,
  Field,
  Form,
  Modal,
  SearchBox,
  SectionHead,
  Submit,
} from "./components";
import {
  downloadFile,
  enterDemo,
  getDemoIdentity,
  identityFromSession,
  loadWorkspace,
  logout,
  mode,
  runCommand,
  subscribe,
  supabase,
  uploadFile,
} from "./data";
import type { Identity } from "./data";
import { categories, difficulties, money, paymentSummary } from "./types";
import type {
  Appointment,
  Command,
  Difficulty,
  Document,
  Role,
  Ticket,
  Workspace,
} from "./types";

type Page =
  | "Overview"
  | "Job services"
  | "Appointments"
  | "Messages"
  | "Billing"
  | "Files & documents"
  | "Tools & software"
  | "Profile"
  | "Activity logs";
type Dialog = {
  type:
    | "request"
    | "ticket"
    | "appointment"
    | "payment"
    | "pay"
    | "feedback"
    | "help"
    | "cancel";
  id?: string;
  date?: string;
} | null;
const nav: { page: Page; icon: LucideIcon }[] = [
  { page: "Overview", icon: LayoutDashboard },
  { page: "Job services", icon: BriefcaseBusiness },
  { page: "Appointments", icon: CalendarDays },
  { page: "Messages", icon: MessageSquare },
  { page: "Billing", icon: CreditCard },
  { page: "Files & documents", icon: FolderOpen },
];
const dateText = (
  date: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
) =>
  new Date(date.length === 10 ? date + "T12:00:00" : date).toLocaleDateString(
    "en-US",
    options,
  );
const timeText = (date: string) =>
  new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
const dateInput = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const str = (form: FormData, key: string) => String(form.get(key) || "");

export default function App() {
  const [identity, setIdentity] = useState<Identity | null>(getDemoIdentity);
  const [state, setState] = useState<Workspace | null>(null);
  const [page, setPage] = useState<Page>("Overview");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!supabase);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [notifications, setNotifications] = useState(false);
  const [accountMenu, setAccountMenu] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All requests");
  const [conversation, setConversation] = useState<string | null>(null);
  const chatBottom = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const showToast = useCallback(
    (text: string, error = false) => setToast({ text, error }),
    [],
  );
  const refresh = useCallback(async () => {
    try {
      setState(await loadWorkspace());
      setLoadError("");
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Could not load your workspace.",
      );
    }
  }, []);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(async ({ data, error }) => {
      try {
        if (error) throw error;
        const id = await identityFromSession(data.session);
        if (active) setIdentity(id);
      } catch (e) {
        if (active)
          setLoadError(
            e instanceof Error ? e.message : "Could not restore your session.",
          );
      } finally {
        if (active) setLoading(false);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setIdentity(null);
        setState(null);
      } else if (event === "SIGNED_IN" && session) {
        setTimeout(() => {
          void identityFromSession(session)
            .then((id) => {
              if (active) setIdentity(id);
            })
            .catch((e) => setLoadError(String(e)));
        }, 0);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!identity) return;
    void refresh();
    return subscribe(() => {
      void refresh();
    });
  }, [identity, refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPage("Job services");
        setTimeout(
          () =>
            document
              .querySelector<HTMLInputElement>(
                '[aria-label="Search requests…"]',
              )
              ?.focus(),
          0,
        );
      }
      if (event.key === "Escape") {
        setAccountMenu(false);
        setNotifications(false);
        setMobile(false);
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (
        !(event.target as Element).closest(".account-wrap,.notification-wrap")
      ) {
        setAccountMenu(false);
        setNotifications(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, []);
  useEffect(() => {
    chatBottom.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [conversation, state?.messages.length]);
  const actor = state?.profiles.find((p) => p.id === identity?.id);
  const mine = useMemo(
    () =>
      state?.tickets.filter(
        (t) =>
          actor?.role === "admin" ||
          (actor?.role === "client"
            ? t.clientId === actor.id
            : t.assigneeId === actor?.id || !t.assigneeId),
      ) || [],
    [state, actor],
  );
  const myAppointments =
    state?.appointments
      .filter(
        (a) =>
          actor?.role === "admin" ||
          a.clientId === actor?.id ||
          a.staffId === actor?.id,
      )
      .sort((a, b) => a.start.localeCompare(b.start)) || [];
  const upcoming = myAppointments.filter((a) => new Date(a.end) > new Date());
  const myNotes =
    state?.notifications.filter((n) => n.userId === actor?.id) || [];
  const unread = myNotes.filter((n) => !n.read).length;
  const messageUnread = myNotes.filter(
    (n) => !n.read && /message/i.test(n.text),
  ).length;
  const closeDialog = useCallback(() => {
    if (!lock.current) setDialog(null);
  }, []);
  const perform = async (command: Command, success: string, close = true) => {
    if (!actor || lock.current) return false;
    lock.current = true;
    setBusy(true);
    try {
      setState(await runCommand(actor.id, command));
      showToast(success);
      if (close) setDialog(null);
      return true;
    } catch (e) {
      showToast(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
        true,
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const upload = async (
    file: File,
    ticketId: string | null = null,
    isOutput = false,
  ) => {
    if (!actor || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      setState(await uploadFile(file, actor, ticketId, isOutput));
      showToast(
        isOutput
          ? "Output uploaded. You can now deliver the work."
          : "File uploaded successfully.",
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Upload failed.", true);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const download = async (doc: Document) => {
    try {
      await downloadFile(doc);
      showToast("Your download is ready.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Download failed.", true);
    }
  };
  const navigate = (next: Page) => {
    setPage(next);
    setSearch("");
    setMobile(false);
    setNotifications(false);
    setAccountMenu(false);
    window.scrollTo({ top: 0 });
  };
  const person = (id: string | null | undefined) =>
    state?.profiles.find((p) => p.id === id);
  const openConversation = (id: string) => {
    setConversation(id);
    navigate("Messages");
    setDialog(null);
  };
  const signout = async () => {
    try {
      await logout();
      setIdentity(null);
      setState(null);
      setAccountMenu(false);
      setPage("Overview");
      setDialog(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Sign out failed.", true);
    }
  };
  if (loading)
    return (
      <div className="loading-screen">
        <CommandIcon size={34} />
        <span className="spinner" />
        Opening your workspace…
      </div>
    );
  if (!identity)
    return (
      <>
        <Auth
          onLogin={(id) => {
            setIdentity(id);
            setLoadError("");
          }}
        />
        {loadError && (
          <div className="toast error" role="alert">
            {loadError}
            <button onClick={() => setLoadError("")} aria-label="Dismiss error">
              <X size={16} />
            </button>
          </div>
        )}
      </>
    );
  if (!state || !actor)
    return (
      <div className="loading-screen">
        <CommandIcon size={34} />
        {loadError ? (
          <>
            <p>{loadError}</p>
            <button className="button primary" onClick={() => void refresh()}>
              Try again
            </button>
            <button className="text-button" onClick={() => void signout()}>
              Back to sign in
            </button>
          </>
        ) : (
          <>
            <span className="spinner" />
            <p>Getting everything ready…</p>
          </>
        )}
      </div>
    );
  const active = mine.filter((t) => t.status === "In progress");
  const review = mine.filter((t) => t.status === "In review");
  const completed = mine.filter((t) => t.status === "Completed");
  const totalPaid = state.payments
    .filter((p) => p.status === "Paid" && mine.some((t) => t.id === p.ticketId))
    .reduce((sum, p) => sum + p.amount, 0);
  const currentChat =
    mine.find((t) => t.id === conversation && t.assigneeId) ||
    mine.find((t) => t.assigneeId);
  const filtered = mine.filter(
    (t) =>
      (filter === "All requests" ||
        t.status === filter ||
        (filter === "Available" && !t.assigneeId)) &&
      `${t.title} ${t.number} ${t.category}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const titleCell = (t: Ticket) => (
    <div className="project-cell">
      <span
        className={`project-icon category-${categories.indexOf(t.category) % 5}`}
      >
        <BriefcaseBusiness size={17} />
      </span>
      <span>
        <button
          className="table-title"
          onClick={(e) => {
            e.stopPropagation();
            setDialog({ type: "ticket", id: t.id });
          }}
        >
          {t.title}
        </button>
        <small>
          NX-{t.number} <span>·</span> {t.category}
        </small>
      </span>
    </div>
  );
  const columns: ColumnDef<Ticket, unknown>[] = [
    {
      accessorKey: "title",
      header: "Project",
      cell: ({ row }) => titleCell(row.original),
    },
    {
      accessorKey: "assigneeId",
      header: "Assistant",
      cell: ({ row }) => {
        const p = person(row.original.assigneeId);
        return p ? (
          <div className="person-inline">
            <Avatar
              name={p.name}
              size="small"
              color={p.name.startsWith("Luis") ? 1 : 0}
            />
            <span>{p.name.split(" ")[0]}</span>
          </div>
        ) : (
          <span className="muted">Finding a match</span>
        );
      },
    },
    {
      accessorKey: "dueDate",
      header: "Due date",
      cell: ({ row }) => (
        <span className="subtle">{dateText(row.original.dueDate)}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <Badge>{row.original.status}</Badge>,
    },
    ...(page === "Job services"
      ? [
          {
            accessorKey: "budget",
            header: "Budget",
            cell: ({ row }: { row: { original: Ticket } }) => (
              <strong>{money(row.original.budget)}</strong>
            ),
          },
          {
            id: "open",
            header: "",
            enableSorting: false,
            cell: ({ row }: { row: { original: Ticket } }) => (
              <button
                className="icon-button"
                aria-label={`Open ${row.original.title}`}
                onClick={() =>
                  setDialog({ type: "ticket", id: row.original.id })
                }
              >
                <ArrowUpRight size={16} />
              </button>
            ),
          },
        ]
      : []),
  ];
  const requestButton =
    actor.role === "client" ? (
      <button
        className="button primary"
        onClick={() => setDialog({ type: "request" })}
      >
        <Plus size={17} />
        New request
      </button>
    ) : (
      <button
        className="button secondary"
        onClick={() =>
          navigate(actor.role === "admin" ? "Activity logs" : "Job services")
        }
      >
        {actor.role === "admin" ? "View activity logs" : "Explore requests"}
        <ArrowUpRight size={16} />
      </button>
    );
  const fileUpload = (ticketId: string | null = null, output = false) => (
    <div className="upload-controls">
      <label
        className={`button ${output ? "primary" : "secondary"} upload-button ${busy ? "disabled" : ""}`}
      >
        <Upload size={15} />
        {busy ? "Uploading…" : output ? "Upload output" : "Upload file"}
        <input
          aria-label={output ? "Upload output file" : "Upload file"}
          type="file"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file, ticketId, output);
            e.target.value = "";
          }}
        />
      </label>
      {output && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() =>
            void upload(
              new File([sampleOutput], "sample-output.txt", {
                type: "text/plain",
              }),
              ticketId,
              true,
            )
          }
        >
          Try sample output
        </button>
      )}
    </div>
  );
  const appointmentCard = (a: Appointment) => (
    <div className="appointment-row" key={a.id}>
      <div className="date-tile">
        <span>{dateText(a.start, { month: "short" })}</span>
        <strong>{new Date(a.start).getDate()}</strong>
      </div>
      <div className="appointment-info">
        <strong>{a.title}</strong>
        <span>
          <Clock3 size={12} />
          {timeText(a.start)} – {timeText(a.end)}
        </span>
        <small>
          with {person(actor.role === "client" ? a.staffId : a.clientId)?.name}
        </small>
      </div>
      <button
        className="icon-button"
        aria-label={`View ${a.title}`}
        onClick={() => setDialog({ type: "cancel", id: a.id })}
      >
        <ArrowUpRight size={17} />
      </button>
    </div>
  );

  return (
    <div className={`app-shell ${mobile ? "nav-open" : ""}`}>
      <aside className="rail">
        <a
          className="rail-brand"
          href="#"
          aria-label="Nexus VA home"
          onClick={(e) => {
            e.preventDefault();
            navigate("Overview");
          }}
        >
          <CommandIcon size={23} />
        </a>
        <div className="rail-divider" />
        {nav.map(({ page: next, icon: Icon }) => (
          <button
            key={next}
            className={`rail-link ${page === next ? "selected" : ""}`}
            aria-label={next}
            title={next}
            onClick={() => navigate(next)}
          >
            <Icon size={20} />
          </button>
        ))}
        {actor.role === "admin" && (
          <button
            className={`rail-link ${page === "Activity logs" ? "selected" : ""}`}
            title="Activity logs"
            aria-label="Activity logs"
            onClick={() => navigate("Activity logs")}
          >
            <ShieldCheck size={20} />
          </button>
        )}
        <div className="rail-bottom">
          <button
            className="rail-link"
            aria-label="Help"
            onClick={() => setDialog({ type: "help" })}
          >
            <CircleHelp size={20} />
          </button>
          <button
            className="rail-avatar"
            title="Your profile"
            onClick={() => navigate("Profile")}
          >
            <Avatar name={actor.name} color={2} />
          </button>
        </div>
      </aside>
      <aside className="sidebar">
        <div className="sidebar-brand">
          Nexus VA<span>®</span>
          <button
            className="icon-button mobile-close"
            aria-label="Close navigation"
            onClick={() => setMobile(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-chip">
          <span className="workspace-letter">
            {actor.company.charAt(0) || "N"}
          </span>
          <span>
            <strong>{actor.company || "My workspace"}</strong>
            <small>
              {actor.role === "client"
                ? "Client workspace"
                : actor.role === "staff"
                  ? "Assistant workspace"
                  : "Admin workspace"}
            </small>
          </span>
          <ChevronDown size={13} />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {nav.map(({ page: next, icon: Icon }) => (
            <button
              key={next}
              className={`nav-link ${page === next ? "active" : ""}`}
              onClick={() => navigate(next)}
            >
              <Icon size={17} />
              {next}
              {next === "Messages" && messageUnread > 0 && (
                <span className="nav-count">{messageUnread}</span>
              )}
              {next === "Job services" && (
                <span className="nav-count neutral">
                  {mine.filter((t) => t.status !== "Completed").length}
                </span>
              )}
            </button>
          ))}
          {actor.role === "admin" && (
            <button
              className={`nav-link ${page === "Activity logs" ? "active" : ""}`}
              onClick={() => navigate("Activity logs")}
            >
              <ShieldCheck size={17} />
              Activity logs
            </button>
          )}
        </nav>
        <span className="nav-label resources-label">RESOURCES</span>
        <button
          className={`nav-link ${page === "Tools & software" ? "active" : ""}`}
          onClick={() => navigate("Tools & software")}
        >
          <Sparkles size={17} />
          Tools & software
          <ArrowUpRight className="nav-arrow" size={13} />
        </button>
        <div className="sidebar-bottom">
          <div className="support-card">
            <span className="support-spark">
              <Sparkles size={18} />
            </span>
            <strong>A little help goes a long way.</strong>
            <p>We’re here when you need us.</p>
            <button onClick={() => setDialog({ type: "help" })}>
              Explore the guide
              <ArrowUpRight size={13} />
            </button>
          </div>
          <button
            className={`nav-link ${page === "Profile" ? "active" : ""}`}
            onClick={() => navigate("Profile")}
          >
            <Settings2 size={17} />
            Settings & profile
          </button>
          <div className="sidebar-foot">
            <span className="online-dot" />
            All systems connected<span>v0.1</span>
          </div>
        </div>
      </aside>
      {mobile && (
        <div className="mobile-shade" onClick={() => setMobile(false)} />
      )}
      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={12} />
            <strong>{page}</strong>
          </div>
          <div className="topbar-right">
            <div className="global-search">
              <Search size={15} />
              <input
                aria-label="Search workspace"
                placeholder="Search your workspace…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (page !== "Job services") setPage("Job services");
                }}
              />
              <kbd>⌘ K</kbd>
            </div>
            <span className="mode-label">
              <span />
              {mode === "demo" ? "Demo workspace" : "Connected"}
            </span>
            <div className="notification-wrap">
              <button
                className={`icon-button notification-button ${unread ? "has-unread" : ""}`}
                aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
                onClick={() => {
                  setNotifications(!notifications);
                  setAccountMenu(false);
                }}
              >
                <Bell size={18} />
              </button>
              {notifications && (
                <div className="popover notifications">
                  <div className="popover-head">
                    <strong>Notifications</strong>
                    <button
                      className="text-button"
                      onClick={() =>
                        void perform(
                          { type: "readNotifications" },
                          "You’re all caught up.",
                          false,
                        )
                      }
                    >
                      Mark all read
                    </button>
                  </div>
                  {myNotes.length ? (
                    myNotes.slice(0, 12).map((n) => (
                      <div
                        className={`notification-item ${!n.read ? "unread" : ""}`}
                        key={n.id}
                      >
                        <span className="notification-dot" />
                        <div>
                          <p>{n.text}</p>
                          <small>
                            {dateText(n.createdAt)} · {timeText(n.createdAt)}
                          </small>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="popover-empty">You’re all caught up.</div>
                  )}
                </div>
              )}
            </div>
            <div className="topbar-divider" />
            <div className="account-wrap">
              <button
                className="account-button"
                onClick={() => {
                  setAccountMenu(!accountMenu);
                  setNotifications(false);
                }}
                aria-label="Account menu"
                aria-expanded={accountMenu}
              >
                <Avatar name={actor.name} size="small" color={2} />
                <span>{actor.name.split(" ")[0]}</span>
                <ChevronDown size={12} />
              </button>
              {accountMenu && (
                <div className="popover account-popover">
                  <div className="account-details">
                    <strong>{actor.name}</strong>
                    <small>{actor.email}</small>
                    <Badge>
                      {actor.role === "staff"
                        ? "Virtual assistant"
                        : actor.role}
                    </Badge>
                  </div>
                  <button onClick={() => navigate("Profile")}>
                    <Settings2 size={15} />
                    Your profile
                  </button>
                  {mode === "demo" && (
                    <>
                      <span className="menu-label">SWITCH DEMO ACCOUNT</span>
                      {(["client", "staff", "admin"] as Role[]).map((role) => (
                        <button
                          key={role}
                          onClick={() => {
                            setState(null);
                            setIdentity(enterDemo(role));
                            navigate("Overview");
                          }}
                        >
                          {role === "staff" ? (
                            <Users size={15} />
                          ) : role === "admin" ? (
                            <ShieldCheck size={15} />
                          ) : (
                            <BriefcaseBusiness size={15} />
                          )}
                          <span>
                            {role === "staff"
                              ? "Virtual assistant"
                              : role === "admin"
                                ? "Admin"
                                : "Client"}
                          </span>
                          {actor.role === role && <Check size={14} />}
                        </button>
                      ))}
                    </>
                  )}
                  <button className="signout" onClick={() => void signout()}>
                    <LogOut size={15} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="content" key={page}>
          {loadError && (
            <div className="banner error-banner" role="alert">
              {loadError}
              <button className="text-button" onClick={() => void refresh()}>
                Retry
              </button>
            </div>
          )}
          {page === "Overview" && (
            <>
              <SectionHead
                eyebrow={`${actor.role === "client" ? "A LITTLE SUPPORT. A LOT OF PROGRESS." : actor.role === "staff" ? "GOOD WORK STARTS HERE." : "THE BIGGER PICTURE, ALL TOGETHER."}`}
                title={
                  actor.role === "client"
                    ? `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${actor.name.split(" ")[0]} ☀`
                    : actor.role === "staff"
                      ? `Hello, ${actor.name.split(" ")[0]}. Let’s make things happen.`
                      : "Your workspace at a glance."
                }
                description={
                  actor.role === "client"
                    ? "More headspace for you. We’ll take care of the moving parts."
                    : actor.role === "staff"
                      ? "Your projects, your people, and your next opportunity."
                      : "A clear view of your people, projects, and performance."
                }
                action={requestButton}
              />
              <div className="dashboard-context">
                <span>
                  <span className="online-dot" />
                  Your workspace is up to date
                </span>
                <span>
                  <CalendarDays size={13} />
                  {new Date().toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
              <div className="spotlight">
                <div className="spotlight-art">
                  <div className="art-sheet sheet-back" />
                  <div className="art-sheet sheet-front">
                    <div className="art-lines" />
                    <span>
                      <Check size={18} />
                    </span>
                  </div>
                  <span className="art-spark spark-one">✦</span>
                  <span className="art-spark spark-two">✧</span>
                </div>
                <div className="spotlight-copy">
                  <span className="spotlight-label">
                    <span />
                    {actor.role === "client" && review.length
                      ? "READY FOR YOUR REVIEW"
                      : actor.role === "staff"
                        ? "A LITTLE MOMENTUM GOES A LONG WAY"
                        : "YOUR PEOPLE. YOUR PROGRESS."}
                  </span>
                  <h2>
                    {actor.role === "client" && review.length
                      ? review[0].title
                      : actor.role === "staff"
                        ? "Your next great project is waiting."
                        : actor.role === "admin"
                          ? "Good work happens when everything connects."
                          : "Your next big idea starts here."}
                  </h2>
                  <p>
                    {actor.role === "client" && review.length
                      ? `${person(review[0].assigneeId)?.name.split(" ")[0]} has wrapped things up. Take a look and add your finishing touch.`
                      : actor.role === "staff"
                        ? "Explore open requests and find work that fits your skills."
                        : "A shared workspace for every step, from the first hello to the final delivery."}
                  </p>
                </div>
                <button
                  className="button dark"
                  onClick={() =>
                    actor.role === "client" && review.length
                      ? setDialog({ type: "ticket", id: review[0].id })
                      : navigate("Job services")
                  }
                >
                  {actor.role === "client" && review.length
                    ? "Review delivery"
                    : "Explore requests"}
                  <ArrowUpRight size={15} />
                </button>
              </div>
              <div className="stats-grid">
                {[
                  {
                    label:
                      actor.role === "staff"
                        ? "ACTIVE ASSIGNMENTS"
                        : "ACTIVE PROJECTS",
                    value: active.length,
                    icon: BriefcaseBusiness,
                    note: active.length
                      ? "Good things in motion"
                      : "Room for something new",
                    color: "purple",
                  },
                  {
                    label:
                      actor.role === "admin"
                        ? "AWAITING DELIVERY"
                        : "WAITING ON YOU",
                    value:
                      actor.role === "admin"
                        ? mine.filter(
                            (t) =>
                              paymentSummary(state, t.id) === "Paid" &&
                              !t.deliveredAt,
                          ).length
                        : review.length,
                    icon: Clock3,
                    note: review.length
                      ? "Ready for a fresh pair of eyes"
                      : "You’re all caught up",
                    color: "peach",
                  },
                  {
                    label:
                      actor.role === "staff"
                        ? "TOTAL EARNED"
                        : "TOTAL INVESTED",
                    value: money(totalPaid),
                    icon: Wallet,
                    note:
                      mode === "demo"
                        ? "Simulated payments"
                        : "All-time paid services",
                    color: "mint",
                  },
                  {
                    label:
                      actor.role === "admin"
                        ? "COMPLETED REQUESTS"
                        : "UPCOMING CALL",
                    value:
                      actor.role === "admin"
                        ? completed.length
                        : upcoming[0]
                          ? dateText(upcoming[0].start)
                          : "All clear",
                    icon: actor.role === "admin" ? CircleCheck : CalendarDays,
                    note:
                      actor.role === "admin"
                        ? "From request to a job well done"
                        : upcoming[0]
                          ? `${timeText(upcoming[0].start)} · ${person(upcoming[0].staffId)?.name.split(" ")[0]}`
                          : "Make time to connect",
                    color: "gold",
                  },
                ].map((item) => (
                  <div className={`stat-card ${item.color}`} key={item.label}>
                    <div className="stat-label">
                      {item.label}
                      <item.icon size={16} />
                    </div>
                    <strong>{item.value}</strong>
                    <span>{item.note}</span>
                  </div>
                ))}
              </div>
              <div className="dashboard-grid">
                <section className="panel project-panel">
                  <div className="panel-head">
                    <div>
                      <h2>
                        {actor.role === "staff"
                          ? "Your project activity"
                          : "Project activity"}
                        <span className="count-pill">{mine.length}</span>
                      </h2>
                      <p>A little progress, every day.</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("Job services")}
                    >
                      View all projects
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <DataTable
                    data={mine.slice(0, 4)}
                    columns={columns}
                    onRow={(t) => setDialog({ type: "ticket", id: t.id })}
                  />
                  <div className="panel-foot">
                    <span>
                      <span className="online-dot" />
                      {completed.length} project
                      {completed.length !== 1 ? "s" : ""} completed. Look at you
                      go.
                    </span>
                    <span>
                      Keep it moving
                      <TrendingUp size={14} />
                    </span>
                  </div>
                </section>
                <section className="panel team-panel">
                  <div className="panel-head">
                    <div>
                      <h2>
                        {actor.role === "client"
                          ? "Your support crew"
                          : "The people behind the progress"}
                      </h2>
                      <p>Real people. In your corner.</p>
                    </div>
                    <Users size={18} />
                  </div>
                  <div className="team-list">
                    {state.profiles
                      .filter((p) => p.role === "staff")
                      .map((p, i) => (
                        <div className="team-person" key={p.id}>
                          <div className="avatar-online">
                            <Avatar name={p.name} color={i} />
                            {p.available && <i />}
                          </div>
                          <div>
                            <strong>{p.name}</strong>
                            <small>
                              {i === 0
                                ? "Creative & operations"
                                : "Support & research"}
                            </small>
                          </div>
                          <span
                            className={`team-status ${p.available ? "" : "offline"}`}
                          >
                            {p.available ? "Available" : "Away"}
                          </span>
                        </div>
                      ))}
                  </div>
                  <div className="team-note">
                    <Sparkles size={16} />
                    <p>
                      Great things happen with the right people by your side.
                    </p>
                  </div>
                  <button
                    className="team-link"
                    onClick={() => navigate("Messages")}
                  >
                    Say hello to your team
                    <ArrowRight size={15} />
                  </button>
                </section>
                <section className="panel appointments-panel">
                  <div className="panel-head">
                    <div>
                      <h2>A moment to connect</h2>
                      <p>Your upcoming appointments.</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("Appointments")}
                    >
                      View calendar
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                  {upcoming.length ? (
                    upcoming.slice(0, 2).map(appointmentCard)
                  ) : (
                    <Empty
                      icon={<CalendarDays size={24} />}
                      title="A little room in your calendar"
                      text="Book a call to connect with your assistant."
                    />
                  )}
                </section>
                <section className="panel activity-panel">
                  <div className="panel-head">
                    <div>
                      <h2>The latest little things</h2>
                      <p>What’s been happening in your workspace.</p>
                    </div>
                    <span className="live-indicator">
                      <span />
                      LIVE
                    </span>
                  </div>
                  <div className="activity-list">
                    {(actor.role === "admin"
                      ? state.audit
                          .slice(0, 3)
                          .map((a) => ({
                            id: a.id,
                            text: `${person(a.actorId)?.name.split(" ")[0]} · ${a.text}`,
                            createdAt: a.createdAt,
                          }))
                      : myNotes.slice(0, 3)
                    ).map((n, i) => (
                      <div className="activity-item" key={n.id}>
                        <span className={`activity-icon category-${i}`}>
                          {i === 0 ? (
                            <CircleCheck size={14} />
                          ) : i === 1 ? (
                            <MessageSquare size={14} />
                          ) : (
                            <CreditCard size={14} />
                          )}
                        </span>
                        <div>
                          <p>{n.text}</p>
                          <small>
                            {dateText(n.createdAt)} · {timeText(n.createdAt)}
                          </small>
                        </div>
                      </div>
                    ))}
                    {!myNotes.length && actor.role !== "admin" && (
                      <p className="muted">
                        Your next update will appear here.
                      </p>
                    )}
                  </div>
                </section>
              </div>
              <div className="workspace-footer">
                <span>
                  <CommandIcon size={13} /> A little more organized. A lot more
                  you.
                </span>
                <span>NEXUS VA WORKSPACE</span>
              </div>
            </>
          )}

          {page === "Job services" && (
            <>
              <SectionHead
                eyebrow="FROM TO-DO TO ALL DONE"
                title={
                  actor.role === "staff"
                    ? "Find your next good thing."
                    : "Your ideas. In good hands."
                }
                description="Every request, every detail, and every little bit of progress."
                action={requestButton}
              />
              <div className="page-tabs">
                {[
                  "All requests",
                  "Open",
                  "In progress",
                  "In review",
                  "Completed",
                  ...(actor.role === "staff" ? ["Available"] : []),
                ].map((f) => (
                  <button
                    key={f}
                    className={filter === f ? "active" : ""}
                    onClick={() => setFilter(f)}
                  >
                    {f}
                    <span>
                      {f === "All requests"
                        ? mine.length
                        : mine.filter((t) =>
                            f === "Available" ? !t.assigneeId : t.status === f,
                          ).length}
                    </span>
                  </button>
                ))}
              </div>
              <section className="panel">
                <div className="table-toolbar">
                  <SearchBox value={search} onChange={setSearch} />
                  <span className="muted">
                    {filtered.length} request{filtered.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <DataTable
                  data={filtered}
                  columns={columns}
                  onRow={(t) => setDialog({ type: "ticket", id: t.id })}
                  empty="No requests match this view. Try another filter or create a new request."
                  pageSize={8}
                />
              </section>
              {actor.role === "staff" && (
                <div className="info-note">
                  <Sparkles size={18} />
                  <span>
                    Automatic matching uses your availability, service skills,
                    and difficulty level. Update them in{" "}
                    <button
                      className="text-button"
                      onClick={() => navigate("Profile")}
                    >
                      your profile
                    </button>
                    .
                  </span>
                </div>
              )}
            </>
          )}

          {page === "Appointments" && (
            <>
              <SectionHead
                eyebrow="MAKE TIME FOR THE GOOD STUFF"
                title="A little time to connect."
                description={`Your appointments, all in one place. Times shown in ${Intl.DateTimeFormat().resolvedOptions().timeZone}.`}
                action={
                  actor.role === "client" && (
                    <button
                      className="button primary"
                      onClick={() => setDialog({ type: "appointment" })}
                    >
                      <Plus size={16} />
                      Schedule appointment
                    </button>
                  )
                }
              />
              <div className="calendar-layout">
                <section className="panel calendar-panel">
                  <FullCalendar
                    plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                    initialView="dayGridMonth"
                    headerToolbar={{
                      left: "prev,next today",
                      center: "title",
                      right: "dayGridMonth,timeGridWeek",
                    }}
                    height="auto"
                    events={myAppointments.map((a) => ({
                      id: a.id,
                      title: a.title,
                      start: a.start,
                      end: a.end,
                      backgroundColor: "#eeeafd",
                      borderColor: "#ded6fc",
                      textColor: "#6550c1",
                    }))}
                    dateClick={(info) => {
                      if (actor.role === "client")
                        setDialog({
                          type: "appointment",
                          date: info.dateStr.slice(0, 10),
                        });
                    }}
                    eventClick={(info) =>
                      setDialog({ type: "cancel", id: info.event.id })
                    }
                    dayMaxEvents={2}
                    nowIndicator
                  />
                </section>
                <section className="panel calendar-upcoming">
                  <div className="panel-head">
                    <div>
                      <h2>Coming up next</h2>
                      <p>A good conversation goes a long way.</p>
                    </div>
                    <Video size={18} />
                  </div>
                  {upcoming.length ? (
                    upcoming.map(appointmentCard)
                  ) : (
                    <Empty
                      icon={<CalendarDays size={26} />}
                      title="Your calendar is clear"
                      text="Schedule your next catch-up when you’re ready."
                    />
                  )}
                  <div className="calendar-note">
                    <Clock3 size={17} />
                    <p>
                      Appointments can last up to 4 hours. We’ll check for
                      overlaps so everyone has room to focus.
                    </p>
                  </div>
                </section>
              </div>
            </>
          )}

          {page === "Messages" && (
            <>
              <SectionHead
                eyebrow="KEEP THE CONVERSATION GOING"
                title="Good work starts with hello."
                description="One shared conversation for every project."
              />
              <section className="panel messages-layout">
                <div className="conversation-list">
                  <div className="conversation-heading">
                    <h2>Conversations</h2>
                    <span className="count-pill">
                      {mine.filter((t) => t.assigneeId).length}
                    </span>
                  </div>
                  {mine
                    .filter((t) => t.assigneeId)
                    .map((t) => {
                      const counterpart = person(
                        actor.role === "client" ? t.assigneeId : t.clientId,
                      )!;
                      const last = state.messages
                        .filter((m) => m.ticketId === t.id)
                        .at(-1);
                      return (
                        <button
                          className={`conversation-item ${currentChat?.id === t.id ? "selected" : ""}`}
                          key={t.id}
                          onClick={() => setConversation(t.id)}
                        >
                          <Avatar
                            name={counterpart.name}
                            color={t.number % 4}
                          />
                          <span>
                            <strong>{t.title}</strong>
                            <small>
                              {counterpart.name} · NX-{t.number}
                            </small>
                            <p>{last?.text || "Start a conversation…"}</p>
                          </span>
                          <ChevronRight size={14} />
                        </button>
                      );
                    })}
                </div>
                {currentChat ? (
                  <div className="chat">
                    <header className="chat-head">
                      <div className="person-inline">
                        <Avatar
                          name={
                            person(
                              actor.role === "client"
                                ? currentChat.assigneeId
                                : currentChat.clientId,
                            )?.name || "Team"
                          }
                        />
                        <div>
                          <strong>
                            {
                              person(
                                actor.role === "client"
                                  ? currentChat.assigneeId
                                  : currentChat.clientId,
                              )?.name
                            }
                          </strong>
                          <small>
                            <span className="online-dot" />
                            {currentChat.title}
                          </small>
                        </div>
                      </div>
                      <button
                        className="button secondary compact"
                        onClick={() =>
                          setDialog({ type: "ticket", id: currentChat.id })
                        }
                      >
                        Project details
                        <ArrowUpRight size={14} />
                      </button>
                    </header>
                    <div className="chat-project-strip">
                      <span>NX-{currentChat.number}</span>
                      <Badge>{currentChat.status}</Badge>
                      <span className="chat-strip-spacer" />
                      {actor.role !== "client" &&
                        currentChat.status !== "Completed" && (
                          <button
                            className="text-button"
                            onClick={() =>
                              setDialog({ type: "payment", id: currentChat.id })
                            }
                          >
                            <CreditCard size={14} />
                            Request payment
                          </button>
                        )}
                      {actor.role === "client" && (
                        <button
                          className="text-button"
                          onClick={() => navigate("Billing")}
                        >
                          <CreditCard size={14} />
                          View billing
                        </button>
                      )}
                    </div>
                    <div className="chat-body">
                      <div className="chat-start">
                        <ShieldCheck size={13} />A shared space for you and your
                        project team.
                      </div>
                      {state.messages
                        .filter((m) => m.ticketId === currentChat.id)
                        .map((m) =>
                          m.system ? (
                            <div className="system-message" key={m.id}>
                              <CircleCheck size={12} />
                              {m.text}
                            </div>
                          ) : (
                            <div
                              className={`message-row ${m.senderId === actor.id ? "own" : ""}`}
                              key={m.id}
                            >
                              {m.senderId !== actor.id && (
                                <Avatar
                                  name={person(m.senderId)?.name || "Team"}
                                  size="small"
                                />
                              )}
                              <div className="message-block">
                                <div className="message-meta">
                                  {person(m.senderId)?.name.split(" ")[0]}
                                  <span>
                                    {dateText(m.createdAt)} ·{" "}
                                    {timeText(m.createdAt)}
                                  </span>
                                </div>
                                <div className="message-bubble">{m.text}</div>
                              </div>
                            </div>
                          ),
                        )}
                      {state.documents
                        .filter((d) => d.ticketId === currentChat.id)
                        .map((d) => (
                          <div className="chat-file" key={d.id}>
                            <span className="file-icon">
                              <FileText size={21} />
                            </span>
                            <div>
                              <strong>{d.name}</strong>
                              <small>
                                {d.isOutput ? "Project output" : "Shared file"}{" "}
                                · {dateText(d.createdAt)}
                              </small>
                            </div>
                            <button
                              className="icon-button"
                              aria-label={`Download ${d.name}`}
                              onClick={() => void download(d)}
                            >
                              <Download size={17} />
                            </button>
                          </div>
                        ))}
                      <div ref={chatBottom} />
                    </div>
                    {currentChat.status === "Completed" ? (
                      <div className="chat-closed">
                        <CircleCheck size={17} />
                        This project is complete. Thank you for making good
                        things happen.
                      </div>
                    ) : (
                      <form
                        className="chat-composer"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const form = e.currentTarget;
                          const text = String(
                            new FormData(form).get("message") || "",
                          );
                          if (
                            await perform(
                              {
                                type: "sendMessage",
                                ticketId: currentChat.id,
                                text,
                              },
                              "Message sent.",
                              false,
                            )
                          )
                            form.reset();
                        }}
                      >
                        <textarea
                          name="message"
                          aria-label="Your message"
                          placeholder="A question, an idea, a little update…"
                          required
                          maxLength={5000}
                          rows={2}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              e.currentTarget.form?.requestSubmit();
                            }
                          }}
                        />
                        <div className="composer-actions">
                          {fileUpload(currentChat.id)}
                          <span>
                            Enter to send · Shift + Enter for a new line
                          </span>
                          <button
                            className="button primary compact"
                            disabled={busy}
                            type="submit"
                          >
                            Send
                            <Send size={14} />
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                ) : (
                  <Empty
                    icon={<MessageSquare size={32} />}
                    title="Your next conversation starts here"
                    text="Once an assistant accepts your request, you can connect right here."
                  />
                )}
              </section>
            </>
          )}

          {page === "Billing" && (
            <>
              <SectionHead
                eyebrow="A CLEAR VIEW OF THE NUMBERS"
                title="The little details, accounted for."
                description="Payment requests, confirmations, and history in one place."
              />
              <div className="billing-demo-banner">
                <ShieldCheck size={20} />
                <div>
                  <strong>Prototype payments · No real charges</strong>
                  <p>
                    Try the full payment experience safely. No bank or card
                    details needed.
                  </p>
                </div>
                <span>TEST MODE</span>
              </div>
              <div className="stats-grid billing-stats">
                {[
                  {
                    label: "TOTAL PAID",
                    value: money(totalPaid),
                    icon: CheckCheck,
                    color: "mint",
                  },
                  {
                    label: "AWAITING PAYMENT",
                    value: money(
                      state.payments
                        .filter(
                          (p) =>
                            p.status !== "Paid" &&
                            mine.some((t) => t.id === p.ticketId),
                        )
                        .reduce((sum, p) => sum + p.amount, 0),
                    ),
                    icon: Clock3,
                    color: "peach",
                  },
                  {
                    label: "PAYMENT REQUESTS",
                    value: state.payments.filter((p) =>
                      mine.some((t) => t.id === p.ticketId),
                    ).length,
                    icon: FileText,
                    color: "purple",
                  },
                ].map((item) => (
                  <div className={`stat-card ${item.color}`} key={item.label}>
                    <div className="stat-label">
                      {item.label}
                      <item.icon size={17} />
                    </div>
                    <strong>{item.value}</strong>
                    <span>Across your workspace</span>
                  </div>
                ))}
              </div>
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Payment activity</h2>
                    <p>From first request to final confirmation.</p>
                  </div>
                  <CreditCard size={18} />
                </div>
                <DataTable
                  data={state.payments
                    .filter((p) => mine.some((t) => t.id === p.ticketId))
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))}
                  columns={[
                    {
                      accessorKey: "description",
                      header: "Payment request",
                      cell: ({ row }) => (
                        <div className="payment-cell">
                          <span className="payment-icon">
                            <ArrowDownLeft size={18} />
                          </span>
                          <div>
                            <strong>{row.original.description}</strong>
                            <small>
                              NX-
                              {
                                mine.find((t) => t.id === row.original.ticketId)
                                  ?.number
                              }{" "}
                              · {dateText(row.original.createdAt)}
                            </small>
                          </div>
                        </div>
                      ),
                    },
                    {
                      accessorKey: "amount",
                      header: "Amount",
                      cell: ({ row }) => (
                        <strong>{money(row.original.amount)}</strong>
                      ),
                    },
                    {
                      accessorKey: "status",
                      header: "Status",
                      cell: ({ row }) => <Badge>{row.original.status}</Badge>,
                    },
                    {
                      id: "action",
                      header: "",
                      enableSorting: false,
                      cell: ({ row }) =>
                        row.original.status === "Paid" ? (
                          <span className="paid-label">
                            <CheckCheck size={14} />
                            Paid{" "}
                            {row.original.paidAt &&
                              dateText(row.original.paidAt)}
                          </span>
                        ) : actor.role === "client" ? (
                          <button
                            className="button primary compact"
                            onClick={() =>
                              setDialog({ type: "pay", id: row.original.id })
                            }
                          >
                            Pay in test mode
                            <ArrowUpRight size={13} />
                          </button>
                        ) : row.original.status === "Pending" ? (
                          <button
                            disabled={busy}
                            className="button secondary compact"
                            onClick={() =>
                              void perform(
                                {
                                  type: "verifyPayment",
                                  paymentId: row.original.id,
                                },
                                "Payment request verified.",
                                false,
                              )
                            }
                          >
                            Verify request
                          </button>
                        ) : (
                          <span className="muted">Awaiting client</span>
                        ),
                    },
                  ]}
                  empty="Payment requests will appear here when a service is requested."
                />
              </section>
            </>
          )}

          {page === "Files & documents" && (
            <>
              <SectionHead
                eyebrow="EVERYTHING HAS ITS PLACE"
                title="A home for the details."
                description="Your documents, shared resources, and finished work. All together."
                action={fileUpload()}
              />
              <div className="document-summary">
                <FolderOpen size={25} />
                <div>
                  <strong>Your shared workspace</strong>
                  <p>
                    Upload documents up to 10 MB. Project files can also be
                    shared directly in conversations.
                  </p>
                </div>
                <Badge tone="purple">
                  {
                    state.documents.filter(
                      (d) =>
                        actor.role !== "client" ||
                        d.ownerId === actor.id ||
                        mine.some((t) => t.id === d.ticketId),
                    ).length
                  }{" "}
                  files
                </Badge>
              </div>
              <section className="panel">
                <div className="table-toolbar">
                  <SearchBox
                    value={search}
                    onChange={setSearch}
                    placeholder="Search files…"
                  />
                  <span className="muted">
                    {mode === "demo"
                      ? "Stored in this browser"
                      : "Private Supabase storage"}
                  </span>
                </div>
                <DataTable
                  data={state.documents.filter(
                    (d) =>
                      (actor.role !== "client" ||
                        d.ownerId === actor.id ||
                        mine.some((t) => t.id === d.ticketId)) &&
                      d.name.toLowerCase().includes(search.toLowerCase()),
                  )}
                  columns={[
                    {
                      accessorKey: "name",
                      header: "File name",
                      cell: ({ row }) => (
                        <div className="payment-cell">
                          <span
                            className={`file-icon ${row.original.isOutput ? "output" : ""}`}
                          >
                            <FileText size={21} />
                          </span>
                          <div>
                            <strong>{row.original.name}</strong>
                            <small>
                              {row.original.isOutput
                                ? "Project output"
                                : "Shared document"}{" "}
                              ·{" "}
                              {row.original.size < 1024 * 1024
                                ? `${Math.max(1, Math.round(row.original.size / 1024))} KB`
                                : `${(row.original.size / 1024 / 1024).toFixed(1)} MB`}
                            </small>
                          </div>
                        </div>
                      ),
                    },
                    {
                      id: "owner",
                      header: "Shared by",
                      cell: ({ row }) =>
                        person(row.original.ownerId)?.name || "Team",
                    },
                    {
                      accessorKey: "createdAt",
                      header: "Uploaded",
                      cell: ({ row }) => dateText(row.original.createdAt),
                    },
                    {
                      accessorKey: "reviewed",
                      header: "Status",
                      cell: ({ row }) => (
                        <Badge
                          tone={row.original.reviewed ? "paid" : "pending"}
                        >
                          {row.original.reviewed ? "Reviewed" : "To review"}
                        </Badge>
                      ),
                    },
                    {
                      id: "actions",
                      header: "",
                      enableSorting: false,
                      cell: ({ row }) => (
                        <div className="row-actions">
                          {actor.role !== "client" &&
                            !row.original.reviewed && (
                              <button
                                className="icon-button"
                                title="Mark reviewed"
                                aria-label={`Review ${row.original.name}`}
                                onClick={() =>
                                  void perform(
                                    {
                                      type: "reviewDocument",
                                      documentId: row.original.id,
                                    },
                                    "Document marked as reviewed.",
                                    false,
                                  )
                                }
                              >
                                <FileCheck2 size={17} />
                              </button>
                            )}
                          <button
                            className="icon-button"
                            aria-label={`Download ${row.original.name}`}
                            onClick={() => void download(row.original)}
                          >
                            <Download size={17} />
                          </button>
                        </div>
                      ),
                    },
                  ]}
                  empty="A fresh folder. Upload your first document to get started."
                />
              </section>
            </>
          )}

          {page === "Profile" && (
            <>
              <SectionHead
                eyebrow="A LITTLE MORE YOU"
                title="Make yourself at home."
                description="Your profile, account details, and work preferences."
              />
              <div className="profile-layout">
                <aside className="panel profile-card">
                  <Avatar name={actor.name} size="large" color={2} />
                  <h2>{actor.name}</h2>
                  <p>{actor.company}</p>
                  <Badge>
                    {actor.role === "staff" ? "Virtual assistant" : actor.role}
                  </Badge>
                  <div className="profile-status">
                    <span className="online-dot" />
                    {actor.status} account
                    <ShieldCheck size={16} />
                  </div>
                  <div className="profile-detail">
                    <span>Email address</span>
                    <strong>{actor.email}</strong>
                  </div>
                  <div className="profile-detail">
                    <span>Workspace</span>
                    <strong>
                      {mode === "demo"
                        ? "Prototype demo"
                        : "Supabase connected"}
                    </strong>
                  </div>
                  <button
                    className="button secondary"
                    onClick={() => navigate("Files & documents")}
                  >
                    <FolderOpen size={16} />
                    View my documents
                  </button>
                  <button
                    className="text-button signout"
                    onClick={() => void signout()}
                  >
                    <LogOut size={15} />
                    Sign out
                  </button>
                </aside>
                <section className="panel profile-form">
                  <div className="panel-head">
                    <div>
                      <h2>The person behind the projects</h2>
                      <p>Let your team get to know you.</p>
                    </div>
                  </div>
                  <Form
                    key={actor.id}
                    onSubmit={async (form) => {
                      await perform(
                        {
                          type: "saveProfile",
                          name: str(form, "name"),
                          company: str(form, "company"),
                          bio: str(form, "bio"),
                          available: form.get("available") === "on",
                          autoAssign: form.get("autoAssign") === "on",
                          skillLevel: (str(form, "skillLevel") ||
                            actor.skillLevel) as Difficulty,
                          skills:
                            actor.role === "staff"
                              ? form.getAll("skills").map(String)
                              : actor.skills,
                        },
                        "Profile updated.",
                        false,
                      );
                    }}
                  >
                    <div className="form-row">
                      <Field label="Full name">
                        <input
                          name="name"
                          defaultValue={actor.name}
                          required
                          minLength={2}
                        />
                      </Field>
                      <Field label="Company / organization">
                        <input name="company" defaultValue={actor.company} />
                      </Field>
                    </div>
                    <Field label="A little about you">
                      <textarea
                        name="bio"
                        defaultValue={actor.bio}
                        rows={4}
                        maxLength={1000}
                      />
                    </Field>
                    {actor.role === "staff" && (
                      <>
                        <div className="form-section-title">
                          <h3>Your work, your way</h3>
                          <p>
                            Tell us what you’re available for. We’ll use these
                            details to match you with new work.
                          </p>
                        </div>
                        <label className="toggle-row">
                          <span>
                            <strong>Available for new requests</strong>
                            <small>
                              Let clients and your team know you have room.
                            </small>
                          </span>
                          <input
                            type="checkbox"
                            name="available"
                            defaultChecked={actor.available}
                          />
                        </label>
                        <label className="toggle-row">
                          <span>
                            <strong>Automatic assignment</strong>
                            <small>
                              Accept matching requests automatically after
                              payment.
                            </small>
                          </span>
                          <input
                            type="checkbox"
                            name="autoAssign"
                            defaultChecked={actor.autoAssign}
                          />
                        </label>
                        <Field label="Maximum service difficulty">
                          <select
                            name="skillLevel"
                            defaultValue={actor.skillLevel}
                          >
                            {difficulties.map((d) => (
                              <option key={d}>{d}</option>
                            ))}
                          </select>
                        </Field>
                        <div className="field">
                          <span>Your service skills</span>
                          <div className="skills-options">
                            {categories.map((c) => (
                              <label key={c}>
                                <input
                                  type="checkbox"
                                  name="skills"
                                  value={c}
                                  defaultChecked={actor.skills.includes(c)}
                                />
                                {c}
                              </label>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                    <div className="form-actions">
                      <span className="muted">
                        A little update goes a long way.
                      </span>
                      <Submit busy={busy}>
                        Save changes
                        <Check size={15} />
                      </Submit>
                    </div>
                  </Form>
                </section>
              </div>
            </>
          )}

          {page === "Activity logs" && actor.role === "admin" && (
            <>
              <SectionHead
                eyebrow="EVERY DETAIL IN VIEW"
                title="A clear view of every request."
                description="Track payments and output delivery across your entire workspace."
              />
              <div className="stats-grid">
                {[
                  {
                    label: "PAID · OUTPUT DELIVERED",
                    paid: true,
                    delivered: true,
                    color: "mint",
                  },
                  {
                    label: "PAID · AWAITING OUTPUT",
                    paid: true,
                    delivered: false,
                    color: "purple",
                  },
                  {
                    label: "PENDING · OUTPUT DELIVERED",
                    paid: false,
                    delivered: true,
                    color: "gold",
                  },
                  {
                    label: "PENDING · AWAITING OUTPUT",
                    paid: false,
                    delivered: false,
                    color: "peach",
                  },
                ].map((item) => (
                  <div className={`stat-card ${item.color}`} key={item.label}>
                    <div className="stat-label">
                      {item.label}
                      <ShieldCheck size={15} />
                    </div>
                    <strong>
                      {
                        mine.filter(
                          (t) =>
                            (paymentSummary(state, t.id) === "Paid") ===
                              item.paid && !!t.deliveredAt === item.delivered,
                        ).length
                      }
                    </strong>
                    <span>Across all client requests</span>
                  </div>
                ))}
              </div>
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Ticket oversight</h2>
                    <p>Every payment. Every promised output.</p>
                  </div>
                </div>
                <DataTable
                  data={mine}
                  columns={[
                    {
                      accessorKey: "title",
                      header: "Request",
                      cell: ({ row }) => titleCell(row.original),
                    },
                    {
                      id: "client",
                      header: "Client",
                      cell: ({ row }) => person(row.original.clientId)?.name,
                    },
                    {
                      id: "payment",
                      header: "Payment",
                      cell: ({ row }) => (
                        <Badge>{paymentSummary(state, row.original.id)}</Badge>
                      ),
                    },
                    {
                      id: "output",
                      header: "Output",
                      cell: ({ row }) => (
                        <Badge
                          tone={row.original.deliveredAt ? "paid" : "pending"}
                        >
                          {row.original.deliveredAt
                            ? "Delivered"
                            : "Not delivered"}
                        </Badge>
                      ),
                    },
                    {
                      accessorKey: "status",
                      header: "Ticket status",
                      cell: ({ row }) => <Badge>{row.original.status}</Badge>,
                    },
                  ]}
                  onRow={(t) => setDialog({ type: "ticket", id: t.id })}
                />
              </section>
              <section className="panel audit-panel">
                <div className="panel-head">
                  <div>
                    <h2>Workspace activity log</h2>
                    <p>A record of the actions behind the progress.</p>
                  </div>
                  <span className="live-indicator">
                    <span />
                    LIVE
                  </span>
                </div>
                <DataTable
                  data={state.audit}
                  columns={[
                    {
                      accessorKey: "createdAt",
                      header: "Time",
                      cell: ({ row }) =>
                        `${dateText(row.original.createdAt)} · ${timeText(row.original.createdAt)}`,
                    },
                    {
                      id: "actor",
                      header: "Account",
                      cell: ({ row }) =>
                        person(row.original.actorId)?.name || "Team",
                    },
                    { accessorKey: "text", header: "Activity" },
                    {
                      id: "ticket",
                      header: "Ticket",
                      cell: ({ row }) => {
                        const t = mine.find(
                          (t) => t.id === row.original.ticketId,
                        );
                        return t ? (
                          <button
                            className="text-button"
                            onClick={() =>
                              setDialog({ type: "ticket", id: t.id })
                            }
                          >
                            NX-{t.number}
                            <ArrowUpRight size={12} />
                          </button>
                        ) : (
                          "—"
                        );
                      },
                    },
                  ]}
                  pageSize={8}
                />
              </section>
            </>
          )}

          {page === "Tools & software" && (
            <>
              <SectionHead
                eyebrow="A FEW GOOD TOOLS"
                title="Built to work beautifully together."
                description="The tools behind your workspace. Simple, connected, and ready to grow."
              />
              <div className="tools-grid">
                {[
                  {
                    name: "Supabase",
                    label: "DATABASE · AUTH · FILES",
                    text: "Your accounts, workspace data, and private documents, connected in one place.",
                    letter: "S",
                    color: "mint",
                    url: "https://supabase.com/docs",
                    status:
                      mode === "demo"
                        ? "Integration ready · setup required"
                        : "Connected",
                  },
                  {
                    name: "FullCalendar",
                    label: "SCHEDULING",
                    text: "An interactive calendar for catch-ups, appointments, and a little time to connect.",
                    letter: "F",
                    color: "purple",
                    url: "https://fullcalendar.io/docs",
                    status: "Active",
                  },
                  {
                    name: "TanStack Table",
                    label: "YOUR WORK, ORGANIZED",
                    text: "Sortable, paginated tables that make the details easier to find.",
                    letter: "T",
                    color: "peach",
                    url: "https://tanstack.com/table/latest",
                    status: "Active",
                  },
                  {
                    name: "Resend",
                    label: "EMAIL NOTIFICATIONS",
                    text: "A server-side email function for confirmed payments. Requires your API key and a verified sender.",
                    letter: "R",
                    color: "gold",
                    url: "https://resend.com/docs",
                    status: "Integration ready · setup required",
                  },
                  {
                    name: "Git + GitHub",
                    label: "SOURCE CONTROL",
                    text: "Version control for the prototype, ready to connect to your GitHub repository.",
                    letter: "G",
                    color: "purple",
                    url: "https://docs.github.com/",
                    status: "Local Git repository",
                  },
                  {
                    name: "Railway",
                    label: "WHEN YOU’RE READY TO LAUNCH",
                    text: "Hosting comes later. This prototype runs locally until you decide to deploy.",
                    letter: "R",
                    color: "mint",
                    url: "https://docs.railway.com/",
                    status: "Not deployed",
                  },
                ].map((tool) => (
                  <a
                    className="panel tool-card"
                    key={tool.name}
                    href={tool.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <div>
                      <span className={`tool-letter ${tool.color}`}>
                        {tool.letter}
                      </span>
                      <ExternalLink size={16} />
                    </div>
                    <span className="eyebrow">{tool.label}</span>
                    <h2>{tool.name}</h2>
                    <p>{tool.text}</p>
                    <small>
                      <span className="online-dot" />
                      {tool.status}
                    </small>
                  </a>
                ))}
              </div>
            </>
          )}
        </main>
      </div>

      {dialog && (
        <Modal
          title={
            dialog.type === "request"
              ? "What can we take off your plate?"
              : dialog.type === "appointment"
                ? "Make a little time to connect."
                : dialog.type === "payment"
                  ? "Let’s get the details in order."
                  : dialog.type === "pay"
                    ? "One little step. A lot of progress."
                    : dialog.type === "feedback"
                      ? "How did we do?"
                      : dialog.type === "help"
                        ? "A little guidance goes a long way."
                        : dialog.type === "cancel"
                          ? "Your time to connect."
                          : "Every detail, in one place."
          }
          subtitle={
            dialog.type === "request"
              ? "Tell us what you have in mind. We’ll help you make it happen."
              : undefined
          }
          close={closeDialog}
          wide={dialog.type === "ticket"}
        >
          {dialog.type === "request" && (
            <Form
              onSubmit={async (form) => {
                await perform(
                  {
                    type: "createTicket",
                    title: str(form, "title"),
                    description: str(form, "description"),
                    category: str(form, "category"),
                    budget: Number(form.get("budget")),
                    difficulty: str(form, "difficulty") as Difficulty,
                    dueDate: str(form, "dueDate"),
                  },
                  "Your request is live. Your test payment is ready in Billing.",
                );
              }}
            >
              <Field label="Give your request a name">
                <input
                  name="title"
                  placeholder="e.g. A fresh set of social media posts"
                  required
                  minLength={5}
                  maxLength={150}
                />
              </Field>
              <Field label="What would you like help with?">
                <select name="category" required defaultValue="">
                  <option value="" disabled>
                    Choose a service
                  </option>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="The details make the difference"
                hint="Include your goals, deliverables, and anything your assistant should know."
              >
                <textarea
                  name="description"
                  placeholder="A little context goes a long way…"
                  rows={4}
                  required
                  minLength={15}
                  maxLength={5000}
                />
              </Field>
              <div className="form-row">
                <Field label="Your budget (USD)">
                  <div className="input-prefix">
                    <span>$</span>
                    <input
                      name="budget"
                      type="number"
                      min={1}
                      max={1000000}
                      step="0.01"
                      placeholder="250"
                      required
                    />
                  </div>
                </Field>
                <Field label="When do you need it?">
                  <input
                    name="dueDate"
                    type="date"
                    required
                    min={dateInput()}
                  />
                </Field>
              </div>
              <div className="field">
                <span>How much is involved?</span>
                <div className="difficulty-options">
                  {difficulties.map((d, i) => (
                    <label key={d}>
                      <input
                        type="radio"
                        name="difficulty"
                        value={d}
                        defaultChecked={i === 1}
                      />
                      <span className={`difficulty-bars difficulty-${i}`}>
                        <i />
                        <i />
                        <i />
                      </span>
                      <strong>{d}</strong>
                      <small>
                        {
                          [
                            "A straightforward task",
                            "A few moving parts",
                            "A bigger challenge",
                          ][i]
                        }
                      </small>
                    </label>
                  ))}
                </div>
              </div>
              <div className="info-note">
                <ShieldCheck size={17} />
                <p>
                  Submitting creates a test payment for your budget. Pay it in
                  Billing to match with an available assistant, or let an
                  assistant accept the request first.
                </p>
              </div>
              <div className="form-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={closeDialog}
                >
                  Keep thinking
                </button>
                <Submit busy={busy}>
                  Create request
                  <ArrowUpRight size={15} />
                </Submit>
              </div>
            </Form>
          )}
          {dialog.type === "ticket" &&
            (() => {
              const t = mine.find((t) => t.id === dialog.id);
              if (!t) return <p>Request not found.</p>;
              const assistant = person(t.assigneeId);
              const docs = state.documents.filter((d) => d.ticketId === t.id);
              const payments = state.payments.filter(
                (p) => p.ticketId === t.id,
              );
              return (
                <div className="ticket-detail">
                  <div className="ticket-topline">
                    <span>NX-{t.number}</span>
                    <Badge>{t.status}</Badge>
                    <Badge
                      tone={`difficulty-badge ${t.difficulty.toLowerCase()}`}
                    >
                      {t.difficulty}
                    </Badge>
                  </div>
                  <h2>{t.title}</h2>
                  <span className="ticket-category">{t.category}</span>
                  <div className="ticket-description">{t.description}</div>
                  <div className="ticket-facts">
                    <div>
                      <span>PROJECT BUDGET</span>
                      <strong>{money(t.budget)}</strong>
                    </div>
                    <div>
                      <span>DUE DATE</span>
                      <strong>{dateText(t.dueDate)}</strong>
                    </div>
                    <div>
                      <span>YOUR ASSISTANT</span>
                      <strong>
                        {assistant ? (
                          <>
                            <Avatar name={assistant.name} size="tiny" />
                            {assistant.name}
                          </>
                        ) : (
                          "Finding the right match"
                        )}
                      </strong>
                    </div>
                  </div>
                  {actor.role === "admin" &&
                    t.status !== "Completed" &&
                    !t.deliveredAt && (
                      <Form
                        className="assignment-form"
                        onSubmit={async (form) => {
                          await perform(
                            {
                              type: "assignTicket",
                              ticketId: t.id,
                              staffId: str(form, "staffId"),
                            },
                            "Assistant assigned.",
                            false,
                          );
                        }}
                      >
                        <Field label="Assign an assistant">
                          <select
                            name="staffId"
                            defaultValue={t.assigneeId || ""}
                            required
                          >
                            <option value="" disabled>
                              Choose an assistant
                            </option>
                            {state.profiles
                              .filter((p) => p.role === "staff")
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                          </select>
                        </Field>
                        <Submit busy={busy}>Assign</Submit>
                      </Form>
                    )}
                  <div className="ticket-section">
                    <div className="ticket-section-head">
                      <h3>Payment tracking</h3>
                      {actor.role !== "client" &&
                        t.assigneeId &&
                        t.status !== "Completed" && (
                          <button
                            className="text-button"
                            onClick={() =>
                              setDialog({ type: "payment", id: t.id })
                            }
                          >
                            <Plus size={14} />
                            Request payment
                          </button>
                        )}
                    </div>
                    {payments.length ? (
                      payments.map((p) => (
                        <div className="ticket-payment" key={p.id}>
                          <span className="payment-icon">
                            <CreditCard size={18} />
                          </span>
                          <div>
                            <strong>{p.description}</strong>
                            <small>{money(p.amount)} · Simulated payment</small>
                          </div>
                          <Badge>{p.status}</Badge>
                          {actor.role === "client" && p.status !== "Paid" && (
                            <button
                              className="button primary compact"
                              onClick={() =>
                                setDialog({ type: "pay", id: p.id })
                              }
                            >
                              Pay
                            </button>
                          )}
                          {actor.role !== "client" &&
                            p.status === "Pending" && (
                              <button
                                className="button secondary compact"
                                disabled={busy}
                                onClick={() =>
                                  void perform(
                                    { type: "verifyPayment", paymentId: p.id },
                                    "Payment request verified.",
                                    false,
                                  )
                                }
                              >
                                Verify
                              </button>
                            )}
                        </div>
                      ))
                    ) : (
                      <p className="muted">
                        Your assistant will set up payment tracking after you
                        agree on the details.
                      </p>
                    )}
                  </div>
                  <div className="ticket-section">
                    <div className="ticket-section-head">
                      <h3>Files & final output</h3>
                      {t.status !== "Completed" &&
                        (actor.id === t.assigneeId || actor.role === "admin"
                          ? fileUpload(t.id, true)
                          : fileUpload(t.id))}
                    </div>
                    {docs.length ? (
                      docs.map((d) => (
                        <div className="ticket-file" key={d.id}>
                          <FileText size={19} />
                          <div>
                            <strong>{d.name}</strong>
                            <small>
                              {d.isOutput ? "Final output" : "Shared document"}{" "}
                              · {dateText(d.createdAt)}
                            </small>
                          </div>
                          <button
                            className="icon-button"
                            aria-label={`Download ${d.name}`}
                            onClick={() => void download(d)}
                          >
                            <Download size={16} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="muted">
                        A place for the details, and the great work to come.
                      </p>
                    )}
                  </div>
                  {t.rating && (
                    <div className="feedback-display">
                      <span>
                        {"★".repeat(t.rating)}
                        {"☆".repeat(5 - t.rating)}
                      </span>
                      <strong>A job well done.</strong>
                      <p>{t.feedback || "Thank you for your feedback!"}</p>
                    </div>
                  )}
                  <div className="ticket-actions">
                    {t.assigneeId && (
                      <button
                        className="button secondary"
                        onClick={() => openConversation(t.id)}
                      >
                        <MessageSquare size={16} />
                        Open conversation
                      </button>
                    )}
                    {actor.role === "staff" && !t.assigneeId && (
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() =>
                          void perform(
                            { type: "acceptTicket", ticketId: t.id },
                            "Request accepted. Your conversation is ready.",
                          )
                        }
                      >
                        <Check size={16} />
                        Accept request
                      </button>
                    )}
                    {(actor.id === t.assigneeId || actor.role === "admin") &&
                      ["In progress", "In review"].includes(t.status) &&
                      !t.deliveredAt && (
                        <button
                          className="button primary"
                          disabled={busy}
                          onClick={() =>
                            void perform(
                              { type: "deliver", ticketId: t.id },
                              "Output delivered. Your client has been notified.",
                            )
                          }
                        >
                          <CheckCheck size={16} />
                          Deliver output
                        </button>
                      )}
                    {actor.id === t.clientId && t.status === "In review" && (
                      <button
                        className="button primary"
                        onClick={() =>
                          setDialog({ type: "feedback", id: t.id })
                        }
                      >
                        <Star size={16} />
                        Approve & leave feedback
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
          {dialog.type === "appointment" && (
            <Form
              onSubmit={async (form) => {
                const start = new Date(
                  `${str(form, "date")}T${str(form, "time")}`,
                );
                const end = new Date(
                  +start + Number(form.get("duration")) * 60000,
                );
                await perform(
                  {
                    type: "createAppointment",
                    title: str(form, "title"),
                    staffId: str(form, "staffId"),
                    start: start.toISOString(),
                    end: end.toISOString(),
                    notes: str(form, "notes"),
                  },
                  "Appointment scheduled. A little time, well spent.",
                );
              }}
            >
              <Field label="What’s on the agenda?">
                <input
                  name="title"
                  placeholder="e.g. Weekly project catch-up"
                  required
                  maxLength={150}
                />
              </Field>
              <Field label="Who would you like to connect with?">
                <select name="staffId" required>
                  {state.profiles
                    .filter(
                      (p) =>
                        p.role === "staff" &&
                        p.available &&
                        p.status === "Active",
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </Field>
              <div className="form-row">
                <Field label="Date">
                  <input
                    type="date"
                    name="date"
                    min={dateInput()}
                    defaultValue={dialog.date}
                    required
                  />
                </Field>
                <Field label="Time">
                  <input
                    type="time"
                    name="time"
                    defaultValue="10:00"
                    required
                  />
                </Field>
              </div>
              <Field label="How much time do you need?">
                <select name="duration" defaultValue="30">
                  <option value="15">15 minutes · A quick hello</option>
                  <option value="30">30 minutes · A good catch-up</option>
                  <option value="60">1 hour · Room to go deeper</option>
                  <option value="120">2 hours · Let’s make a plan</option>
                </select>
              </Field>
              <Field label="Anything else? (optional)">
                <textarea
                  name="notes"
                  rows={3}
                  placeholder="Add a little context for your assistant…"
                  maxLength={2000}
                />
              </Field>
              <div className="info-note">
                <Clock3 size={16} />
                <span>
                  Times use your local timezone:{" "}
                  {Intl.DateTimeFormat().resolvedOptions().timeZone}.
                </span>
              </div>
              <div className="form-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={closeDialog}
                >
                  Maybe later
                </button>
                <Submit busy={busy}>
                  Schedule appointment
                  <CalendarDays size={15} />
                </Submit>
              </div>
            </Form>
          )}
          {dialog.type === "cancel" &&
            (() => {
              const a = myAppointments.find((a) => a.id === dialog.id);
              return a ? (
                <div className="appointment-detail">
                  <span className="appointment-detail-icon">
                    <Video size={26} />
                  </span>
                  <h2>{a.title}</h2>
                  <p>
                    {dateText(a.start, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                  <p>
                    {timeText(a.start)} – {timeText(a.end)} ·{" "}
                    {Intl.DateTimeFormat().resolvedOptions().timeZone}
                  </p>
                  <div className="person-inline">
                    <Avatar name={person(a.staffId)?.name || "Assistant"} />
                    <span>{person(a.staffId)?.name}</span>
                  </div>
                  {a.notes && <blockquote>{a.notes}</blockquote>}
                  <div className="form-actions">
                    <button
                      className="button danger-secondary"
                      disabled={busy}
                      onClick={() =>
                        void perform(
                          { type: "cancelAppointment", appointmentId: a.id },
                          "Appointment cancelled.",
                        )
                      }
                    >
                      Cancel appointment
                    </button>
                    <button className="button primary" onClick={closeDialog}>
                      All set
                      <Check size={15} />
                    </button>
                  </div>
                </div>
              ) : (
                <p>This appointment has been cancelled.</p>
              );
            })()}
          {dialog.type === "payment" && (
            <Form
              onSubmit={async (form) => {
                await perform(
                  {
                    type: "createPayment",
                    ticketId: dialog.id!,
                    amount: Number(form.get("amount")),
                    description: str(form, "description"),
                  },
                  "Payment request sent to your client.",
                );
              }}
            >
              <div className="info-note">
                <CreditCard size={18} />
                <p>
                  Create a clear payment request for the agreed work. Your
                  client will see it in Billing and on the project.
                </p>
              </div>
              <Field label="What is this payment for?">
                <input
                  name="description"
                  placeholder="e.g. Additional video edits — agreed scope"
                  required
                  maxLength={300}
                />
              </Field>
              <Field label="Amount (USD)">
                <div className="input-prefix">
                  <span>$</span>
                  <input
                    type="number"
                    name="amount"
                    min={1}
                    max={1000000}
                    step="0.01"
                    required
                    placeholder="150"
                  />
                </div>
              </Field>
              <div className="form-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={closeDialog}
                >
                  Cancel
                </button>
                <Submit busy={busy}>
                  Request payment
                  <ArrowUpRight size={15} />
                </Submit>
              </div>
            </Form>
          )}
          {dialog.type === "pay" &&
            (() => {
              const p = state.payments.find((p) => p.id === dialog.id);
              return p ? (
                <div className="checkout">
                  <span className="checkout-icon">
                    <ShieldCheck size={30} />
                  </span>
                  <span className="eyebrow">A SAFE SPACE TO TRY THINGS</span>
                  <h2>{money(p.amount)}</h2>
                  <p>{p.description}</p>
                  <div className="checkout-summary">
                    <span>
                      Payment method<strong>Prototype test payment</strong>
                    </span>
                    <span>
                      Real money charged<strong>$0</strong>
                    </span>
                    <span>
                      Test amount<strong>{money(p.amount)}</strong>
                    </span>
                  </div>
                  <p className="checkout-note">
                    No card details needed. Confirming records a simulated
                    payment, notifies your assistant, and enables skill-based
                    matching for unassigned work.
                  </p>
                  <button
                    className="button primary"
                    disabled={busy || p.status === "Paid"}
                    onClick={() =>
                      void perform(
                        { type: "pay", paymentId: p.id },
                        "Test payment confirmed. No real money was charged.",
                      )
                    }
                  >
                    {busy
                      ? "Confirming…"
                      : p.status === "Paid"
                        ? "Already paid"
                        : "Confirm test payment"}
                    <Check size={16} />
                  </button>
                  <button className="text-button" onClick={closeDialog}>
                    Back to my workspace
                  </button>
                </div>
              ) : (
                <p>Payment not found.</p>
              );
            })()}
          {dialog.type === "feedback" && (
            <Feedback
              busy={busy}
              onSubmit={async (rating, feedback) => {
                await perform(
                  {
                    type: "closeTicket",
                    ticketId: dialog.id!,
                    rating,
                    feedback,
                  },
                  "A job well done. Your request is complete!",
                );
              }}
            />
          )}
          {dialog.type === "help" && (
            <div className="guide">
              <div className="info-note">
                <Sparkles size={21} />
                <p>
                  Your workspace brings every step together. Here’s how to try a
                  complete project.
                </p>
              </div>
              {[
                {
                  title: "1. Start with a little idea",
                  text: "In the Client workspace, create a request with a service, budget, difficulty, and due date.",
                },
                {
                  title: "2. Find your person",
                  text: "Pay the initial test payment for automatic matching, or switch to Virtual assistant and accept a matching open request.",
                },
                {
                  title: "3. Keep the conversation going",
                  text: "Use Messages to agree on the details. The assistant can create additional payment tracking after the initial request is paid.",
                },
                {
                  title: "4. Make it official, safely",
                  text: "The client confirms a test payment in Billing. Staff can verify pending payment requests. No real money is charged.",
                },
                {
                  title: "5. Share something great",
                  text: "The assistant uploads an output in the project details and selects Deliver output after all payments are paid.",
                },
                {
                  title: "6. Give a little appreciation",
                  text: "The client downloads the work, approves delivery, and leaves a star rating. Admin sees the entire journey in Activity logs.",
                },
              ].map((g) => (
                <div className="guide-step" key={g.title}>
                  <CircleCheck size={18} />
                  <div>
                    <h3>{g.title}</h3>
                    <p>{g.text}</p>
                  </div>
                </div>
              ))}
              <div className="info-note">
                <ShieldCheck size={18} />
                <p>
                  {mode === "demo"
                    ? "Use your account menu at the top right to switch demo roles. Demo information persists in this browser and is for testing only."
                    : "Your account role is managed by an administrator. Data and files are protected by Supabase row-level security."}
                </p>
              </div>
              <button className="button primary" onClick={closeDialog}>
                Let’s get to it
                <ArrowRight size={15} />
              </button>
            </div>
          )}
        </Modal>
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <CircleHelp size={19} /> : <CircleCheck size={19} />}
          <span>{toast.text}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function Feedback({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (rating: number, feedback: string) => Promise<void>;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  return (
    <Form
      className="feedback-form"
      onSubmit={async (form) => {
        await onSubmit(rating, str(form, "feedback"));
      }}
    >
      <span className="feedback-spark">
        <Sparkles size={33} />
      </span>
      <h3>A little appreciation means a lot.</h3>
      <p>
        Your project is ready. If you’re happy with the output, close the
        request and let your assistant know how they did.
      </p>
      <div className="rating-stars" role="group" aria-label="Service rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            aria-label={`${n} star${n !== 1 ? "s" : ""}`}
            aria-pressed={rating === n}
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
          >
            <Star
              size={36}
              fill={n <= (hover || rating) ? "#e8b15b" : "none"}
              color={n <= (hover || rating) ? "#e8b15b" : "#d5d3de"}
            />
          </button>
        ))}
      </div>
      <small className="rating-caption">
        {
          [
            "Choose your stars",
            "Could be better",
            "Room to grow",
            "Good work",
            "Really great work",
            "Couldn’t be happier!",
          ][rating]
        }
      </small>
      <Field label="Leave a little note (optional)">
        <textarea
          name="feedback"
          rows={3}
          placeholder="What made the experience great?"
          maxLength={2000}
        />
      </Field>
      <button
        className="button primary"
        type="submit"
        disabled={busy || !rating}
      >
        {busy ? "Closing…" : "Close request & send feedback"}
        <Check size={16} />
      </button>
    </Form>
  );
}
