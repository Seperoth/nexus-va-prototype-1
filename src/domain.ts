import { categories, difficulties, paymentSummary } from "./types";
import type { Command, Profile, Ticket, Workspace } from "./types";

export const uid = () => crypto.randomUUID();
export function applyCommand(
  previous: Workspace,
  actorId: string,
  command: Command,
): Workspace {
  const s = structuredClone(previous);
  const actor = s.profiles.find((p) => p.id === actorId);
  if (!actor || actor.status !== "Active")
    throw new Error("An active account is required.");
  const now = new Date().toISOString();
  const notify = (userId: string, text: string) =>
    s.notifications.unshift({
      id: uid(),
      userId,
      text,
      createdAt: now,
      read: false,
    });
  const log = (text: string, ticketId: string | null = null) =>
    s.audit.unshift({ id: uid(), actorId, ticketId, text, createdAt: now });
  const ticket = (id: string) => {
    const t = s.tickets.find((t) => t.id === id);
    if (!t) throw new Error("Ticket not found.");
    return t;
  };
  const participant = (t: Ticket) =>
    actor.role === "admin" ||
    t.clientId === actor.id ||
    t.assigneeId === actor.id;
  const staff = (t: Ticket) =>
    actor.role === "admin" ||
    (actor.role === "staff" && t.assigneeId === actor.id);
  const systemMessage = (t: Ticket, text: string) =>
    s.messages.push({
      id: uid(),
      ticketId: t.id,
      senderId: actor.id,
      text,
      createdAt: now,
      system: true,
    });
  const assign = (t: Ticket, p: Profile) => {
    t.assigneeId = p.id;
    t.status = "In progress";
    notify(p.id, `You’ve been assigned to ${t.title}.`);
    notify(t.clientId, `${p.name} is now working on ${t.title}.`);
    systemMessage(t, `${p.name} joined the conversation.`);
  };
  switch (command.type) {
    case "createTicket": {
      if (actor.role !== "client")
        throw new Error("Only clients can create requests.");
      if (
        command.title.trim().length < 5 ||
        command.description.trim().length < 15
      )
        throw new Error(
          "Add a title of at least 5 characters and a description of at least 15 characters.",
        );
      if (
        !Number.isFinite(command.budget) ||
        command.budget <= 0 ||
        command.budget > 1000000
      )
        throw new Error("Enter a valid budget between $1 and $1,000,000.");
      if (
        !categories.includes(command.category) ||
        !difficulties.includes(command.difficulty)
      )
        throw new Error("Select a valid service and difficulty.");
      if (
        !command.dueDate ||
        command.dueDate < new Date().toLocaleDateString("en-CA")
      )
        throw new Error("Choose today or a future due date.");
      const t: Ticket = {
        id: uid(),
        number: Math.max(1000, ...s.tickets.map((t) => t.number)) + 1,
        clientId: actor.id,
        assigneeId: null,
        title: command.title.trim(),
        description: command.description.trim(),
        category: command.category,
        budget: command.budget,
        difficulty: command.difficulty,
        dueDate: command.dueDate,
        createdAt: now,
        status: "Open",
        deliveredAt: null,
        rating: null,
        feedback: "",
      };
      s.tickets.unshift(t);
      s.payments.unshift({
        id: uid(),
        ticketId: t.id,
        amount: t.budget,
        description: `Initial service budget — ${t.title}`,
        status: "Pending",
        createdAt: now,
        paidAt: null,
      });
      log("Created a service request", t.id);
      s.profiles
        .filter((p) => p.role === "staff" || p.role === "admin")
        .forEach((p) => notify(p.id, `New request: ${t.title}.`));
      break;
    }
    case "acceptTicket": {
      const t = ticket(command.ticketId);
      if (actor.role !== "staff" || t.assigneeId || t.status !== "Open")
        throw new Error("This request is no longer available.");
      if (
        !actor.available ||
        !actor.skills.includes(t.category) ||
        difficulties.indexOf(actor.skillLevel) <
          difficulties.indexOf(t.difficulty)
      )
        throw new Error(
          "Your availability, service skills, and skill level must match this request.",
        );
      assign(t, actor);
      log("Accepted the service request", t.id);
      break;
    }
    case "assignTicket": {
      if (actor.role !== "admin") throw new Error("Admin access required.");
      const t = ticket(command.ticketId);
      const p = s.profiles.find(
        (p) =>
          p.id === command.staffId &&
          p.role === "staff" &&
          p.status === "Active",
      );
      if (!p || t.status === "Completed" || t.deliveredAt)
        throw new Error(
          "Choose an active assistant for an unfinished request.",
        );
      assign(t, p);
      log(`Assigned ${p.name}`, t.id);
      break;
    }
    case "sendMessage": {
      const t = ticket(command.ticketId);
      if (!participant(t) || !t.assigneeId || t.status === "Completed")
        throw new Error("Messages require an assigned, open request.");
      if (!command.text.trim() || command.text.length > 5000)
        throw new Error("Messages must be between 1 and 5,000 characters.");
      s.messages.push({
        id: uid(),
        ticketId: t.id,
        senderId: actor.id,
        text: command.text.trim(),
        createdAt: now,
        system: false,
      });
      notify(
        actor.id === t.clientId ? t.assigneeId : t.clientId,
        `New message on ${t.title}.`,
      );
      break;
    }
    case "createPayment": {
      const t = ticket(command.ticketId);
      if (!staff(t) || !t.assigneeId || t.status === "Completed")
        throw new Error(
          "Only the assigned assistant or admin can request payment.",
        );
      if (
        !Number.isFinite(command.amount) ||
        command.amount <= 0 ||
        command.amount > 1000000 ||
        !command.description.trim()
      )
        throw new Error("Enter a valid amount and payment description.");
      if (s.payments.some((p) => p.ticketId === t.id && p.status !== "Paid"))
        throw new Error(
          "This request already has a payment awaiting completion.",
        );
      s.payments.unshift({
        id: uid(),
        ticketId: t.id,
        amount: command.amount,
        description: command.description.trim(),
        status: "Pending",
        createdAt: now,
        paidAt: null,
      });
      systemMessage(
        t,
        `Payment requested: $${command.amount} — ${command.description.trim()}.`,
      );
      notify(t.clientId, `A payment is ready for ${t.title}.`);
      log("Created payment tracking", t.id);
      break;
    }
    case "verifyPayment": {
      const p = s.payments.find((p) => p.id === command.paymentId);
      if (!p) throw new Error("Payment not found.");
      const t = ticket(p.ticketId);
      if (!staff(t) || p.status !== "Pending")
        throw new Error("Only staff can verify a pending payment request.");
      p.status = "Verified";
      notify(t.clientId, `Payment verified and ready to pay: ${t.title}.`);
      log("Verified payment request", t.id);
      break;
    }
    case "pay": {
      const p = s.payments.find((p) => p.id === command.paymentId);
      if (!p) throw new Error("Payment not found.");
      const t = ticket(p.ticketId);
      if (
        actor.id !== t.clientId ||
        p.status === "Paid" ||
        t.status === "Completed"
      )
        throw new Error("Only the client can pay an outstanding request.");
      p.status = "Paid";
      p.paidAt = now;
      notify(t.clientId, `Test payment confirmed: ${t.title}.`);
      if (t.assigneeId)
        notify(t.assigneeId, `Payment received for ${t.title}.`);
      if (!t.assigneeId) {
        const p = s.profiles
          .filter(
            (p) =>
              p.role === "staff" &&
              p.status === "Active" &&
              p.available &&
              p.autoAssign &&
              p.skills.includes(t.category) &&
              difficulties.indexOf(p.skillLevel) >=
                difficulties.indexOf(t.difficulty),
          )
          .sort(
            (a, b) =>
              s.tickets.filter(
                (t) => t.assigneeId === a.id && t.status !== "Completed",
              ).length -
              s.tickets.filter(
                (t) => t.assigneeId === b.id && t.status !== "Completed",
              ).length,
          )[0];
        if (p) assign(t, p);
      }
      systemMessage(t, "Test payment confirmed. No real money was charged.");
      log("Completed a simulated payment", t.id);
      break;
    }
    case "deliver": {
      const t = ticket(command.ticketId);
      if (!staff(t) || t.status === "Completed")
        throw new Error("Only the assigned assistant can deliver this work.");
      if (paymentSummary(s, t.id) !== "Paid")
        throw new Error("All payment requests must be paid before delivery.");
      if (!s.documents.some((d) => d.ticketId === t.id && d.isOutput))
        throw new Error(
          "Upload an output file before marking the work delivered.",
        );
      t.status = "In review";
      t.deliveredAt = now;
      systemMessage(t, "Your finished work is ready to review.");
      notify(t.clientId, `${t.title} is ready for your review.`);
      log("Delivered the output", t.id);
      break;
    }
    case "closeTicket": {
      const t = ticket(command.ticketId);
      if (
        t.clientId !== actor.id ||
        t.status !== "In review" ||
        !t.deliveredAt ||
        paymentSummary(s, t.id) !== "Paid"
      )
        throw new Error("Only the client can close delivered, paid work.");
      if (
        !Number.isInteger(command.rating) ||
        command.rating < 1 ||
        command.rating > 5
      )
        throw new Error("Choose a rating from 1 to 5 stars.");
      t.status = "Completed";
      t.rating = command.rating;
      t.feedback = command.feedback.trim();
      systemMessage(
        t,
        `Request completed with a ${command.rating}-star rating.`,
      );
      if (t.assigneeId)
        notify(
          t.assigneeId,
          `${actor.name} rated your work ${command.rating}/5.`,
        );
      log("Closed the ticket and left feedback", t.id);
      break;
    }
    case "saveProfile": {
      if (
        command.name.trim().length < 2 ||
        !difficulties.includes(command.skillLevel) ||
        command.skills.some((c) => !categories.includes(c))
      )
        throw new Error("Enter a valid name and service preferences.");
      Object.assign(actor, {
        name: command.name.trim(),
        company: command.company.trim(),
        bio: command.bio.trim(),
      });
      if (actor.role === "staff")
        Object.assign(actor, {
          available: command.available,
          autoAssign: command.autoAssign,
          skillLevel: command.skillLevel,
          skills: command.skills,
        });
      log("Updated profile information");
      break;
    }
    case "createAppointment": {
      if (actor.role !== "client")
        throw new Error("Only clients can book appointments.");
      const p = s.profiles.find(
        (p) =>
          p.id === command.staffId &&
          p.role === "staff" &&
          p.status === "Active" &&
          p.available,
      );
      const start = new Date(command.start),
        end = new Date(command.end);
      if (
        !p ||
        !command.title.trim() ||
        !Number.isFinite(+start) ||
        !Number.isFinite(+end) ||
        start < new Date() ||
        end <= start ||
        +end - +start > 4 * 3600000
      )
        throw new Error(
          "Choose an available assistant and a future appointment lasting up to four hours.",
        );
      if (
        s.appointments.some(
          (a) =>
            (a.staffId === p.id || a.clientId === actor.id) &&
            command.start < a.end &&
            command.end > a.start,
        )
      )
        throw new Error(
          "This time overlaps an existing appointment. Please choose another time.",
        );
      s.appointments.push({
        id: uid(),
        clientId: actor.id,
        staffId: p.id,
        title: command.title.trim(),
        start: start.toISOString(),
        end: end.toISOString(),
        notes: command.notes.trim(),
      });
      notify(p.id, `New appointment: ${command.title}.`);
      log("Scheduled an appointment");
      break;
    }
    case "cancelAppointment": {
      const a = s.appointments.find((a) => a.id === command.appointmentId);
      if (
        !a ||
        (actor.id !== a.clientId &&
          actor.id !== a.staffId &&
          actor.role !== "admin")
      )
        throw new Error("Appointment not found.");
      s.appointments = s.appointments.filter((row) => row.id !== a.id);
      notify(
        actor.id === a.clientId ? a.staffId : a.clientId,
        `Appointment cancelled: ${a.title}.`,
      );
      log("Cancelled an appointment");
      break;
    }
    case "addDocument": {
      const d = command.document;
      if (d.ownerId !== actor.id || d.size > 10 * 1024 * 1024 || d.size <= 0)
        throw new Error("Upload a nonempty file up to 10 MB.");
      if (d.ticketId) {
        const t = ticket(d.ticketId);
        if (!participant(t) || t.status === "Completed")
          throw new Error("You cannot upload to this ticket.");
        if (d.isOutput && !staff(t))
          throw new Error(
            "Only the assigned assistant can upload output files.",
          );
      } else if (d.isOutput)
        throw new Error("Output files must be attached to a ticket.");
      s.documents.unshift({ ...d, reviewed: false, createdAt: now });
      log(`Uploaded ${d.name}`, d.ticketId);
      break;
    }
    case "reviewDocument": {
      const d = s.documents.find((d) => d.id === command.documentId);
      if (
        !d ||
        actor.role === "client" ||
        (actor.role === "staff" &&
          d.ticketId &&
          ticket(d.ticketId).assigneeId !== actor.id)
      )
        throw new Error("You cannot review this document.");
      d.reviewed = true;
      notify(d.ownerId, `${d.name} has been reviewed.`);
      log(`Reviewed ${d.name}`, d.ticketId);
      break;
    }
    case "readNotifications":
      s.notifications
        .filter((n) => n.userId === actor.id)
        .forEach((n) => (n.read = true));
      break;
    default:
      throw new Error("Unsupported action.");
  }
  return s;
}
