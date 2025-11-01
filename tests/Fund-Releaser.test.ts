// Fund-Releaser.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Cl } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_PROJECT_NOT_FOUND = 101;
const ERR_MILESTONE_NOT_FOUND = 102;
const ERR_MILESTONE_NOT_APPROVED = 103;
const ERR_INSUFFICIENT_FUNDS = 104;
const ERR_ALREADY_RELEASED = 105;
const ERR_INVALID_AMOUNT = 106;
const ERR_PAUSED = 107;
const ERR_INVALID_RECIPIENT = 108;
const ERR_CONTRACT_NOT_SET = 109;

interface Project {
  recipient: string;
  totalBudget: bigint;
  releasedAmount: bigint;
  milestoneCount: bigint;
  status: string;
}

interface Milestone {
  amount: bigint;
  approved: boolean;
  released: boolean;
  proofHash: Uint8Array;
}

class FundReleaserMock {
  state: {
    admin: string;
    paused: boolean;
    fundingPool: string | null;
    milestoneTracker: string | null;
    oracleVerifier: string | null;
    projects: Map<bigint, Project>;
    milestones: Map<string, Milestone>;
    projectPaused: Map<bigint, boolean>;
  } = {
    admin: "ST1ADMIN",
    paused: false,
    fundingPool: null,
    milestoneTracker: null,
    oracleVerifier: null,
    projects: new Map(),
    milestones: new Map(),
    projectPaused: new Map(),
  };
  caller = "ST1ADMIN";
  blockHeight = 100n;

  reset() {
    this.state = {
      admin: "ST1ADMIN",
      paused: false,
      fundingPool: null,
      milestoneTracker: null,
      oracleVerifier: null,
      projects: new Map(),
      milestones: new Map(),
      projectPaused: new Map(),
    };
    this.caller = "ST1ADMIN";
  }

  setContract(contractName: string, address: string): { ok: boolean; value: boolean } {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    if (!["funding-pool", "milestone-tracker", "oracle-verifier"].includes(contractName)) return { ok: false, value: false };
    if (contractName === "funding-pool") this.state.fundingPool = address;
    if (contractName === "milestone-tracker") this.state.milestoneTracker = address;
    if (contractName === "oracle-verifier") this.state.oracleVerifier = address;
    return { ok: true, value: true };
  }

  initializeProject(
    projectId: bigint,
    recipient: string,
    totalBudget: bigint,
    milestoneCount: bigint
  ): { ok: boolean; value: boolean } {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    if (recipient === this.caller) return { ok: false, value: false };
    if (totalBudget === 0n || milestoneCount === 0n) return { ok: false, value: false };
    this.state.projects.set(projectId, {
      recipient,
      totalBudget,
      releasedAmount: 0n,
      milestoneCount,
      status: "active",
    });
    return { ok: true, value: true };
  }

  addMilestone(
    projectId: bigint,
    milestoneId: bigint,
    amount: bigint,
    proofHash: Uint8Array
  ): { ok: boolean; value: boolean } {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    if (!this.state.projects.has(projectId)) return { ok: false, value: false };
    if (amount === 0n) return { ok: false, value: false };
    const key = `${projectId}-${milestoneId}`;
    if (this.state.milestones.has(key)) return { ok: false, value: false };
    this.state.milestones.set(key, { amount, approved: false, released: false, proofHash });
    return { ok: true, value: true };
  }

  approveMilestone(projectId: bigint, milestoneId: bigint): { ok: boolean; value: boolean } {
    if (this.caller !== this.state.milestoneTracker) return { ok: false, value: false };
    const key = `${projectId}-${milestoneId}`;
    const milestone = this.state.milestones.get(key);
    if (!milestone) return { ok: false, value: false };
    this.state.milestones.set(key, { ...milestone, approved: true });
    return { ok: true, value: true };
  }

  releaseFunds(projectId: bigint, milestoneId: bigint): { ok: boolean; value: bigint } | { ok: false; value: number } {
    if (this.state.paused) return { ok: false, value: ERR_PAUSED };
    if (this.state.projectPaused.get(projectId)) return { ok: false, value: ERR_PAUSED };
    const project = this.state.projects.get(projectId);
    if (!project) return { ok: false, value: ERR_PROJECT_NOT_FOUND };
    const key = `${projectId}-${milestoneId}`;
    const milestone = this.state.milestones.get(key);
    if (!milestone) return { ok: false, value: ERR_MILESTONE_NOT_FOUND };
    if (!milestone.approved) return { ok: false, value: ERR_MILESTONE_NOT_APPROVED };
    if (milestone.released) return { ok: false, value: ERR_ALREADY_RELEASED };
    if (!this.state.fundingPool || !this.state.oracleVerifier) return { ok: false, value: ERR_CONTRACT_NOT_SET };
    this.state.milestones.set(key, { ...milestone, released: true });
    this.state.projects.set(projectId, {
      ...project,
      releasedAmount: project.releasedAmount + milestone.amount,
    });
    return { ok: true, value: milestone.amount };
  }

