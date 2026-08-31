import { describe, expect, it } from "vitest";

import { serverConfig } from "@/lib/config";
import {
  decideIntake,
  isOperatorPresent,
  releaseDelayMs,
  shouldAutoRelease,
} from "@/lib/domain/policy";
import type { MessageRecord } from "@/lib/domain/types";

const NOW = Date.parse("2026-10-25T21:30:00.000Z");

function message(overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    id: "m1",
    eventId: "e1",
    body: "Grazie per la serata",
    authorName: null,
    status: "pending",
    filterVerdict: "clean",
    rejectReason: null,
    createdAt: new Date(NOW - 60_000).toISOString(),
    releasedAt: null,
    moderatedAt: null,
    moderatedBy: null,
    displayedAt: null,
    ipHash: "hash",
    sessionId: "s1",
    clientMsgId: "c1",
    ...overrides,
  };
}

describe("isOperatorPresent", () => {
  it("e' assente se nessuno ha mai aperto /admin", () => {
    expect(isOperatorPresent(null, NOW)).toBe(false);
  });

  it("e' presente subito dopo un heartbeat", () => {
    expect(isOperatorPresent(new Date(NOW - 5_000).toISOString(), NOW)).toBe(true);
  });

  it("e' assente dopo il timeout", () => {
    const stale = new Date(NOW - serverConfig.moderation.operatorTimeoutMs - 1).toISOString();
    expect(isOperatorPresent(stale, NOW)).toBe(false);
  });
});

describe("decideIntake", () => {
  it("rifiuta sempre i contenuti bloccati, in ogni modalita'", () => {
    for (const mode of ["manual", "assisted", "auto"] as const) {
      for (const operatorPresent of [true, false]) {
        expect(decideIntake({ mode, verdict: "blocked", operatorPresent })).toEqual({
          status: "rejected",
          reason: "profanity",
          decidedBy: "auto",
        });
      }
    }
  });

  it("manual: niente esce senza un umano, nemmeno se pulito", () => {
    expect(decideIntake({ mode: "manual", verdict: "clean", operatorPresent: false })).toEqual({
      status: "pending",
    });
  });

  it("auto: i puliti passano, i dubbi restano in coda", () => {
    expect(decideIntake({ mode: "auto", verdict: "clean", operatorPresent: false })).toEqual({
      status: "approved",
      decidedBy: "auto",
    });
    expect(decideIntake({ mode: "auto", verdict: "suspect", operatorPresent: false })).toEqual({
      status: "pending",
    });
  });

  describe("assisted (default)", () => {
    it("con operatore presente si comporta come manual", () => {
      expect(decideIntake({ mode: "assisted", verdict: "clean", operatorPresent: true })).toEqual({
        status: "pending",
      });
    });

    it("senza operatore libera i puliti: lo schermo non resta mai nero", () => {
      expect(decideIntake({ mode: "assisted", verdict: "clean", operatorPresent: false })).toEqual({
        status: "approved",
        decidedBy: "auto",
      });
    });

    it("senza operatore i dubbi restano fermi: nessuno li ha guardati", () => {
      expect(
        decideIntake({ mode: "assisted", verdict: "suspect", operatorPresent: false }),
      ).toEqual({ status: "pending" });
    });
  });
});

describe("shouldAutoRelease (dead-man switch)", () => {
  const old = new Date(NOW - serverConfig.moderation.autoReleaseDelayMs - 1000).toISOString();

  it("libera i pending puliti quando l'operatore e' sparito a meta' concerto", () => {
    expect(shouldAutoRelease(message({ createdAt: old }), "assisted", false, NOW)).toBe(true);
  });

  it("non libera niente finche' l'operatore e' li'", () => {
    expect(shouldAutoRelease(message({ createdAt: old }), "assisted", true, NOW)).toBe(false);
  });

  it("non libera mai i sospetti: nessun umano li ha valutati", () => {
    expect(
      shouldAutoRelease(message({ createdAt: old, filterVerdict: "suspect" }), "assisted", false, NOW),
    ).toBe(false);
  });

  it("non libera nulla in modalita' manual: e' esattamente cio' che promette", () => {
    expect(shouldAutoRelease(message({ createdAt: old }), "manual", false, NOW)).toBe(false);
  });

  it("aspetta il ritardo prima di liberare", () => {
    const fresh = new Date(NOW - 1000).toISOString();
    expect(shouldAutoRelease(message({ createdAt: fresh }), "assisted", false, NOW)).toBe(false);
  });

  it("ignora i messaggi gia' decisi", () => {
    expect(
      shouldAutoRelease(message({ createdAt: old, status: "approved" }), "assisted", false, NOW),
    ).toBe(false);
  });
});

describe("releaseDelayMs", () => {
  it("mette una finestra di sicurezza solo dietro alle decisioni automatiche", () => {
    expect(releaseDelayMs("auto")).toBe(serverConfig.moderation.displayDelayMs);
  });

  it("non ritarda una decisione umana: la valutazione e' gia' avvenuta", () => {
    expect(releaseDelayMs("operator")).toBe(0);
  });
});
