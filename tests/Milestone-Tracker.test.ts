// Milestone-Tracker.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_PROJECT_NOT_FOUND = 101;
const ERR_MILESTONE_NOT_FOUND = 102;
const ERR_ALREADY_APPROVED = 103;
const ERR_INVALID_STATUS = 104;
const ERR_INVALID_PROOF_HASH = 105;
const ERR_NOT_ORACLE = 106;
const ERR_NOT_RELEASER = 107;

interface Project {
  projectId: bigint;
  totalMilestones: bigint;
  approvedCount: bigint;
  status: string;
  createdAt: bigint;
  updatedAt: bigint;
}

interface Milestone {
  title: string;
  description: string;
  targetAmount: bigint;
  proofHash: Uint8Array;
  status: string;
  submittedAt: bigint;
  approvedAt: bigint | null;
  submitter: string;
}

class MilestoneTrackerMock {
  state: {
    admin: string;
    fundReleaser: string | null;
    oracleVerifier: string | null;
    projects: Map<bigint, Project>;
    milestones: Map<string, Milestone>;
    projectOracles: Map<bigint, string[]>;
  } = {
    admin: "ST1ADMIN",
    fundReleaser: null,
    oracleVerifier: null,
    projects: new Map(),
    milestones: new Map(),
    projectOracles: new Map(),
  };
  caller = "ST1ADMIN";
  blockHeight = 100n;

  reset() {
    this.state = {
      admin: "ST1ADMIN",
      fundReleaser: null,
      oracleVerifier: null,
      projects: new Map(),
      milestones: new Map(),
      projectOracles: new Map(),
    };
    this.caller = "ST1ADMIN";
    this.blockHeight = 100n;
  }

  initializeProject(
    projectId: bigint,
    totalMilestones: bigint,
    oracleList: string[]
  ): { ok: boolean; value: boolean } {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    if (this.state.projects.has(projectId)) return { ok: false, value: false };
    if (totalMilestones === 0n || oracleList.length > 10)
      return { ok: false, value: false };
    this.state.projects.set(projectId, {
      projectId,
      totalMilestones,
      approvedCount: 0n,
      status: "active",
      createdAt: this.blockHeight,
      updatedAt: this.blockHeight,
    });
    this.state.projectOracles.set(projectId, oracleList);
    return { ok: true, value: true };
  }

  submitMilestone(
    projectId: bigint,
    milestoneId: bigint,
    title: string,
    description: string,
    targetAmount: bigint,
    proofHash: Uint8Array
  ): { ok: boolean; value: boolean } {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    const project = this.state.projects.get(projectId);
    if (!project) return { ok: false, value: false };
    const key = `${projectId}-${milestoneId}`;
    if (this.state.milestones.has(key)) return { ok: false, value: false };
    if (
      targetAmount === 0n ||
      proofHash.length !== 32 ||
      milestoneId >= project.totalMilestones
    ) {
      return { ok: false, value: false };
    }
    this.state.milestones.set(key, {
      title,
      description,
      targetAmount,
      proofHash,
      status: "submitted",
      submittedAt: this.blockHeight,
      approvedAt: null,
      submitter: this.caller,
    });
    this.state.projects.set(projectId, {
      ...project,
      updatedAt: this.blockHeight,
    });
    return { ok: true, value: true };
  }

  oracleApprove(
    projectId: bigint,
    milestoneId: bigint,
    approvalProofHash: Uint8Array
  ): { ok: boolean; value: boolean } {
    if (
      !this.state.oracleVerifier ||
      this.caller !== this.state.oracleVerifier
    ) {
      return { ok: false, value: false };
    }
    const key = `${projectId}-${milestoneId}`;
    const milestone = this.state.milestones.get(key);
    if (
      !milestone ||
      milestone.status !== "submitted" ||
      approvalProofHash.length !== 32
    ) {
      return { ok: false, value: false };
    }
    this.state.milestones.set(key, {
      ...milestone,
      status: "oracle-verified",
      approvedAt: this.blockHeight,
      proofHash: approvalProofHash,
    });
    return { ok: true, value: true };
  }

  approveMilestone(
    projectId: bigint,
    milestoneId: bigint
  ): { ok: boolean; value: boolean } {
    if (!this.state.fundReleaser || this.caller !== this.state.fundReleaser) {
      return { ok: false, value: false };
    }
    const key = `${projectId}-${milestoneId}`;
    const milestone = this.state.milestones.get(key);
    const project = this.state.projects.get(projectId);
    if (!milestone || !project || milestone.status !== "oracle-verified") {
      return { ok: false, value: false };
    }
    this.state.milestones.set(key, { ...milestone, status: "approved" });
    this.state.projects.set(projectId, {
      ...project,
      approvedCount: project.approvedCount + 1n,
      updatedAt: this.blockHeight,
    });
    return { ok: true, value: true };
  }