  pauseProject(projectId: bigint): { ok: boolean; value: boolean } {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    this.state.projectPaused.set(projectId, true);
    return { ok: true, value: true };
  }

  unpauseProject(projectId: bigint): { ok: boolean; value: boolean } {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    this.state.projectPaused.delete(projectId);
    return { ok: true, value: true };
  }

  getProject(projectId: bigint): Project | null {
    return this.state.projects.get(projectId) ?? null;
  }

  getMilestone(projectId: bigint, milestoneId: bigint): Milestone | null {
    return this.state.milestones.get(`${projectId}-${milestoneId}`) ?? null;
  }
}

describe("FundReleaser", () => {
  let contract: FundReleaserMock;

  beforeEach(() => {
    contract = new FundReleaserMock();
    contract.reset();
  });

  it("initializes project successfully", () => {
    const result = contract.initializeProject(1n, "ST2RECIPIENT", 1000000n, 3n);
    expect(result.ok).toBe(true);
    const project = contract.getProject(1n);
    expect(project?.recipient).toBe("ST2RECIPIENT");
    expect(project?.totalBudget).toBe(1000000n);
    expect(project?.milestoneCount).toBe(3n);
  });

  it("rejects initialize by non-admin", () => {
    contract.caller = "ST3HACKER";
    const result = contract.initializeProject(1n, "ST2RECIPIENT", 1000000n, 3n);
    expect(result.ok).toBe(false);
  });

  it("adds milestone correctly", () => {
    contract.initializeProject(1n, "ST2RECIPIENT", 1000000n, 3n);
    const hash = new Uint8Array(32).fill(1);
    const result = contract.addMilestone(1n, 0n, 300000n, hash);
    expect(result.ok).toBe(true);
    const milestone = contract.getMilestone(1n, 0n);
    expect(milestone?.amount).toBe(300000n);
    expect(milestone?.approved).toBe(false);
  });

  it("releases funds after approval", () => {
    contract.initializeProject(1n, "ST2RECIPIENT", 1000000n, 3n);
    contract.setContract("funding-pool", "ST5POOL");
    contract.setContract("oracle-verifier", "ST6ORACLE");
    contract.setContract("milestone-tracker", "ST4TRACKER");
    const hash = new Uint8Array(32).fill(1);
    contract.addMilestone(1n, 0n, 300000n, hash);
    contract.caller = "ST4TRACKER";
    contract.approveMilestone(1n, 0n);
    contract.caller = "ST1USER";
    const result = contract.releaseFunds(1n, 0n);
    expect(result.ok).toBe(true);
    expect((result as any).value).toBe(300000n);
    const project = contract.getProject(1n);
    expect(project?.releasedAmount).toBe(300000n);
  });

  it("blocks release if paused", () => {
    contract.state.paused = true;
    contract.initializeProject(1n, "ST2RECIPIENT", 1000000n, 3n);
    const result = contract.releaseFunds(1n, 0n);
    expect(result.ok).toBe(false);
    expect((result as any).value).toBe(ERR_PAUSED);
  });

  it("blocks release if project paused", () => {
    contract.initializeProject(1n, "ST2RECIPIENT", 1000000n, 3n);
    contract.pauseProject(1n);
    const result = contract.releaseFunds(1n, 0n);
    expect(result.ok).toBe(false);
    expect((result as any).value).toBe(ERR_PAUSED);
  });

  it("prevents double release", () => {
    contract.initializeProject(1n, "ST2RECIPIENT", 1000000n, 3n);
    contract.setContract("funding-pool", "ST5POOL");
    contract.setContract("oracle-verifier", "ST6ORACLE");
    contract.setContract("milestone-tracker", "ST4TRACKER");
    const hash = new Uint8Array(32).fill(1);
    contract.addMilestone(1n, 0n, 300000n, hash);
    contract.caller = "ST4TRACKER";
    contract.approveMilestone(1n, 0n);
    contract.caller = "ST1USER";
    contract.releaseFunds(1n, 0n);
    const result = contract.releaseFunds(1n, 0n);
    expect(result.ok).toBe(false);
    expect((result as any).value).toBe(ERR_ALREADY_RELEASED);
  });

  it("unpauses project", () => {
    contract.initializeProject(1n, "ST2RECIPIENT", 1000000n, 3n);
    contract.pauseProject(1n);
    const result = contract.unpauseProject(1n);
    expect(result.ok).toBe(true);
    expect(contract.state.projectPaused.has(1n)).toBe(false);
  });
});