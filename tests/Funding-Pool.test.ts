// Funding-Pool.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_PROJECT_NOT_FOUND = 101;
const ERR_INSUFFICIENT_BALANCE = 102;
const ERR_INVALID_AMOUNT = 103;
const ERR_ALREADY_INITIALIZED = 104;
const ERR_NOT_RELEASER = 105;
const ERR_EMERGENCY_LOCKED = 106;

interface Contribution {
  contributor: string;
  amount: bigint;
}

class FundingPoolMock {
  state: {
    admin: string;
    emergencyLocked: boolean;
    fundReleaser: string | null;
    projectBalances: Map<bigint, bigint>;
    contributions: Map<string, Contribution>;
  } = {
    admin: "ST1ADMIN",
    emergencyLocked: false,
    fundReleaser: null,
    projectBalances: new Map(),
    contributions: new Map(),
  };
  caller = "ST1ADMIN";
  contractBalance = 0n;
  stxTransfers: Array<{ amount: bigint; from: string; to: string }> = [];

  reset() {
    this.state = {
      admin: "ST1ADMIN",
      emergencyLocked: false,
      fundReleaser: null,
      projectBalances: new Map(),
      contributions: new Map(),
    };
    this.caller = "ST1ADMIN";
    this.contractBalance = 0n;
    this.stxTransfers = [];
  }

  initializeProject(
    projectId: bigint,
    targetAmount: bigint
  ): { ok: boolean; value: boolean } {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    if (this.state.projectBalances.has(projectId))
      return { ok: false, value: false };
    if (targetAmount === 0n) return { ok: false, value: false };
    this.state.projectBalances.set(projectId, 0n);
    return { ok: true, value: true };
  }

  contribute(
    projectId: bigint,
    amount: bigint
  ): { ok: boolean; value: bigint } | { ok: false; value: number } {
    if (amount === 0n) return { ok: false, value: ERR_INVALID_AMOUNT };
    if (this.state.emergencyLocked)
      return { ok: false, value: ERR_EMERGENCY_LOCKED };
    if (!this.state.projectBalances.has(projectId))
      return { ok: false, value: ERR_PROJECT_NOT_FOUND };
    const key = `${projectId}-${this.caller}`;
    const currentContrib = this.state.contributions.get(key)?.amount ?? 0n;
    const currentBalance = this.state.projectBalances.get(projectId) ?? 0n;
    this.contractBalance += amount;
    this.stxTransfers.push({ amount, from: this.caller, to: "contract" });
    this.state.projectBalances.set(projectId, currentBalance + amount);
    this.state.contributions.set(key, {
      contributor: this.caller,
      amount: currentContrib + amount,
    });
    return { ok: true, value: amount };
  }

  requestWithdrawal(
    projectId: bigint,
    amount: bigint,
    recipient: string
  ): { ok: boolean; value: boolean } | { ok: false; value: number } {
    if (!this.state.fundReleaser) return { ok: false, value: ERR_NOT_RELEASER };
    if (this.caller !== this.state.fundReleaser)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    const balance = this.state.projectBalances.get(projectId) ?? 0n;
    if (balance < amount) return { ok: false, value: ERR_INSUFFICIENT_BALANCE };
    if (amount === 0n) return { ok: false, value: ERR_INVALID_AMOUNT };
    this.state.projectBalances.set(projectId, balance - amount);
    this.contractBalance -= amount;
    this.stxTransfers.push({ amount, from: "contract", to: recipient });
    return { ok: true, value: true };
  }

  setFundReleaser(releaser: string): { ok: boolean; value: boolean } {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    this.state.fundReleaser = releaser;
    return { ok: true, value: true };
  }

  toggleEmergencyLock(): { ok: boolean; value: boolean } {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    this.state.emergencyLocked = !this.state.emergencyLocked;
    return { ok: true, value: this.state.emergencyLocked };
  }

  getProjectBalance(projectId: bigint): bigint {
    return this.state.projectBalances.get(projectId) ?? 0n;
  }

  getContribution(projectId: bigint, contributor: string): bigint {
    return (
      this.state.contributions.get(`${projectId}-${contributor}`)?.amount ?? 0n
    );
  }
}

describe("FundingPool", () => {
  let contract: FundingPoolMock;

  beforeEach(() => {
    contract = new FundingPoolMock();
    contract.reset();
  });

  it("initializes project successfully", () => {
    const result = contract.initializeProject(1n, 1000000n);
    expect(result.ok).toBe(true);
    expect(contract.getProjectBalance(1n)).toBe(0n);
  });

  it("accepts contributions", () => {
    contract.initializeProject(1n, 1000000n);
    contract.caller = "ST2DONOR";
    const result = contract.contribute(1n, 500000n);
    expect(result.ok).toBe(true);
    expect((result as any).value).toBe(500000n);
    expect(contract.getProjectBalance(1n)).toBe(500000n);
    expect(contract.getContribution(1n, "ST2DONOR")).toBe(500000n);
  });

  it("blocks contribution when emergency locked", () => {
    contract.initializeProject(1n, 1000000n);
    contract.toggleEmergencyLock();
    contract.caller = "ST2DONOR";
    const result = contract.contribute(1n, 500000n);
    expect(result.ok).toBe(false);
    expect((result as any).value).toBe(ERR_EMERGENCY_LOCKED);
  });

  it("allows releaser to withdraw", () => {
    contract.initializeProject(1n, 1000000n);
    contract.caller = "ST2DONOR";
    contract.contribute(1n, 500000n);
    contract.caller = "ST1ADMIN";
    contract.setFundReleaser("ST3RELEASER");
    contract.caller = "ST3RELEASER";
    const result = contract.requestWithdrawal(1n, 300000n, "ST4RECIPIENT");
    expect(result.ok).toBe(true);
    expect(contract.getProjectBalance(1n)).toBe(200000n);
  });

  it("tracks multiple contributions", () => {
    contract.initializeProject(1n, 1000000n);
    contract.caller = "ST2DONOR";
    contract.contribute(1n, 200000n);
    contract.caller = "ST3DONOR";
    contract.contribute(1n, 300000n);
    expect(contract.getProjectBalance(1n)).toBe(500000n);
    expect(contract.getContribution(1n, "ST2DONOR")).toBe(200000n);
    expect(contract.getContribution(1n, "ST3DONOR")).toBe(300000n);
  });
});
