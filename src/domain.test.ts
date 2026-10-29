import { beforeEach, describe, expect, it } from "vitest";
import { applyCommand } from "./domain";
import { createSeed, demoIds } from "./seed";
import { categories } from "./types";
import type { Command, Workspace } from "./types";
let s: Workspace;
const act = (who: keyof typeof demoIds, c: Command) => {
  s = applyCommand(s, demoIds[who], c);
};
const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA");
};
const create = () => {
  act("client", {
    type: "createTicket",
    title: "Build a client onboarding guide",
    description:
      "Create a clear guide for our team to help new clients get started.",
    category: categories[1],
    budget: 125,
    difficulty: "Medium",
    dueDate: tomorrow(),
  });
  return s.tickets[0];
};
beforeEach(() => {
  s = createSeed();
});
describe("A complete service journey", () => {
  it("creates, matches after payment, chats, delivers, and closes with a client rating", () => {
    const t = create();
    const p = s.payments.find((p) => p.ticketId === t.id)!;
    expect(t.assigneeId).toBeNull();
    expect(p.status).toBe("Pending");
    act("client", { type: "pay", paymentId: p.id });
    expect(s.tickets[0].assigneeId).toBe(demoIds.staff);
    act("staff", {
      type: "sendMessage",
      ticketId: t.id,
      text: "I’ll prepare the guide this afternoon.",
    });
    act("staff", {
      type: "addDocument",
      document: {
        id: crypto.randomUUID(),
        ownerId: demoIds.staff,
        ticketId: t.id,
        name: "onboarding.txt",
        size: 100,
        type: "text/plain",
        path: "test/output.txt",
        createdAt: "",
        reviewed: false,
        isOutput: true,
      },
    });
    act("staff", { type: "deliver", ticketId: t.id });
    expect(s.tickets[0].status).toBe("In review");
    act("client", {
      type: "closeTicket",
      ticketId: t.id,
      rating: 5,
      feedback: "Clear, helpful, and right on time.",
    });
    expect(s.tickets[0].status).toBe("Completed");
    expect(s.tickets[0].rating).toBe(5);
    expect(
      s.notifications.some(
        (n) => n.userId === demoIds.staff && n.text.includes("5/5"),
      ),
    ).toBe(true);
    expect(s.audit[0].text).toContain("Closed");
  });
  it("supports manual acceptance, staff verification and additional negotiated payments", () => {
    const t = create();
    act("staff", { type: "acceptTicket", ticketId: t.id });
    const p = s.payments.find((p) => p.ticketId === t.id)!;
    act("staff", { type: "verifyPayment", paymentId: p.id });
    expect(s.payments[0].status).toBe("Verified");
    act("client", { type: "pay", paymentId: p.id });
    act("staff", {
      type: "createPayment",
      ticketId: t.id,
      amount: 50,
      description: "Agreed additional scope",
    });
    expect(s.payments[0].amount).toBe(50);
    expect(s.payments[0].status).toBe("Pending");
  });
});
describe("Authorization and workflow guards", () => {
  it("prevents clients from accepting tickets or issuing payment requests", () => {
    const t = create();
    expect(() =>
      act("client", { type: "acceptTicket", ticketId: t.id }),
    ).toThrow();
    expect(() =>
      act("client", {
        type: "createPayment",
        ticketId: t.id,
        amount: 20,
        description: "Invalid",
      }),
    ).toThrow();
  });
  it("rejects payment by an assistant, repeated payment and unauthorized delivery", () => {
    const t = create();
    const p = s.payments.find((p) => p.ticketId === t.id)!;
    expect(() => act("staff", { type: "pay", paymentId: p.id })).toThrow();
    act("client", { type: "pay", paymentId: p.id });
    expect(() => act("client", { type: "pay", paymentId: p.id })).toThrow();
    expect(() =>
      act("secondStaff", { type: "deliver", ticketId: t.id }),
    ).toThrow();
  });
  it("requires both complete payment and actual output before delivery", () => {
    const t = create();
    act("staff", { type: "acceptTicket", ticketId: t.id });
    expect(() => act("staff", { type: "deliver", ticketId: t.id })).toThrow(
      "paid",
    );
    act("client", {
      type: "pay",
      paymentId: s.payments.find((p) => p.ticketId === t.id)!.id,
    });
    expect(() => act("staff", { type: "deliver", ticketId: t.id })).toThrow(
      "Upload",
    );
  });
  it("does not assign when the assistant is unavailable, opted out, under-skilled, or lacks the service skill", () => {
    for (const change of [
      { available: false },
      { autoAssign: false },
      { skillLevel: "Easy" as const },
      { skills: [] },
    ]) {
      s = createSeed();
      Object.assign(
        s.profiles.find((p) => p.id === demoIds.staff)!,
        change,
      );
      const t = create();
      act("client", {
        type: "pay",
        paymentId: s.payments.find((p) => p.ticketId === t.id)!.id,
      });
      expect(s.tickets[0].assigneeId).toBeNull();
    }
  });
  it("prevents unrelated assistants from reading through mutations", () => {
    const t = create();
    act("staff", { type: "acceptTicket", ticketId: t.id });
    expect(() =>
      act("secondStaff", {
        type: "sendMessage",
        ticketId: t.id,
        text: "Unauthorized",
      }),
    ).toThrow();
    expect(() =>
      act("secondStaff", {
        type: "createPayment",
        ticketId: t.id,
        amount: 99,
        description: "Unauthorized",
      }),
    ).toThrow();
  });
  it("requires delivery and a valid rating before the client can close a ticket", () => {
    const t = create();
    expect(() =>
      act("client", {
        type: "closeTicket",
        ticketId: t.id,
        rating: 5,
        feedback: "",
      }),
    ).toThrow();
    const review = s.tickets.find((t) => t.status === "In review")!;
    expect(() =>
      act("client", {
        type: "closeTicket",
        ticketId: review.id,
        rating: 0,
        feedback: "",
      }),
    ).toThrow("1 to 5");
    expect(() =>
      act("staff", {
        type: "closeTicket",
        ticketId: review.id,
        rating: 5,
        feedback: "",
      }),
    ).toThrow();
  });
  it("blocks new work by suspended accounts", () => {
    s.profiles.find((p) => p.id === demoIds.client)!.status = "Suspended";
    expect(() => create()).toThrow("active");
  });
});
describe("Scheduling and data validation", () => {
  it("rejects appointment overlaps, permits adjacent appointments, and enforces cancellation ownership", () => {
    const a = s.appointments[0];
    expect(() =>
      act("client", {
        type: "createAppointment",
        title: "Overlap",
        staffId: a.staffId,
        start: a.start,
        end: a.end,
        notes: "",
      }),
    ).toThrow("overlaps");
    act("client", {
      type: "createAppointment",
      title: "Adjacent call",
      staffId: a.staffId,
      start: a.end,
      end: new Date(+new Date(a.end) + 1800000).toISOString(),
      notes: "",
    });
    const booked = s.appointments.at(-1)!;
    expect(() =>
      act("secondStaff", {
        type: "cancelAppointment",
        appointmentId: booked.id,
      }),
    ).toThrow();
    act("client", { type: "cancelAppointment", appointmentId: booked.id });
    expect(s.appointments.find((a) => a.id === booked.id)).toBeUndefined();
  });
  it("rejects invalid budgets and prevents duplicate outstanding payment requests", () => {
    expect(() =>
      act("client", {
        type: "createTicket",
        title: "A valid title",
        description: "This is a valid description for testing.",
        category: categories[0],
        budget: NaN,
        difficulty: "Easy",
        dueDate: tomorrow(),
      }),
    ).toThrow("budget");
    const t = create();
    act("staff", { type: "acceptTicket", ticketId: t.id });
    expect(() =>
      act("staff", {
        type: "createPayment",
        ticketId: t.id,
        amount: 100,
        description: "Duplicate",
      }),
    ).toThrow("already");
  });
  it("keeps the previous state immutable when a mutation fails", () => {
    const previous = structuredClone(s);
    expect(() =>
      act("client", { type: "acceptTicket", ticketId: s.tickets[3].id }),
    ).toThrow();
    expect(s).toEqual(previous);
  });
});
