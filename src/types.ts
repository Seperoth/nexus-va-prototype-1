export type Role = "client" | "staff" | "admin";
export type Difficulty = "Easy" | "Medium" | "Hard";
export type TicketStatus = "Open" | "In progress" | "In review" | "Completed";
export type PaymentStatus = "Pending" | "Verified" | "Paid";
export interface Profile {
  id: string;
  name: string;
  email: string;
  role: Role;
  company: string;
  bio: string;
  status: string;
  available: boolean;
  autoAssign: boolean;
  skillLevel: Difficulty;
  skills: string[];
}
export interface Ticket {
  id: string;
  number: number;
  clientId: string;
  assigneeId: string | null;
  title: string;
  description: string;
  category: string;
  budget: number;
  difficulty: Difficulty;
  status: TicketStatus;
  dueDate: string;
  createdAt: string;
  deliveredAt: string | null;
  rating: number | null;
  feedback: string;
}
export interface Message {
  id: string;
  ticketId: string;
  senderId: string;
  text: string;
  createdAt: string;
  system: boolean;
}
export interface Payment {
  id: string;
  ticketId: string;
  amount: number;
  description: string;
  status: PaymentStatus;
  createdAt: string;
  paidAt: string | null;
}
export interface Appointment {
  id: string;
  clientId: string;
  staffId: string;
  title: string;
  start: string;
  end: string;
  notes: string;
}
export interface Document {
  id: string;
  ownerId: string;
  ticketId: string | null;
  name: string;
  size: number;
  type: string;
  path: string;
  createdAt: string;
  reviewed: boolean;
  isOutput: boolean;
}
export interface Notification {
  id: string;
  userId: string;
  text: string;
  createdAt: string;
  read: boolean;
}
export interface Audit {
  id: string;
  actorId: string;
  ticketId: string | null;
  text: string;
  createdAt: string;
}
export interface Workspace {
  profiles: Profile[];
  tickets: Ticket[];
  messages: Message[];
  payments: Payment[];
  appointments: Appointment[];
  documents: Document[];
  notifications: Notification[];
  audit: Audit[];
}
export type Command =
  | {
      type: "createTicket";
      title: string;
      description: string;
      category: string;
      budget: number;
      difficulty: Difficulty;
      dueDate: string;
    }
  | { type: "acceptTicket"; ticketId: string }
  | { type: "assignTicket"; ticketId: string; staffId: string }
  | { type: "sendMessage"; ticketId: string; text: string }
  | {
      type: "createPayment";
      ticketId: string;
      amount: number;
      description: string;
    }
  | { type: "verifyPayment"; paymentId: string }
  | { type: "pay"; paymentId: string }
  | { type: "deliver"; ticketId: string }
  | { type: "closeTicket"; ticketId: string; rating: number; feedback: string }
  | {
      type: "saveProfile";
      name: string;
      company: string;
      bio: string;
      available: boolean;
      autoAssign: boolean;
      skillLevel: Difficulty;
      skills: string[];
    }
  | {
      type: "createAppointment";
      title: string;
      staffId: string;
      start: string;
      end: string;
      notes: string;
    }
  | { type: "cancelAppointment"; appointmentId: string }
  | { type: "addDocument"; document: Document }
  | { type: "reviewDocument"; documentId: string }
  | { type: "readNotifications" };
export const categories = [
  "Administrative support",
  "Content & marketing",
  "Design & creative",
  "Customer support",
  "Research & data",
  "Web & technology",
];
export const difficulties: Difficulty[] = ["Easy", "Medium", "Hard"];
export const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
export const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
export function paymentSummary(state: Workspace, ticketId: string) {
  const rows = state.payments.filter((p) => p.ticketId === ticketId);
  return rows.length && rows.every((p) => p.status === "Paid")
    ? "Paid"
    : rows.some((p) => p.status === "Verified")
      ? "Verified"
      : "Pending";
}
