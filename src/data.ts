import { createClient } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";
import type { Command, Document, Profile, Role, Workspace } from "./types";
import { applyCommand, uid } from "./domain";
import { createSeed, demoIds } from "./seed";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key) : null;
export const mode = supabase ? "supabase" : "demo";
const DATA_KEY = "nexus-va-prototype-v1";
const SESSION_KEY = "nexus-va-session-v1";
export interface Identity {
  id: string;
  role: Role;
}
export const getDemoIdentity = (): Identity | null => {
  try {
    const data = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    return data && Object.values(demoIds).includes(data.id) ? data : null;
  } catch {
    return null;
  }
};
export const enterDemo = (role: Role) => {
  const identity = { id: demoIds[role], role };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(identity));
  return identity;
};
export async function logout() {
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } else sessionStorage.removeItem(SESSION_KEY);
}
export async function loadWorkspace(): Promise<Workspace> {
  if (!supabase) {
    const raw = localStorage.getItem(DATA_KEY);
    if (raw) return JSON.parse(raw);
    const seed = createSeed();
    localStorage.setItem(DATA_KEY, JSON.stringify(seed));
    return seed;
  }
  const names = [
    "profiles",
    "tickets",
    "messages",
    "payments",
    "appointments",
    "documents",
    "notifications",
    "audit",
  ] as const;
  const results = await Promise.all(
    names.map((n) => supabase!.from(n).select("*")),
  );
  const state = {} as Workspace;
  results.forEach((r, i) => {
    if (r.error) throw r.error;
    Object.assign(state, { [names[i]]: r.data });
  });
  state.messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  state.tickets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  state.notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  state.audit.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return state;
}
export async function runCommand(actorId: string, command: Command) {
  if (supabase) {
    const { error } = await supabase.rpc("workspace_command", { command });
    if (error) throw new Error(error.message);
  } else {
    const mutate = async () => {
      const state = applyCommand(await loadWorkspace(), actorId, command);
      localStorage.setItem(DATA_KEY, JSON.stringify(state));
    };
    if (navigator.locks) await navigator.locks.request(DATA_KEY, mutate);
    else await mutate();
    window.dispatchEvent(new Event("nexus-change"));
  }
  return loadWorkspace();
}
export async function identityFromSession(
  session: Session | null,
): Promise<Identity | null> {
  if (!session || !supabase) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id,role")
    .eq("id", session.user.id)
    .single();
  if (error)
    throw new Error(
      "Your account profile could not be loaded. Check that the Supabase migration is applied.",
    );
  return data as Identity;
}
export function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("nexus-change", onChange);
  const interval = supabase ? window.setInterval(onChange, 15000) : null;
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("nexus-change", onChange);
    if (interval) clearInterval(interval);
  };
}
async function blobDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("nexus-va-files", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function saveBlob(id: string, file: Blob) {
  const db = await blobDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put(file, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
async function readBlob(id: string) {
  const db = await blobDb();
  try {
    return await new Promise<Blob>((resolve, reject) => {
      const r = db.transaction("files").objectStore("files").get(id);
      r.onsuccess = () =>
        r.result
          ? resolve(r.result)
          : reject(new Error("The file is no longer stored in this browser."));
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export async function uploadFile(
  file: File,
  actor: Profile,
  ticketId: string | null,
  isOutput: boolean,
) {
  if (!file.size || file.size > 10 * 1024 * 1024)
    throw new Error("Please select a nonempty file smaller than 10 MB.");
  if (/\.(html?|svg|js|exe|bat|cmd|ps1)$/i.test(file.name))
    throw new Error(
      "Please upload a document, image, archive, or other work file. Executable and active web files are not supported.",
    );
  const id = uid();
  const path = `${actor.id}/${id}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  if (supabase) {
    const { error } = await supabase.storage
      .from("documents")
      .upload(path, file, { upsert: false });
    if (error) throw error;
  } else await saveBlob(path, file);
  const document: Document = {
    id,
    ownerId: actor.id,
    ticketId,
    name: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
    path,
    createdAt: new Date().toISOString(),
    reviewed: false,
    isOutput,
  };
  try {
    return await runCommand(actor.id, { type: "addDocument", document });
  } catch (error) {
    if (supabase) await supabase.storage.from("documents").remove([path]);
    throw error;
  }
}
export async function downloadFile(document: Document) {
  let blob: Blob;
  if (supabase) {
    const { data, error } = await supabase.storage
      .from("documents")
      .download(document.path);
    if (error) throw error;
    blob = data;
  } else if (document.path.startsWith("seed-"))
    blob = new Blob(
      [
        document.path === "seed-content"
          ? "STUDIO NORTH — SOCIAL MEDIA CONTENT PACK\n\nPrepared by Maya Bennett\n\nWeek 1: Meet the new collection. Thoughtful objects for everyday living.\nWeek 2: A closer look at our process. Designed with care, made to last.\nWeek 3: Your stories, our inspiration. Share your Studio North moments.\nWeek 4: The next chapter starts here. Explore the November launch.\n\nPosting schedule: Monday, Wednesday, Friday at 10:00 AM.\nDeliverables: 12 post concepts with captions and recommended visual direction.\n\nThis is a sample prototype output."
          : "STUDIO NORTH — BRAND DIRECTION\n\nPurpose: Thoughtful design for everyday living.\nVoice: Calm, warm, confident, and a little playful.\nPalette: Warm neutrals, forest green, and soft lavender.\nTypography: Clear sans serif with generous spacing.\n\nThis is a sample prototype document.",
      ],
      { type: "text/plain" },
    );
  else blob = await readBlob(document.path);
  const href = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = href;
  anchor.download = document.name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
