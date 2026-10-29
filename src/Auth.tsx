import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Command,
  Layers3,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Form, Field, Submit } from "./components";
import { enterDemo, identityFromSession, supabase } from "./data";
import type { Identity } from "./data";
import type { Role } from "./types";

export default function Auth({
  onLogin,
}: {
  onLogin: (identity: Identity) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [signup, setSignup] = useState(false);
  const [notice, setNotice] = useState("");
  const login = async (form: FormData) => {
    if (!supabase) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const email = String(form.get("email"));
      const password = String(form.get("password"));
      if (signup) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name: String(form.get("name")) } },
        });
        if (error) throw error;
        if (data.session) {
          const id = await identityFromSession(data.session);
          if (id) onLogin(id);
        } else
          setNotice("Check your email to confirm your account, then sign in.");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        const id = await identityFromSession(data.session);
        if (id) onLogin(id);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Sign in failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth">
      <div className="auth-story">
        <a className="brand" href="#">
          <span className="brand-icon">
            <Command size={23} />
          </span>
          Nexus VA<span className="brand-dot">®</span>
        </a>
        <div className="auth-copy">
          <span className="auth-tag">
            <span /> LESS BUSYWORK. MORE POSSIBILITY.
          </span>
          <h1>
            A little support.
            <br />A lot more
            <br />
            <em>possibility.</em>
          </h1>
          <p>
            Your people, projects, and progress.
            <br />
            Together in one thoughtful workspace.
          </p>
          <div className="auth-project">
            <div className="auth-project-icon">
              <Layers3 size={24} />
            </div>
            <div>
              <span>YOUR NEXT BIG THING</span>
              <strong>Consider it handled.</strong>
            </div>
            <span className="auth-project-check">
              <Check size={19} />
            </span>
          </div>
          <div className="auth-avatars">
            <span className="avatar avatar-0">MB</span>
            <span className="avatar avatar-1">LT</span>
            <span className="avatar avatar-3">JL</span>
            <span>Good people. Great work.</span>
          </div>
        </div>
        <footer>
          MADE FOR THE WAY YOU WORK <Sparkles size={16} />
        </footer>
        <div className="auth-orbit orbit-one" />
        <div className="auth-orbit orbit-two" />
      </div>
      <div className="auth-form-side">
        <span className="prototype-label">
          <span /> PROTOTYPE 01
        </span>
        <div className="auth-form">
          <span className="eyebrow">YOUR WORKSPACE AWAITS</span>
          <h2>{signup ? "Make room for more." : "Welcome to Nexus."}</h2>
          <p>
            {supabase
              ? "Sign in to pick up where you left off."
              : "Meet your new space to get things done. Choose a demo account to explore."}
          </p>
          {supabase ? (
            <Form onSubmit={login}>
              {signup && (
                <Field label="Full name">
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    minLength={2}
                    placeholder="Your full name"
                  />
                </Field>
              )}
              <Field label="Email address">
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  placeholder="you@company.com"
                />
              </Field>
              <Field label="Password">
                <input
                  type="password"
                  name="password"
                  autoComplete={signup ? "new-password" : "current-password"}
                  minLength={8}
                  required
                  placeholder="Enter your password"
                />
              </Field>
              {error && (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              )}
              {notice && <p className="inline-success">{notice}</p>}
              <Submit busy={busy}>
                {signup ? "Create client account" : "Sign in"}
                <ArrowRight size={17} />
              </Submit>
              <button
                type="button"
                className="text-button"
                onClick={() => setSignup(!signup)}
              >
                {signup
                  ? "Already have an account? Sign in"
                  : "New here? Create a client account"}
              </button>
            </Form>
          ) : (
            <div className="demo-logins">
              {(
                [
                  {
                    role: "client",
                    title: "Client workspace",
                    name: "Alex Morgan",
                    description: "Bring your next project to life",
                    initials: "AM",
                  },
                  {
                    role: "staff",
                    title: "Virtual assistant workspace",
                    name: "Maya Bennett",
                    description: "Turn your skills into great work",
                    initials: "MB",
                  },
                  {
                    role: "admin",
                    title: "Admin workspace",
                    name: "Jordan Lee",
                    description: "Keep the bigger picture in view",
                    initials: "JL",
                  },
                ] as const
              ).map((p, i) => (
                <button
                  key={p.role}
                  className={`demo-login ${i === 0 ? "featured" : ""}`}
                  onClick={() => onLogin(enterDemo(p.role as Role))}
                >
                  <span className={`avatar avatar-${i}`}>{p.initials}</span>
                  <span>
                    <strong>{p.title}</strong>
                    <small>
                      {p.name} · {p.description}
                    </small>
                  </span>
                  <ArrowUpRight size={19} />
                </button>
              ))}
            </div>
          )}
          <div className="auth-note">
            <ShieldCheck size={17} />
            <span>
              {supabase
                ? "Your account is protected with Supabase Auth."
                : "A safe space to try things. Payments are simulated and demo data stays in this browser."}
            </span>
          </div>
        </div>
        <footer>
          <span>© {new Date().getFullYear()} Nexus VA</span>
          <span>A little more connected.</span>
        </footer>
      </div>
    </main>
  );
}