  setFundReleaser(releaser: string): { ok: boolean; value: boolean } {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    this.state.fundReleaser = releaser;
    return { ok: true, value: true };
  }

  setOracleVerifier(oracle: string): { ok: boolean; value: boolean } {
    if (this.caller !== this.state.admin) return { ok: false, value: false };
    this.state.oracleVerifier = oracle;
    return { ok: true, value: true };
  }

  getProject(projectId: bigint): Project | null {
    return this.state.projects.get(projectId) ?? null;
  }

  getMilestone(projectId: bigint, milestoneId: bigint): Milestone | null {
    return this.state.milestones.get(`${projectId}-${milestoneId}`) ?? null;
  }
}

describe("MilestoneTracker", () => {
  let contract: MilestoneTrackerMock;

  beforeEach(() => {
    contract = new MilestoneTrackerMock();
    contract.reset();
  });

  it("initializes project with oracles", () => {
    const result = contract.initializeProject(1n, 3n, [
      "ST2ORACLE1",
      "ST2ORACLE2",
    ]);
    expect(result.ok).toBe(true);
    const project = contract.getProject(1n);
    expect(project?.totalMilestones).toBe(3n);
    expect(project?.status).toBe("active");
  });

  it("submits milestone successfully", () => {
    contract.initializeProject(1n, 3n, ["ST2ORACLE1"]);
    const hash = new Uint8Array(32).fill(1);
    const result = contract.submitMilestone(
      1n,
      0n,
      "Build Foundation",
      "Complete foundation work",
      300000n,
      hash
    );
    expect(result.ok).toBe(true);
    const milestone = contract.getMilestone(1n, 0n);
    expect(milestone?.status).toBe("submitted");
    expect(milestone?.targetAmount).toBe(300000n);
  });

  it("oracle verifies milestone", () => {
    contract.initializeProject(1n, 3n, ["ST2ORACLE1"]);
    contract.setOracleVerifier("ST2ORACLE1");
    const hash = new Uint8Array(32).fill(1);
    contract.submitMilestone(1n, 0n, "Build", "desc", 100n, hash);
    contract.caller = "ST2ORACLE1";
    const approvalHash = new Uint8Array(32).fill(2);
    const result = contract.oracleApprove(1n, 0n, approvalHash);
    expect(result.ok).toBe(true);
    const milestone = contract.getMilestone(1n, 0n);
    expect(milestone?.status).toBe("oracle-verified");
    expect(milestone?.proofHash).toEqual(approvalHash);
  });

  it("releaser approves after oracle", () => {
    contract.initializeProject(1n, 3n, ["ST2ORACLE1"]);
    contract.setOracleVerifier("ST2ORACLE1");
    contract.setFundReleaser("ST3RELEASER");
    const hash = new Uint8Array(32).fill(1);
    contract.submitMilestone(1n, 0n, "Build", "desc", 100n, hash);
    contract.caller = "ST2ORACLE1";
    contract.oracleApprove(1n, 0n, hash);
    contract.caller = "ST3RELEASER";
    const result = contract.approveMilestone(1n, 0n);
    expect(result.ok).toBe(true);
    const milestone = contract.getMilestone(1n, 0n);
    expect(milestone?.status).toBe("approved");
    const project = contract.getProject(1n);
    expect(project?.approvedCount).toBe(1n);
  });

  it("blocks non-oracle approval", () => {
    contract.initializeProject(1n, 3n, ["ST2ORACLE1"]);
    const hash = new Uint8Array(32).fill(1);
    contract.submitMilestone(1n, 0n, "Build", "desc", 100n, hash);
    contract.caller = "ST3HACKER";
    const result = contract.oracleApprove(1n, 0n, hash);
    expect(result.ok).toBe(false);
  });

  it("blocks releaser before oracle", () => {
    contract.initializeProject(1n, 3n, ["ST2ORACLE1"]);
    contract.setFundReleaser("ST3RELEASER");
    const hash = new Uint8Array(32).fill(1);
    contract.submitMilestone(1n, 0n, "Build", "desc", 100n, hash);
    contract.caller = "ST3RELEASER";
    const result = contract.approveMilestone(1n, 0n);
    expect(result.ok).toBe(false);
  });
});
